"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, CircleAlert, Loader2, Plug, Plus, Trash2, X } from "lucide-react"
import { useMcpServers } from "@/hooks/use-mcp-servers"
import { McpServer } from "@/types/chat"

const INPUT = "w-full rounded-md border border-[#E0E7FF] bg-white px-2 py-1.5 text-[12px] text-gray-800 outline-none focus:border-[#5661f6] placeholder:text-gray-400"

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors ${on ? "bg-[#5661f6]" : "bg-gray-300"}`}
    >
      <span className={`absolute top-[2px] size-[14px] rounded-full bg-white shadow transition-all ${on ? "left-[16px]" : "left-[2px]"}`} />
    </button>
  )
}

function Server({
  s, canToggle, onToggle, onRemove,
}: { s: McpServer; canToggle: boolean; onToggle: (v: boolean) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const on = s.enabled !== false
  return (
    <li className="rounded-lg border border-[#E0E7FF] bg-white p-2.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className={`size-2 shrink-0 rounded-full ${s.error ? "bg-red-400" : "bg-emerald-400"}`} title={s.error ?? "Connected"} />
        <span className="flex-1 min-w-0 truncate text-[12.5px] font-semibold text-gray-800">{s.name}</span>
        {canToggle && <Toggle on={on} onChange={onToggle} label={`Use ${s.name} in this conversation`} />}
        {confirming ? (
          <span className="flex items-center gap-1 text-[11px]">
            <button onClick={onRemove} className="font-semibold text-red-600 hover:underline">Remove</button>
            <button onClick={() => setConfirming(false)} aria-label="Cancel" className="text-gray-400 hover:text-gray-600"><X className="size-3" /></button>
          </span>
        ) : (
          <button onClick={() => setConfirming(true)} aria-label={`Remove ${s.name}`} className="text-gray-400 hover:text-red-500">
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
      <p className="truncate text-[11px] font-mono text-gray-400" title={s.url}>{s.url}</p>
      {s.error ? (
        <p className="flex items-start gap-1 text-[11px] text-red-600 break-words"><CircleAlert className="mt-[1px] size-3 shrink-0" />{s.error}</p>
      ) : (
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-[#5661f6]">
          {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          {s.tools.length} tool{s.tools.length === 1 ? "" : "s"}
          {s.header_names.length > 0 && <span className="text-gray-400"> · {s.header_names.length} header{s.header_names.length === 1 ? "" : "s"}</span>}
        </button>
      )}
      {open && !s.error && (
        <ul className="ml-1 space-y-0.5 border-l border-[#E0E7FF] pl-2">
          {s.tools.map((t) => <li key={t} className="truncate font-mono text-[11px] text-gray-500">{t}</li>)}
        </ul>
      )}
    </li>
  )
}

function AddForm({
  headersSupported, onAdd, onClose,
}: {
  headersSupported: boolean
  onAdd: ReturnType<typeof useMcpServers>["add"]
  onClose: () => void
}) {
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [transport, setTransport] = useState<"streamable_http" | "sse">("streamable_http")
  const [headers, setHeaders] = useState<{ k: string; v: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const h: Record<string, string> = {}
    headers.forEach(({ k, v }) => { if (k.trim()) h[k.trim()] = v })
    const err = await onAdd({ name: name.trim(), url: url.trim(), transport, headers: h })
    setBusy(false)
    if (err) setError(err)
    else onClose()
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-[#C7CCFF] bg-[#F7F8FF] p-2.5 space-y-2">
      <input className={INPUT} placeholder="Name (e.g. docs)" value={name} onChange={(e) => setName(e.target.value)} required maxLength={24} aria-label="Server name" />
      <input className={INPUT} placeholder="https://example.com/mcp" value={url} onChange={(e) => setUrl(e.target.value)} required type="url" aria-label="Server URL" />
      <select className={INPUT} value={transport} onChange={(e) => setTransport(e.target.value as typeof transport)} aria-label="Transport">
        <option value="streamable_http">Streamable HTTP</option>
        <option value="sse">SSE</option>
      </select>
      {headersSupported && (
        <div className="space-y-1.5">
          {headers.map((h, i) => (
            <div key={i} className="flex gap-1.5">
              <input className={INPUT} placeholder="Header" value={h.k} aria-label="Header name"
                     onChange={(e) => setHeaders((hs) => hs.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} />
              <input className={INPUT} placeholder="Value" type="password" autoComplete="off" value={h.v} aria-label="Header value"
                     onChange={(e) => setHeaders((hs) => hs.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} />
              <button type="button" onClick={() => setHeaders((hs) => hs.filter((_, j) => j !== i))} aria-label="Remove header" className="text-gray-400 hover:text-red-500"><X className="size-3.5" /></button>
            </div>
          ))}
          <button type="button" onClick={() => setHeaders((hs) => [...hs, { k: "Authorization", v: "" }])} className="text-[11px] font-semibold text-[#5661f6] hover:underline">
            + Add header (token)
          </button>
        </div>
      )}
      {error && <p className="flex items-start gap-1 text-[11.5px] text-red-600 break-words"><CircleAlert className="mt-[1px] size-3 shrink-0" />{error}</p>}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="flex items-center gap-1 rounded-md bg-[#5661f6] px-2.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60">
          {busy && <Loader2 className="size-3 animate-spin" />}{busy ? "Connecting…" : "Connect"}
        </button>
        <button type="button" onClick={onClose} className="text-[12px] text-gray-500 hover:text-gray-700">Cancel</button>
      </div>
    </form>
  )
}

// MCP servers the user adds themselves. A server belongs to the user and shows
// up in all their conversations; the switch decides whether this conversation
// may use it. Its tools stay out of the model's context until it asks for them.
export function McpSection({ threadId }: { threadId: string | null }) {
  const { data, loading, add, remove, setEnabled } = useMcpServers(threadId)
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  if (!data) return loading ? <div className="p-3"><Loader2 className="size-4 animate-spin text-gray-300" /></div> : null
  if (!data.enabled) return null
  const full = data.servers.length >= data.max_servers
  const show = async (p: Promise<string | null>) => setNotice(await p)

  return (
    <section aria-label="MCP servers" className="p-3 border-b border-[#E0E7FF] space-y-2.5">
      <div className="flex items-center gap-2 px-1 text-[13px] font-semibold text-gray-800">
        <Plug className="size-4 text-[#5661f6]" />
        MCP servers
        <span className="rounded-full bg-[#EEF0FF] px-1.5 text-[11px] font-semibold text-[#5661f6]">{data.servers.length}</span>
      </div>
      {data.servers.length > 0 && (
        <ul className="space-y-2">
          {data.servers.map((s) => (
            <Server key={s.id} s={s} canToggle={!!threadId}
                    onToggle={(v) => show(setEnabled(s.id, v))} onRemove={() => show(remove(s.id))} />
          ))}
        </ul>
      )}
      {notice && <p className="px-1 text-[11.5px] text-red-600">{notice}</p>}
      {adding ? (
        <AddForm headersSupported={data.headers_supported} onAdd={add} onClose={() => setAdding(false)} />
      ) : (
        <button onClick={() => { setNotice(null); setAdding(true) }} disabled={full}
                className="flex items-center gap-1 px-1 text-[12px] font-semibold text-[#5661f6] hover:underline disabled:text-gray-400 disabled:no-underline">
          <Plus className="size-3.5" />{full ? `Limit of ${data.max_servers} reached` : "Add server"}
        </button>
      )}
      {data.servers.length === 0 && !adding && (
        <p className="px-1 text-[11px] leading-[16px] text-gray-400">
          Connect a remote MCP server to give the agent more tools. Its tools are only loaded when the agent asks for them.
        </p>
      )}
    </section>
  )
}
