"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { ChevronRight, File, Folder, FolderPlus, Loader2, Pencil, Trash2, Upload, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useFiles } from "@/hooks/use-files"
import { FileNode } from "@/types/files"

type Props = {
  open: boolean
  onClose: () => void
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return ""
  if (bytes < 1024) return `${bytes}B`
  const units = ["KB", "MB", "GB"]
  let n = bytes / 1024
  for (const unit of units) {
    if (n < 1024) return `${n.toFixed(1)}${unit}`
    n /= 1024
  }
  return `${n.toFixed(1)}TB`
}

function splitPath(path: string): string[] {
  return path.split("/").filter(Boolean)
}

export function FileBrowserModal({ open, onClose }: Props) {
  const { loading, listTree, createFolder, uploadFile, renameNode, deleteNode } = useFiles()
  const [path, setPath] = useState("/")
  const [nodes, setNodes] = useState<FileNode[]>([])
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    setNodes(await listTree(path))
  }, [listTree, path])

  useEffect(() => {
    if (open) {
      // Clearing any stale error from a previous open, and the refresh()
      // below, both sync with the file-service rather than derive from
      // existing state during render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(null)
      refresh()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, path])

  if (!open) return null

  const segments = splitPath(path)

  async function handleCreateFolder() {
    const name = newFolderName.trim()
    if (!name) return
    try {
      await createFolder(path, name)
      setNewFolderName("")
      setCreatingFolder(false)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create folder")
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    try {
      for (const file of Array.from(files)) {
        await uploadFile(path, file)
      }
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleRename(node: FileNode) {
    const name = window.prompt(`Rename "${node.name}" to:`, node.name)
    if (!name || name === node.name) return
    try {
      await renameNode(node.id, name)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rename failed")
    }
  }

  async function handleDelete(node: FileNode) {
    const kind = node.type === "folder" ? "folder (and everything in it)" : "file"
    if (!window.confirm(`Delete ${kind} "${node.name}"? This can't be undone.`)) return
    try {
      await deleteNode(node.id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed")
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="flex h-[min(600px,85vh)] w-[min(640px,90vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.15em] text-gray-900">Files</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:text-gray-700">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 border-b border-gray-100 px-5 py-2.5 text-[13px] text-gray-500">
          <button onClick={() => setPath("/")} className="rounded px-1.5 py-0.5 hover:bg-gray-50 hover:text-gray-900">
            workspace
          </button>
          {segments.map((seg, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="size-3 text-gray-300" />
              <button
                onClick={() => setPath("/" + segments.slice(0, i + 1).join("/"))}
                className="rounded px-1.5 py-0.5 hover:bg-gray-50 hover:text-gray-900"
              >
                {seg}
              </button>
            </span>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading && nodes.length === 0 && (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}

          {!loading && nodes.length === 0 && (
            <p className="px-3 py-6 text-center text-[13px] text-gray-400">Empty folder</p>
          )}

          <ul>
            {nodes.map((node) => (
              <li
                key={node.id}
                className="group flex items-center gap-2.5 rounded-xl px-3 py-2 hover:bg-gray-50"
              >
                <button
                  onClick={() => node.type === "folder" && setPath(path.replace(/\/$/, "") + "/" + node.name)}
                  disabled={node.type !== "folder"}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2.5 text-left",
                    node.type !== "folder" && "cursor-default"
                  )}
                >
                  {node.type === "folder" ? (
                    <Folder className="size-4 shrink-0 text-[#5661f6]" />
                  ) : (
                    <File className="size-4 shrink-0 text-gray-400" />
                  )}
                  <span className="truncate text-[13px] font-medium text-gray-700">{node.name}</span>
                  {node.type === "file" && (
                    <span className="shrink-0 text-[11px] text-gray-400">{formatSize(node.size_bytes)}</span>
                  )}
                  {node.type === "file" && node.indexing_status !== "done" && node.indexing_status !== "skipped" && (
                    <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                      {node.indexing_status}
                    </span>
                  )}
                </button>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={() => handleRename(node)}
                    className="rounded p-1 text-gray-400 hover:text-gray-700"
                    title="Rename"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(node)}
                    className="rounded p-1 text-gray-400 hover:text-red-500"
                    title="Delete"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {creatingFolder && (
            <div className="flex items-center gap-2 px-3 py-2">
              <Folder className="size-4 shrink-0 text-[#5661f6]" />
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFolder()
                  if (e.key === "Escape") setCreatingFolder(false)
                }}
                onBlur={() => !newFolderName && setCreatingFolder(false)}
                placeholder="Folder name"
                className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1 text-[13px] outline-none focus:border-[#5661f6]"
              />
            </div>
          )}
        </div>

        {error && (
          <div className="border-t border-red-100 bg-red-50 px-5 py-2 text-[12px] text-red-600">{error}</div>
        )}

        <div className="flex items-center gap-2 border-t border-gray-100 px-5 py-3">
          <button
            onClick={() => setCreatingFolder(true)}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-gray-600 hover:bg-gray-50"
          >
            <FolderPlus className="size-3.5" />
            New folder
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-full bg-[#5661f6] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#4550e0]"
          >
            <Upload className="size-3.5" />
            Upload
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
        </div>
      </div>
    </div>
  )
}
