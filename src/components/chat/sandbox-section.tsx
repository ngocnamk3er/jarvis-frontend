"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import {
  AtSign, ChevronRight, CircleAlert, CircleCheck, Download, File, FileImage, FileSpreadsheet, FileText, Folder,
  FolderInput, FolderPlus, HardDrive, Loader2, Pencil, RefreshCw, Trash2, Upload, X, type LucideIcon,
} from "lucide-react"
import {
  canPreview, crumbs, formatSize, kindOf, type FileKind, type SandboxEntry, type SandboxListing,
} from "@/lib/sandbox-files"
import { SandboxApiError, insertIntoMessage, sandboxApi } from "@/lib/sandbox-files-api"

const ICONS: Record<FileKind, LucideIcon> = {
  folder: Folder, image: FileImage, text: FileText, table: FileSpreadsheet, pdf: FileText, other: File,
}
const INPUT = "w-full rounded border border-[#C7CCFF] bg-white px-1.5 py-0.5 text-[12px] text-gray-800 outline-none focus:border-[#5661f6]"
const ICON_BUTTON = "flex size-6 items-center justify-center rounded text-gray-400 hover:bg-[#EEF0FF] hover:text-[#5661f6]"

function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString()
}

function message(e: unknown, fallback: string): string {
  return e instanceof SandboxApiError ? e.message : fallback
}

type Preview = { entry: SandboxEntry; text?: string; url?: string }

// The files in this conversation's sandbox: what the agent made and what was attached. Browse folders, look at a file,
// download it, keep it in your Files, point the agent at it, rename or delete it, add files by dropping them here.
export function SandboxSection({ threadId, isLoading }: { threadId: string; isLoading: boolean }) {
  const token = useSession().data?.accessToken
  const [listing, setListing] = useState<SandboxListing | null>(null)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [newFolder, setNewFolder] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const path = listing?.path ?? ""

  const load = useCallback(async (p: string, wake = false) => {
    if (!token) return
    setLoading(true)
    try {
      setListing(await sandboxApi.list(token, threadId, p, wake))
    } catch (e) {
      if (e instanceof SandboxApiError && e.status === 404 && p) {
        setListing(await sandboxApi.list(token, threadId, "").catch(() => null))   // the folder went away
      } else {
        setNotice({ ok: false, text: message(e, "Could not list the sandbox.") })
      }
    } finally {
      setLoading(false)
    }
  }, [token, threadId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load("")
  }, [load])

  // The agent may have written files during the turn that just ended.
  const wasLoading = useRef(isLoading)
  useEffect(() => {
    if (wasLoading.current && !isLoading) void load(path)
    wasLoading.current = isLoading
  }, [isLoading, load, path])

  const act = async (work: () => Promise<string | null>, failure: string) => {
    setNotice(null)
    try {
      const done = await work()
      if (done) setNotice({ ok: true, text: done })
    } catch (e) {
      setNotice({ ok: false, text: message(e, failure) })
    }
    await load(path)
  }

  const download = async (entry: SandboxEntry) => {
    try {
      const blob = await sandboxApi.fetch(token, threadId, entry.path)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = entry.name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (e) {
      setNotice({ ok: false, text: message(e, "Could not download it.") })
    }
  }

  const open = async (entry: SandboxEntry) => {
    if (entry.type === "dir") return load(entry.path)
    if (!canPreview(entry)) return download(entry)
    try {
      const blob = await sandboxApi.fetch(token, threadId, entry.path)
      setPreview(kindOf(entry) === "image" ? { entry, url: URL.createObjectURL(blob) } : { entry, text: await blob.text() })
    } catch (e) {
      setNotice({ ok: false, text: message(e, "Could not open it.") })
    }
  }

  const closePreview = () => {
    if (preview?.url) URL.revokeObjectURL(preview.url)
    setPreview(null)
  }

  const upload = (files: FileList | File[]) => act(async () => {
    const list = Array.from(files)
    for (const f of list) await sandboxApi.upload(token, threadId, f, path)
    return `Uploaded ${list.length} file${list.length === 1 ? "" : "s"}.`
  }, "Could not upload.")

  const entries = listing?.entries ?? []

  return (
    <section
      aria-label="Sandbox files"
      className={`space-y-2 border-b border-[#E0E7FF] p-3 ${dragging ? "bg-[#F2F3FF]" : ""}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true) } }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) void upload(e.dataTransfer.files) }}
    >
      <div className="flex items-center gap-2 px-1 text-[13px] font-semibold text-gray-800">
        <HardDrive className="size-4 text-[#5661f6]" />
        Sandbox files
        {listing?.state === "running" && (
          <span className="rounded-full bg-[#EEF0FF] px-1.5 text-[11px] font-semibold text-[#5661f6]">{entries.length}</span>
        )}
        <span className="flex-1" />
        <button type="button" onClick={() => fileInput.current?.click()} className={ICON_BUTTON} title="Upload files here" aria-label="Upload files">
          <Upload className="size-3.5" />
        </button>
        <button type="button" onClick={() => setNewFolder("")} className={ICON_BUTTON} title="New folder" aria-label="New folder">
          <FolderPlus className="size-3.5" />
        </button>
        <button type="button" onClick={() => void load(path)} className={ICON_BUTTON} title="Refresh" aria-label="Refresh">
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
        <input ref={fileInput} type="file" multiple hidden
               onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.target.value = "" }} />
      </div>

      {listing?.state === "running" && (
        <nav className="flex flex-wrap items-center gap-0.5 px-1 text-[11.5px] text-gray-500" aria-label="Folder">
          <button type="button" onClick={() => void load("")} className="hover:text-[#5661f6]">sandbox</button>
          {crumbs(path).map((c) => (
            <span key={c.path} className="flex items-center gap-0.5">
              <ChevronRight className="size-3 text-gray-300" />
              <button type="button" onClick={() => void load(c.path)} className="hover:text-[#5661f6]">{c.name}</button>
            </span>
          ))}
        </nav>
      )}

      {newFolder !== null && (
        <form className="flex items-center gap-1 px-1"
              onSubmit={(e) => { e.preventDefault(); const n = newFolder; setNewFolder(null); void act(async () => { await sandboxApi.makeFolder(token, threadId, path, n); return null }, "Could not make the folder.") }}>
          <Folder className="size-3.5 shrink-0 text-gray-400" />
          <input autoFocus className={INPUT} value={newFolder} placeholder="Folder name" aria-label="New folder name"
                 onChange={(e) => setNewFolder(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setNewFolder(null) }} />
        </form>
      )}

      {!listing && loading && <Loader2 className="mx-1 size-4 animate-spin text-gray-300" />}
      {listing?.state === "none" && (
        <p className="px-1 text-[11.5px] leading-[16px] text-gray-400">
          No sandbox yet. One starts the first time the agent runs a command, or when you attach or upload a file.
        </p>
      )}
      {listing?.state === "paused" && (
        <div className="space-y-1.5 px-1">
          <p className="text-[11.5px] leading-[16px] text-gray-500">
            The sandbox is paused to save resources. Its files are kept; it wakes when the agent next uses it.
          </p>
          <button type="button" onClick={() => void load(path, true)} disabled={loading}
                  className="flex items-center gap-1 text-[12px] font-semibold text-[#5661f6] hover:underline disabled:opacity-60">
            {loading && <Loader2 className="size-3 animate-spin" />}Open it now
          </button>
        </div>
      )}

      {listing?.state === "running" && (
        <ul className="space-y-0.5">
          {entries.length === 0 && <li className="px-1 text-[11.5px] text-gray-400">Nothing here yet. Drop files to add them.</li>}
          {entries.map((e) => {
            const Icon = ICONS[kindOf(e)]
            if (renaming?.path === e.path) {
              return (
                <li key={e.path} className="px-1">
                  <form className="flex items-center gap-1"
                        onSubmit={(ev) => { ev.preventDefault(); const r = renaming; setRenaming(null); void act(async () => { await sandboxApi.rename(token, threadId, r.path, r.name); return null }, "Could not rename it.") }}>
                    <Icon className="size-3.5 shrink-0 text-gray-400" />
                    <input autoFocus className={INPUT} value={renaming.name} aria-label={`New name for ${e.name}`}
                           onChange={(ev) => setRenaming({ ...renaming, name: ev.target.value })}
                           onKeyDown={(ev) => { if (ev.key === "Escape") setRenaming(null) }} />
                  </form>
                </li>
              )
            }
            return (
              <li key={e.path} className="group flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-[#F7F8FF] focus-within:bg-[#F7F8FF]">
                <button type="button" onClick={() => void open(e)} title={e.type === "dir" ? "Open folder" : canPreview(e) ? "Preview" : "Download"}
                        className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-left">
                  <Icon className={`size-3.5 shrink-0 ${e.type === "dir" ? "text-[#5661f6]" : "text-gray-400"}`} />
                  <span className="truncate text-[12px] text-gray-800">{e.name}</span>
                </button>
                {deleting === e.path ? (
                  <span className="flex shrink-0 items-center gap-1 text-[11px]">
                    <button type="button" className="font-semibold text-red-600 hover:underline"
                            onClick={() => { setDeleting(null); void act(async () => { await sandboxApi.remove(token, threadId, e.path); return null }, "Could not delete it.") }}>
                      Delete
                    </button>
                    <button type="button" aria-label="Cancel" onClick={() => setDeleting(null)} className="text-gray-400 hover:text-gray-600"><X className="size-3" /></button>
                  </span>
                ) : (
                  <>
                    <span className="shrink-0 text-[10.5px] text-gray-400 group-hover:hidden group-focus-within:hidden" title={new Date(e.modified).toLocaleString()}>
                      {e.type === "dir" ? ago(e.modified) : formatSize(e.size)}
                    </span>
                    <span className="hidden shrink-0 items-center group-hover:flex group-focus-within:flex">
                      {e.type === "file" && (
                        <>
                          <button type="button" className={ICON_BUTTON} title="Mention in the message" aria-label={`Mention ${e.name} in the message`}
                                  onClick={() => insertIntoMessage(e.path)}><AtSign className="size-3" /></button>
                          <button type="button" className={ICON_BUTTON} title="Download" aria-label={`Download ${e.name}`}
                                  onClick={() => void download(e)}><Download className="size-3" /></button>
                          <button type="button" className={ICON_BUTTON} title="Keep it in your Files" aria-label={`Save ${e.name} to your Files`}
                                  onClick={() => void act(async () => `Saved to your Files as ${(await sandboxApi.saveToFiles(token, threadId, e.path)).name}.`, "Could not save it.")}>
                            <FolderInput className="size-3" />
                          </button>
                        </>
                      )}
                      <button type="button" className={ICON_BUTTON} title="Rename" aria-label={`Rename ${e.name}`}
                              onClick={() => setRenaming({ path: e.path, name: e.name })}><Pencil className="size-3" /></button>
                      <button type="button" className={`${ICON_BUTTON} hover:!text-red-500`} title="Delete" aria-label={`Delete ${e.name}`}
                              onClick={() => setDeleting(e.path)}><Trash2 className="size-3" /></button>
                    </span>
                  </>
                )}
              </li>
            )
          })}
          {listing.truncated && <li className="px-1 text-[11px] text-gray-400">Showing the first {entries.length}.</li>}
        </ul>
      )}

      {notice && (
        <p className={`flex items-start gap-1 px-1 text-[11.5px] leading-[16px] ${notice.ok ? "text-emerald-700" : "text-red-600"}`}>
          {notice.ok ? <CircleCheck className="mt-[2px] size-3 shrink-0" /> : <CircleAlert className="mt-[2px] size-3 shrink-0" />}
          {notice.text}
        </p>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={closePreview} role="dialog" aria-label={preview.entry.name}>
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-[#E0E7FF] px-4 py-2.5">
              <span className="flex-1 truncate font-mono text-[12.5px] text-gray-700">{preview.entry.path}</span>
              <span className="text-[11px] text-gray-400">{formatSize(preview.entry.size)}</span>
              <button type="button" className={ICON_BUTTON} title="Download" aria-label="Download" onClick={() => void download(preview.entry)}><Download className="size-3.5" /></button>
              <button type="button" className={ICON_BUTTON} title="Close" aria-label="Close" onClick={closePreview}><X className="size-3.5" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-[#FAFBFF]">
              {preview.url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={preview.url} alt={preview.entry.name} className="mx-auto max-h-[75vh] object-contain p-4" />
                : <pre className="whitespace-pre-wrap break-words p-4 font-mono text-[12px] leading-[18px] text-gray-800">{preview.text}</pre>}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
