"use client"

import "@xyflow/react/dist/style.css"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import {
  Background, Controls, MarkerType, ReactFlow, addEdge, useEdgesState, useNodesState, useReactFlow,
  type Connection, type Edge, type EdgeChange, type NodeChange,
} from "@xyflow/react"
import { ArrowLeft, CircleAlert, CircleCheck, Loader2, Save, ShieldCheck } from "lucide-react"
import { layout, newNode, renameNode, starterFlow, validId, NODE_LABELS } from "@/lib/flow-graph"
import { FlowApiError, flowsApi } from "@/lib/flows-api"
import type { FlowCatalog, FlowDefinition, FlowNodeDef, FlowNodeType, FlowProblem } from "@/types/flows"
import { FlowNodeCard, NODE_STYLE, type CardNode, type RunState } from "./flow-node-card"
import { INPUT, NodeInspector } from "./node-inspector"
import { RunPanel } from "./run-panel"

const nodeTypes = { card: FlowNodeCard }
const DRAG_TYPE = "application/x-jarvis-flow-node"

const PALETTE: { type: FlowNodeType; hint: string }[] = [
  { type: "input", hint: "What the flow asks for" },
  { type: "llm", hint: "Ask a model, with a prompt" },
  { type: "tool", hint: "Search the web, read a page or a file" },
  { type: "output", hint: "What the flow returns" },
]

function toNodes(def: FlowDefinition): CardNode[] {
  return def.nodes.map((n) => ({ id: n.id, type: "card", position: n.position ?? { x: 0, y: 0 }, data: { def: n, problems: 0 } }))
}

function toEdges(def: FlowDefinition): Edge[] {
  return def.edges.map((e) => ({ id: `${e.source}->${e.target}`, source: e.source, target: e.target }))
}

function toDef(nodes: CardNode[], edges: Edge[]): FlowDefinition {
  return {
    schema_version: 1,
    nodes: nodes.map((n) => ({ ...n.data.def, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) } })),
    edges: edges.map((e) => ({ source: e.source, target: e.target })),
  }
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
            className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors ${on ? "bg-[#5661f6]" : "bg-gray-300"}`}>
      <span className={`absolute top-[2px] size-[14px] rounded-full bg-white shadow transition-all ${on ? "left-[16px]" : "left-[2px]"}`} />
    </button>
  )
}

// The flow editor: steps dragged onto a canvas and connected, each step's settings on the right, checked and saved
// through the backend (which validates every save), and a test run of the saved flow.
export function FlowEditor({ flowId }: { flowId: string }) {
  const router = useRouter()
  const { data: session } = useSession()
  const token = session?.accessToken
  const { screenToFlowPosition } = useReactFlow()
  const wrapper = useRef<HTMLDivElement>(null)
  const savedId = useRef<string | null>(flowId === "new" ? null : flowId)

  const [nodes, setNodes, onNodesChange] = useNodesState<CardNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [enabled, setEnabled] = useState(true)
  const [version, setVersion] = useState<number | null>(null)
  const [catalog, setCatalog] = useState<FlowCatalog | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [problems, setProblems] = useState<FlowProblem[]>([])
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState<"check" | "save" | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [tab, setTab] = useState<"edit" | "run">("edit")
  const [runSteps, setRunSteps] = useState<Record<string, RunState>>({})

  const def = useMemo(() => toDef(nodes, edges), [nodes, edges])

  const show = useCallback((d: FlowDefinition, flowName: string, desc: string, on: boolean, v: number | null) => {
    setNodes(toNodes(layout(d)))
    setEdges(toEdges(d))
    setName(flowName)
    setDescription(desc)
    setEnabled(on)
    setVersion(v)
    setLoaded(true)
  }, [setNodes, setEdges])

  useEffect(() => {
    if (!token) return
    if (loaded && flowId === savedId.current) return      // the URL just changed to the flow this editor saved
    let off = false
    void (async () => {
      try {
        const cat = await flowsApi.catalog(token)
        if (!off) setCatalog(cat)
      } catch {
        // the editor still works without it; the selects show what is saved
      }
      if (flowId === "new") {
        if (!off) show(starterFlow(), "New flow", "", true, null)
        return
      }
      try {
        const rec = await flowsApi.get(token, flowId)
        if (!off) show(rec.definition, rec.name, rec.description, rec.enabled, rec.version)
      } catch (e) {
        if (!off) setLoadError(e instanceof FlowApiError ? e.message : "Could not load the flow.")
      }
    })()
    return () => { off = true }
  }, [token, flowId, loaded, show])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const changed = useCallback(() => {
    setDirty(true)
    setNotice(null)
    setRunSteps({})
  }, [])

  const handleNodesChange = useCallback((changes: NodeChange<CardNode>[]) => {
    onNodesChange(changes)
    if (changes.some((c) => c.type === "remove" || (c.type === "position" && c.dragging === false))) changed()
  }, [onNodesChange, changed])

  const handleEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
    onEdgesChange(changes)
    if (changes.some((c) => c.type === "remove")) changed()
  }, [onEdgesChange, changed])

  const onConnect = useCallback((c: Connection) => {
    setEdges((es) => (es.some((e) => e.source === c.source && e.target === c.target)
      ? es : addEdge({ ...c, id: `${c.source}->${c.target}` }, es)))
    changed()
  }, [setEdges, changed])

  const addNode = useCallback((type: FlowNodeType, at?: { x: number; y: number }) => {
    let position = at
    if (!position) {
      const box = wrapper.current?.getBoundingClientRect()
      position = screenToFlowPosition({ x: (box?.left ?? 0) + (box?.width ?? 600) / 2, y: (box?.top ?? 0) + (box?.height ?? 400) / 2 })
    }
    const node = newNode(type, nodes.map((n) => n.id), position)
    setNodes((ns) => [...ns, { id: node.id, type: "card", position: node.position!, data: { def: node, problems: 0 } }])
    setSelected(node.id)
    setTab("edit")
    changed()
  }, [nodes, setNodes, screenToFlowPosition, changed])

  const updateNode = useCallback((d: FlowNodeDef) => {
    setNodes((ns) => ns.map((n) => (n.id === d.id ? { ...n, data: { ...n.data, def: d } } : n)))
    changed()
  }, [setNodes, changed])

  const rename = useCallback((from: string, to: string): string | null => {
    if (!validId(to)) return "An id is a letter or _, then letters, digits or _ (32 at most), and not a reserved name."
    if (nodes.some((n) => n.id === to)) return "Another step has this id."
    const next = renameNode(def, from, to)
    setNodes(toNodes(next))
    setEdges(toEdges(next))
    setSelected(to)
    changed()
    return null
  }, [def, nodes, setNodes, setEdges, changed])

  const removeNode = useCallback((id: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== id))
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id))
    setSelected(null)
    changed()
  }, [setNodes, setEdges, changed])

  const check = async () => {
    setBusy("check")
    try {
      const r = await flowsApi.validate(token, def)
      setProblems(r.problems)
      setNotice(r.valid ? { ok: true, text: "No problems found." } : { ok: false, text: `${r.problems.length} problem${r.problems.length === 1 ? "" : "s"} to fix.` })
    } catch (e) {
      setNotice({ ok: false, text: e instanceof FlowApiError ? e.message : "Could not check the flow." })
    } finally {
      setBusy(null)
    }
  }

  // Saves, and gives back the flow's id; null if it could not be saved (the problems are shown).
  const save = useCallback(async (): Promise<string | null> => {
    if (!dirty && savedId.current) return savedId.current
    setBusy("save")
    try {
      const fields = { name: name.trim() || "Untitled flow", description, definition: def, enabled }
      const rec = savedId.current ? await flowsApi.update(token, savedId.current, fields) : await flowsApi.create(token, fields)
      const wasNew = !savedId.current
      savedId.current = rec.id
      setVersion(rec.version)
      setName(rec.name)
      setDirty(false)
      setProblems([])
      setNotice({ ok: true, text: `Saved · the chat can use it as flow_${rec.slug}` })
      if (wasNew) router.replace(`/flows/${rec.id}`)
      return rec.id
    } catch (e) {
      if (e instanceof FlowApiError) {
        setProblems(e.problems)
        setNotice({ ok: false, text: e.message })
      } else {
        setNotice({ ok: false, text: "Could not save the flow." })
      }
      return null
    } finally {
      setBusy(null)
    }
  }, [dirty, name, description, def, enabled, token, router])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault()
        void save()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [save])

  const byNode = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const p of problems) if (p.node) m.set(p.node, [...(m.get(p.node) ?? []), p.message])
    return m
  }, [problems])

  const shown = useMemo(() => nodes.map((n) => ({
    ...n, data: { ...n.data, problems: byNode.get(n.id)?.length ?? 0, run: runSteps[n.id] },
  })), [nodes, byNode, runSteps])

  const selectedNode = def.nodes.find((n) => n.id === selected) ?? null
  const hasInput = def.nodes.some((n) => n.type === "input")

  if (loadError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-[#F7F8FF] text-[13px] text-gray-600">
        <p className="flex items-center gap-1.5 text-red-600"><CircleAlert className="size-4" />{loadError}</p>
        <Link href="/flows" className="font-semibold text-[#5661f6] hover:underline">Back to your flows</Link>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-[#F7F8FF]">
      <header className="flex items-center gap-3 border-b border-[#E0E7FF] bg-white px-4 py-2.5">
        <Link href="/flows" className="flex items-center gap-1 text-[12.5px] font-medium text-gray-500 hover:text-[#5661f6]">
          <ArrowLeft className="size-3.5" />Flows
        </Link>
        <input value={name} onChange={(e) => { setName(e.target.value); changed() }} aria-label="Flow name" maxLength={60}
               placeholder="Flow name" className="min-w-0 max-w-[320px] flex-1 rounded-md border border-transparent px-2 py-1 text-[15px] font-semibold text-gray-900 outline-none hover:border-[#E0E7FF] focus:border-[#5661f6]" />
        <span className="shrink-0 text-[11.5px] text-gray-400">
          {version ? `v${version}` : "not saved yet"}{dirty && <span className="text-amber-600"> · unsaved changes</span>}
        </span>
        <div className="flex-1" />
        <label className="flex shrink-0 items-center gap-2 text-[12px] text-gray-600">
          Offer in chat
          <Toggle on={enabled} onChange={(v) => { setEnabled(v); changed() }} label="Offer this flow in chat" />
        </label>
        <button type="button" onClick={check} disabled={busy !== null}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-[#E0E7FF] bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-700 hover:bg-[#F7F8FF] disabled:opacity-60">
          {busy === "check" ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}Check
        </button>
        <button type="button" onClick={() => void save()} disabled={busy !== null || (!dirty && version !== null)}
                className="flex shrink-0 items-center gap-1.5 rounded-md bg-[#5661f6] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#4550e0] disabled:opacity-50">
          {busy === "save" ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}Save
        </button>
      </header>
      {notice && (
        <div className={`flex items-center gap-1.5 border-b px-4 py-1.5 text-[12px] ${notice.ok ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-red-100 bg-red-50 text-red-700"}`}>
          {notice.ok ? <CircleCheck className="size-3.5" /> : <CircleAlert className="size-3.5" />}{notice.text}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="w-[190px] shrink-0 space-y-2 border-r border-[#E0E7FF] bg-white p-3" aria-label="Steps">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Steps</p>
          {PALETTE.map(({ type, hint }) => {
            const { Icon, tint } = NODE_STYLE[type]
            const off = type === "input" && hasInput
            return (
              <button key={type} type="button" draggable={!off} disabled={off}
                      onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, type); e.dataTransfer.effectAllowed = "move" }}
                      onClick={() => addNode(type)}
                      title={off ? "A flow has one Input step" : "Drag onto the canvas, or click to add"}
                      className="flex w-full items-start gap-2 rounded-lg border border-[#E0E7FF] bg-white p-2 text-left hover:border-[#5661f6] disabled:cursor-not-allowed disabled:opacity-40">
                <span className={`flex size-6 shrink-0 items-center justify-center rounded-md ${tint}`}><Icon className="size-3.5" /></span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold text-gray-800">{NODE_LABELS[type]}</span>
                  <span className="block text-[10.5px] leading-[14px] text-gray-400">{hint}</span>
                </span>
              </button>
            )
          })}
          <p className="px-1 pt-2 text-[10.5px] leading-[15px] text-gray-400">
            Connect a step&apos;s right dot to the next step&apos;s left dot. Select a step or a connection and press Delete to remove it.
          </p>
        </aside>

        <div ref={wrapper} className="relative min-w-0 flex-1"
             onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move" }}
             onDrop={(e) => {
               e.preventDefault()
               const type = e.dataTransfer.getData(DRAG_TYPE) as FlowNodeType
               if (type && !(type === "input" && hasInput)) addNode(type, screenToFlowPosition({ x: e.clientX, y: e.clientY }))
             }}>
          {loaded ? (
            <ReactFlow
              nodes={shown} edges={edges} nodeTypes={nodeTypes}
              onNodesChange={handleNodesChange} onEdgesChange={handleEdgesChange} onConnect={onConnect}
              isValidConnection={(c) => c.source !== c.target}
              onNodeClick={(_, n) => { setSelected(n.id); setTab("edit") }} onPaneClick={() => setSelected(null)}
              deleteKeyCode={["Backspace", "Delete"]} fitView fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
              defaultEdgeOptions={{
                type: "smoothstep",
                markerEnd: { type: MarkerType.ArrowClosed, color: "#5661f6" },
                style: { stroke: "#5661f6", strokeWidth: 1.5 },
              }}
            >
              <Background gap={20} color="#dfe3ff" />
              <Controls showInteractive={false} />
            </ReactFlow>
          ) : (
            <div className="flex h-full items-center justify-center"><Loader2 className="size-5 animate-spin text-gray-300" /></div>
          )}
        </div>

        <aside className="flex w-[360px] shrink-0 flex-col border-l border-[#E0E7FF] bg-white" aria-label="Settings">
          <div className="flex border-b border-[#E0E7FF] px-3" role="tablist">
            {(["edit", "run"] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                      className={`-mb-px border-b-2 px-3 py-2 text-[12.5px] font-semibold ${tab === t ? "border-[#5661f6] text-[#5661f6]" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                {t === "edit" ? (selectedNode ? `Step ${selectedNode.id}` : "Flow") : "Test run"}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {tab === "run" ? (
              <RunPanel def={def} catalog={catalog} save={save} onStep={setRunSteps} />
            ) : selectedNode ? (
              <NodeInspector
                key={selectedNode.id} node={selectedNode} def={def} catalog={catalog}
                problems={byNode.get(selectedNode.id) ?? []} onChange={updateNode}
                onRename={(to) => rename(selectedNode.id, to)} onDelete={() => removeNode(selectedNode.id)}
              />
            ) : (
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-gray-500">What the flow does (the agent reads this to decide when to use it)</span>
                  <textarea rows={4} className={`${INPUT} resize-y`} value={description} maxLength={500}
                            placeholder="e.g. Searches the news on a topic and summarises it in three bullet points."
                            onChange={(e) => { setDescription(e.target.value); changed() }} />
                </label>
                {problems.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] font-semibold text-gray-500">Problems</p>
                    <ul className="space-y-1">
                      {problems.map((p, i) => (
                        <li key={i}>
                          <button type="button" disabled={!p.node} onClick={() => p.node && setSelected(p.node)}
                                  className="flex w-full items-start gap-1 rounded-md px-1 py-0.5 text-left text-[11.5px] leading-[16px] text-red-700 hover:bg-red-50 disabled:hover:bg-transparent">
                            <CircleAlert className="mt-[2px] size-3 shrink-0" />
                            <span>{p.node && <span className="font-mono font-semibold">{p.node}: </span>}{p.message}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-[11px] leading-[16px] text-gray-400">
                  Select a step to set it up. A step reads what earlier steps produced with {"{{step.field}}"}: the
                  chips above each text field insert them.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
