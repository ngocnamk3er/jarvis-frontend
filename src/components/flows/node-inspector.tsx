"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CircleAlert, Plus, Trash2, X } from "lucide-react"
import { NODE_LABELS, refsFor } from "@/lib/flow-graph"
import type { FlowCatalog, FlowDefinition, FlowNodeDef, InputField } from "@/types/flows"
import { NODE_STYLE } from "./flow-node-card"

export const INPUT = "w-full rounded-md border border-[#E0E7FF] bg-white px-2 py-1.5 text-[12px] text-gray-800 outline-none focus:border-[#5661f6] placeholder:text-gray-400"
const LABEL = "mb-1 block text-[11px] font-semibold text-gray-500"

// The text field a reference chip goes into: the last one focused, else the node's main one.
type Target = { el: HTMLTextAreaElement | HTMLInputElement; set: (v: string) => void }

function TemplateField({
  label, value, onChange, rows = 4, placeholder, primary = false, onTarget, hint, required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  rows?: number
  placeholder?: string
  primary?: boolean
  onTarget: (t: Target, primary: boolean) => void   // this field is where a reference chip should go
  hint?: string
  required?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const set = useRef(onChange)
  useEffect(() => { set.current = onChange })
  useEffect(() => {
    if (primary && ref.current) onTarget({ el: ref.current, set: (v: string) => set.current(v) }, true)
  }, [primary, onTarget])
  return (
    <label className="block">
      <span className={LABEL}>{label}{required && <span className="text-red-500"> *</span>}</span>
      <textarea
        ref={ref} rows={rows} value={value} placeholder={placeholder}
        onFocus={(e) => onTarget({ el: e.currentTarget, set: (v: string) => set.current(v) }, false)}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT} resize-y font-mono text-[11.5px] leading-[17px]`}
      />
      {hint && <span className="mt-0.5 block text-[10.5px] leading-[14px] text-gray-400">{hint}</span>}
    </label>
  )
}

function FieldsEditor({ fields, onChange }: { fields: InputField[]; onChange: (f: InputField[]) => void }) {
  const set = (i: number, patch: Partial<InputField>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  return (
    <div className="space-y-2">
      <span className={LABEL}>Inputs the flow asks for</span>
      {fields.map((f, i) => (
        <div key={i} className="space-y-1.5 rounded-lg border border-[#E0E7FF] bg-[#FAFBFF] p-2">
          <div className="flex gap-1.5">
            <input className={`${INPUT} font-mono`} value={f.name} placeholder="name" aria-label="Field name"
                   onChange={(e) => set(i, { name: e.target.value })} />
            <select className={`${INPUT} w-[96px] shrink-0`} value={f.type} aria-label="Field type"
                    onChange={(e) => set(i, { type: e.target.value as InputField["type"] })}>
              <option value="string">text</option>
              <option value="number">number</option>
              <option value="boolean">yes/no</option>
            </select>
            <button type="button" onClick={() => onChange(fields.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}
                    className="shrink-0 text-gray-400 hover:text-red-500"><X className="size-3.5" /></button>
          </div>
          <input className={INPUT} value={f.description ?? ""} placeholder="What it is (the agent reads this)"
                 aria-label="Field description" onChange={(e) => set(i, { description: e.target.value })} />
          <label className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <input type="checkbox" checked={f.required !== false} onChange={(e) => set(i, { required: e.target.checked })} />
            Required
          </label>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...fields, { name: `field${fields.length + 1}`, type: "string", required: true }])}
              className="flex items-center gap-1 text-[12px] font-semibold text-[#5661f6] hover:underline">
        <Plus className="size-3.5" />Add input
      </button>
    </div>
  )
}

// The tools an LLM step's model may call itself (it decides when and how often), and how many calls it gets.
function ToolPicker({
  catalog, chosen, max, onChange,
}: { catalog: FlowCatalog | null; chosen: string[]; max: number; onChange: (tools: string[], max: number) => void }) {
  const names = [...(catalog?.tools.map((t) => t.name) ?? []), ...chosen.filter((c) => !catalog?.tools.some((t) => t.name === c))]
  const describe = (n: string) => catalog?.tools.find((t) => t.name === n)?.description ?? "No longer available"
  return (
    <div>
      <span className={LABEL}>Tools the model may use (it decides when, and how often)</span>
      <div className="space-y-0.5 rounded-lg border border-[#E0E7FF] p-1.5">
        {names.map((n) => (
          <label key={n} className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 hover:bg-[#F7F8FF]">
            <input type="checkbox" className="mt-[3px]" checked={chosen.includes(n)}
                   onChange={(e) => onChange(e.target.checked ? [...chosen, n] : chosen.filter((c) => c !== n), max)} />
            <span className="min-w-0">
              <span className="block font-mono text-[11.5px] text-gray-700">{n}</span>
              <span className="line-clamp-1 block text-[10.5px] leading-[14px] text-gray-400">{describe(n)}</span>
            </span>
          </label>
        ))}
      </div>
      {chosen.length > 0 && (
        <label className="mt-1.5 flex items-center gap-2 text-[11.5px] text-gray-600">
          At most
          <input type="number" min={1} max={20} value={max} aria-label="Most tool calls"
                 onChange={(e) => onChange(chosen, Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
                 className={`${INPUT} w-16`} />
          tool calls, then it has to answer
        </label>
      )}
    </div>
  )
}

// The settings of the selected node.
export function NodeInspector({
  node, def, catalog, problems, onChange, onRename, onDelete,
}: {
  node: FlowNodeDef
  def: FlowDefinition
  catalog: FlowCatalog | null
  problems: string[]
  onChange: (n: FlowNodeDef) => void
  onRename: (to: string) => string | null
  onDelete: () => void
}) {
  // Keyed by node id where it is used, so all of this starts afresh for each node.
  const targets = useRef<{ active: Target | null; fallback: Target | null }>({ active: null, fallback: null })
  const onTarget = useCallback((t: Target, primary: boolean) => {
    if (primary) targets.current.fallback = t
    else targets.current.active = t
  }, [])
  const [id, setId] = useState(node.id)
  const [idError, setIdError] = useState<string | null>(null)
  const refs = refsFor(node.id, def)
  const { Icon, tint } = NODE_STYLE[node.type]

  const insert = (text: string) => {
    const t = targets.current.active ?? targets.current.fallback
    if (!t) return
    const start = t.el.selectionStart ?? t.el.value.length
    const end = t.el.selectionEnd ?? start
    t.set(t.el.value.slice(0, start) + text + t.el.value.slice(end))
    requestAnimationFrame(() => { t.el.focus(); t.el.setSelectionRange(start + text.length, start + text.length) })
  }
  const rename = () => {
    if (id === node.id) return
    setIdError(onRename(id))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className={`flex size-7 items-center justify-center rounded-lg ${tint}`}><Icon className="size-4" /></span>
        <span className="flex-1 text-[13px] font-semibold text-gray-800">{NODE_LABELS[node.type]} step</span>
        <button type="button" onClick={onDelete} className="flex items-center gap-1 text-[11.5px] text-gray-400 hover:text-red-500">
          <Trash2 className="size-3.5" />Delete
        </button>
      </div>

      {problems.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-2">
          {problems.map((p, i) => (
            <li key={i} className="flex items-start gap-1 text-[11.5px] leading-[16px] text-red-700">
              <CircleAlert className="mt-[2px] size-3 shrink-0" />{p}
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className={LABEL}>Id (used in {"{{…}}"})</span>
          <input className={`${INPUT} font-mono`} value={id} aria-label="Node id"
                 onChange={(e) => setId(e.target.value)} onBlur={rename}
                 onKeyDown={(e) => { if (e.key === "Enter") rename() }} />
        </label>
        <label className="block">
          <span className={LABEL}>Name</span>
          <input className={INPUT} value={node.label ?? ""} placeholder={NODE_LABELS[node.type]} aria-label="Node name"
                 onChange={(e) => onChange({ ...node, label: e.target.value })} />
        </label>
      </div>
      {idError && <p className="-mt-2 text-[11px] text-red-600">{idError}</p>}

      {node.type !== "input" && refs.length > 0 && (
        <div>
          <span className={LABEL}>Insert what an earlier step produced</span>
          <div className="flex flex-wrap gap-1">
            {refs.map((r) => (
              <button key={r} type="button" onMouseDown={(e) => { e.preventDefault(); insert(r) }}
                      className="rounded-md bg-[#EEF0FF] px-1.5 py-0.5 font-mono text-[10.5px] text-[#5661f6] hover:bg-[#E0E4FF]">
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      {node.type === "input" && (
        <FieldsEditor fields={node.config.fields} onChange={(fields) => onChange({ ...node, config: { fields } })} />
      )}

      {node.type === "llm" && (
        <>
          <TemplateField label="Prompt" required primary rows={6} onTarget={onTarget} value={node.config.prompt}
                         placeholder="e.g. Summarise in three bullet points: {{s.result}}"
                         onChange={(prompt) => onChange({ ...node, config: { ...node.config, prompt } })} />
          <TemplateField label="System message (optional)" rows={2} onTarget={onTarget} value={node.config.system ?? ""}
                         onChange={(system) => onChange({ ...node, config: { ...node.config, system } })} />
          <ToolPicker catalog={catalog} chosen={node.config.tools ?? []} max={node.config.max_tool_calls ?? 5}
                      onChange={(tools, max_tool_calls) => onChange({ ...node, config: { ...node.config, tools, max_tool_calls } })} />
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={LABEL}>Model</span>
              <select className={INPUT} value={node.config.model ?? ""} aria-label="Model"
                      onChange={(e) => onChange({ ...node, config: { ...node.config, model: e.target.value || null } })}>
                <option value="">The chat&apos;s model</option>
                {catalog?.models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={LABEL}>Answer as</span>
              <select className={INPUT} value={node.config.output ?? "text"} aria-label="Answer as"
                      onChange={(e) => onChange({ ...node, config: { ...node.config, output: e.target.value as "text" | "json" } })}>
                <option value="text">Text</option>
                <option value="json">JSON</option>
              </select>
            </label>
          </div>
        </>
      )}

      {node.type === "tool" && (() => {
        const tool = catalog?.tools.find((t) => t.name === node.config.tool)
        return (
          <>
            <label className="block">
              <span className={LABEL}>Tool</span>
              <select className={INPUT} value={node.config.tool} aria-label="Tool"
                      onChange={(e) => onChange({ ...node, config: { tool: e.target.value, args: {} } })}>
                {!tool && <option value={node.config.tool}>{node.config.tool}</option>}
                {catalog?.tools.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
              </select>
              {tool?.description && <span className="mt-0.5 block text-[10.5px] leading-[14px] text-gray-400">{tool.description}</span>}
            </label>
            {tool?.args.map((a, i) => (
              <TemplateField key={a.name} label={`${a.name} · ${a.type}`} required={a.required} primary={i === 0}
                             rows={a.type === "string" ? 2 : 1}
                             onTarget={onTarget} value={node.config.args[a.name] ?? ""} hint={a.description || undefined}
                             onChange={(v) => {
                               const args = { ...node.config.args, [a.name]: v }
                               if (!v) delete args[a.name]
                               onChange({ ...node, config: { ...node.config, args } })
                             }} />
            ))}
          </>
        )
      })()}

      {node.type === "output" && (
        <TemplateField label="What the flow returns" required primary rows={6} onTarget={onTarget}
                       value={node.config.template} placeholder="e.g. {{sum.text}}"
                       onChange={(template) => onChange({ ...node, config: { template } })} />
      )}
    </div>
  )
}
