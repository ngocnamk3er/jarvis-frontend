"use client"

import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { FlowApiError, flowsApi } from "@/lib/flows-api"
import type { FlowSummary } from "@/types/flows"

// The user's flows, for the list page and the side panel. Each action returns an error message, or null.
export function useFlows() {
  const { data: session } = useSession()
  const token = session?.accessToken
  const [flows, setFlows] = useState<FlowSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!token) return
    try {
      setFlows(await flowsApi.list(token))
      setError(null)
    } catch (e) {
      setError(e instanceof FlowApiError ? e.message : "Could not load your flows.")
    }
  }, [token])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [refresh])

  const setEnabled = async (id: string, enabled: boolean): Promise<string | null> => {
    setFlows((fs) => fs && fs.map((f) => (f.id === id ? { ...f, enabled } : f)))   // optimistic
    try {
      await flowsApi.setEnabled(token, id, enabled)
      return null
    } catch (e) {
      await refresh()
      return e instanceof FlowApiError ? e.message : "Could not change the flow."
    }
  }

  const remove = async (id: string): Promise<string | null> => {
    try {
      await flowsApi.remove(token, id)
      await refresh()
      return null
    } catch (e) {
      return e instanceof FlowApiError ? e.message : "Could not delete the flow."
    }
  }

  return { flows, error, refresh, setEnabled, remove }
}
