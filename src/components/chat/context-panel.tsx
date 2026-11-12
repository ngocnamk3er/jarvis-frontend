"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, Gauge } from "lucide-react"
import { ContextBreakdown, ContextTool } from "@/types/chat"

// Same threshold the backend compacts at (COMPACT_THRESHOLD_RATIO in
// chat_service.py): the last fifth of the window is kept free for the reply
// and the next turn, so it is shown as reserved rather than as free space.
const COMPACT_AT = 0.8

const COLORS = {
  messages: "#5661f6",
  system: "#f59e0b",
  skills: "#14b8a6",
  tools: "#f97316",
  mcp: "#a855f7",
  reserved: "#9ca3af",
  free: "#e5e7eb",
}

function k(n: number) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(2)}M`
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

function pct(n: number, of: number) {
  return `${((n / of) * 100).toFixed(1)}%`
}

type RowProps = {
  color: string
  label: string
  tokens: number
  of?: number          // omitted: not part of the window (deferred), so no percentage
  hint?: string
  items?: ContextTool[]
}

function Row({ color, label, tokens, of, hint, items }: RowProps) {
  const [open, setOpen] = useState(false)
  const expandable = !!items && items.length > 0
  const body = (
    <>
      <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />
      <span className="flex-1 min-w-0 truncate text-left text-gray-700" title={hint}>{label}</span>
      {expandable && (open ? <ChevronDown className="size-3 text-gray-400" /> : <ChevronRight className="size-3 text-gray-400" />)}
      <span className="w-12 text-right tabular-nums text-gray-400">{k(tokens)}</span>
      <span className="w-12 text-right tabular-nums font-medium text-gray-700">{of ? pct(tokens, of) : "—"}</span>
    </>
  )
  const cls = "flex w-full items-center gap-2 py-[3px] text-[12px]"
  return (
    <>
      {expandable
        ? <button type="button" onClick={() => setOpen((o) => !o)} className={`${cls} hover:bg-[#F7F8FF] rounded`}>{body}</button>
        : <div className={cls}>{body}</div>}
      {expandable && open && (
        <ul className="ml-[18px] mb-1 space-y-0.5 border-l border-[#E0E7FF] pl-2">
          {items!.map((t) => (
            <li key={t.name} className="flex items-center justify-between text-[11px] text-gray-500">
              <span className="truncate font-mono">{t.name}</span>
              <span className="tabular-nums text-gray-400">{k(t.tokens)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function ContextSection({
  total, window: win, modelName, breakdown,
}: { total: number; window: number; modelName: string; breakdown: ContextBreakdown | null }) {
  const system = breakdown?.system_prompt ?? null
  const tools = breakdown?.tools ?? null
  const known = system !== null && tools !== null
  const skills = breakdown?.skills ?? 0
  const mcp = breakdown?.mcp_tools ?? 0
  // Messages = the provider's real total minus the measured parts, taken from
  // the live total so the parts always add up to the gauge.
  const messages = known ? Math.max(0, total - system - skills - tools - mcp) : total
  const reserved = Math.round(win * (1 - COMPACT_AT))
  const free = Math.max(0, win - total - reserved)
  const used = Math.min(1, total / win)

  const sent = breakdown?.tool_detail ?? []
  const builtin = sent.filter((t) => t.kind === "builtin")
  const mcpSent = sent.filter((t) => t.kind === "mcp")
  const held = breakdown?.deferred.detail ?? []
  const heldBuiltin = held.filter((t) => t.kind === "builtin")
  const heldMcp = held.filter((t) => t.kind === "mcp")
  const sum = (xs: ContextTool[]) => xs.reduce((a, t) => a + t.tokens, 0)

  const segs = [
    ...(known ? [
      { c: COLORS.messages, n: messages }, { c: COLORS.system, n: system }, { c: COLORS.skills, n: skills },
      { c: COLORS.tools, n: tools }, { c: COLORS.mcp, n: mcp },
    ] : [{ c: COLORS.messages, n: total }]),
    { c: COLORS.reserved, n: Math.min(reserved, Math.max(0, win - total)) },
  ]

  return (
    <section aria-label="Context" className="p-3 border-b border-[#E0E7FF] space-y-2.5">
      <div className="flex items-center gap-2 px-1 text-[13px] font-semibold text-gray-800">
        <Gauge className="size-4 text-[#5661f6]" />
        Context
      </div>

      <div className="px-1">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-semibold text-gray-800">Used {(used * 100).toFixed(used < 0.1 ? 1 : 0)}%</span>
          <span className="text-[11px] text-gray-400 tabular-nums">{k(total)} / {k(win)}</span>
        </div>
        <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full" style={{ background: COLORS.free }} title={modelName}>
          {segs.map((s, i) => <div key={i} style={{ width: `${(s.n / win) * 100}%`, background: s.c }} />)}
        </div>
      </div>

      <div>
        <Row color={COLORS.messages} label="Messages" tokens={messages} of={win} hint="Conversation history, including tool results" />
        {known && (
          <>
            <Row color={COLORS.system} label="System prompt" tokens={system} of={win} />
            {skills > 0 && <Row color={COLORS.skills} label="Skills" tokens={skills} of={win} hint="Name and description of each skill; a skill's full text loads only when used" />}
            <Row color={COLORS.tools} label="System tools" tokens={tools} of={win} hint="Tool schemas sent with every call" items={builtin} />
            {mcp > 0 && <Row color={COLORS.mcp} label="MCP tools" tokens={mcp} of={win} hint="Loaded from MCP servers, and asked for by the model" items={mcpSent} />}
          </>
        )}
        <Row color={COLORS.reserved} label="Autocompact buffer" tokens={reserved} of={win}
             hint="Kept free: the conversation is summarised once it passes 80% of the window" />
        <Row color={COLORS.free} label="Free space" tokens={free} of={win} />
      </div>

      {(heldBuiltin.length > 0 || heldMcp.length > 0) && (
        <div className="border-t border-[#E0E7FF] pt-2">
          <p className="px-0.5 pb-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400" title="Not sent to the model until it asks for them with tool_search">
            Deferred — not sent
          </p>
          {heldBuiltin.length > 0 && <Row color="#6b7280" label="System tools (deferred)" tokens={sum(heldBuiltin)} items={heldBuiltin} />}
          {heldMcp.length > 0 && <Row color="#6b7280" label="MCP tools (deferred)" tokens={sum(heldMcp)} items={heldMcp} />}
        </div>
      )}

      {!known && (
        <p className="px-1 text-[11px] leading-[16px] text-gray-400">
          The split into system prompt and tools appears after the next message.
        </p>
      )}
    </section>
  )
}
