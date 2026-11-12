"use client"

import { useEffect, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  ChevronDown, ChevronRight, CircleAlert, CircleCheck, CircleSlash,
  Clock, FileText, FlaskConical, Globe, Loader2, Search,
} from "lucide-react"
import { ResearchStatus, ResearchStep, ResearchTask } from "@/types/chat"

// Right-hand panel for background research tasks (see jarvis-backend's
// app/agents/async_research.py). A task runs after the chat turn that started
// it has ended, so its progress cannot ride that turn's stream; this panel
// shows it live from the polled task state instead — the same state the agent
// reads when it is asked how a task is going.

const STATUS: Record<ResearchStatus, { label: string; cls: string }> = {
  running: { label: "Running", cls: "bg-[#EEF0FF] text-[#5661f6] border-[#C7CCFF]" },
  success: { label: "Done", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  error: { label: "Failed", cls: "bg-red-50 text-red-600 border-red-200" },
  cancelled: { label: "Cancelled", cls: "bg-gray-100 text-gray-500 border-gray-200" },
  interrupted: { label: "Interrupted", cls: "bg-amber-50 text-amber-700 border-amber-200" },
}

// A "success" task cut off by its search budget has no report; show it as
// what it is rather than as a clean finish.
const STOPPED = { label: "Stopped at limit", cls: "bg-amber-50 text-amber-700 border-amber-200" }

function StatusIcon({ status }: { status: ResearchStatus }) {
  const cls = "size-3 shrink-0"
  if (status === "running") return <Loader2 className={`${cls} animate-spin`} />
  if (status === "success") return <CircleCheck className={cls} />
  if (status === "cancelled") return <CircleSlash className={cls} />
  return <CircleAlert className={cls} />
}

function StepIcon({ tool }: { tool: string }) {
  const cls = "size-3.5 shrink-0 text-gray-400"
  if (tool === "web_fetch") return <FileText className={cls} />
  if (tool === "web_search") return <Globe className={cls} />
  return <Search className={cls} />
}

// Ticks once a second, but only while something is running.
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

function elapsed(startedAt: string, now: number) {
  const s = Math.max(0, Math.round((now - Date.parse(startedAt)) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

function Step({ step }: { step: ResearchStep }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-[3px]"><StepIcon tool={step.tool} /></span>
      <span className={`flex-1 min-w-0 text-[12px] leading-[17px] break-words ${step.done ? "text-gray-500" : "text-gray-800 font-medium"}`}>
        {step.what || step.tool}
      </span>
      {step.done
        ? <CircleCheck className="size-3.5 shrink-0 text-emerald-500 mt-[2px]" />
        : <Loader2 className="size-3.5 shrink-0 text-[#5661f6] animate-spin mt-[2px]" />}
    </li>
  )
}

function TaskCard({ task, now }: { task: ResearchTask; now: number }) {
  const [reportOpen, setReportOpen] = useState(false)
  const running = task.status === "running"
  const stoppedEarly = task.status === "success" && !!task.stopped_early
  const st = stoppedEarly ? STOPPED : STATUS[task.status]
  const earlier = task.steps_total - task.recent_steps.length
  const allDone = task.recent_steps.every((s) => s.done)

  return (
    <div className="rounded-xl border border-[#E0E7FF] bg-white shadow-sm p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-[11px] font-semibold ${st.cls}`}>
          {stoppedEarly ? <CircleAlert className="size-3 shrink-0" /> : <StatusIcon status={task.status} />}
          {st.label}
        </span>
        {running && (
          <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 tabular-nums">
            <Clock className="size-3" />
            {elapsed(task.started_at, now)}
          </span>
        )}
      </div>

      <p className="text-[13px] leading-[19px] font-medium text-gray-800 line-clamp-3">{task.description}</p>

      <div className="text-[11px] text-gray-400 font-mono truncate">
        {task.task_id.slice(0, 8)} · {task.steps_done}/{task.steps_total} steps
      </div>

      {running && <div className="h-[3px] rounded-full bg-[#EEF0FF] overflow-hidden"><div className="h-full w-1/3 rounded-full bg-[#5661f6] animate-pulse" /></div>}

      {task.recent_steps.length > 0 && (
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
            {running ? "Doing now" : "Steps"}
          </div>
          <ul className="space-y-1.5">
            {earlier > 0 && <li className="text-[11px] text-gray-400 pl-[22px]">… {earlier} earlier step{earlier > 1 ? "s" : ""}</li>}
            {task.recent_steps.map((s, i) => <Step key={i} step={s} />)}
            {running && allDone && (
              <li className="flex items-center gap-2 text-[12px] text-gray-500 pl-[2px]">
                <Loader2 className="size-3.5 text-[#5661f6] animate-spin" />
                Thinking…
              </li>
            )}
          </ul>
        </div>
      )}

      {task.plan.length > 0 && (
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Plan</div>
          <ul className="space-y-1">
            {task.plan.map((p, i) => (
              <li key={i} className={`text-[12px] leading-[17px] ${p.status === "completed" ? "text-gray-400 line-through" : p.status === "in_progress" ? "text-gray-800 font-medium" : "text-gray-500"}`}>
                {p.task}
              </li>
            ))}
          </ul>
        </div>
      )}

      {task.error && <p className="text-[12px] text-red-600 break-words">{task.error}</p>}
      {task.stopped_early && (
        <p className="text-[12px] text-amber-700 break-words">
          Ran out of its search budget before writing a report. {task.stopped_early}
        </p>
      )}
      {task.status === "interrupted" && (
        <p className="text-[12px] text-amber-700">The service restarted while this ran, so it stopped part-way.</p>
      )}

      {task.report && (
        <div>
          <button
            onClick={() => setReportOpen((o) => !o)}
            className="flex items-center gap-1 text-[12px] font-semibold text-[#5661f6] hover:text-[#3f49d6]"
          >
            {reportOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            {reportOpen ? "Hide report" : "View report"}
          </button>
          {reportOpen && (
            <div className="prose prose-sm max-w-none mt-2 max-h-80 overflow-y-auto rounded-lg bg-[#F7F8FF] border border-[#E0E7FF] p-2.5 text-[12px] [&_table]:text-[11px] [&_p]:text-[12px] [&_p]:leading-[18px] [&_li]:text-[12px]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.report}</ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ResearchSection({ tasks }: { tasks: ResearchTask[] }) {
  const runningCount = tasks.filter((t) => t.status === "running").length
  const now = useNow(runningCount > 0)
  return (
    <section aria-label="Background research" className="p-3 space-y-3">
      <div className="flex items-center gap-2 px-1 text-[13px] font-semibold text-gray-800">
        <FlaskConical className="size-4 text-[#5661f6]" />
        Background research
        <span className="rounded-full bg-[#EEF0FF] px-1.5 text-[11px] font-semibold text-[#5661f6]">{tasks.length}</span>
      </div>
      {tasks.map((t) => <TaskCard key={t.task_id} task={t} now={now} />)}
    </section>
  )
}
