"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useSession } from "next-auth/react"
import { apiFetch } from "@/lib/api-client"
import { Model, UserModels } from "@/types/chat"
import { USER_MODELS_CHANGED } from "@/hooks/use-user-models"

// The built-in models, then the ones the signed-in user added (marked `custom`).
export function useModels() {
  const { data: session } = useSession()
  const accessToken = session?.accessToken
  const [builtin, setBuiltin] = useState<Model[]>([])
  const [own, setOwn] = useState<Model[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // /chat/models is static config, deliberately left unauthenticated
        const res = await apiFetch("/api/v1/chat/models", null)
        if (!res.ok) return
        const data: Model[] = await res.json()
        if (!cancelled) setBuiltin(Array.isArray(data) ? data : [])
      } catch {
        // backend unavailable — leave list empty
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const loadOwn = useCallback(async () => {
    if (!accessToken) { setOwn([]); return }
    try {
      const res = await apiFetch("/api/v1/user-models", accessToken)
      if (!res.ok) return
      const data: UserModels = await res.json()
      setOwn(Array.isArray(data.catalog) ? data.catalog : [])
    } catch {
      // the picker keeps the models it had
    }
  }, [accessToken])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOwn()
    window.addEventListener(USER_MODELS_CHANGED, loadOwn)
    return () => window.removeEventListener(USER_MODELS_CHANGED, loadOwn)
  }, [loadOwn])

  const models = useMemo(() => [...builtin, ...own], [builtin, own])
  return { models, loading }
}
