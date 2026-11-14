import { apiFetch } from "@/lib/api-client"

// Files attached to a chat message go into that conversation's sandbox (backend:
// POST /api/v1/chat/sandbox-upload), not the file workspace. The agent is told
// about them by a block appended to the message text; the chat reads the same
// block back to show them as file cards instead of as raw text.

export type ChatAttachment = { name: string; size: number; mime: string }

export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024
export const MAX_ATTACHMENTS = 10

const BLOCK = /\n*<attachments>\n([\s\S]*?)\n<\/attachments>\s*$/
const LINE = /^- (.+) \(([^,]*), (\d+) bytes\)$/

export function buildAttachmentsBlock(files: ChatAttachment[]): string {
  if (files.length === 0) return ""
  const lines = files.map((f) => `- ${f.name} (${f.mime || "application/octet-stream"}, ${f.size} bytes)`)
  return `\n\n<attachments>\n${lines.join("\n")}\n</attachments>`
}

/** The message text without its attachments block, and the files that block lists. */
export function splitAttachments(text: string): { text: string; files: ChatAttachment[] } {
  const m = BLOCK.exec(text)
  if (!m) return { text, files: [] }
  const files: ChatAttachment[] = []
  for (const line of m[1].split("\n")) {
    const parsed = LINE.exec(line)
    if (parsed) files.push({ name: parsed[1], mime: parsed[2], size: Number(parsed[3]) })
  }
  return { text: text.slice(0, m.index), files }
}

/** Why a file cannot be attached, or null if it can. */
export function attachmentProblem(file: File): string | null {
  if (file.size > MAX_ATTACHMENT_BYTES) return `${file.name} is over the ${MAX_ATTACHMENT_BYTES >> 20} MB limit`
  return null
}

/** Upload files one after another into the conversation's sandbox. Throws on the first failure. */
export async function uploadChatFiles(
  threadId: string,
  files: File[],
  accessToken: string | null | undefined,
): Promise<ChatAttachment[]> {
  const saved: ChatAttachment[] = []
  for (const file of files) {
    const form = new FormData()
    form.append("thread_id", threadId)
    form.append("file", file, file.name)
    let res: Response
    try {
      res = await apiFetch("/api/v1/chat/sandbox-upload", accessToken, { method: "POST", body: form })
    } catch {
      throw new Error(`Could not attach ${file.name}: the server could not be reached`)
    }
    if (!res.ok) {
      const detail = await res.json().then((j) => j?.detail as string | undefined).catch(() => undefined)
      throw new Error(`Could not attach ${file.name}: ${detail ?? `error ${res.status}`}`)
    }
    saved.push((await res.json()) as ChatAttachment)
  }
  return saved
}
