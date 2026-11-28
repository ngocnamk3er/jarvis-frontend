"use client"

import { memo } from "react"
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { CircleAlert, CircleCheck, Flag, Loader2, LogIn, Sparkles, Wrench, type LucideIcon } from "lucide-react"
import { NODE_LABELS, summary } from "@/lib/flow-graph"
import type { FlowNodeDef, FlowNodeType } from "@/types/flows"

export type RunState = "running" | "done" | "error"
export type CardData = { def: FlowNodeDef; problems: number; run?: RunState }
export type CardNode = Node<CardData, "card">

export const NODE_STYLE: Record<FlowNodeType, { Icon: LucideIcon; tint: string }> = {
  input: { Icon: LogIn, tint: "bg-emerald-50 text-emerald-700" },
  llm: { Icon: Sparkles, tint: "bg-[#EEF0FF] text-[#5661f6]" },
  tool: { Icon: Wrench, tint: "bg-amber-50 text-amber-700" },
  output: { Icon: Flag, tint: "bg-sky-50 text-sky-700" },
}

const HANDLE = "!size-3 !border-2 !border-white !bg-[#5661f6]"

// A node on the canvas: its type, name and id, and one line of what it does. Red when validation found a problem in
// it; a status icon while a test run goes through it.
function Card({ data, selected }: NodeProps<CardNode>) {
  const { def, problems, run } = data
  const { Icon, tint } = NODE_STYLE[def.type]
  const ring = problems
    ? "border-red-400 ring-2 ring-red-100"
    : selected ? "border-[#5661f6] ring-2 ring-[#E0E7FF]" : "border-[#E0E7FF]"
  return (
    <div className={`w-[200px] rounded-xl border bg-white shadow-sm ${ring}`}>
      {def.type !== "input" && <Handle type="target" position={Position.Left} className={HANDLE} />}
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
        <span className={`flex size-6 shrink-0 items-center justify-center rounded-md ${tint}`}>
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-gray-800">{def.label || NODE_LABELS[def.type]}</div>
          <div className="truncate font-mono text-[10.5px] text-gray-400">{def.id}</div>
        </div>
        {run === "running" && <Loader2 className="size-3.5 shrink-0 animate-spin text-gray-400" aria-label="Running" />}
        {run === "done" && <CircleCheck className="size-3.5 shrink-0 text-emerald-500" aria-label="Done" />}
        {(run === "error" || problems > 0) && <CircleAlert className="size-3.5 shrink-0 text-red-500" aria-label="Problem" />}
      </div>
      {/* padding on a wrapper: on the clamped <p> itself a third line shows through the bottom padding */}
      <div className="px-3 py-2">
        <p className="line-clamp-2 break-words text-[11.5px] leading-[16px] text-gray-500">{summary(def)}</p>
      </div>
      {def.type === "llm" && (def.config.tools ?? []).length > 0 && (
        <div className="flex flex-wrap items-center gap-1 px-3 pb-2" title="Tools the model may call">
          <Wrench className="size-3 text-amber-600" />
          {def.config.tools!.map((t) => (
            <span key={t} className="rounded bg-amber-50 px-1 font-mono text-[10px] text-amber-700">{t}</span>
          ))}
        </div>
      )}
      {def.type !== "output" && <Handle type="source" position={Position.Right} className={HANDLE} />}
    </div>
  )
}

export const FlowNodeCard = memo(Card)
