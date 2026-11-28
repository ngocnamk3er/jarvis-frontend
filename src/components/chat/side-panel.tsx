"use client"

import { ChevronLeft, ChevronRight, FlaskConical, Gauge, Plug, Workflow } from "lucide-react"
import { ContextBreakdown, ResearchTask } from "@/types/chat"
import { ContextSection } from "./context-panel"
import { FlowsSection } from "./flows-section"
import { McpSection } from "./mcp-section"
import { ModelsSection } from "./models-section"
import { ResearchSection } from "./research-panel"

// The chat's right-hand sidebar: what the context window is made of, and the
// background research tasks started from this conversation. Collapses to a
// thin strip; hidden below lg, where there is no room beside the chat.
export function SidePanel({
  tasks, open, onToggle, context, threadId,
}: {
  threadId: string | null
  tasks: ResearchTask[]
  open: boolean
  onToggle: () => void
  context: { total: number; window: number; modelName: string; breakdown: ContextBreakdown | null } | null
}) {
  const running = tasks.filter((t) => t.status === "running").length

  if (!open) {
    return (
      <aside className="hidden lg:flex w-11 shrink-0 flex-col items-center gap-3 border-l border-[#E0E7FF] bg-white/70 py-3">
        <button
          onClick={onToggle}
          aria-label="Open side panel"
          className="flex size-8 items-center justify-center rounded-lg text-gray-500 hover:bg-[#EEF0FF] hover:text-[#5661f6]"
        >
          <ChevronLeft className="size-4" />
        </button>
        {context && <Gauge className="size-4 text-gray-400" />}
        <Plug className="size-4 text-gray-400" />
        <Workflow className="size-4 text-gray-400" />
        {tasks.length > 0 && <FlaskConical className="size-4 text-gray-400" />}
        {running > 0 && (
          <span className="flex size-5 items-center justify-center rounded-full bg-[#5661f6] text-[10px] font-semibold text-white">
            {running}
          </span>
        )}
      </aside>
    )
  }

  return (
    <aside className="hidden lg:flex w-[340px] shrink-0 flex-col border-l border-[#E0E7FF] bg-white/70" aria-label="Side panel">
      <div className="flex justify-end px-2 pt-2">
        <button
          onClick={onToggle}
          aria-label="Collapse side panel"
          className="flex size-7 items-center justify-center rounded-lg text-gray-400 hover:bg-[#EEF0FF] hover:text-[#5661f6]"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {context && <ContextSection {...context} />}
        <ModelsSection />
        <McpSection threadId={threadId} />
        <FlowsSection />
        {tasks.length > 0 && <ResearchSection tasks={tasks} />}
      </div>
    </aside>
  )
}
