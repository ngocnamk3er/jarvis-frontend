import { test, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { apiStatus } from "./api-status.ts"

const overloaded = { kind: "overloaded" as const, status: 503, retryAfterMs: 1000 }

beforeEach(() => apiStatus.reset())

test("starts not busy, and nothing is paused", () => {
  assert.deepEqual(apiStatus.getSnapshot(), { busy: false })
  assert.equal(apiStatus.pauseRemainingMs(), 0)
})

test("a failure makes it busy until the time the next try is due", () => {
  apiStatus.reportFailure(overloaded, 2000, 10_000)
  const s = apiStatus.getSnapshot()
  assert.ok(s.busy && s.kind === "overloaded" && s.retryAt === 12_000 && s.since === 10_000 && s.failures === 1)
  assert.equal(apiStatus.pauseRemainingMs(10_500), 1500)
  assert.equal(apiStatus.pauseRemainingMs(13_000), 0)
})

test("several failures keep the latest retry time and count, and the original start", () => {
  apiStatus.reportFailure(overloaded, 2000, 10_000)
  apiStatus.reportFailure({ ...overloaded, kind: "unavailable", status: null }, 5000, 10_100)
  apiStatus.reportFailure(overloaded, 1000, 10_200) // sooner than the one before: does not pull the time back
  const s = apiStatus.getSnapshot()
  assert.ok(s.busy && s.retryAt === 15_100 && s.since === 10_000 && s.failures === 3)
})

test("a success clears it, and listeners hear only about real changes", () => {
  let calls = 0
  const off = apiStatus.subscribe(() => calls++)
  apiStatus.reportSuccess() // already fine: nothing to tell
  assert.equal(calls, 0)
  apiStatus.reportFailure(overloaded, 1000)
  assert.equal(calls, 1)
  apiStatus.reportSuccess()
  assert.equal(calls, 2)
  assert.deepEqual(apiStatus.getSnapshot(), { busy: false })
  off()
  apiStatus.reportFailure(overloaded, 1000)
  assert.equal(calls, 2) // unsubscribed
})

test("the server render always sees 'not busy'", () => {
  apiStatus.reportFailure(overloaded, 1000)
  assert.deepEqual(apiStatus.getServerSnapshot(), { busy: false })
})
