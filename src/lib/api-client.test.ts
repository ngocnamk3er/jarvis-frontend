// apiFetch against a fake fetch: what is retried, what is not, and that waiting never outlives the caller.
import { test, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"
import { apiFetch } from "@/lib/api-client"
import { apiStatus } from "@/lib/api-status"

const realFetch = globalThis.fetch
let calls: { url: string; method: string }[] = []

function fakeFetch(script: (Response | Error)[]) {
  calls = []
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" })
    const next = script[Math.min(calls.length - 1, script.length - 1)]
    if (next instanceof Error) throw next
    return next.clone()
  }) as typeof fetch
}

const ok = () => new Response("{}", { status: 200 })
const busy = (retryAfter = "0") => new Response("{}", { status: 503, headers: { "retry-after": retryAfter } })

beforeEach(() => apiStatus.reset())
afterEach(() => {
  globalThis.fetch = realFetch
  apiStatus.reset()
})

test("a good answer is returned at once and nothing is flagged", async () => {
  fakeFetch([ok()])
  const res = await apiFetch("/x", "tok")
  assert.equal(res.status, 200)
  assert.equal(calls.length, 1)
  assert.equal(apiStatus.getSnapshot().busy, false)
})

test("the token and the base url are applied", async () => {
  let seen: Headers | undefined
  globalThis.fetch = (async (_u: string, init?: RequestInit) => {
    seen = new Headers(init?.headers)
    return ok()
  }) as typeof fetch
  await apiFetch("/api/v1/conversations", "abc")
  assert.equal(seen?.get("authorization"), "Bearer abc")
})

test("a GET refused with 503 is tried again and the user ends up with the good answer", async () => {
  fakeFetch([busy(), ok()])
  const res = await apiFetch("/x", "tok")
  assert.equal(res.status, 200)
  assert.equal(calls.length, 2)
  assert.equal(apiStatus.getSnapshot().busy, false) // the success cleared the flag the failure had raised
})

test("a GET that keeps being refused is given up on after the attempt limit, with the last answer, and the page is flagged busy", async () => {
  fakeFetch([busy()])
  const res = await apiFetch("/x", "tok")
  assert.equal(res.status, 503)
  assert.equal(calls.length, 3)
  assert.equal(apiStatus.getSnapshot().busy, true)
})

test("a POST is never repeated by itself, but the refusal is still reported", async () => {
  fakeFetch([busy(), ok()])
  const res = await apiFetch("/api/v1/chat/stream", "tok", { method: "POST", body: "{}" })
  assert.equal(res.status, 503)
  assert.equal(calls.length, 1)
  assert.equal(apiStatus.getSnapshot().busy, true)
})

test("a 500 is a bug, not load: not repeated and not flagged", async () => {
  fakeFetch([new Response("boom", { status: 500 }), ok()])
  const res = await apiFetch("/x", "tok")
  assert.equal(res.status, 500)
  assert.equal(calls.length, 1)
  assert.equal(apiStatus.getSnapshot().busy, false)
})

test("a network error on a GET is tried again", async () => {
  fakeFetch([new TypeError("Failed to fetch"), ok()])
  const res = await apiFetch("/x", "tok")
  assert.equal(res.status, 200)
  assert.equal(calls.length, 2)
})

test("a network error on a POST is thrown at once, and reported", async () => {
  fakeFetch([new TypeError("Failed to fetch"), ok()])
  await assert.rejects(apiFetch("/x", "tok", { method: "POST" }), TypeError)
  assert.equal(calls.length, 1)
  assert.equal(apiStatus.getSnapshot().busy, true)
})

test("while the backend is known to be busy a new GET waits instead of being sent; a POST is not held", async () => {
  fakeFetch([ok()])
  apiStatus.reportFailure({ kind: "overloaded", status: 503, retryAfterMs: 600 }, 600)
  const t0 = Date.now()
  await apiFetch("/x", "tok")
  assert.ok(Date.now() - t0 >= 500, `waited ${Date.now() - t0} ms`)
  fakeFetch([ok()])
  apiStatus.reportFailure({ kind: "overloaded", status: 503, retryAfterMs: 5000 }, 5000)
  const t1 = Date.now()
  await apiFetch("/x", "tok", { method: "POST" })
  assert.ok(Date.now() - t1 < 200)
})

test("a Retry-After longer than the time budget is not waited for: the refusal is returned at once", async () => {
  fakeFetch([busy("30")])
  const t0 = Date.now()
  const res = await apiFetch("/x", "tok")
  assert.equal(res.status, 503)
  assert.equal(calls.length, 1)
  assert.ok(Date.now() - t0 < 500)
  assert.equal(apiStatus.pauseRemainingMs() > 25_000, true) // but the page now knows to hold off for about that long
})

test("cancelling while waiting to retry ends the request at once", async () => {
  fakeFetch([busy("10")])
  const controller = new AbortController()
  setTimeout(() => controller.abort(), 50)
  const t0 = Date.now()
  await assert.rejects(apiFetch("/x", "tok", { signal: controller.signal }), { name: "AbortError" })
  assert.ok(Date.now() - t0 < 1000)
  assert.equal(calls.length, 1)
})

test("a request the caller cancelled is not counted as the backend being busy", async () => {
  const controller = new AbortController()
  globalThis.fetch = (async () => {
    controller.abort()
    throw new DOMException("aborted", "AbortError")
  }) as typeof fetch
  await assert.rejects(apiFetch("/x", "tok", { signal: controller.signal }), { name: "AbortError" })
  assert.equal(apiStatus.getSnapshot().busy, false)
})
