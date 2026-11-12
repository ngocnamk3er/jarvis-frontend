"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { apiFetch } from "@/lib/api-client"
import { ContextBreakdown } from "@/types/chat"

// What the conversation's context is made of. Re-read whenever the live
// context size (the gauge) changes — i.e. after every model call — rather than
// on a timer; the size itself is passed in by the caller, who already has it.
export function useContextBreakdown(threadId: string | null, contextTokens: number) {
  const { data: session } = useSession()
  const accessToken = session?.accessToken
  // Tagged with its thread so switching conversations never shows the
  // previous one's figures while the next read is in flight.
  const [loaded, setLoaded] = useState<{ id: string; data: ContextBreakdown } | null>(null)

  useEffect(() => {
    if (!threadId || !accessToken) return
    let cancelled = false
    // Debounced: a turn with several model calls changes the size several times.
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/v1/conversations/${threadId}/context`, accessToken)
        if (res.ok && !cancelled) setLoaded({ id: threadId, data: await res.json() })
      } catch {
        // backend unavailable — the next change tries again
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [threadId, accessToken, contextTokens])

  return loaded && loaded.id === threadId ? loaded.data : null
}
