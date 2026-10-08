"use client"

import { useEffect, useState } from "react"
import { ThumbsUp, ThumbsDown } from "lucide-react"

type Props = {
  traceId: string
  submitFeedback: (traceId: string, rating: "up" | "down", comment?: string) => Promise<void>
  getFeedback: (traceId: string) => Promise<"up" | "down" | null>
}

// Thumbs up/down on one assistant message, backed by a Langfuse Score on
// the trace that produced it (see jarvis-backend's observability.py) —
// no feedback table of our own. Up submits immediately; down opens the
// "what went wrong" box first, matching the familiar ChatGPT pattern.
export function MessageFeedback({ traceId, submitFeedback, getFeedback }: Props) {
  const [rating, setRating] = useState<"up" | "down" | null>(null)
  const [showDialog, setShowDialog] = useState(false)
  const [comment, setComment] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    // Best-effort: a message voted on moments ago via a previous session
    // might not show its state yet (ingestion lag, see submitFeedback's
    // own comment in use-chat.ts) — failing quietly just means the
    // buttons start unfilled, never a broken control.
    getFeedback(traceId)
      .then((r) => { if (!cancelled) setRating(r) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [traceId, getFeedback])

  async function vote(next: "up" | "down", withComment?: string) {
    setSubmitting(true)
    try {
      await submitFeedback(traceId, next, withComment)
      // Optimistic, not a re-fetch — see getFeedback's own ingestion-lag
      // note above; a re-fetch right after submitting would show the
      // vote as still missing.
      setRating(next)
      setShowDialog(false)
      setComment("")
    } catch {
      // Leave rating as it was; the buttons stay enabled to retry.
    } finally {
      setSubmitting(false)
    }
  }

  function handleDown() {
    if (submitting || rating === "down") return
    setShowDialog(true)
  }

  return (
    <>
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => !submitting && void vote("up")}
          disabled={submitting}
          title="Good response"
          className={`p-1 rounded-lg hover:bg-white/60 transition-colors ${
            rating === "up" ? "text-[#5661f6]" : "text-gray-400"
          }`}
        >
          <ThumbsUp className="size-3" fill={rating === "up" ? "currentColor" : "none"} />
        </button>
        <button
          onClick={handleDown}
          disabled={submitting}
          title="Bad response"
          className={`p-1 rounded-lg hover:bg-white/60 transition-colors ${
            rating === "down" ? "text-red-500" : "text-gray-400"
          }`}
        >
          <ThumbsDown className="size-3" fill={rating === "down" ? "currentColor" : "none"} />
        </button>
      </div>

      {showDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setShowDialog(false)}
        >
          <div
            className="w-[min(420px,92vw)] rounded-2xl bg-white shadow-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[14px] font-semibold text-gray-800">Additional feedback</h3>
            <p className="text-[12px] text-gray-400 mt-0.5 mb-3">Tell us what went wrong (optional)</p>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              autoFocus
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[13px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#5661f6]/30 resize-none"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => void vote("down")}
                disabled={submitting}
                className="px-2 py-1.5 text-[13px] text-gray-500 hover:text-gray-700"
              >
                Skip
              </button>
              <button
                onClick={() => void vote("down", comment.trim() || undefined)}
                disabled={submitting}
                className="px-4 py-1.5 rounded-lg bg-gray-900 text-white text-[13px] font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
