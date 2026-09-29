"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { X, ChevronLeft, ChevronRight, Loader2, AlertCircle, Download } from "lucide-react"
import { useFiles } from "@/hooks/use-files"
import { triggerDownload } from "@/lib/download"
import type { Citation } from "@/types/chat"
import type { FileNodeDetail } from "@/types/files"

type Props = {
  citation: Citation
  onClose: () => void
}

// Pages this citation actually has a box on, in order — a 300-word chunk
// crosses a page break often enough that "just show page_start" would hide
// half the highlight. Falls back to [page_start] when there are no boxes at
// all (page_start still 0 for a pageless format, handled by the caller).
function citedPages(citation: Citation): number[] {
  const pages = [...new Set(citation.boxes.map(([p]) => p))].sort((a, b) => a - b)
  return pages.length > 0 ? pages : citation.page_start ? [citation.page_start] : []
}

// The overlay is positioned in percent of its wrapper, not pixels — so it
// lines up with a PDF canvas (which has explicit render dimensions) and a
// plain <img> (which doesn't, until it's loaded) the same way, with no
// natural-size bookkeeping either has to do.
function HighlightBoxes({ citation, page }: { citation: Citation; page: number }) {
  const boxes = citation.boxes.filter(([p]) => p === page)
  if (boxes.length === 0) return null
  return (
    <div className="pointer-events-none absolute inset-0">
      {boxes.map(([, [x0, top, x1, bottom]], i) => (
        <div
          key={i}
          className="absolute rounded-[2px] bg-yellow-300/40 ring-2 ring-yellow-400"
          style={{
            left: `${x0 * 100}%`,
            top: `${top * 100}%`,
            width: `${(x1 - x0) * 100}%`,
            height: `${(bottom - top) * 100}%`,
          }}
        />
      ))}
    </div>
  )
}

function PdfPage({ blob, citation, page }: { blob: Blob; citation: Citation; page: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Whether the canvas has pixels in it yet — not the canvas's size. Sizing
  // the wrapper from the PDF's native viewport (getViewport's width/height)
  // used to desync it from what actually renders on screen: the canvas
  // shrinks under `max-w-full` whenever the modal is narrower than the
  // page, keeping its own aspect ratio as it does — but a wrapper pinned to
  // the *unshrunk* viewport size does not follow it down, so the two ended
  // up different heights (measured: 942px canvas inside a 1188px wrapper on
  // a 760px-wide modal). Every highlight box, positioned in percent of the
  // wrapper, inherited that gap as a proportional downward drift — worse
  // the further down the page. Leaving the wrapper's size unset instead
  // (just `inline-block`) makes it shrink-wrap to the canvas's real
  // rendered size, the same way ImagePage's wrapper already does around its
  // `<img>` — so it matches at any zoom or modal width, not just the one
  // this was tested at.
  const [rendered, setRendered] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let renderTask: { cancel: () => void } | null = null
    // A new page/citation must not keep showing the previous page's canvas
    // pixels underneath a "loading" state that never arrives, and boxes
    // must not draw over a canvas that no longer matches them.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRendered(false)
    setError(null)

    async function render() {
      try {
        const pdfjsLib = await import("pdfjs-dist")
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
        const buf = await blob.arrayBuffer()
        const doc = await pdfjsLib.getDocument({ data: buf }).promise
        if (cancelled) return
        const pdfPage = await doc.getPage(page)
        if (cancelled) return
        // 1.5x reads comfortably without the canvas ballooning on a long
        // document's worth of pages the user might page through.
        const viewport = pdfPage.getViewport({ scale: 1.5 })
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext("2d")
        if (!ctx) return
        const task = pdfPage.render({ canvas, canvasContext: ctx, viewport })
        renderTask = task
        await task.promise
        if (!cancelled) setRendered(true)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to render page")
      }
    }
    render()
    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [blob, page])

  if (error) {
    return <p className="px-5 py-16 text-center text-[13px] text-red-500">{error}</p>
  }

  return (
    <div className="flex items-center justify-center p-4">
      <div className="relative inline-block">
        <canvas ref={canvasRef} className="block max-w-full shadow-sm" />
        {rendered && <HighlightBoxes citation={citation} page={page} />}
      </div>
    </div>
  )
}

function ImagePage({ blob, citation }: { blob: Blob; citation: Citation }) {
  // useMemo derives the URL during render (not an effect setting state) —
  // the effect below only performs the actual side effect, revoking it.
  const url = useMemo(() => URL.createObjectURL(blob), [blob])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return (
    <div className="flex items-center justify-center p-4">
      <div className="relative inline-block max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL, next/image can't optimize it */}
        <img src={url} alt="" className="block max-w-full" />
        <HighlightBoxes citation={citation} page={1} />
      </div>
    </div>
  )
}

function TextExcerpt({ node, citation }: { node: FileNodeDetail; citation: Citation }) {
  const text = node.extracted_text ?? ""
  const markRef = useRef<HTMLElement>(null)

  useEffect(() => {
    markRef.current?.scrollIntoView({ block: "center" })
  }, [])

  if (!text) {
    return <p className="px-5 py-16 text-center text-[13px] text-gray-400">No text available for this file.</p>
  }
  const start = Math.max(0, Math.min(citation.char_start, text.length))
  const end = Math.max(start, Math.min(citation.char_end, text.length))
  return (
    <pre className="whitespace-pre-wrap break-words px-5 py-4 text-[12px] leading-relaxed text-gray-700">
      {text.slice(0, start)}
      <mark ref={markRef} className="rounded-[2px] bg-yellow-300/60">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </pre>
  )
}

export function SourceViewer({ citation, onClose }: Props) {
  const { getNode, fetchContent } = useFiles()
  const [node, setNode] = useState<FileNodeDetail | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const pages = citedPages(citation)
  const [pageIdx, setPageIdx] = useState(0)
  const page = pages[pageIdx] ?? citation.page_start

  useEffect(() => {
    let cancelled = false
    // Resetting for the new citation being loaded, not deriving from
    // existing state — same category as file-browser-modal.tsx's refresh().
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const n = await getNode(citation.file_id)
        if (cancelled) return
        setNode(n)
        // Only a pdf/image needs the raw bytes — a pageless format (docx,
        // txt) is shown from extracted_text, which getNode already returned.
        if (n.mime_type === "application/pdf" || n.mime_type?.startsWith("image/")) {
          const b = await fetchContent(citation.file_id)
          if (cancelled) return
          setBlob(b)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load file")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- citation.file_id is the real key; getNode/fetchContent are stable useCallbacks
  }, [citation.file_id])

  const name = node?.name ?? citation.path.split("/").pop() ?? citation.path

  async function handleDownload() {
    if (!node) return
    triggerDownload(await fetchContent(node.id), node.name)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="flex h-[min(720px,85vh)] w-[min(760px,92vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
          <span className="truncate text-[13px] font-medium text-gray-700">{name}</span>
          {pages.length > 0 && (
            <span className="shrink-0 text-[12px] text-gray-400">
              {pages.length > 1 ? `page ${page} of ${pages.join(", ")}` : `page ${page}`}
            </span>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {pages.length > 1 && (
              <>
                <button
                  onClick={() => setPageIdx((i) => Math.max(0, i - 1))}
                  disabled={pageIdx === 0}
                  className="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  onClick={() => setPageIdx((i) => Math.min(pages.length - 1, i + 1))}
                  disabled={pageIdx === pages.length - 1}
                  className="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                >
                  <ChevronRight className="size-4" />
                </button>
              </>
            )}
            {node && (
              <button onClick={handleDownload} className="rounded p-1 text-gray-400 hover:text-gray-700" title="Download">
                <Download className="size-4" />
              </button>
            )}
            <button onClick={onClose} className="rounded p-1 text-gray-400 hover:text-gray-700">
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}
          {!loading && error && (
            <div className="flex flex-col items-center gap-2 px-5 py-16 text-center">
              <AlertCircle className="size-5 text-red-400" />
              <p className="text-[13px] text-red-500">{error}</p>
            </div>
          )}
          {!loading && !error && node && (
            <>
              {node.mime_type === "application/pdf" && blob && (
                <PdfPage blob={blob} citation={citation} page={page} />
              )}
              {node.mime_type?.startsWith("image/") && blob && (
                <ImagePage blob={blob} citation={citation} />
              )}
              {node.mime_type !== "application/pdf" && !node.mime_type?.startsWith("image/") && (
                <TextExcerpt node={node} citation={citation} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
