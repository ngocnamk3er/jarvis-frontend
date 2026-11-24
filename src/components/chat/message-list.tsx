"use client"

import { useEffect, useRef, useCallback } from "react"
import { Message } from "@/types/chat"
import { MessageItem } from "./message-item"
import { splitAttachments } from "@/lib/attachments"

const NEAR_BOTTOM_THRESHOLD = 120

export function MessageList({
  messages,
  submitFeedback,
  threadId,
  onBranch,
}: {
  messages: Message[]
  threadId?: string | null
  // keepTurns: how many turns of this conversation the branch keeps; draft: the user message to edit, if any.
  onBranch?: (keepTurns: number, draft?: string) => void
  submitFeedback: (traceId: string, rating: "up" | "down", comment?: string) => Promise<void>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)
  const isStreaming = messages.some((m) => m.isStreaming)

  const isNearBottom = useCallback(() => {
    const el = containerRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD
  }, [])

  // When streaming ends, re-enable auto-scroll
  const prevStreaming = useRef(false)
  useEffect(() => {
    if (prevStreaming.current && !isStreaming) {
      userScrolledUp.current = false
    }
    prevStreaming.current = isStreaming
  }, [isStreaming])

  // Auto-scroll to bottom when messages update, unless user scrolled up
  useEffect(() => {
    if (!userScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])

  const handleScroll = useCallback(() => {
    if (!isNearBottom()) {
      userScrolledUp.current = true
    } else {
      userScrolledUp.current = false
    }
  }, [isNearBottom])

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-8 py-6"
    >
      <div className="max-w-3xl mx-auto space-y-6">
        {messages.map((msg, i) => {
          // Turns are counted by user messages: a user message is turn N (0-based) and the answer after it ends turn N.
          const userBefore = messages.slice(0, i).filter((m) => m.role === "user").length
          let branch: (() => void) | undefined
          if (onBranch && !isStreaming) {
            if (msg.role === "user") {
              const text = splitAttachments(msg.parts.filter((p) => p.type === "text").map((p) => p.content).join("")).text
              branch = () => onBranch(userBefore, text)
            } else if (msg.role === "assistant" && userBefore > 0) {
              branch = () => onBranch(userBefore)
            }
          }
          return (
            <MessageItem
              key={msg.id}
              message={msg}
              submitFeedback={submitFeedback}
              threadId={threadId}
              onBranch={branch}
            />
          )
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
