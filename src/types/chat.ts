export type Role = "user" | "assistant" | "system"

export type ThinkingEffort = "none" | "low" | "medium" | "high" | "xhigh"

export type Model = {
  id: string
  name: string
  desc: string
  inputPrice: string
  outputPrice: string
  context: string
  // Numeric max context window (see backend AVAILABLE_MODELS.contextWindow)
  // — used to hard-block sending once a conversation's context_tokens
  // reaches it, instead of the "context" display string above.
  contextWindow: number
  size: string
  default?: boolean
  // Whether the model can look at images (backend AVAILABLE_MODELS.vision).
  // Only the models that can are flagged; the others omit it.
  vision?: boolean
  // Which thinking_effort levels are actually meaningful/safe for this
  // model — verified live per-model (see AVAILABLE_MODELS in
  // backend/app/schemas/chat.py for the evidence). Not every model exposes
  // all 4 levels: some collapse several levels to a no-op, others make
  // "xhigh" specifically unsafe (unbounded reasoning with no official
  // provider support).
  effortOptions: ThinkingEffort[]
  // Real HuggingFace repo path if this model is open-weight (sourced from
  // OpenRouter's own hugging_face_id field), null if closed/proprietary.
  huggingFaceId: string | null
  // A model the user added themselves (backend user_models.catalog_entry), and the
  // result of its last connection check: "unchecked" | "ok" | "degraded" | "error".
  custom?: boolean
  status?: string
}

export type ToolStatus = "streaming" | "running" | "done"

// One search_files hit, shaped for a source chip and (for pdf/image files)
// a highlight overlay. Mirrors jarvis-file-service's VectorSearchResult —
// see app/agents/tools/files.py's _citation() for the backend side.
// page_start/page_end are 0 when the source format has no pagination (a
// .txt, a .docx) — not a failure, just nothing to point at on a page.
export type Citation = {
  file_id: string
  path: string
  page_start: number
  page_end: number
  // [[page, [x0, top, x1, bottom]], ...] — fractions of the page (0..1,
  // top-left origin), one box per line of matched text. Relevant by
  // meaning (semantic search's whole-chunk extent) — drawn one color.
  boxes: [number, [number, number, number, number]][]
  char_start: number
  char_end: number
  // Relevant by literal wording — search_files(exact=True) narrows its
  // own boxes/char_start/char_end down to this instead (see
  // jarvis-backend's _citation()), so exact=False is the only case where
  // both this and boxes/char_start/char_end are populated together; this
  // range is always nested inside the other when both are non-empty.
  // Drawn a second color, alongside (not instead of) the first.
  exact_boxes: [number, [number, number, number, number]][]
  exact_char_start: number
  exact_char_end: number
  score: number
  snippet: string
}

export type ToolCall = {
  name: string
  label?: string
  chunkIndex?: number
  argsStr?: string
  input?: unknown
  output?: string
  status: ToolStatus
  run_id?: string
  parent_run_id?: string
  // run_id of the `task` call this tool call happened inside (via a
  // subagent's own tool loop), so the UI can nest it under that badge
  // instead of showing it as an unrelated top-level row.
  task_run_id?: string
  // search_files only — carried on the ToolMessage's artifact rather than
  // its content, so it never costs the model tokens. See use-chat.ts's
  // tool_end handling and chat_service.py's ToolEndEventHandler.
  citations?: Citation[]
  // view_image only — the stored pictures it opened (backend attachment store),
  // shown under the step. Same artifact route as `citations`.
  images?: ToolImage[]
}

export type ToolImage = { id: string; label?: string }

export type TodoStatus = "pending" | "in_progress" | "completed"

export type Todo = {
  content: string
  status: TodoStatus
}

export type ToolLimitLevel = "soft" | "hard"

export type MessagePart =
  | { type: "text"; content: string }
  | { type: "tool"; tool: ToolCall }
  | { type: "thinking"; content: string; isStreaming?: boolean }
  // task_run_id set when this belongs to a subagent's own tool loop (nested
  // under that subagent's badge) rather than the main agent's own turn.
  | { type: "viz"; format: "svg"; code: string; title?: string; task_run_id?: string }
  // A file the agent generated in the sandbox and handed to the user via
  // `present_file` — rendered as a download chip. `path` is relative to the
  // conversation's sandbox workspace; downloaded via GET /api/v1/chat/sandbox-file.
  | { type: "file"; name: string; mime: string; size: number; path: string; thread_id: string; task_run_id?: string }
  | { type: "todos"; todos: Todo[]; task_run_id?: string }
  // Emitted when SoftHardToolCallLimitMiddleware blocks a call — "soft" means
  // blocked but the run continues, "hard" means blocked and no more tool calls:
  // the model answers with what it already has.
  | {
      type: "tool_limit"
      tool_name: string
      level: ToolLimitLevel
      count: number
      limit: number
      blocked: number
      task_run_id?: string
    }
  // A step of a flow the model ran (a `flow_<slug>` tool), nested under that flow's badge. `output` is what the
  // step produced (an LLM step: { text }), set once it is done.
  | {
      type: "flow_step"
      node: string
      node_type: string
      status: "running" | "done"
      output?: Record<string, unknown>
      task_run_id?: string
    }

export type TokenUsage = {
  input_tokens: number
  output_tokens: number
  total_tokens: number
}

export type Message = {
  id: string
  role: Role
  parts: MessagePart[]
  isStreaming: boolean
  // One entry per LLM call within this turn (a turn may call the model
  // multiple times for tool round-trips) — NOT summed, since each call's
  // input_tokens already includes all prior calls' context in this turn.
  usage?: TokenUsage[]
  // The trace recorded while generating this message — lets MessageFeedback
  // (thumbs up/down) submit a vote against it. Arrives live via the
  // "trace_id" SSE event while streaming, or from GET .../messages' own
  // trace_id field after a reload (see jarvis-backend's serialize_messages).
  trace_id?: string
  // Any existing vote for trace_id, included directly in the .../messages
  // response (see jarvis-backend's serialize_messages) so the frontend
  // doesn't need a separate getFeedback call per message after reload.
  rating?: "up" | "down" | null
  comment?: string | null
}

export type PendingClarify = {
  question: string
  options?: string[] | null
}

export type HitlAction = { name: string; args: Record<string, unknown>; description: string }
export type HitlReviewConfig = { action_name: string; allowed_decisions: string[] }
export type PendingHitl = { actions: HitlAction[]; review_configs: HitlReviewConfig[] }

export type StreamEvent =
  | { type: "trace_id"; trace_id: string }
  | { type: "token"; content: string }
  | { type: "thinking_token"; content: string }
  | { type: "tool_chunk"; index: number; name: string; args_delta: string }
  | { type: "tool_start"; name: string; label?: string; input?: unknown; run_id?: string; task_run_id?: string }
  | { type: "tool_end"; name: string; output: string; run_id?: string; task_run_id?: string; citations?: Citation[]; images?: ToolImage[] }
  | { type: "viz"; format: "svg"; code: string; title?: string; task_run_id?: string }
  | { type: "file"; name: string; mime: string; size: number; path: string; thread_id: string; task_run_id?: string }
  | { type: "todo_update"; todos: Todo[]; task_run_id?: string }
  | {
      type: "tool_limit"
      tool_name: string
      level: ToolLimitLevel
      count: number
      limit: number
      blocked: number
      task_run_id?: string
    }
  | {
      type: "flow_node"
      node: string
      node_type: string
      phase: "start" | "end"
      output?: Record<string, unknown>
      task_run_id?: string
    }
  | { type: "hitl_request"; actions: HitlAction[]; review_configs: HitlReviewConfig[] }
  | { type: "clarify_request"; question: string; options?: string[] | null }
  | ({ type: "usage" } & TokenUsage)
  | { type: "context_tokens"; tokens: number }
  | { type: "stopped" }
  | { type: "done" }
  | { type: "error"; message: string }

export type Conversation = {
  id: string
  title: string
  last_model: string | null
  last_subagent_model: string | null
  // Current context size (not lifetime total) — see backend
  // Conversation.context_tokens for why this overwrites rather than sums.
  context_tokens: number
  created_at: string
  updated_at: string
}

// A background research task, as GET /api/v1/conversations/{id}/research
// returns it (see jarvis-backend's app/agents/async_research.py,
// describe_tasks). Live: status and steps move while the task runs.
export type ResearchStatus = "running" | "success" | "error" | "cancelled" | "interrupted"

export type ResearchStep = {
  tool: string
  // What the step is about — the search query, or the page it reads.
  what: string
  // False while the call is still in flight.
  done: boolean
}

export type ResearchTask = {
  task_id: string
  status: ResearchStatus
  description: string
  started_at: string
  steps_total: number
  steps_done: number
  // The most recent steps only, oldest first.
  recent_steps: ResearchStep[]
  plan: { task: string; status: string }[]
  // Present once status is "success" / "error".
  report?: string
  error?: string
  // A "success" task that ran out of its search budget before writing a
  // report: the stop notice, in place of `report`.
  stopped_early?: string
}

// GET /api/v1/conversations/{id}/context — what the context window is made of.
// system_prompt / tools are null until the conversation has had a model call
// since the breakdown was introduced; `messages` is total minus those two.
export type ContextTool = { name: string; tokens: number; kind: "builtin" | "mcp" }

export type ContextBreakdown = {
  total: number
  system_prompt: number | null
  skills: number | null
  tools: number | null
  mcp_tools: number | null
  messages: number | null
  tool_detail: ContextTool[]
  // Tools held back until the model asks for them (tool_search): what their
  // schemas would cost — not part of `total`.
  deferred: { tokens: number; detail: ContextTool[] }
}

// /api/v1/mcp/servers — MCP servers the user added. A header's value is never
// returned, only its name.
export type McpServer = {
  id: string
  name: string
  url: string
  transport: "streamable_http" | "sse"
  header_names: string[]
  enabled: boolean | null   // for the conversation asked about; null when none
  tools: string[]
  error: string | null
}

// One step of a connection check on a model the user added. `ok` is null when
// the step could not be decided (skipped).
export type ModelCheckStep = { name: string; ok: boolean | null; detail: string; ms: number }

export type UserModel = {
  id: string                 // "user:<uuid>", what the chat request carries
  name: string
  kind: "openrouter" | "endpoint"
  model: string              // the name the API is asked for
  base_url: string | null
  has_key: boolean           // the key itself never comes back
  vision: boolean
  context_window: number
  send_reasoning: boolean
  status: "unchecked" | "ok" | "degraded" | "error"
  checked_at: string | null
  result: {
    steps: ModelCheckStep[]
    capabilities: { tools: boolean | null; vision: boolean | null } | null
    total_ms: number
  } | null
}

export type UserModels = {
  models: UserModel[]
  catalog: Model[]           // the same models, shaped for the model picker
  keys_supported: boolean
  max_models: number
  enabled: boolean
}

export type McpServers = {
  servers: McpServer[]
  headers_supported: boolean
  max_servers: number
  enabled: boolean
}
