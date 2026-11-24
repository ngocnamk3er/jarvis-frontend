// Run with: node --test src/lib/*.test.ts   (Node strips the types itself; no test runner is installed)
import { test } from "node:test"
import assert from "node:assert/strict"
import { RETRY, canResendChat, canRetry, classifyStatus, nextDelayMs, parseRetryAfter } from "./api-resilience.ts"

test("only the statuses that mean 'busy' or 'not answering' are classified", () => {
  assert.equal(classifyStatus(503), "overloaded")
  assert.equal(classifyStatus(429), "rate_limited")
  assert.equal(classifyStatus(502), "unavailable")
  assert.equal(classifyStatus(504), "unavailable")
  for (const s of [200, 201, 204, 304, 400, 401, 403, 404, 409, 422, 500]) assert.equal(classifyStatus(s), null, String(s))
})

test("Retry-After in seconds", () => {
  assert.equal(parseRetryAfter("3"), 3000)
  assert.equal(parseRetryAfter(" 1 "), 1000)
  assert.equal(parseRetryAfter("0"), 0)
  assert.equal(parseRetryAfter("1.5"), 1500)
})

test("Retry-After as an HTTP date is turned into a wait from now, and a past date is 0", () => {
  const now = Date.parse("2026-11-21T10:00:00Z")
  assert.equal(parseRetryAfter("Sat, 21 Nov 2026 10:00:07 GMT", now), 7000)
  assert.equal(parseRetryAfter("Sat, 21 Nov 2026 09:00:00 GMT", now), 0)
})

test("Retry-After that is missing, empty, or nonsense is null, and an absurd one is capped", () => {
  assert.equal(parseRetryAfter(null), null)
  assert.equal(parseRetryAfter(undefined), null)
  assert.equal(parseRetryAfter(""), null)
  assert.equal(parseRetryAfter("soon"), null)
  assert.equal(parseRetryAfter("-5"), null)
  assert.equal(parseRetryAfter("86400"), RETRY.maxServerWaitMs)
})

test("the wait is never shorter than what the server asked for, and gets a little jitter on top", () => {
  assert.equal(nextDelayMs(0, 2000, () => 0), 2000)
  assert.equal(nextDelayMs(0, 2000, () => 1), 2000 + 400) // 20% of 2 s
  assert.equal(nextDelayMs(5, 30_000, () => 1), 30_000 + 1000) // jitter is capped at 1 s
  for (let i = 0; i < 50; i++) assert.ok(nextDelayMs(0, 2000) >= 2000)
})

test("without a server hint the wait is exponential backoff with full jitter, within the floor and the ceiling", () => {
  assert.equal(nextDelayMs(0, null, () => 0), RETRY.floorMs)
  assert.equal(nextDelayMs(0, null, () => 1), RETRY.baseMs)
  assert.equal(nextDelayMs(2, null, () => 1), RETRY.baseMs * 4)
  assert.equal(nextDelayMs(20, null, () => 1), RETRY.capMs)
  for (let attempt = 0; attempt < 8; attempt++) {
    for (let i = 0; i < 30; i++) {
      const d = nextDelayMs(attempt, null)
      assert.ok(d >= RETRY.floorMs && d <= RETRY.capMs, `${attempt}: ${d}`)
    }
  }
})

test("a request that is not safe to repeat is never retried", () => {
  for (const m of ["POST", "PUT", "PATCH", "DELETE", "post"]) assert.equal(canRetry(m, "overloaded", 1, 0), false, m)
})

test("GET and HEAD are retried, up to the attempt limit and the time budget", () => {
  assert.equal(canRetry("GET", "overloaded", 1, 1000), true)
  assert.equal(canRetry("get", "unavailable", 2, 1000), true)
  assert.equal(canRetry("HEAD", "rate_limited", 1, 1000), true)
  assert.equal(canRetry("GET", "overloaded", RETRY.maxAttempts, 1000), false)
  assert.equal(canRetry("GET", "overloaded", 1, RETRY.budgetMs + 1), false)
  assert.equal(canRetry("GET", null, 1, 0), false) // not a retryable failure
})

test("a failed chat send can be sent again only when nothing is known to have run, or it was refused", () => {
  for (const s of [null, 503, 429, 502, 504]) assert.equal(canResendChat(s), true, String(s))
  for (const s of [200, 400, 401, 403, 409, 422, 500]) assert.equal(canResendChat(s), false, String(s))
})
