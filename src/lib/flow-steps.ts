// The steps of a flow the model ran, as message parts: a `flow_node` stream event starts a step or completes it.
import type { MessagePart, StreamEvent } from "@/types/chat"

export type FlowNodeEvent = Extract<StreamEvent, { type: "flow_node" }>
export type FlowStepPart = Extract<MessagePart, { type: "flow_step" }>

// The steps shown under a flow's badge. A tool step already shows as that tool's own nested badge, and the input and
// output are the flow badge's own input and result: an LLM step is the one with nothing else to show it.
export const SHOWN_STEP_TYPES: ReadonlySet<string> = new Set(["llm"])

export function applyFlowNode(parts: MessagePart[], ev: FlowNodeEvent): MessagePart[] {
  const step = { type: "flow_step" as const, node: ev.node, node_type: ev.node_type, task_run_id: ev.task_run_id }
  if (ev.phase === "start") return [...parts, { ...step, status: "running" }]
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]
    if (p.type === "flow_step" && p.node === ev.node && p.task_run_id === ev.task_run_id && p.status === "running") {
      const next = parts.slice()
      next[i] = { ...p, status: "done", output: ev.output }
      return next
    }
  }
  // Its start was not seen (the stream was joined late): show it done anyway.
  return [...parts, { ...step, status: "done", output: ev.output }]
}

// The run is over (done, stopped): no step is still running.
export function settleFlowSteps(parts: MessagePart[]): MessagePart[] {
  return parts.some((p) => p.type === "flow_step" && p.status === "running")
    ? parts.map((p) => (p.type === "flow_step" && p.status === "running" ? { ...p, status: "done" as const } : p))
    : parts
}

// What to show as a step's result: an LLM step's text, else its output as JSON.
export function stepText(part: FlowStepPart): string {
  const out = part.output
  if (!out) return ""
  return typeof out.text === "string" ? out.text : JSON.stringify(out, null, 2)
}
