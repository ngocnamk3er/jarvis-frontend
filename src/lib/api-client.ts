import { RETRY, canRetry, classifyStatus, nextDelayMs, parseRetryAfter } from "@/lib/api-resilience"
import { apiStatus } from "@/lib/api-status"

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

function abortError() {
  return new DOMException("The operation was aborted.", "AbortError")
}

// A pause that gives up at once if the caller aborts the request meanwhile.
function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

// fetch, plus what the page should do when the backend is busy (see lib/api-resilience.ts and lib/api-status.ts):
//  - every answer is reported to apiStatus, which is what the "server is busy" banner shows;
//  - a request that is safe to repeat (GET) that gets 503/429/502/504 or no answer is repeated, waiting what the server
//    asked for in Retry-After (or backing off with jitter), a few times and within a time budget; and while the backend
//    is known to be busy, new GETs wait a moment instead of adding to the load;
//  - anything else (a POST: sending a message, uploading) is never repeated on its own, but still reported.
// It resolves with the last response, or rejects with the network error, once it stops trying, so callers still see
// the failure they always saw; they just see it later and less often.
export async function apiFetch(pathOrUrl: string, accessToken: string | null | undefined, init: RequestInit = {}) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API_URL}${pathOrUrl}`
  const headers = new Headers(init.headers)
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`)

  const method = (init.method ?? "GET").toUpperCase()
  const repeatable = method === "GET" || method === "HEAD"
  const started = Date.now()
  let attemptsMade = 0

  for (;;) {
    if (repeatable) {
      const hold = Math.min(apiStatus.pauseRemainingMs(), RETRY.holdGetsMs)
      // A little jitter, so the requests that were all held come back spread out and not as one burst.
      if (hold > 0) await sleep(hold + Math.random() * 300, init.signal)
    }

    let res: Response | null = null
    let networkError: unknown = null
    try {
      res = await fetch(url, { ...init, headers })
    } catch (e) {
      if (init.signal?.aborted) throw e // the caller cancelled: not a failure of the backend
      networkError = e
    }
    attemptsMade++

    const kind = res ? classifyStatus(res.status) : "unavailable"
    if (!kind) {
      apiStatus.reportSuccess()
      return res as Response
    }

    const retryAfterMs = res ? parseRetryAfter(res.headers.get("retry-after")) : null
    const delay = nextDelayMs(attemptsMade - 1, retryAfterMs)
    apiStatus.reportFailure({ kind, status: res?.status ?? null, retryAfterMs }, delay)

    if (!canRetry(method, kind, attemptsMade, Date.now() - started + delay)) {
      if (res) return res
      throw networkError
    }
    res?.body?.cancel().catch(() => {}) // not going to read this one: let go of the connection
    await sleep(delay, init.signal)
  }
}
