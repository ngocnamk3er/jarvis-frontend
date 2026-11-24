"use client"

import { useState } from "react"
import { Check, ChevronDown, ChevronRight, CircleAlert, Cpu, Loader2, Minus, Plus, RefreshCw, Trash2, X } from "lucide-react"
import { NewUserModel, useUserModels } from "@/hooks/use-user-models"
import { ModelCheckStep, UserModel } from "@/types/chat"

const INPUT = "w-full rounded-md border border-[#E0E7FF] bg-white px-2 py-1.5 text-[12px] text-gray-800 outline-none focus:border-[#5661f6] placeholder:text-gray-400"

const STATUS: Record<UserModel["status"], { dot: string; label: string }> = {
  ok: { dot: "bg-emerald-400", label: "Connected" },
  degraded: { dot: "bg-amber-400", label: "Connected, but it cannot call tools" },
  error: { dot: "bg-red-400", label: "Not working" },
  unchecked: { dot: "bg-gray-300", label: "Not checked yet" },
}

function StepRow({ s }: { s: ModelCheckStep }) {
  const icon = s.ok === true ? <Check className="size-3 text-emerald-500" />
    : s.ok === false ? <X className="size-3 text-red-500" />
    : <Minus className="size-3 text-gray-400" />
  return (
    <li className="flex items-start gap-1.5 text-[11px] leading-[15px]">
      <span className="mt-[2px] shrink-0">{icon}</span>
      <span className="min-w-0 break-words text-gray-600">
        <span className="font-semibold text-gray-700">{s.name}</span> — {s.detail}
        <span className="text-gray-400"> · {s.ms} ms</span>
      </span>
    </li>
  )
}

function Capability({ label, value }: { label: string; value: boolean | null | undefined }) {
  if (value == null) return null
  return (
    <span className={`rounded-full px-1.5 py-[1px] text-[10.5px] font-semibold ${value ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
      {label}: {value ? "yes" : "no"}
    </span>
  )
}

function ModelRow({
  m, busy, onCheck, onRemove,
}: { m: UserModel; busy: boolean; onCheck: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const st = STATUS[m.status] ?? STATUS.unchecked
  const caps = m.result?.capabilities
  return (
    <li className="rounded-lg border border-[#E0E7FF] bg-white p-2.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className={`size-2 shrink-0 rounded-full ${busy ? "bg-sky-400 animate-pulse" : st.dot}`} title={busy ? "Checking…" : st.label} />
        <span className="flex-1 min-w-0 truncate text-[12.5px] font-semibold text-gray-800">{m.name}</span>
        <button onClick={onCheck} disabled={busy} aria-label={`Check ${m.name}`} title="Check the connection"
                className="text-gray-400 hover:text-[#5661f6] disabled:opacity-60">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
        </button>
        {confirming ? (
          <span className="flex items-center gap-1 text-[11px]">
            <button onClick={onRemove} className="font-semibold text-red-600 hover:underline">Remove</button>
            <button onClick={() => setConfirming(false)} aria-label="Cancel" className="text-gray-400 hover:text-gray-600"><X className="size-3" /></button>
          </span>
        ) : (
          <button onClick={() => setConfirming(true)} aria-label={`Remove ${m.name}`} className="text-gray-400 hover:text-red-500">
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
      <p className="truncate text-[11px] font-mono text-gray-400" title={m.base_url ?? "OpenRouter"}>
        {m.model}{m.kind === "endpoint" && m.base_url ? ` · ${m.base_url}` : " · OpenRouter"}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-gray-500">{busy ? "Checking…" : st.label}</span>
        <Capability label="Tools" value={caps?.tools} />
        <Capability label="Images" value={caps?.vision} />
      </div>
      {m.result && m.result.steps.length > 0 && (
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-[#5661f6]">
          {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          Details{m.checked_at ? ` · checked ${new Date(m.checked_at).toLocaleTimeString()}` : ""}
        </button>
      )}
      {open && m.result && (
        <ul className="ml-1 space-y-1 border-l border-[#E0E7FF] pl-2">
          {m.result.steps.map((s) => <StepRow key={s.name} s={s} />)}
        </ul>
      )}
    </li>
  )
}

function AddForm({
  keysSupported, onAdd, onClose,
}: { keysSupported: boolean; onAdd: (m: NewUserModel) => Promise<string | null>; onClose: () => void }) {
  const [kind, setKind] = useState<NewUserModel["kind"]>("openrouter")
  const [name, setName] = useState("")
  const [model, setModel] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [context, setContext] = useState("128000")
  const [reasoning, setReasoning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const err = await onAdd({
      name: name.trim(), kind, model: model.trim(),
      ...(kind === "endpoint" ? { base_url: baseUrl.trim(), ...(apiKey ? { api_key: apiKey } : {}) } : {}),
      context_window: Number(context) || 128000,
      send_reasoning: kind === "endpoint" ? reasoning : true,
    })
    setBusy(false)
    if (err) setError(err)
    else onClose()
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-[#C7CCFF] bg-[#F7F8FF] p-2.5 space-y-2">
      <select className={INPUT} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Kind of model">
        <option value="openrouter">A model on OpenRouter</option>
        <option value="endpoint">My own endpoint (OpenAI-compatible)</option>
      </select>
      <input className={INPUT} placeholder="Name shown in the list" value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} aria-label="Display name" />
      <input className={INPUT} value={model} onChange={(e) => setModel(e.target.value)} required aria-label="Model name"
             placeholder={kind === "openrouter" ? "OpenRouter model id, e.g. mistralai/mistral-large-4-0" : "Model name, e.g. llama3.1:8b"} />
      {kind === "endpoint" && (
        <>
          <input className={INPUT} placeholder="Base URL, e.g. https://api.example.com/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required type="url" aria-label="Base URL" />
          {keysSupported ? (
            <input className={INPUT} placeholder="API key (stored encrypted; leave empty if none)" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} aria-label="API key" />
          ) : (
            <p className="text-[11px] text-gray-500">This server cannot store API keys, so only endpoints that need none can be added.</p>
          )}
        </>
      )}
      <label className="flex items-center gap-2 text-[11.5px] text-gray-600">
        Context window (tokens)
        <input className={`${INPUT} w-24`} value={context} onChange={(e) => setContext(e.target.value.replace(/\D/g, ""))} inputMode="numeric" aria-label="Context window" />
      </label>
      {kind === "endpoint" && (
        <label className="flex items-start gap-2 text-[11.5px] text-gray-600">
          <input type="checkbox" checked={reasoning} onChange={(e) => setReasoning(e.target.checked)} className="mt-[2px]" />
          <span>Send OpenRouter&apos;s <code>reasoning</code> field (only if the endpoint accepts it)</span>
        </label>
      )}
      {error && <p className="flex items-start gap-1 text-[11.5px] text-red-600 break-words"><CircleAlert className="mt-[1px] size-3 shrink-0" />{error}</p>}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="flex items-center gap-1 rounded-md bg-[#5661f6] px-2.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60">
          {busy && <Loader2 className="size-3 animate-spin" />}{busy ? "Adding…" : "Add and check"}
        </button>
        <button type="button" onClick={onClose} className="text-[12px] text-gray-500 hover:text-gray-700">Cancel</button>
      </div>
    </form>
  )
}

// Models the user adds themselves, with the state of the last connection check on each.
// They belong to the user, show up in the model picker, and are checked as soon as they are added.
export function ModelsSection() {
  const { data, loading, checking, add, remove, check } = useUserModels()
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  if (!data) return loading ? <div className="p-3"><Loader2 className="size-4 animate-spin text-gray-300" /></div> : null
  if (!data.enabled) return null
  const full = data.models.length >= data.max_models
  const show = async (p: Promise<string | null>) => setNotice(await p)

  return (
    <section aria-label="My models" className="p-3 border-b border-[#E0E7FF] space-y-2.5">
      <div className="flex items-center gap-2 px-1 text-[13px] font-semibold text-gray-800">
        <Cpu className="size-4 text-[#5661f6]" />
        My models
        <span className="rounded-full bg-[#EEF0FF] px-1.5 text-[11px] font-semibold text-[#5661f6]">{data.models.length}</span>
      </div>
      {data.models.length > 0 && (
        <ul className="space-y-2">
          {data.models.map((m) => (
            <ModelRow key={m.id} m={m} busy={checking.has(m.id)}
                      onCheck={() => show(check(m.id))} onRemove={() => show(remove(m.id))} />
          ))}
        </ul>
      )}
      {notice && <p className="px-1 text-[11.5px] text-red-600">{notice}</p>}
      {adding ? (
        <AddForm keysSupported={data.keys_supported} onAdd={add} onClose={() => setAdding(false)} />
      ) : (
        <button onClick={() => { setNotice(null); setAdding(true) }} disabled={full}
                className="flex items-center gap-1 px-1 text-[12px] font-semibold text-[#5661f6] hover:underline disabled:text-gray-400 disabled:no-underline">
          <Plus className="size-3.5" />{full ? `Limit of ${data.max_models} reached` : "Add model"}
        </button>
      )}
      {data.models.length === 0 && !adding && (
        <p className="px-1 text-[11px] leading-[16px] text-gray-400">
          Add a model on OpenRouter, or your own OpenAI-compatible endpoint. It appears in the model picker once added; the
          check tells you whether it connects, and whether it can call tools and see images.
        </p>
      )}
    </section>
  )
}
