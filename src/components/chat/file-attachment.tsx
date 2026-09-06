"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { Download, File, FileImage, FileSpreadsheet, FileText, Loader2, Presentation } from "lucide-react"
import { apiFetch } from "@/lib/api-client"
import { formatSize, triggerDownload } from "@/lib/download"
import { MessagePart } from "@/types/chat"

type FilePart = Extract<MessagePart, { type: "file" }>

function FileIcon({ mime, className }: { mime: string; className: string }) {
  if (mime.startsWith("image/")) return <FileImage className={className} />
  if (mime.includes("presentation")) return <Presentation className={className} />
  if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv") return <FileSpreadsheet className={className} />
  if (mime.includes("word") || mime === "application/pdf" || mime.startsWith("text/")) return <FileText className={className} />
  return <File className={className} />
}

export function FileAttachment({ part }: { part: FilePart }) {
  const { data: session } = useSession()
  const accessToken = session?.accessToken
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imgUrl, setImgUrl] = useState<string | null>(null)

  const url = `/api/v1/chat/sandbox-file?thread_id=${encodeURIComponent(part.thread_id)}&name=${encodeURIComponent(part.path)}`
  const isImage = part.mime.startsWith("image/")

  async function fetchBlob(): Promise<Blob> {
    const res = await apiFetch(url, accessToken)
    if (!res.ok) throw new Error(res.status === 404 ? "This file is no longer available." : `Download failed (${res.status})`)
    return res.blob()
  }

  async function handleDownload() {
    setBusy(true)
    setError(null)
    try {
      triggerDownload(await fetchBlob(), part.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed")
    } finally {
      setBusy(false)
    }
  }

  async function loadPreview() {
    if (imgUrl || busy) return
    setBusy(true)
    setError(null)
    try {
      setImgUrl(URL.createObjectURL(await fetchBlob()))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="my-2">
      <button
        onClick={handleDownload}
        disabled={busy}
        className="group flex max-w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-left transition-colors hover:border-[#5661f6] hover:bg-[#f7f8ff] disabled:opacity-60"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#EEF0FF]">
          <FileIcon mime={part.mime} className="size-4 text-[#5661f6]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-gray-800">{part.name}</span>
          <span className="block text-[11px] text-gray-400">{formatSize(part.size)}</span>
        </span>
        {busy ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-gray-400" />
        ) : (
          <Download className="size-4 shrink-0 text-gray-400 group-hover:text-[#5661f6]" />
        )}
      </button>

      {isImage && !imgUrl && !error && (
        <button onClick={loadPreview} className="mt-1 pl-1 text-[11px] font-medium text-[#5661f6] hover:underline">
          Show preview
        </button>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL, next/image can't optimize it */}
      {imgUrl && <img src={imgUrl} alt={part.name} className="mt-1.5 max-h-80 rounded-xl border border-gray-100" />}
      {error && <p className="mt-1 pl-1 text-[11px] text-red-500">{error}</p>}
    </div>
  )
}
