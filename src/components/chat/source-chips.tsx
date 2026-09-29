"use client"

import { useState } from "react"
import { FileText } from "lucide-react"
import type { Citation } from "@/types/chat"
import { SourceViewer } from "./source-viewer"

// Renders search_files' citations as a row of clickable chips under its
// output — one per hit, in the order the search returned them (already
// ranked by relevance). Clicking a chip opens SourceViewer on that exact
// citation, page and highlight included; the chip itself carries no page
// state of its own, so several chips for the same file at different pages
// stay distinguishable.
export function SourceChips({ citations }: { citations: Citation[] }) {
  const [open, setOpen] = useState<Citation | null>(null)

  if (citations.length === 0) return null

  return (
    <>
      <div>
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
          sources
        </span>
        <div className="flex flex-wrap gap-1.5">
          {citations.map((c, i) => {
            const name = c.path.split("/").pop() ?? c.path
            const page = c.page_start
              ? c.page_start === c.page_end
                ? `p.${c.page_start}`
                : `pp.${c.page_start}-${c.page_end}`
              : null
            return (
              <button
                key={`${c.file_id}-${c.char_start}-${i}`}
                onClick={() => setOpen(c)}
                className="flex items-center gap-1 rounded-full border border-[#E0E7FF] bg-[#F7F8FF] px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:border-[#5661f6] hover:text-[#5661f6] transition-colors max-w-[220px]"
                title={c.snippet}
              >
                <FileText className="size-3 shrink-0" />
                <span className="truncate">{name}</span>
                {page && <span className="shrink-0 text-gray-400">{page}</span>}
              </button>
            )
          })}
        </div>
      </div>
      {open && <SourceViewer citation={open} onClose={() => setOpen(null)} />}
    </>
  )
}
