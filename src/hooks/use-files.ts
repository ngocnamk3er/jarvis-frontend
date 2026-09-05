"use client"

import { useCallback, useState } from "react"
import { useSession } from "next-auth/react"
import { apiFetch } from "@/lib/api-client"
import { FileNode } from "@/types/files"

export function useFiles() {
  const { data: session } = useSession()
  const accessToken = session?.accessToken
  const [loading, setLoading] = useState(false)

  const listTree = useCallback(async (path: string = "/"): Promise<FileNode[]> => {
    if (!accessToken) return []
    setLoading(true)
    try {
      const res = await apiFetch(`/api/v1/files/tree?path=${encodeURIComponent(path)}`, accessToken)
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data) ? data : []
    } catch {
      return []
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  const createFolder = useCallback(async (parentPath: string, name: string): Promise<FileNode> => {
    const res = await apiFetch("/api/v1/files/folders", accessToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parent_path: parentPath, name }),
    })
    if (!res.ok) throw new Error(`Failed to create folder: ${res.status}`)
    return res.json()
  }, [accessToken])

  const uploadFile = useCallback(async (parentPath: string, file: File): Promise<FileNode> => {
    const form = new FormData()
    form.append("parent_path", parentPath)
    form.append("file", file)
    // No Content-Type header here on purpose — the browser sets the
    // multipart boundary itself; setting it manually breaks the upload.
    const res = await apiFetch("/api/v1/files/upload", accessToken, { method: "POST", body: form })
    if (!res.ok) throw new Error(`Failed to upload ${file.name}: ${res.status}`)
    return res.json()
  }, [accessToken])

  const renameNode = useCallback(async (id: string, name: string): Promise<FileNode> => {
    const res = await apiFetch(`/api/v1/files/nodes/${id}`, accessToken, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) throw new Error(`Failed to rename: ${res.status}`)
    return res.json()
  }, [accessToken])

  const deleteNode = useCallback(async (id: string): Promise<void> => {
    await apiFetch(`/api/v1/files/nodes/${id}`, accessToken, { method: "DELETE" })
  }, [accessToken])

  return { loading, listTree, createFolder, uploadFile, renameNode, deleteNode }
}
