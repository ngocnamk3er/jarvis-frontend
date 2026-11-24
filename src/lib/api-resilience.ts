// What to do when the backend says it is busy: tell the failures apart, read how long it asked us to wait, and decide
// whether and when to try again. Pure functions, no React and no fetch, so they can be tested on their own.
//
// The backend refuses with 503 + `Retry-After` once too many requests are in flight (jarvis-backend app/core/load_shed.py);
// the ingress answers 502/504 (or nothing at all) when the backend is not answering. From here on that is all "busy":
// the user is told once, and requests that are safe to repeat are repeated, politely.

export type FailureKind = "overloaded" | "rate_limited" | "unavailable"

export interface Failure {
  kind: FailureKind
  status: number | null // null: no response at all (network error)
  retryAfterMs: number | null // what the server asked for, if it did
}

export const RETRY = {
  maxAttempts: 3, // tries in all, the first included
  budgetMs: 20_000, // never keep one request going longer than this in total
  baseMs: 1_000, // backoff ceiling is base * 2^attempt ...
  capMs: 15_000, // ... up to this
  floorMs: 250, // never retry sooner than this, however the dice fall
  maxServerWaitMs: 60_000, // a Retry-After longer than this is not believed
  holdGetsMs: 10_000, // most a new GET waits for an open circuit before it goes anyway
} as const

// 503 is the backend refusing on purpose. 429 is a per-user limit. 502/504 and a network error are "not answering".
// 500 is deliberately not here: it is a bug, and repeating it does nothing.
export function classifyStatus(status: number): FailureKind | null {
  if (status === 503) return "overloaded"
  if (status === 429) return "rate_limited"
  if (status === 502 || status === 504) return "unavailable"
  return null
}

// `Retry-After` is either a number of seconds or an HTTP date. Null when absent or not understood.
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | null {
  if (value == null) return null
  const text = value.trim()
  if (!text) return null
  let ms: number
  if (/^\d+(\.\d+)?$/.test(text)) {
    ms = Number(text) * 1000
  } else {
    // Something made only of digits and signs that is not a plain number ("-5") is not a date either, though V8 will
    // happily parse it as one.
    if (/^[\d.+\-\s]+$/.test(text)) return null
    const date = Date.parse(text)
    if (Number.isNaN(date)) return null
    ms = date - now
  }
  return Math.min(Math.max(ms, 0), RETRY.maxServerWaitMs)
}

// How long to wait before attempt number `attempt` (0 = the wait after the first failure). What the server asked for is
// a lower bound, never undercut; a little jitter goes on top so that every tab does not come back at the same instant.
// With no server hint: exponential backoff with full jitter, between the floor and the ceiling.
export function nextDelayMs(attempt: number, retryAfterMs: number | null, random: () => number = Math.random): number {
  if (retryAfterMs != null) {
    const jitter = random() * Math.min(1_000, retryAfterMs * 0.2)
    return Math.max(RETRY.floorMs, retryAfterMs + jitter)
  }
  const ceiling = Math.min(RETRY.capMs, RETRY.baseMs * 2 ** attempt)
  return RETRY.floorMs + random() * Math.max(0, ceiling - RETRY.floorMs)
}

// A chat message that did not start a run can be sent again by the user. 503 and 429 are refusals before anything ran;
// 502/504 and no answer at all (null) mean we do not know, but sending again is still safe because the backend runs one
// run at a time per conversation (a second send while the first is running gets 409, not a second run). 409 itself, and
// every other status, are not offered a resend: they would fail the same way.
export function canResendChat(status: number | null): boolean {
  return status === null || status === 503 || status === 429 || status === 502 || status === 504
}

// Only requests that are safe to send twice are repeated. A POST (sending a chat message, uploading a file) is never
// repeated on its own: it may have gone through. `attemptsMade` counts the tries so far; `spentMs` is the time used,
// including the wait that is about to happen.
export function canRetry(method: string, kind: FailureKind | null, attemptsMade: number, spentMs: number): boolean {
  if (!kind) return false
  const m = method.toUpperCase()
  if (m !== "GET" && m !== "HEAD") return false
  return attemptsMade < RETRY.maxAttempts && spentMs <= RETRY.budgetMs
}
