"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { apiFetch } from "@/lib/api-client"
import { useOnApiRecovered } from "@/hooks/use-api-recovery"
import { Conversation } from "@/types/chat"

export function useConversations() {
  const { data: session, status } = useSession()
  const accessToken = session?.accessToken
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(false)
  // The last load did not work (as opposed to there being nothing to load): the list is empty because of that.
  const [loadFailed, setLoadFailed] = useState(false)

  const fetch_ = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    try {
      const res = await apiFetch("/api/v1/conversations", accessToken)
      if (!res.ok) {
        setLoadFailed(true)
        return
      }
      const data: Conversation[] = await res.json()
      setConversations(Array.isArray(data) ? data : [])
      setLoadFailed(false)
    } catch {
      // backend unavailable — keep what is on screen (an empty list says so via loadFailed)
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  const create = useCallback(async (title = "New conversation"): Promise<Conversation> => {
    const res = await apiFetch("/api/v1/conversations", accessToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
    if (!res.ok) throw new Error(`Failed to create conversation: ${res.status}`)
    const conv: Conversation = await res.json()
    if (!conv?.id) throw new Error("Invalid conversation response")
    setConversations((prev) => {
      const safe = Array.isArray(prev) ? prev : []
      return [conv, ...safe.filter((c) => c.id !== conv.id)]
    })
    return conv
  }, [accessToken])

  // A new conversation holding the first `keepTurns` turns of `id` (a turn = a user message and its answer).
  const fork = useCallback(async (id: string, keepTurns: number): Promise<Conversation> => {
    const res = await apiFetch(`/api/v1/conversations/${id}/fork`, accessToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keep_turns: keepTurns }),
    })
    if (!res.ok) {
      const detail = await res.json().then((b) => b?.detail).catch(() => null)
      throw new Error(typeof detail === "string" ? detail : `Could not branch: ${res.status}`)
    }
    const conv: Conversation = await res.json()
    setConversations((prev) => [conv, ...(Array.isArray(prev) ? prev : []).filter((c) => c.id !== conv.id)])
    return conv
  }, [accessToken])

  const remove = useCallback(async (id: string) => {
    await apiFetch(`/api/v1/conversations/${id}`, accessToken, { method: "DELETE" })
    setConversations((prev) => prev.filter((c) => c.id !== id))
  }, [accessToken])

  const updateTitle = useCallback(async (id: string, title: string) => {
    await apiFetch(`/api/v1/conversations/${id}/title`, accessToken, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c))
    )
  }, [accessToken])

  // The backend already persists last_model as a side effect of /chat/stream
  // (see chat.py's touch_conversation call) — this just mirrors that locally
  // so the sidebar/input reflect it immediately, without waiting on a refetch.
  const setLastModel = useCallback((id: string, modelId: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, last_model: modelId } : c))
    )
  }, [])

  const setLastSubagentModel = useCallback((id: string, modelId: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, last_subagent_model: modelId } : c))
    )
  }, [])

  useEffect(() => {
    // Fetches from the backend once auth resolves — synchronizing with an
    // external system (the network), not a value derivable during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status === "authenticated") fetch_()
  }, [status, fetch_])

  // The load gave up while the backend was busy: do it again once it answers, instead of staying empty.
  useOnApiRecovered(() => {
    if (loadFailed) void fetch_()
  })

  return { conversations, loading, loadFailed, refetch: fetch_, create, fork, remove, updateTitle, setLastModel, setLastSubagentModel }
}
