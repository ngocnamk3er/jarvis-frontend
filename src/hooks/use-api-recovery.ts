"use client"

import { useEffect, useRef } from "react"
import { apiStatus } from "@/lib/api-status"

// Calls `callback` when the backend goes from busy back to fine. For the loads that gave up while it was busy (a list
// that came up empty): they use this to load again, instead of staying empty until the user happens to reload.
export function useOnApiRecovered(callback: () => void) {
  const latest = useRef(callback)
  useEffect(() => {
    latest.current = callback
  })
  useEffect(() => {
    let wasBusy = apiStatus.getSnapshot().busy
    return apiStatus.subscribe(() => {
      const busy = apiStatus.getSnapshot().busy
      if (wasBusy && !busy) latest.current()
      wasBusy = busy
    })
  }, [])
}
