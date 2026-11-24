"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { Loader2 } from "lucide-react"
import { API_URL } from "@/lib/api-client"
import { nextDelayMs } from "@/lib/api-resilience"
import { apiStatus } from "@/lib/api-status"

const PROBE_TIMEOUT_MS = 5000

// One cheap request to the unauthenticated health endpoint, which the backend never refuses. This is the single trial
// of a circuit breaker: the page stays quiet while the backend is busy and sends this, no more often than the backoff
// allows, to find out when it is back.
async function backendAnswers(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/v1/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), cache: "no-store" })
    return res.ok
  } catch {
    return false
  }
}

const TEXT = {
  overloaded: "The server is busy right now.",
  rate_limited: "You're sending requests too quickly. Slowing down for a moment.",
  unavailable: "Can't reach the server right now.",
} as const

// Shown while the backend says it is busy, and gone as soon as it answers again. Out of the way (a pill at the top, not
// a bar that pushes the page down), amber and not red (busy is not broken), and it says what is happening and what
// happens next instead of leaving the page looking dead.
export function SystemStatusBanner() {
  const status = useSyncExternalStore(apiStatus.subscribe, apiStatus.getSnapshot, apiStatus.getServerSnapshot)
  const [now, setNow] = useState(() => Date.now())
  const probing = useRef(false)
  const busy = status.busy
  const retryAt = status.busy ? status.retryAt : 0

  const tryNow = useCallback(async () => {
    if (probing.current) return
    probing.current = true
    try {
      if (await backendAnswers()) {
        apiStatus.reportSuccess()
      } else {
        const s = apiStatus.getSnapshot()
        apiStatus.reportFailure({ kind: "unavailable", status: null, retryAfterMs: null }, nextDelayMs(s.busy ? s.failures : 0, null))
      }
    } finally {
      probing.current = false
    }
  }, [])

  // The countdown.
  useEffect(() => {
    if (!busy) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [busy])

  // The trial, when it is due. A tab nobody is looking at waits until it is shown again rather than keep asking.
  useEffect(() => {
    if (!busy) return
    let onVisible: (() => void) | undefined
    const timer = setTimeout(() => {
      if (document.visibilityState === "visible") {
        void tryNow()
        return
      }
      onVisible = () => {
        if (document.visibilityState !== "visible") return
        document.removeEventListener("visibilitychange", onVisible!)
        void tryNow()
      }
      document.addEventListener("visibilitychange", onVisible)
    }, Math.max(0, retryAt - Date.now()))
    return () => {
      clearTimeout(timer)
      if (onVisible) document.removeEventListener("visibilitychange", onVisible)
    }
  }, [busy, retryAt, tryNow])

  if (!status.busy) return null
  const seconds = Math.ceil((status.retryAt - now) / 1000)
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-3">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full border border-amber-200 bg-amber-50 py-1.5 pl-3 pr-1.5 text-[13px] text-amber-900 shadow-sm dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
      >
        <Loader2 className="size-3.5 shrink-0 animate-spin opacity-70" aria-hidden />
        <span>
          {TEXT[status.kind]} {seconds > 0 ? `Trying again in ${seconds}s.` : "Trying again…"}
        </span>
        <button
          type="button"
          onClick={() => void tryNow()}
          className="rounded-full bg-amber-100 px-2.5 py-1 text-[12px] font-medium hover:bg-amber-200 dark:bg-amber-900 dark:hover:bg-amber-800"
        >
          Retry now
        </button>
      </div>
    </div>
  )
}
