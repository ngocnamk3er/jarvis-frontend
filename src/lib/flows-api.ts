// The /api/v1/flows API (jarvis-backend app/api/v1/endpoints/flows.py).
import { apiFetch } from "@/lib/api-client"
import type {
  FlowCatalog, FlowDefinition, FlowProblem, FlowRecord, FlowRunEvent, FlowSummary,
} from "@/types/flows"

// A failed call: its message, and for a flow that does not validate, what is wrong with it.
export class FlowApiError extends Error {
  readonly status: number
  readonly problems: FlowProblem[]

  constructor(message: string, status: number, problems: FlowProblem[] = []) {
    super(message)
    this.status = status
    this.problems = problems
  }
}

async function failure(res: Response, fallback: string): Promise<FlowApiError> {
  try {
    const body = await res.json()
    const detail = body?.detail
    if (typeof detail === "string") return new FlowApiError(detail, res.status)
    if (detail && typeof detail.message === "string") return new FlowApiError(detail.message, res.status, detail.problems ?? [])
  } catch {
    // not JSON
  }
  return new FlowApiError(fallback, res.status)
}

async function call<T>(token: string | undefined, path: string, init: RequestInit, fallback: string): Promise<T> {
  let res: Response
  try {
    res = await apiFetch(path, token, init)
  } catch {
    throw new FlowApiError("The backend is not reachable.", 0)
  }
  if (!res.ok) throw await failure(res, fallback)
  return (res.status === 204 ? undefined : await res.json()) as T
}

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

export type FlowFields = { name: string; description: string; definition: FlowDefinition; enabled: boolean }

export const flowsApi = {
  list: (t?: string) => call<FlowSummary[]>(t, "/api/v1/flows", {}, "Could not load your flows."),
  get: (t: string | undefined, id: string) => call<FlowRecord>(t, `/api/v1/flows/${id}`, {}, "Could not load the flow."),
  catalog: (t?: string) => call<FlowCatalog>(t, "/api/v1/flows/catalog", {}, "Could not load the node catalog."),
  validate: (t: string | undefined, definition: FlowDefinition) =>
    call<{ valid: boolean; problems: FlowProblem[] }>(t, "/api/v1/flows/validate", { method: "POST", ...json({ definition }) },
      "Could not check the flow."),
  create: (t: string | undefined, f: FlowFields) =>
    call<FlowRecord>(t, "/api/v1/flows", { method: "POST", ...json(f) }, "Could not save the flow."),
  update: (t: string | undefined, id: string, f: FlowFields) =>
    call<FlowRecord>(t, `/api/v1/flows/${id}`, { method: "PUT", ...json(f) }, "Could not save the flow."),
  setEnabled: (t: string | undefined, id: string, enabled: boolean) =>
    call<FlowSummary>(t, `/api/v1/flows/${id}`, { method: "PATCH", ...json({ enabled }) }, "Could not change the flow."),
  remove: (t: string | undefined, id: string) =>
    call<void>(t, `/api/v1/flows/${id}`, { method: "DELETE" }, "Could not delete the flow."),
}

// Reads Server-Sent Events: feed it decoded text as it arrives, get back the `data:` payloads that are complete.
// Lines that are not `data:` — heartbeats (`: ping`), blank separators — are skipped.
export function sseReader() {
  let buffer = ""
  return (text: string): unknown[] => {
    buffer += text
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    const out: unknown[] = []
    for (const raw of lines) {
      const line = raw.trimEnd()
      if (!line.startsWith("data: ")) continue
      try {
        out.push(JSON.parse(line.slice(6)))
      } catch {
        // a malformed line is skipped, not fatal to the run
      }
    }
    return out
  }
}

// A test run of the saved flow, event by event. Throws FlowApiError if it is refused before it starts (bad inputs).
export async function* runFlow(
  token: string | undefined, id: string, inputs: Record<string, unknown>, model: string | null, signal?: AbortSignal,
): AsyncGenerator<FlowRunEvent> {
  let res: Response
  try {
    res = await apiFetch(`/api/v1/flows/${id}/run`, token, { method: "POST", ...json({ inputs, model }), signal })
  } catch (e) {
    if ((e as Error).name === "AbortError") return
    throw new FlowApiError("The backend is not reachable.", 0)
  }
  if (!res.ok || !res.body) throw await failure(res, "Could not run the flow.")
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  const read = sseReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    for (const ev of read(decoder.decode(value, { stream: true }))) yield ev as FlowRunEvent
  }
}
