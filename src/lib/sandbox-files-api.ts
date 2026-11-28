// The /chat/sandbox-files API (jarvis-backend app/api/v1/endpoints/sandbox_files.py), plus the existing sandbox upload
// and download routes.
import { apiFetch } from "@/lib/api-client"
import type { SandboxListing } from "@/lib/sandbox-files"

export class SandboxApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function check(res: Response, fallback: string): Promise<Response> {
  if (res.ok) return res
  let message = fallback
  try {
    const body = await res.json()
    if (typeof body?.detail === "string") message = body.detail
  } catch {
    // not JSON
  }
  throw new SandboxApiError(message, res.status)
}

async function call(token: string | undefined, path: string, init: RequestInit, fallback: string): Promise<Response> {
  let res: Response
  try {
    res = await apiFetch(path, token, init)
  } catch {
    throw new SandboxApiError("The backend is not reachable.", 0)
  }
  return check(res, fallback)
}

const json = (body: unknown): RequestInit => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const q = (params: Record<string, string>) => new URLSearchParams(params).toString()

export const sandboxApi = {
  list: async (t: string | undefined, threadId: string, path: string, wake = false): Promise<SandboxListing> =>
    (await call(t, `/api/v1/chat/sandbox-files?${q({ thread_id: threadId, path, wake: String(wake) })}`, {},
      "Could not list the sandbox.")).json(),
  remove: async (t: string | undefined, threadId: string, path: string) => {
    await call(t, `/api/v1/chat/sandbox-files?${q({ thread_id: threadId, path })}`, { method: "DELETE" },
      "Could not delete it.")
  },
  rename: async (t: string | undefined, threadId: string, path: string, newName: string): Promise<{ path: string }> =>
    (await call(t, "/api/v1/chat/sandbox-files/rename",
      { method: "POST", ...json({ thread_id: threadId, path, new_name: newName }) }, "Could not rename it.")).json(),
  makeFolder: async (t: string | undefined, threadId: string, parent: string, name: string): Promise<{ path: string }> =>
    (await call(t, "/api/v1/chat/sandbox-files/folders",
      { method: "POST", ...json({ thread_id: threadId, parent, name }) }, "Could not make the folder.")).json(),
  saveToFiles: async (t: string | undefined, threadId: string, path: string): Promise<{ name: string; path: string }> =>
    (await call(t, "/api/v1/chat/sandbox-files/save",
      { method: "POST", ...json({ thread_id: threadId, path }) }, "Could not save it to your Files.")).json(),
  upload: async (t: string | undefined, threadId: string, file: File, folder: string): Promise<{ name: string }> => {
    const form = new FormData()
    form.append("thread_id", threadId)
    form.append("folder", folder)
    form.append("file", file)
    return (await call(t, "/api/v1/chat/sandbox-upload", { method: "POST", body: form }, "Could not upload it.")).json()
  },
  // The file's bytes, for a preview or a download.
  fetch: async (t: string | undefined, threadId: string, path: string): Promise<Blob> =>
    (await call(t, `/api/v1/chat/sandbox-file?${q({ thread_id: threadId, name: path })}`, {},
      "Could not read the file.")).blob(),
}

// Asks the chat input to add `text` to the message being written (ChatInput listens).
export const INSERT_INTO_MESSAGE = "jarvis:insert-into-message"

export function insertIntoMessage(text: string) {
  window.dispatchEvent(new CustomEvent(INSERT_INTO_MESSAGE, { detail: text }))
}
