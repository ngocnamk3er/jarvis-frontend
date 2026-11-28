"use client"

import { useRef, useState } from "react"
import { ChevronDown, ChevronRight, CircleAlert, CircleCheck, Circle, Loader2, Play, Square } from "lucide-react"
import { useSession } from "next-auth/react"
import { topological } from "@/lib/flow-graph"
import { FlowApiError, runFlow } from "@/lib/flows-api"
import type { FlowCatalog, FlowDefinition, FlowNodeType } from "@/types/flows"
import { NODE_STYLE, type RunState } from "./flow-node-card"
import { INPUT } from "./node-inspector"

type Call = { name: string; input: Record<string, unknown> }
type Step = { status: RunState; output?: Record<string, unknown>; live: string; calls: Call[] }

// The tools an LLM step's model called: as they happen, then as the step reports them when it is done.
function callsOf(step: Step): Call[] {
  const done = step.output?.tool_calls
  return Array.isArray(done) ? done.map((c: { name: string; args?: Record<string, unknown> }) => ({ name: c.name, input: c.args ?? {} })) : step.calls
}

function brief(input: Record<string, unknown>): string {
  return Object.values(input).map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(", ").slice(0, 80)
}

function outputText(out: Record<string, unknown> | undefined, live: string): string {
  if (!out) return live
  const v = out.text ?? out.result
  return typeof v === "string" ? v : JSON.stringify(out, null, 2)
}

function StepRow({ id, type, step }: { id: string; type: FlowNodeType; step?: Step }) {
  const [open, setOpen] = useState(false)
  const { Icon, tint } = NODE_STYLE[type]
  const text = step ? outputText(step.output, step.live) : ""
  const calls = step && type === "llm" ? callsOf(step) : []
  return (
    <li className="rounded-lg border border-[#E0E7FF] bg-white">
      <button type="button" onClick={() => setOpen((o) => !o)} disabled={!text}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left disabled:cursor-default">
        <span className={`flex size-5 shrink-0 items-center justify-center rounded ${tint}`}><Icon className="size-3" /></span>
        <span className="flex-1 truncate font-mono text-[11.5px] text-gray-700">{id}</span>
        {!step && <Circle className="size-3.5 text-gray-300" aria-label="Waiting" />}
        {step?.status === "running" && <Loader2 className="size-3.5 animate-spin text-gray-400" aria-label="Running" />}
        {step?.status === "done" && <CircleCheck className="size-3.5 text-emerald-500" aria-label="Done" />}
        {step?.status === "error" && <CircleAlert className="size-3.5 text-red-500" aria-label="Failed" />}
        {text && (open ? <ChevronDown className="size-3 text-gray-400" /> : <ChevronRight className="size-3 text-gray-400" />)}
      </button>
      {calls.length > 0 && (
        <ul className="space-y-0.5 px-2 pb-1.5 pl-9">
          {calls.map((c, i) => (
            <li key={i} className="truncate font-mono text-[10.5px] text-amber-700" title={JSON.stringify(c.input)}>
              → {c.name}({brief(c.input)})
            </li>
          ))}
        </ul>
      )}
      {open && text && (
        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words border-t border-gray-100 px-2 py-1.5 font-mono text-[11px] leading-[16px] text-gray-600">
          {text}
        </pre>
      )}
    </li>
  )
}

// A test run: fill in the inputs, run the saved flow, watch each step. `save` saves pending edits first and gives back
// the flow's id, or null if it could not be saved (its problems are then shown in the editor).
export function RunPanel({
  def, catalog, save, onStep,
}: {
  def: FlowDefinition
  catalog: FlowCatalog | null
  save: () => Promise<string | null>
  onStep: (steps: Record<string, RunState>) => void
}) {
  const { data: session } = useSession()
  const input = def.nodes.find((n) => n.type === "input")
  const fields = input?.type === "input" ? input.config.fields : []
  const [values, setValues] = useState<Record<string, string | boolean>>({})
  const [model, setModel] = useState("")
  const [steps, setSteps] = useState<Record<string, Step>>({})
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const order = topological(def)
  const types = Object.fromEntries(def.nodes.map((n) => [n.id, n.type]))

  const run = async () => {
    setError(null)
    setResult(null)
    setSteps({})
    onStep({})
    setRunning(true)
    const id = await save()
    if (!id) {
      setRunning(false)
      setError("Fix the flow's problems first: it has to be saved to run.")
      return
    }
    const inputs: Record<string, unknown> = {}
    for (const f of fields) {
      const v = values[f.name]
      if (v === undefined || v === "") continue
      inputs[f.name] = f.type === "boolean" ? v === true : f.type === "number" ? Number(v) : v
    }
    abort.current = new AbortController()
    const now: Record<string, Step> = {}
    const publish = () => {
      setSteps({ ...now })
      onStep(Object.fromEntries(Object.entries(now).map(([k, s]) => [k, s.status])))
    }
    try {
      for await (const ev of runFlow(session?.accessToken, id, inputs, model || null, abort.current.signal)) {
        if (ev.type === "node") {
          now[ev.node] = ev.phase === "start"
            ? { status: "running", live: "", calls: [] }
            : { status: "done", output: ev.output, live: now[ev.node]?.live ?? "", calls: now[ev.node]?.calls ?? [] }
          publish()
        } else if (ev.type === "tool" && now[ev.node]) {
          now[ev.node] = { ...now[ev.node], calls: [...now[ev.node].calls, { name: ev.name, input: ev.input }] }
          publish()
        } else if (ev.type === "token" && ev.node && now[ev.node]) {
          now[ev.node] = { ...now[ev.node], live: now[ev.node].live + ev.content }
          publish()
        } else if (ev.type === "result") {
          setResult(ev.text)
        } else if (ev.type === "error") {
          if (ev.node && now[ev.node]) now[ev.node] = { ...now[ev.node], status: "error" }
          publish()
          setError(ev.node ? `Step ${ev.node}: ${ev.message}` : ev.message)
        }
      }
    } catch (e) {
      setError(e instanceof FlowApiError ? e.message : "The run was cut off.")
    } finally {
      setRunning(false)
      abort.current = null
    }
  }

  return (
    <div className="space-y-3">
      {fields.length > 0 && (
        <div className="space-y-2">
          {fields.map((f) => (
            <label key={f.name} className="block">
              <span className="mb-1 block text-[11px] font-semibold text-gray-500">
                <span className="font-mono">{f.name}</span>{f.required !== false && <span className="text-red-500"> *</span>}
                {f.description && <span className="font-normal text-gray-400"> · {f.description}</span>}
              </span>
              {f.type === "boolean" ? (
                <input type="checkbox" checked={values[f.name] === true}
                       onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.checked }))} />
              ) : (
                <input className={INPUT} type={f.type === "number" ? "number" : "text"} aria-label={f.name}
                       value={(values[f.name] as string) ?? ""}
                       onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} />
              )}
            </label>
          ))}
        </div>
      )}
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold text-gray-500">Model for the LLM steps</span>
        <select className={INPUT} value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model for the run">
          <option value="">Default</option>
          {catalog?.models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>
      {running ? (
        <button type="button" onClick={() => abort.current?.abort()}
                className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-700 hover:bg-gray-50">
          <Square className="size-3" />Stop
        </button>
      ) : (
        <button type="button" onClick={run}
                className="flex items-center gap-1.5 rounded-md bg-[#5661f6] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#4550e0]">
          <Play className="size-3" />Run
        </button>
      )}

      {(running || Object.keys(steps).length > 0) && (
        <ul className="space-y-1.5">
          {order.map((id) => <StepRow key={id} id={id} type={types[id]} step={steps[id]} />)}
        </ul>
      )}
      {error && (
        <p className="flex items-start gap-1 rounded-lg border border-red-200 bg-red-50 p-2 text-[11.5px] leading-[16px] text-red-700">
          <CircleAlert className="mt-[2px] size-3 shrink-0" />{error}
        </p>
      )}
      {result !== null && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2">
          <span className="mb-1 block text-[11px] font-semibold text-emerald-700">Result</span>
          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words font-sans text-[12px] leading-[18px] text-gray-800">{result}</pre>
        </div>
      )}
    </div>
  )
}
