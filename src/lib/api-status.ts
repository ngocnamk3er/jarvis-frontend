// One shared answer to "is the backend busy right now?", for the whole page. The API client reports into it, the banner
// and the hooks read from it. It is also the client-side circuit breaker: while it is busy, requests that are safe to
// repeat are held back until `retryAt` instead of piling more onto a server that has just said it is full.
import type { Failure, FailureKind } from "./api-resilience"

export type ApiStatus =
  | { busy: false }
  | { busy: true; kind: FailureKind; retryAt: number; since: number; failures: number }

const OK: ApiStatus = { busy: false }

let state: ApiStatus = OK
const listeners = new Set<() => void>()

function set(next: ApiStatus) {
  state = next
  listeners.forEach((l) => l())
}

export const apiStatus = {
  getSnapshot: (): ApiStatus => state,
  getServerSnapshot: (): ApiStatus => OK,
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  // A request failed in a way that means "busy". `delayMs` is when the next try is due. Several requests failing at
  // once keep the latest retry time, so the banner counts down to the furthest one rather than flickering.
  reportFailure(failure: Failure, delayMs: number, now: number = Date.now()) {
    const retryAt = now + delayMs
    if (state.busy) {
      set({ ...state, kind: failure.kind, retryAt: Math.max(state.retryAt, retryAt), failures: state.failures + 1 })
    } else {
      set({ busy: true, kind: failure.kind, retryAt, since: now, failures: 1 })
    }
  },

  // The backend answered properly: not busy any more. No change, and so no re-render, if it already was not.
  reportSuccess() {
    if (state.busy) set(OK)
  },

  // How long a request that is safe to repeat should still hold off. 0 when not busy or the time has passed.
  pauseRemainingMs(now: number = Date.now()): number {
    return state.busy ? Math.max(0, state.retryAt - now) : 0
  },

  // Test helper: forget everything.
  reset() {
    set(OK)
  },
}
