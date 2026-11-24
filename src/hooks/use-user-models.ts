"use client"

import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { apiFetch } from "@/lib/api-client"
import { UserModels } from "@/types/chat"

export const USER_MODELS_CHANGED = "user-models-changed"

export type NewUserModel = {
  name: string
  kind: "openrouter" | "endpoint"
  model: string
  base_url?: string
  api_key?: string
  context_window: number
  send_reasoning: boolean
}

// The models the user added themselves: add, check the connection, remove. Anything that
// changes the list tells the model picker (useModels) to read it again.
export function useUserModels() {
  const { data: session } = useSession()
  const accessToken = session?.accessToken
  const [data, setData] = useState<UserModels | null>(null)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    try {
      const res = await apiFetch("/api/v1/user-models", accessToken)
      if (res.ok) setData(await res.json())
    } catch {
      // backend unavailable — the list stays as it was
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [refresh])

  const changed = () => window.dispatchEvent(new Event(USER_MODELS_CHANGED))

  const fail = async (res: Response, fallback: string) => {
    try {
      const body = await res.json()
      return typeof body.detail === "string" ? body.detail : fallback
    } catch {
      return fallback
    }
  }

  // Each returns an error message to show, or null on success.
  const check = async (id: string): Promise<string | null> => {
    const raw = id.replace(/^user:/, "")
    setChecking((s) => new Set(s).add(id))
    try {
      const res = await apiFetch(`/api/v1/user-models/${raw}/check`, accessToken, { method: "POST" })
      if (!res.ok) return await fail(res, "Could not check the model.")
      await refresh()
      changed()          // a check can change whether the model is known to see images
      return null
    } catch {
      return "The backend is not reachable."
    } finally {
      setChecking((s) => { const n = new Set(s); n.delete(id); return n })
    }
  }

  const add = async (model: NewUserModel): Promise<string | null> => {
    try {
      const res = await apiFetch("/api/v1/user-models", accessToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(model),
      })
      if (!res.ok) return await fail(res, "Could not add the model.")
      const added = await res.json()
      await refresh()
      changed()
      void check(added.id)           // a new model is checked at once: the person learns now whether it works
      return null
    } catch {
      return "The backend is not reachable."
    }
  }

  const remove = async (id: string): Promise<string | null> => {
    try {
      const res = await apiFetch(`/api/v1/user-models/${id.replace(/^user:/, "")}`, accessToken, { method: "DELETE" })
      if (!res.ok) return await fail(res, "Could not remove the model.")
      await refresh()
      changed()
      return null
    } catch {
      return "The backend is not reachable."
    }
  }

  return { data, loading, checking, add, remove, check }
}
