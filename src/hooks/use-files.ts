"use client"

import { useCallback, useState } from "react"
import { useSession } from "next-auth/react"
import { apiFetch } from "@/lib/api-client"
import { FileNode, FileNodeDetail, FileSpace } from "@/types/files"

// Why a request failed, in the backend's words when it gave any (e.g. a department the user may only read).
async function failure(res: Response, fallback: string): Promise<Error> {
  try {
    const body = await res.json()
    if (typeof body?.detail === "string") return new Error(body.detail)
  } catch {
    // not JSON
  }
  return new Error(`${fallback}: ${res.status}`)
}

// `space` is which files: the user's own (undefined or "personal") or a department's ("dept:<slug>"). Left out on a
// node read, the backend looks in every space the user can read (a citation saved before spaces existed).
export function useFiles(space?: string) {
  const { data: session } = useSession()
  const accessToken = session?.accessToken
  const [loading, setLoading] = useState(false)
  const inSpace = useCallback(
    (url: string) => (space ? `${url}${url.includes("?") ? "&" : "?"}space=${encodeURIComponent(space)}` : url),
    [space],
  )

  const listSpaces = useCallback(async (): Promise<FileSpace[]> => {
    if (!accessToken) return []
    try {
      const res = await apiFetch("/api/v1/files/spaces", accessToken)
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data) ? data : []
    } catch {
      return []
    }
  }, [accessToken])

  const listTree = useCallback(async (path: string = "/"): Promise<FileNode[]> => {
    if (!accessToken) return []
    setLoading(true)
    try {
      const res = await apiFetch(inSpace(`/api/v1/files/tree?path=${encodeURIComponent(path)}`), accessToken)
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data) ? data : []
    } catch {
      return []
    } finally {
      setLoading(false)
    }
  }, [accessToken, inSpace])

  const createFolder = useCallback(async (parentPath: string, name: string): Promise<FileNode> => {
    const res = await apiFetch(inSpace("/api/v1/files/folders"), accessToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parent_path: parentPath, name }),
    })
    if (!res.ok) throw await failure(res, "Failed to create folder")
    return res.json()
  }, [accessToken, inSpace])

  const uploadFile = useCallback(async (parentPath: string, file: File): Promise<FileNode> => {
    const form = new FormData()
    form.append("parent_path", parentPath)
    form.append("file", file)
    // No Content-Type header here on purpose — the browser sets the
    // multipart boundary itself; setting it manually breaks the upload.
    const res = await apiFetch(inSpace("/api/v1/files/upload"), accessToken, { method: "POST", body: form })
    if (!res.ok) throw await failure(res, `Failed to upload ${file.name}`)
    return res.json()
  }, [accessToken, inSpace])

  const getNode = useCallback(async (id: string): Promise<FileNodeDetail> => {
    const res = await apiFetch(inSpace(`/api/v1/files/nodes/${id}`), accessToken)
    if (!res.ok) throw await failure(res, "Failed to load file")
    return res.json()
  }, [accessToken, inSpace])

  // Returns a blob (not text/JSON) — used for both preview (wrapped in an
  // object URL for <img>/<iframe>) and download (<a download> via the same
  // object URL). The auth header has to travel with a real fetch() call
  // here, which is why this can't just be a plain <a href> straight to the
  // backend — the browser wouldn't attach the bearer token to that request.
  const fetchContent = useCallback(async (id: string): Promise<Blob> => {
    const res = await apiFetch(inSpace(`/api/v1/files/nodes/${id}/content`), accessToken)
    if (!res.ok) throw await failure(res, "Failed to fetch file content")
    return res.blob()
  }, [accessToken, inSpace])

  const renameNode = useCallback(async (id: string, name: string): Promise<FileNode> => {
    const res = await apiFetch(inSpace(`/api/v1/files/nodes/${id}`), accessToken, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) throw await failure(res, "Failed to rename")
    return res.json()
  }, [accessToken, inSpace])

  const deleteNode = useCallback(async (id: string): Promise<void> => {
    const res = await apiFetch(inSpace(`/api/v1/files/nodes/${id}`), accessToken, { method: "DELETE" })
    if (!res.ok) throw await failure(res, "Failed to delete")
  }, [accessToken, inSpace])

  return { loading, listSpaces, listTree, createFolder, uploadFile, getNode, fetchContent, renameNode, deleteNode }
}
