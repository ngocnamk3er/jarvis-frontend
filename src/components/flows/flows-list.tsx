"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, CircleAlert, Loader2, Plus, Trash2, Workflow, X } from "lucide-react"
import { useFlows } from "@/hooks/use-flows"
import type { FlowSummary } from "@/types/flows"

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
            className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors ${on ? "bg-[#5661f6]" : "bg-gray-300"}`}>
      <span className={`absolute top-[2px] size-[14px] rounded-full bg-white shadow transition-all ${on ? "left-[16px]" : "left-[2px]"}`} />
    </button>
  )
}

function Row({ f, onToggle, onDelete }: { f: FlowSummary; onToggle: (v: boolean) => void; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <li className="flex items-start gap-3 rounded-xl border border-[#E0E7FF] bg-white p-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#EEF0FF] text-[#5661f6]"><Workflow className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <Link href={`/flows/${f.id}`} className="text-[14px] font-semibold text-gray-900 hover:text-[#5661f6]">{f.name}</Link>
        <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-[18px] text-gray-500">{f.description || "No description."}</p>
        <p className="mt-1 text-[11px] text-gray-400">
          <span className="font-mono">flow_{f.slug}</span> · v{f.version} · saved {new Date(f.updated_at).toLocaleString()}
        </p>
      </div>
      <label className="flex shrink-0 items-center gap-2 text-[11.5px] text-gray-500">
        In chat
        <Toggle on={f.enabled} onChange={onToggle} label={`Offer ${f.name} in chat`} />
      </label>
      {confirming ? (
        <span className="flex shrink-0 items-center gap-1.5 text-[11.5px]">
          <button type="button" onClick={onDelete} className="font-semibold text-red-600 hover:underline">Delete</button>
          <button type="button" onClick={() => setConfirming(false)} aria-label="Cancel" className="text-gray-400 hover:text-gray-600"><X className="size-3.5" /></button>
        </span>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} aria-label={`Delete ${f.name}`} className="shrink-0 text-gray-400 hover:text-red-500">
          <Trash2 className="size-4" />
        </button>
      )}
    </li>
  )
}

// The user's flows: open one, switch it on or off for chat, delete it, or start a new one.
export function FlowsList() {
  const { flows, error, refresh, setEnabled, remove } = useFlows()
  const [notice, setNotice] = useState<string | null>(null)
  const show = async (p: Promise<string | null>) => setNotice(await p)

  return (
    <div className="min-h-screen bg-[#F7F8FF]">
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <Link href="/" className="flex items-center gap-1 text-[12.5px] font-medium text-gray-500 hover:text-[#5661f6]">
          <ArrowLeft className="size-3.5" />Back to chat
        </Link>
        <div className="mt-4 flex items-center gap-3">
          <h1 className="flex-1 text-[22px] font-bold text-gray-900">Flows</h1>
          <Link href="/flows/new" className="flex items-center gap-1.5 rounded-full bg-[#5661f6] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#4550e0]">
            <Plus className="size-3.5" />New flow
          </Link>
        </div>
        <p className="mt-1 text-[13px] leading-[20px] text-gray-500">
          A flow is a fixed series of steps — search, ask a model, return a result. Switched on, the agent can run it in
          your chats when a request fits its description.
        </p>
        {notice && <p className="mt-3 text-[12px] text-red-600">{notice}</p>}
        {error && (
          <p className="mt-6 flex items-center gap-1.5 text-[13px] text-red-600">
            <CircleAlert className="size-4" />{error}
            <button type="button" onClick={() => void refresh()} className="font-semibold text-[#5661f6] hover:underline">Try again</button>
          </p>
        )}
        {!flows && !error && <Loader2 className="mt-8 size-5 animate-spin text-gray-300" />}
        {flows && flows.length === 0 && (
          <div className="mt-8 rounded-xl border border-dashed border-[#C7CCFF] bg-white p-8 text-center">
            <Workflow className="mx-auto size-6 text-[#5661f6]" />
            <p className="mt-2 text-[13.5px] font-semibold text-gray-800">No flows yet</p>
            <p className="mt-1 text-[12.5px] text-gray-500">Start from a simple input → model → output flow and build from there.</p>
          </div>
        )}
        {flows && flows.length > 0 && (
          <ul className="mt-6 space-y-2.5">
            {flows.map((f) => (
              <Row key={f.id} f={f} onToggle={(v) => void show(setEnabled(f.id, v))} onDelete={() => void show(remove(f.id))} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
