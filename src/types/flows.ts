// Flows the user builds from nodes (backend: jarvis-backend app/flows/). The definition is saved as is, positions
// included; the backend reads everything but the positions.

export type FlowNodeType = "input" | "llm" | "tool" | "output"

export type InputField = {
  name: string
  type: "string" | "number" | "boolean"
  description?: string
  required?: boolean
}

export type InputConfig = { fields: InputField[] }
export type LlmConfig = {
  prompt: string
  system?: string
  model?: string | null
  output?: "text" | "json"
  // Tools the model may call itself, as it decides, at most `max_tool_calls` times in all (an "agent" step).
  tools?: string[]
  max_tool_calls?: number
}
export type ToolConfig = { tool: string; args: Record<string, string> }
export type OutputConfig = { template: string }

export type FlowNodeDef =
  | { id: string; type: "input"; label?: string; config: InputConfig; position?: XY }
  | { id: string; type: "llm"; label?: string; config: LlmConfig; position?: XY }
  | { id: string; type: "tool"; label?: string; config: ToolConfig; position?: XY }
  | { id: string; type: "output"; label?: string; config: OutputConfig; position?: XY }

export type XY = { x: number; y: number }
export type FlowEdgeDef = { source: string; target: string }

export type FlowDefinition = { schema_version: 1; nodes: FlowNodeDef[]; edges: FlowEdgeDef[] }

export type FlowSummary = {
  id: string
  name: string
  slug: string
  description: string
  version: number
  enabled: boolean
  created_at: string
  updated_at: string
}

export type FlowRecord = FlowSummary & { definition: FlowDefinition }

// What validation found; `node` is the node it is in, or null for the flow as a whole.
export type FlowProblem = { node: string | null; message: string }

export type CatalogTool = {
  name: string
  description: string
  args: { name: string; type: string; required: boolean; description: string }[]
}

export type FlowCatalog = {
  tools: CatalogTool[]
  models: { id: string; name: string }[]
}

// One event of a test run (POST /flows/{id}/run).
export type FlowRunEvent =
  | { type: "node"; node: string; node_type: FlowNodeType; phase: "start" | "end"; output?: Record<string, unknown> }
  | { type: "token"; node: string | null; content: string }
  | { type: "tool"; node: string; name: string; input: Record<string, unknown> }
  | { type: "result"; text: string }
  | { type: "error"; node: string | null; message: string }
  | { type: "done" }
