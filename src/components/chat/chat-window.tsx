"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { RotateCcw } from "lucide-react"
import { useChat, useLoadingThreadIds } from "@/hooks/use-chat"
import { useConversations } from "@/hooks/use-conversations"
import { useModels } from "@/hooks/use-models"
import { useContextBreakdown } from "@/hooks/use-context-breakdown"
import { useResearchTasks } from "@/hooks/use-research-tasks"
import { Sidebar } from "./sidebar"
import { FileBrowserModal } from "@/components/files/file-browser-modal"
import { buildAttachmentsBlock, uploadChatFiles } from "@/lib/attachments"
import { EmptyState } from "./empty-state"
import { MessageList } from "./message-list"
import { ChatInput } from "./chat-input"
import { ClarifyRequest } from "./clarify-request"
import { HitlApproval } from "./hitl-approval"
import { SidePanel } from "./side-panel"

// Module-level set to track which threads have already had history loaded
// (avoids re-fetching when switching back to a conversation mid-stream)
const _historyLoaded = new Set<string>()

export function ChatWindow() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const { conversations, create, remove, setLastModel, setLastSubagentModel } = useConversations()
  const { models } = useModels()
  const { data: session } = useSession()
  const accessToken = session?.accessToken
  const [activeId, setActiveId] = useState<string | null>(null)
  const [filesOpen, setFilesOpen] = useState(false)
  // Global preference, not per-conversation — persisted to localStorage
  // below. Starts false on every load (incl. SSR) and is corrected from
  // storage in a mount effect, since localStorage isn't available server-side.
  const [autoApproveBash, setAutoApproveBash] = useState(false)
  const pendingContent = useRef<{
    content: string
    effort: import("@/types/chat").ThinkingEffort
    model?: import("@/types/chat").Model
    subagentModel?: import("@/types/chat").Model
    webSearch: boolean
  } | null>(null)
  // Set synchronously (a ref, not state) the moment a message is sent, so a
  // brand-new conversation's ChatInput — which remounts as soon as activeId
  // changes to the newly created id — reads the right model on its very
  // first render. Waiting on `conversations` state (updated via setLastModel,
  // which only lands a render later) let ChatInput's own "default the model"
  // effect fire first with the stale/missing value, flashing DeepSeek Flash
  // before correcting itself once the state caught up.
  const lastSentModel = useRef<Map<string, string>>(new Map())
  const lastSentSubagentModel = useRef<Map<string, string>>(new Map())
  // Carried onto resume/clarify so "Web off" survives a bash-approval
  // interrupt mid-turn (ChatInput's own toggle state doesn't reach resume,
  // which is triggered from here, not from the input).
  const lastSentWebSearch = useRef<Map<string, boolean>>(new Map())

  const { messages, isLoading, pendingHitl, pendingClarify, interrupted, stopped, contextTokens, sendMessage, resumeMessage, resumeClarify, stopMessage, loadHistory, submitFeedback } = useChat(activeId)
  const loadingThreadIds = useLoadingThreadIds()
  // Background research started from this conversation. Polled, because a task
  // keeps going after the turn that started it has ended.
  const { tasks: researchTasks } = useResearchTasks(activeId, isLoading)
  // Open by default and whenever a new task appears; remembered as "collapsed
  // while there were N tasks" so a task started later opens it again.
  const [researchCollapsedAt, setResearchCollapsedAt] = useState<number | null>(null)
  const sideOpen = researchCollapsedAt === null || researchTasks.length > researchCollapsedAt

  async function openConversation(id: string) {
    // Skip if already loaded (may be mid-stream when switching back)
    if (_historyLoaded.has(id)) return
    _historyLoaded.add(id)
    await loadHistory(id)
  }

  // Restore active conversation from URL on mount
  useEffect(() => {
    const cid = searchParams.get("c")
    if (cid) {
      // One-time restore from the URL on mount, not a value derivable
      // during render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveId(cid)
      openConversation(cid)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Restore the auto-approve-bash preference — client-only, so this can't
  // just be the useState initializer (would break SSR).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAutoApproveBash(localStorage.getItem("jarvis:autoApproveBash") === "true")
  }, [])

  const toggleAutoApproveBash = () => {
    setAutoApproveBash((prev) => {
      const next = !prev
      localStorage.setItem("jarvis:autoApproveBash", String(next))
      return next
    })
  }

  // Send pending message after activeId is set (new conversation flow)
  useEffect(() => {
    if (activeId && pendingContent.current) {
      const { content, effort, model, subagentModel, webSearch } = pendingContent.current
      if (model) setLastModel(activeId, model.id)
      if (subagentModel) setLastSubagentModel(activeId, subagentModel.id)
      lastSentWebSearch.current.set(activeId, webSearch)
      sendMessage(content, effort, model, subagentModel, webSearch)
      pendingContent.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, sendMessage])

  function activate(id: string | null) {
    setActiveId(id)
    router.replace(id ? `/?c=${id}` : "/")
  }

  const handleNewChat = () => {
    activate(null)
  }

  const handleSelectConversation = async (id: string) => {
    activate(id)
    await openConversation(id)
  }

  const handleDeleteConversation = async (id: string) => {
    await remove(id)
    _historyLoaded.delete(id)
    if (activeId === id) {
      activate(null)
    }
  }

  const handleSend = async (
    content: string,
    effort: import("@/types/chat").ThinkingEffort = "high",
    model?: import("@/types/chat").Model,
    subagentModel?: import("@/types/chat").Model,
    webSearch: boolean = true,
    files: File[] = []
  ) => {
    if (!activeId) {
      pendingContent.current = { content, effort, model, subagentModel, webSearch }
      const conv = await create(content.slice(0, 50))
      if (model) lastSentModel.current.set(conv.id, model.id)
      if (subagentModel) lastSentSubagentModel.current.set(conv.id, subagentModel.id)
      lastSentWebSearch.current.set(conv.id, webSearch)
      _historyLoaded.add(conv.id)  // Mark as loaded so we don't fetch history for brand-new thread
      if (files.length > 0) {
        // A new chat has no sandbox until now. Upload into the conversation that was
        // just created; if that fails, stay in it (so a retry does not create a second
        // empty one) and drop the queued message so it is not sent without its files.
        try {
          const saved = await uploadChatFiles(conv.id, files, accessToken)
          pendingContent.current = { content: content + buildAttachmentsBlock(saved), effort, model, subagentModel, webSearch }
        } catch (e) {
          pendingContent.current = null
          activate(conv.id)
          throw e
        }
      }
      activate(conv.id)
    } else {
      if (files.length > 0) {
        const saved = await uploadChatFiles(activeId, files, accessToken)
        content += buildAttachmentsBlock(saved)
      }
      if (model) {
        lastSentModel.current.set(activeId, model.id)
        setLastModel(activeId, model.id)
      }
      if (subagentModel) {
        lastSentSubagentModel.current.set(activeId, subagentModel.id)
        setLastSubagentModel(activeId, subagentModel.id)
      }
      lastSentWebSearch.current.set(activeId, webSearch)
      sendMessage(content, effort, model, subagentModel, webSearch)
    }
  }

  // Same model this conversation is already using — resuming a bash approval
  // or a clarify answer must carry it forward explicitly, since the backend
  // has no other way to know which model to continue with (see
  // chat_service.resume/resume_clarify).
  // Reads a ref during render (flagged by react-hooks/refs) — intentional,
  // see the lastSentModel/lastSentSubagentModel comment above for why this
  // can't wait on state instead.
  const resumeModelId =
    // eslint-disable-next-line react-hooks/refs
    (activeId && lastSentModel.current.get(activeId)) ??
    conversations.find((c) => c.id === activeId)?.last_model ??
    null
  const resumeModel = models.find((m) => m.id === resumeModelId)

  const resumeSubagentModelId =
    // eslint-disable-next-line react-hooks/refs
    (activeId && lastSentSubagentModel.current.get(activeId)) ??
    conversations.find((c) => c.id === activeId)?.last_subagent_model ??
    null
  const resumeSubagentModel = models.find((m) => m.id === resumeSubagentModelId)

  // Ref-during-render, same tradeoff as resumeModelId above. Defaults to
  // web-on when this thread was never sent from this session (e.g. after a
  // reload landed on a pending interrupt).
  // eslint-disable-next-line react-hooks/refs
  const resumeWebSearch = (activeId ? lastSentWebSearch.current.get(activeId) : undefined) ?? true

  // Auto-approve preference: click Approve for the user the instant a bash
  // interrupt lands, instead of rendering HitlApproval. Every interrupt today
  // is a bash call (the only tool in HumanInTheLoopMiddleware's interrupt_on
  // — see backend app/agents/graph.py), so there's nothing to distinguish here.
  useEffect(() => {
    if (pendingHitl && !isLoading && autoApproveBash) {
      resumeMessage("approve", resumeModel, resumeSubagentModel, resumeWebSearch)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingHitl, isLoading, autoApproveBash])

  // Live value from this session's SSE stream overrides; else fall back to
  // whatever was last persisted (loaded once via useConversations() on
  // mount) — same pattern as resumeModelId above.
  const displayedContextTokens =
    contextTokens ?? conversations.find((c) => c.id === activeId)?.context_tokens ?? 0

  // The model the conversation last ran on (what its window is measured
  // against); the model picked in the input but not yet sent is not known here.
  const panelModel = resumeModel ?? models.find((m) => m.default) ?? models[0]
  const contextBreakdown = useContextBreakdown(activeId, displayedContextTokens)

  const handleRetry = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user")
    if (!lastUser) return
    const content = lastUser.parts.find((p) => p.type === "text")?.content
    if (content) handleSend(content)
  }

  const hasMessages = messages.length > 0

  return (
    <div className="flex h-screen bg-[#EEF2FF] overflow-hidden">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        loadingThreadIds={loadingThreadIds}
        onNewChat={handleNewChat}
        onSelect={handleSelectConversation}
        onDelete={handleDeleteConversation}
        onOpenFiles={() => setFilesOpen(true)}
      />

      <FileBrowserModal open={filesOpen} onClose={() => setFilesOpen(false)} />

      <div className="flex flex-1 min-w-0 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          {hasMessages ? (
            <MessageList messages={messages} submitFeedback={submitFeedback} threadId={activeId} />
          ) : (
            <EmptyState />
          )}

          {pendingHitl && !isLoading && !autoApproveBash && (
            <HitlApproval
              hitl={pendingHitl}
              onApprove={() => resumeMessage("approve", resumeModel, resumeSubagentModel, resumeWebSearch)}
              onReject={() => resumeMessage("reject", resumeModel, resumeSubagentModel, resumeWebSearch)}
            />
          )}

          {pendingClarify && !isLoading && (
            <ClarifyRequest
              clarify={pendingClarify}
              onAnswer={(answer) => resumeClarify(answer, resumeModel, resumeSubagentModel, resumeWebSearch)}
            />
          )}

          {(interrupted || stopped) && !isLoading && !pendingHitl && !pendingClarify && (
            <div className="flex justify-center pb-2">
              <div className="flex items-center gap-2.5 bg-white border border-amber-200 text-amber-700 rounded-full px-4 py-2 text-[12px] shadow-sm">
                <span>{stopped ? "Stopped" : "Response was interrupted"}</span>
                <button
                  onClick={handleRetry}
                  className="flex items-center gap-1 font-semibold hover:text-amber-900 transition-colors"
                >
                  <RotateCcw className="size-3" />
                  Retry
                </button>
              </div>
            </div>
          )}

          <ChatInput
            key={activeId}
            onSend={handleSend}
            disabled={isLoading || !!pendingHitl || !!pendingClarify}
            isLoading={isLoading}
            onStop={stopMessage}
            initialModelId={
              // Same ref-during-render tradeoff as resumeModelId above.
              // eslint-disable-next-line react-hooks/refs
              (activeId && lastSentModel.current.get(activeId)) ??
              conversations.find((c) => c.id === activeId)?.last_model ??
              null
            }
            initialSubagentModelId={
              // eslint-disable-next-line react-hooks/refs
              (activeId && lastSentSubagentModel.current.get(activeId)) ??
              conversations.find((c) => c.id === activeId)?.last_subagent_model ??
              null
            }
            hasMessages={hasMessages}
            contextTokens={displayedContextTokens}
            autoApproveBash={autoApproveBash}
            onToggleAutoApproveBash={toggleAutoApproveBash}
          />
        </div>

        <SidePanel
          threadId={activeId}
          tasks={researchTasks}
          open={sideOpen}
          onToggle={() => setResearchCollapsedAt(sideOpen ? researchTasks.length : null)}
          context={hasMessages && panelModel ? {
            total: displayedContextTokens,
            window: panelModel.contextWindow,
            modelName: panelModel.name,
            breakdown: contextBreakdown,
          } : null}
        />
      </div>
    </div>
  )
}
