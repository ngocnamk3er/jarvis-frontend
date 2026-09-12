"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { Download, File, FileImage, FileSpreadsheet, FileText, Loader2, Presentation } from "lucide-react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { apiFetch } from "@/lib/api-client"
import { formatSize, parseCsvPreview, previewKind, triggerDownload, TEXT_PREVIEW_CHAR_LIMIT } from "@/lib/download"
import { MessagePart } from "@/types/chat"

type FilePart = Extract<MessagePart, { type: "file" }>

// A blob: URL preview (image, pdf) or a decoded-text preview (markdown, csv,
// plain text/json/code) — kept as a tagged union so each render branch gets
// exactly the data it needs.
type Preview =
  | { kind: "image" | "pdf"; url: string }
  | { kind: "markdown" | "text"; text: string; truncated: boolean }
  | { kind: "csv"; header: string[] | null; rows: string[][]; truncated: boolean }

const markdownPreviewComponents: Components = {
  p: ({ children }) => <p className="mb-2 text-[13px] leading-[20px] text-gray-800 last:mb-0">{children}</p>,
  h1: ({ children }) => <h1 className="mb-2 text-[15px] font-bold text-gray-900">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 text-[14px] font-bold text-gray-900">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 text-[13px] font-semibold text-gray-900">{children}</h3>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-0.5 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-0.5 pl-5">{children}</ol>,
  li: ({ children }) => <li className="text-[13px] leading-[20px] text-gray-800">{children}</li>,
  code: ({ children }) => (
    <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[12px] text-[#5661f6]">{children}</code>
  ),
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#5661f6] underline underline-offset-2 hover:opacity-80">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-gray-100 px-2 py-1 text-left font-semibold text-gray-600">{children}</th>,
  td: ({ children }) => <td className="border-b border-gray-50 px-2 py-1 text-gray-700">{children}</td>,
}

function FileIcon({ mime, className }: { mime: string; className: string }) {
  if (mime.startsWith("image/")) return <FileImage className={className} />
  if (mime.includes("presentation")) return <Presentation className={className} />
  if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv") return <FileSpreadsheet className={className} />
  if (mime.includes("word") || mime === "application/pdf" || mime.startsWith("text/")) return <FileText className={className} />
  return <File className={className} />
}

function TruncatedNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-[11px] text-gray-400">{children}</p>
}

export function FileAttachment({ part }: { part: FilePart }) {
  const { data: session } = useSession()
  const accessToken = session?.accessToken
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)

  const url = `/api/v1/chat/sandbox-file?thread_id=${encodeURIComponent(part.thread_id)}&name=${encodeURIComponent(part.path)}`
  const kind = previewKind(part.mime, part.name)

  // blob: URLs are only revoked on unmount / when a newer preview replaces
  // them — never on every render, or the <img>/<iframe> below would go blank.
  useEffect(() => {
    if (preview?.kind === "image" || preview?.kind === "pdf") {
      const toRevoke = preview.url
      return () => URL.revokeObjectURL(toRevoke)
    }
  }, [preview])

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
    if (preview || busy || kind === "none") return
    setBusy(true)
    setError(null)
    try {
      const blob = await fetchBlob()
      if (kind === "image" || kind === "pdf") {
        setPreview({ kind, url: URL.createObjectURL(blob) })
      } else if (kind === "csv") {
        const { header, rows, truncated } = parseCsvPreview(await blob.text())
        setPreview({ kind: "csv", header, rows, truncated })
      } else {
        const raw = await blob.text()
        setPreview({
          kind,
          text: raw.slice(0, TEXT_PREVIEW_CHAR_LIMIT),
          truncated: raw.length > TEXT_PREVIEW_CHAR_LIMIT,
        })
      }
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

      {kind !== "none" && !preview && !error && (
        <button onClick={loadPreview} className="mt-1 pl-1 text-[11px] font-medium text-[#5661f6] hover:underline">
          Show preview
        </button>
      )}

      {preview?.kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element -- blob: URL, next/image can't optimize it
        <img src={preview.url} alt={part.name} className="mt-1.5 max-h-80 rounded-xl border border-gray-100" />
      )}

      {preview?.kind === "pdf" && (
        <iframe src={preview.url} title={part.name} className="mt-1.5 h-96 w-full max-w-full rounded-xl border border-gray-100" />
      )}

      {preview?.kind === "markdown" && (
        <div className="mt-1.5 max-h-96 overflow-y-auto rounded-xl border border-gray-100 bg-white p-3">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownPreviewComponents}>
            {preview.text}
          </ReactMarkdown>
          {preview.truncated && <TruncatedNote>Preview truncated — download for the full file.</TruncatedNote>}
        </div>
      )}

      {preview?.kind === "text" && (
        <div className="mt-1.5 max-h-96 overflow-auto rounded-xl border border-gray-100 bg-[#FAFAFA] p-3">
          <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-[18px] text-gray-700">{preview.text}</pre>
          {preview.truncated && <TruncatedNote>Preview truncated — download for the full file.</TruncatedNote>}
        </div>
      )}

      {preview?.kind === "csv" && (
        <div className="mt-1.5 overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full border-collapse text-[12px]">
            {preview.header && (
              <thead>
                <tr className="bg-[#FAFAFA]">
                  {preview.header.map((h, i) => (
                    <th key={i} className="whitespace-nowrap border-b border-gray-100 px-2.5 py-1.5 text-left font-semibold text-gray-600">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {preview.rows.map((r, ri) => (
                <tr key={ri} className="border-b border-gray-50 last:border-0">
                  {r.map((c, ci) => (
                    <td key={ci} className="whitespace-nowrap px-2.5 py-1.5 text-gray-700">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {preview.truncated && (
            <p className="border-t border-gray-100 bg-white px-2.5 py-1.5 text-[11px] text-gray-400">
              Showing first {preview.rows.length} rows — download for the full file.
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-1 pl-1 text-[11px] text-red-500">{error}</p>}
    </div>
  )
}
