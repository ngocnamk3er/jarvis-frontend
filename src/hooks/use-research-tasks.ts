"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { apiFetch } from "@/lib/api-client"
import { ResearchTask } from "@/types/chat"

// While something is moving (a task running, or a turn streaming that may be
// about to start one) look often; otherwise just keep an eye out.
const FAST_MS = 2000
const SLOW_MS = 15000

// The background research tasks of one conversation, kept fresh by polling.
// Polling rather than a stream because a task outlives the chat turn that
// started it: there is no request left to carry the events once that turn
// has ended.
export function useResearchTasks(threadId: string | null, streaming: boolean) {
  const { data: session } = useSession()
  const accessToken = session?.accessToken
  // Tagged with the thread it was read for, so switching conversations never
  // shows the previous one's tasks while the next read is in flight.
  const [loaded, setLoaded] = useState<{ id: string; tasks: ResearchTask[] } | null>(null)

  const tasks = loaded && loaded.id === threadId ? loaded.tasks : []
  const fast = streaming || tasks.some((t) => t.status === "running")

  useEffect(() => {
    if (!threadId || !accessToken) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      try {
        const res = await apiFetch(`/api/v1/conversations/${threadId}/research`, accessToken)
        if (res.ok && !cancelled) {
          const data = await res.json()
          setLoaded({ id: threadId, tasks: Array.isArray(data) ? data : [] })
        }
      } catch {
        // backend unavailable — try again on the next tick
      }
      if (!cancelled) timer = setTimeout(tick, fast ? FAST_MS : SLOW_MS)
    }
    tick()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [threadId, accessToken, fast])

  return { tasks }
}
