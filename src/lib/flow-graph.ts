// The flow definition as the editor handles it: new nodes, what a node may reference, renaming, and the shape React
// Flow wants. Mirrors the rules of the backend's app/flows/schema.py where the editor needs them before saving; the
// backend still checks everything (POST /flows/validate).
import type { FlowDefinition, FlowEdgeDef, FlowNodeDef, FlowNodeType, XY } from "@/types/flows"

export const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/
const RESERVED = new Set(["inputs", "outputs"])
const REF = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)(?:\.([A-Za-z_][A-Za-z0-9_]*))?\s*\}\}/g

export const NODE_LABELS: Record<FlowNodeType, string> = {
  input: "Input",
  llm: "LLM",
  tool: "Tool",
  output: "Output",
}

// Whether a node id is one the backend accepts.
export function validId(id: string): boolean {
  return IDENT.test(id) && !id.startsWith("__") && !RESERVED.has(id)
}

// What `{{node.<field>}}` may name.
export function fieldsOf(node: FlowNodeDef): string[] {
  switch (node.type) {
    case "input":
      return node.config.fields.map((f) => f.name).filter(Boolean)
    case "llm":
      return node.config.output === "json" ? ["text", "json"] : ["text"]
    case "tool":
      return ["result"]
    case "output":
      return ["text"]
  }
}

// The nodes a node comes after: the only ones it may reference.
export function ancestors(id: string, edges: FlowEdgeDef[]): Set<string> {
  const into = new Map<string, string[]>()
  for (const e of edges) into.set(e.target, [...(into.get(e.target) ?? []), e.source])
  const seen = new Set<string>()
  const stack = [...(into.get(id) ?? [])]
  while (stack.length) {
    const n = stack.pop()!
    if (seen.has(n) || n === id) continue
    seen.add(n)
    stack.push(...(into.get(n) ?? []))
  }
  return seen
}

// The references a node can use, nearest first: `{{id.field}}` for every field of every node before it.
export function refsFor(id: string, def: FlowDefinition): string[] {
  const before = ancestors(id, def.edges)
  const byId = new Map(def.nodes.map((n) => [n.id, n]))
  const order = topological(def).filter((n) => before.has(n)).reverse()
  return order.flatMap((n) => fieldsOf(byId.get(n)!).map((f) => `{{${n}.${f}}}`))
}

// Node ids in running order (ignores what a loop would make unreachable; validation reports loops).
export function topological(def: FlowDefinition): string[] {
  const indeg = new Map(def.nodes.map((n) => [n.id, 0]))
  for (const e of def.edges) if (indeg.has(e.target)) indeg.set(e.target, indeg.get(e.target)! + 1)
  const ready = def.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id)
  const out: string[] = []
  while (ready.length) {
    const n = ready.shift()!
    out.push(n)
    for (const e of def.edges) {
      if (e.source !== n || !indeg.has(e.target)) continue
      indeg.set(e.target, indeg.get(e.target)! - 1)
      if (indeg.get(e.target) === 0) ready.push(e.target)
    }
  }
  return out
}

// A short, readable id that is not taken: "in", "out", "llm1", "tool2"...
export function newNodeId(type: FlowNodeType, taken: Iterable<string>): string {
  const used = new Set(taken)
  const base = type === "input" ? "in" : type === "output" ? "out" : type
  if ((type === "input" || type === "output") && !used.has(base)) return base
  for (let i = 1; ; i++) if (!used.has(`${base}${i}`)) return `${base}${i}`
}

export function newNode(type: FlowNodeType, taken: Iterable<string>, position: XY): FlowNodeDef {
  const id = newNodeId(type, taken)
  switch (type) {
    case "input":
      return { id, type, position, config: { fields: [{ name: "text", type: "string", required: true }] } }
    case "llm":
      return { id, type, position, config: { prompt: "", output: "text" } }
    case "tool":
      return { id, type, position, config: { tool: "web_search", args: {} } }
    case "output":
      return { id, type, position, config: { template: "" } }
  }
}

// What a new flow starts as: an input, a model that answers it, an output.
export function starterFlow(): FlowDefinition {
  return {
    schema_version: 1,
    nodes: [
      { id: "in", type: "input", position: { x: 0, y: 80 }, config: { fields: [{ name: "text", type: "string", required: true }] } },
      { id: "llm1", type: "llm", position: { x: 250, y: 80 }, config: { prompt: "{{in.text}}", output: "text" } },
      { id: "out", type: "output", position: { x: 500, y: 80 }, config: { template: "{{llm1.text}}" } },
    ],
    edges: [{ source: "in", target: "llm1" }, { source: "llm1", target: "out" }],
  }
}

function renameRefs(text: string, from: string, to: string): string {
  return text.replace(REF, (m, ref: string, field?: string) => (ref === from ? `{{${to}${field ? `.${field}` : ""}}}` : m))
}

// Rename a node, and every edge and {{reference}} to it.
export function renameNode(def: FlowDefinition, from: string, to: string): FlowDefinition {
  const r = (s: string) => renameRefs(s, from, to)
  const nodes = def.nodes.map((n): FlowNodeDef => {
    const id = n.id === from ? to : n.id
    switch (n.type) {
      case "llm":
        return { ...n, id, config: { ...n.config, prompt: r(n.config.prompt), system: n.config.system && r(n.config.system) } }
      case "tool":
        return { ...n, id, config: { ...n.config, args: Object.fromEntries(Object.entries(n.config.args).map(([k, v]) => [k, r(v)])) } }
      case "output":
        return { ...n, id, config: { template: r(n.config.template) } }
      default:
        return { ...n, id }
    }
  })
  const edges = def.edges.map((e) => ({ source: e.source === from ? to : e.source, target: e.target === from ? to : e.target }))
  return { ...def, nodes, edges }
}

// One line on the canvas card: what the node does.
export function summary(node: FlowNodeDef): string {
  const first = (s: string) => s.trim().split("\n")[0].slice(0, 80)
  switch (node.type) {
    case "input":
      return node.config.fields.map((f) => f.name).join(", ") || "no fields"
    case "llm":
      return first(node.config.prompt) || "no prompt yet"
    case "tool": {
      const args = Object.values(node.config.args).filter(Boolean).join(", ")
      return args ? `${node.config.tool}(${first(args)})` : node.config.tool
    }
    case "output":
      return first(node.config.template) || "no template yet"
  }
}

// Positions for nodes saved without one: by depth from the left, stacked within a depth.
export function layout(def: FlowDefinition): FlowDefinition {
  if (def.nodes.every((n) => n.position)) return def
  const depth = new Map<string, number>()
  for (const id of topological(def)) {
    const preds = def.edges.filter((e) => e.target === id).map((e) => depth.get(e.source) ?? 0)
    depth.set(id, preds.length ? Math.max(...preds) + 1 : 0)
  }
  const row = new Map<number, number>()
  const nodes = def.nodes.map((n) => {
    if (n.position) return n
    const d = depth.get(n.id) ?? 0
    const y = row.get(d) ?? 0
    row.set(d, y + 1)
    return { ...n, position: { x: d * 250, y: y * 150 } }
  })
  return { ...def, nodes }
}
