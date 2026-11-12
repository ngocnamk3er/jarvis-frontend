"use client"

import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { apiFetch } from "@/lib/api-client"
import { McpServers } from "@/types/chat"

export type NewMcpServer = {
  name: string
  url: string
  transport: "streamable_http" | "sse"
  headers: Record<string, string>
}

// The user's own MCP servers, and which are on for this conversation (none
// yet for a conversation that does not exist until its first message).
export function useMcpServers(threadId: string | null) {
  const { data: session } = useSession()
  const accessToken = session?.accessToken
  const [data, setData] = useState<McpServers | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    try {
      const q = threadId ? `?conversation_id=${encodeURIComponent(threadId)}` : ""
      const res = await apiFetch(`/api/v1/mcp/servers${q}`, accessToken)
      if (res.ok) setData(await res.json())
    } catch {
      // backend unavailable — the list stays as it was
    } finally {
      setLoading(false)
    }
  }, [accessToken, threadId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [refresh])

  // Each returns an error message to show, or null on success.
  const fail = async (res: Response, fallback: string) => {
    try {
      const body = await res.json()
      return typeof body.detail === "string" ? body.detail : fallback
    } catch {
      return fallback
    }
  }

  const add = async (server: NewMcpServer): Promise<string | null> => {
    try {
      const res = await apiFetch("/api/v1/mcp/servers", accessToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(server),
      })
      if (!res.ok) return await fail(res, "Could not add the server.")
      await refresh()
      return null
    } catch {
      return "The backend is not reachable."
    }
  }

  const remove = async (id: string): Promise<string | null> => {
    try {
      const res = await apiFetch(`/api/v1/mcp/servers/${id}`, accessToken, { method: "DELETE" })
      if (!res.ok) return await fail(res, "Could not remove the server.")
      await refresh()
      return null
    } catch {
      return "The backend is not reachable."
    }
  }

  const setEnabled = async (id: string, enabled: boolean): Promise<string | null> => {
    if (!threadId) return null
    // Optimistic: flip it now, put it back if the call fails.
    setData((d) => d && { ...d, servers: d.servers.map((s) => (s.id === id ? { ...s, enabled } : s)) })
    try {
      const res = await apiFetch(`/api/v1/mcp/conversations/${threadId}/servers/${id}`, accessToken, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      })
      if (res.ok) return null
      await refresh()
      return await fail(res, "Could not change the server.")
    } catch {
      await refresh()
      return "The backend is not reachable."
    }
  }

  return { data, loading, add, remove, setEnabled }
}
