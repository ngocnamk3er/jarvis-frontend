"use client"

import { useEffect, useRef, useState } from "react"
import { ThumbsUp, ThumbsDown } from "lucide-react"

type Props = {
  traceId: string
  submitFeedback: (traceId: string, rating: "up" | "down", comment?: string) => Promise<void>
  getFeedback: (traceId: string) => Promise<{ rating: "up" | "down" | null; comment: string | null }>
}

const DIALOG_COPY: Record<"up" | "down", { title: string; subtitle: string }> = {
  up: { title: "Additional feedback", subtitle: "What did you like? (optional)" },
  down: { title: "Additional feedback", subtitle: "Tell us what went wrong (optional)" },
}

// Thumbs up/down on one assistant message, backed by a Langfuse Score on
// the trace that produced it (see jarvis-backend's observability.py) —
// no feedback table of our own. Either thumb opens the same optional-
// comment box (just worded differently), not just down — re-clicking the
// already-selected thumb reopens it pre-filled, to edit that comment.
export function MessageFeedback({ traceId, submitFeedback, getFeedback }: Props) {
  const [rating, setRating] = useState<"up" | "down" | null>(null)
  const [existingComment, setExistingComment] = useState<string | null>(null)
  const [dialogRating, setDialogRating] = useState<"up" | "down" | null>(null)
  const [draft, setDraft] = useState("")
  const [submitting, setSubmitting] = useState(false)
  // Guards against a real race, not just a theoretical one: getFeedback
  // carries Langfuse's own ~7-10s ingestion lag on top of ordinary
  // network latency, so the mount-time fetch below can still be in
  // flight well after the user has already voted. If it resolves *after*
  // vote() below and is applied unconditionally, it silently overwrites
  // the just-made optimistic state with stale (often null) data — the
  // vote/comment appears to vanish, intermittently, depending on exact
  // timing. Reported live as "editing old feedback feels flaky", which
  // is exactly this. Once a vote has happened locally, that fetch's
  // result is stale by definition and must not be applied.
  const votedLocally = useRef(false)

  useEffect(() => {
    let cancelled = false
    // Best-effort: a message voted on moments ago via a previous session
    // might not show its state yet (ingestion lag, see submitFeedback's
    // own comment in use-chat.ts) — failing quietly just means the
    // buttons start unfilled, never a broken control.
    getFeedback(traceId)
      .then(({ rating, comment }) => {
        if (cancelled || votedLocally.current) return
        setRating(rating)
        setExistingComment(comment)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [traceId, getFeedback])

  function openDialog(next: "up" | "down") {
    if (submitting) return
    // Editing the vote already in place starts from what was said before;
    // switching to the other thumb starts blank rather than carrying over
    // a comment that was about the opposite rating.
    setDraft(next === rating ? (existingComment ?? "") : "")
    setDialogRating(next)
  }

  async function vote(next: "up" | "down", comment?: string) {
    setSubmitting(true)
    try {
      await submitFeedback(traceId, next, comment)
      // Marks any in-flight (or future) mount fetch's result as stale —
      // see votedLocally's own comment above. Optimistic, not a re-fetch:
      // see getFeedback's own ingestion-lag note; a re-fetch right after
      // submitting would show the vote as still missing.
      votedLocally.current = true
      setRating(next)
      setExistingComment(comment ?? null)
      setDialogRating(null)
    } catch {
      // Leave state as it was; the buttons stay enabled to retry.
    } finally {
      setSubmitting(false)
    }
  }

  const copy = dialogRating ? DIALOG_COPY[dialogRating] : null

  return (
    <>
      <div className="flex items-center gap-0.5" title={existingComment ?? undefined}>
        <button
          onClick={() => openDialog("up")}
          disabled={submitting}
          title="Good response"
          className={`p-1 rounded-lg hover:bg-white/60 transition-colors ${
            rating === "up" ? "text-[#5661f6]" : "text-gray-400"
          }`}
        >
          <ThumbsUp className="size-3" fill={rating === "up" ? "currentColor" : "none"} />
        </button>
        <button
          onClick={() => openDialog("down")}
          disabled={submitting}
          title="Bad response"
          className={`p-1 rounded-lg hover:bg-white/60 transition-colors ${
            rating === "down" ? "text-red-500" : "text-gray-400"
          }`}
        >
          <ThumbsDown className="size-3" fill={rating === "down" ? "currentColor" : "none"} />
        </button>
      </div>

      {dialogRating && copy && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setDialogRating(null)}
        >
          <div
            className="w-[min(420px,92vw)] rounded-2xl bg-white shadow-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[14px] font-semibold text-gray-800">{copy.title}</h3>
            <p className="text-[12px] text-gray-400 mt-0.5 mb-3">{copy.subtitle}</p>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              autoFocus
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[13px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#5661f6]/30 resize-none"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => void vote(dialogRating)}
                disabled={submitting}
                className="px-2 py-1.5 text-[13px] text-gray-500 hover:text-gray-700"
              >
                Skip
              </button>
              <button
                onClick={() => void vote(dialogRating, draft.trim() || undefined)}
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
