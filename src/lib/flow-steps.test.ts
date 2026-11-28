// Run with: npm test   (node --test; Node strips the types itself)
import { test } from "node:test"
import assert from "node:assert/strict"
import type { MessagePart } from "@/types/chat"
import { applyFlowNode, settleFlowSteps, stepText } from "./flow-steps.ts"

const tool: MessagePart = { type: "tool", tool: { name: "flow_news", status: "running", run_id: "F" } }

test("a step starts running and is completed in place with its output", () => {
  let parts: MessagePart[] = [tool]
  parts = applyFlowNode(parts, { type: "flow_node", node: "sum", node_type: "llm", phase: "start", task_run_id: "F" })
  assert.deepEqual(parts[1], { type: "flow_step", node: "sum", node_type: "llm", status: "running", task_run_id: "F" })
  parts = applyFlowNode(parts, {
    type: "flow_node", node: "sum", node_type: "llm", phase: "end", output: { text: "short" }, task_run_id: "F",
  })
  assert.equal(parts.length, 2)
  assert.deepEqual(parts[1], {
    type: "flow_step", node: "sum", node_type: "llm", status: "done", output: { text: "short" }, task_run_id: "F",
  })
})

test("the end of a step finds that step of that flow, not a same-named step of another flow", () => {
  let parts: MessagePart[] = []
  parts = applyFlowNode(parts, { type: "flow_node", node: "sum", node_type: "llm", phase: "start", task_run_id: "A" })
  parts = applyFlowNode(parts, { type: "flow_node", node: "sum", node_type: "llm", phase: "start", task_run_id: "B" })
  parts = applyFlowNode(parts, { type: "flow_node", node: "sum", node_type: "llm", phase: "end", task_run_id: "A" })
  assert.deepEqual(parts.map((p) => p.type === "flow_step" && [p.task_run_id, p.status]), [["A", "done"], ["B", "running"]])
})

test("an end whose start was not seen still shows the step, done", () => {
  const parts = applyFlowNode([], { type: "flow_node", node: "x", node_type: "llm", phase: "end", task_run_id: "F" })
  assert.equal(parts.length, 1)
  assert.equal(parts[0].type === "flow_step" && parts[0].status, "done")
})

test("when the run is over no step is left running, and other parts are untouched", () => {
  const parts = applyFlowNode([tool], { type: "flow_node", node: "s", node_type: "llm", phase: "start", task_run_id: "F" })
  const settled = settleFlowSteps(parts)
  assert.equal(settled[1].type === "flow_step" && settled[1].status, "done")
  assert.equal(settled[0], tool)
  const none: MessagePart[] = [tool]
  assert.equal(settleFlowSteps(none), none)
})

test("a step's text is an LLM step's text, else its output as JSON", () => {
  const base = { type: "flow_step" as const, node: "n", node_type: "llm", status: "done" as const }
  assert.equal(stepText({ ...base, output: { text: "hi" } }), "hi")
  assert.equal(stepText({ ...base, output: { json: { a: 1 }, text: 1 } }), JSON.stringify({ json: { a: 1 }, text: 1 }, null, 2))
  assert.equal(stepText(base), "")
})
