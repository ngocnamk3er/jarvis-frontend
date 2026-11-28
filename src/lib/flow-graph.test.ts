// Run with: npm test   (node --test; Node strips the types itself)
import { test } from "node:test"
import assert from "node:assert/strict"
import type { FlowDefinition } from "@/types/flows"
import {
  ancestors, fieldsOf, layout, newNode, newNodeId, refsFor, renameNode, starterFlow, summary, topological, validId,
} from "./flow-graph.ts"
import { sseReader } from "./flows-api.ts"

// in -> s -> sum -> out, plus a side branch in -> t -> out
const news: FlowDefinition = {
  schema_version: 1,
  nodes: [
    { id: "in", type: "input", config: { fields: [{ name: "topic", type: "string" }] } },
    { id: "s", type: "tool", config: { tool: "web_search", args: { query: "{{in.topic}} news" } } },
    { id: "sum", type: "llm", config: { prompt: "Summarise {{s.result}}", output: "json" } },
    { id: "t", type: "tool", config: { tool: "web_fetch", args: { url: "{{in.topic}}" } } },
    { id: "out", type: "output", config: { template: "{{sum.text}} {{t}}" } },
  ],
  edges: [
    { source: "in", target: "s" }, { source: "s", target: "sum" }, { source: "sum", target: "out" },
    { source: "in", target: "t" }, { source: "t", target: "out" },
  ],
}

test("a node may reference only the nodes before it, nearest first", () => {
  assert.deepEqual([...ancestors("sum", news.edges)].sort(), ["in", "s"])
  assert.deepEqual(refsFor("sum", news), ["{{s.result}}", "{{in.topic}}"])
  assert.deepEqual(refsFor("in", news), [])
  // an LLM node asked for JSON has a `json` field too
  assert.ok(refsFor("out", news).includes("{{sum.json}}"))
  assert.ok(!refsFor("t", news).includes("{{s.result}}"))         // a sibling branch is not before it
})

test("fields of each node type", () => {
  assert.deepEqual(fieldsOf(news.nodes[0]), ["topic"])
  assert.deepEqual(fieldsOf(news.nodes[1]), ["result"])
  assert.deepEqual(fieldsOf(news.nodes[4]), ["text"])
})

test("new ids are short, valid and not taken", () => {
  assert.equal(newNodeId("llm", ["in", "llm1"]), "llm2")
  assert.equal(newNodeId("input", []), "in")
  assert.equal(newNodeId("output", ["out"]), "out1")
  for (const t of ["input", "llm", "tool", "output"] as const) assert.ok(validId(newNode(t, [], { x: 0, y: 0 }).id))
  assert.ok(!validId("outputs") && !validId("__start__") && !validId("2x") && !validId("a b"))
})

test("renaming a node renames its edges and every reference to it, and nothing else", () => {
  const r = renameNode(news, "s", "search")
  assert.deepEqual(r.edges.filter((e) => e.source === "search" || e.target === "search"),
    [{ source: "in", target: "search" }, { source: "search", target: "sum" }])
  const sum = r.nodes.find((n) => n.id === "sum")!
  assert.equal(sum.type === "llm" && sum.config.prompt, "Summarise {{search.result}}")
  const out = r.nodes.find((n) => n.id === "out")!
  assert.equal(out.type === "output" && out.config.template, "{{sum.text}} {{t}}")
  // a longer name that starts the same is not touched
  const r2 = renameNode({ ...news, nodes: [...news.nodes, { id: "o", type: "output", config: { template: "{{sum.text}} {{summary.text}}" } }] }, "sum", "x")
  const o = r2.nodes.find((n) => n.id === "o")!
  assert.equal(o.type === "output" && o.config.template, "{{x.text}} {{summary.text}}")
})

test("the starter flow runs input -> llm -> output, its references valid", () => {
  const f = starterFlow()
  assert.deepEqual(topological(f), ["in", "llm1", "out"])
  assert.deepEqual(refsFor("out", f), ["{{llm1.text}}", "{{in.text}}"])
})

test("nodes saved without a position are laid out by depth", () => {
  const laid = layout(news)
  const pos = Object.fromEntries(laid.nodes.map((n) => [n.id, n.position]))
  assert.equal(pos.in!.x, 0)
  assert.equal(pos.s!.x, 250)
  assert.equal(pos.sum!.x, 500)
  assert.equal(pos.out!.x, 750)                                    // after the longer branch
  assert.notDeepEqual(pos.s, pos.t)                                 // same depth, stacked
})

test("a card's one-line summary", () => {
  assert.equal(summary(news.nodes[1]), "web_search({{in.topic}} news)")
  assert.equal(summary(news.nodes[0]), "topic")
  assert.equal(summary({ id: "x", type: "llm", config: { prompt: "" } }), "no prompt yet")
})

test("the SSE reader keeps partial lines across chunks and skips heartbeats", () => {
  const read = sseReader()
  assert.deepEqual(read('data: {"type":"node","no'), [])
  assert.deepEqual(read('de":"s"}\n\n: ping\n\ndata: {"type":"done"}\n'), [{ type: "node", node: "s" }, { type: "done" }])
  assert.deepEqual(read("data: not json\n"), [])
})
