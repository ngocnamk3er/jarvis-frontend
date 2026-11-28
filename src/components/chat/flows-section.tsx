"use client"

import { useState } from "react"
import Link from "next/link"
import { ExternalLink, Loader2, Plus, Workflow } from "lucide-react"
import { useFlows } from "@/hooks/use-flows"

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
            className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors ${on ? "bg-[#5661f6]" : "bg-gray-300"}`}>
      <span className={`absolute top-[2px] size-[14px] rounded-full bg-white shadow transition-all ${on ? "left-[16px]" : "left-[2px]"}`} />
    </button>
  )
}

// The user's flows, from the chat: which are on (the agent may run those), and a way to the editor.
export function FlowsSection() {
  const { flows, setEnabled } = useFlows()
  const [notice, setNotice] = useState<string | null>(null)
  if (!flows) return <div className="p-3"><Loader2 className="size-4 animate-spin text-gray-300" /></div>
  return (
    <section aria-label="Flows" className="space-y-2.5 border-b border-[#E0E7FF] p-3">
      <div className="flex items-center gap-2 px-1 text-[13px] font-semibold text-gray-800">
        <Workflow className="size-4 text-[#5661f6]" />
        Flows
        <span className="rounded-full bg-[#EEF0FF] px-1.5 text-[11px] font-semibold text-[#5661f6]">{flows.length}</span>
        <span className="flex-1" />
        <Link href="/flows" className="flex items-center gap-1 text-[11.5px] font-medium text-gray-400 hover:text-[#5661f6]">
          Manage<ExternalLink className="size-3" />
        </Link>
      </div>
      {flows.length > 0 && (
        <ul className="space-y-1.5">
          {flows.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-lg border border-[#E0E7FF] bg-white px-2.5 py-2">
              <Link href={`/flows/${f.id}`} className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-gray-800 hover:text-[#5661f6]" title={f.description}>
                {f.name}
              </Link>
              <Toggle on={f.enabled} label={`Let the agent run ${f.name}`}
                      onChange={async (v) => setNotice(await setEnabled(f.id, v))} />
            </li>
          ))}
        </ul>
      )}
      {notice && <p className="px-1 text-[11.5px] text-red-600">{notice}</p>}
      <Link href="/flows/new" className="flex items-center gap-1 px-1 text-[12px] font-semibold text-[#5661f6] hover:underline">
        <Plus className="size-3.5" />New flow
      </Link>
      {flows.length === 0 && (
        <p className="px-1 text-[11px] leading-[16px] text-gray-400">
          Build a series of steps once — search, ask a model, return a result — and the agent can run it for you.
        </p>
      )}
    </section>
  )
}
