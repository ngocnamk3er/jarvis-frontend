// Small helpers for the Sandbox panel: names, sizes, kinds of file, the breadcrumb.

export type SandboxEntry = {
  name: string
  path: string
  type: "dir" | "file" | "link"
  size: number | null
  modified: string
}

export type SandboxListing = {
  state: "none" | "paused" | "running"
  path: string
  entries: SandboxEntry[]
  truncated: boolean
}

export type FileKind = "folder" | "image" | "text" | "table" | "pdf" | "other"

const IMAGE = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"])
const TABLE = new Set(["csv", "tsv", "xlsx", "xls"])
const TEXT = new Set([
  "txt", "md", "py", "js", "ts", "tsx", "jsx", "json", "yaml", "yml", "toml", "ini", "cfg", "log", "sh", "sql",
  "html", "css", "xml", "r", "ipynb", "env", "csv", "tsv",
])

export function extension(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ""
}

export function kindOf(entry: Pick<SandboxEntry, "name" | "type">): FileKind {
  if (entry.type === "dir") return "folder"
  const ext = extension(entry.name)
  if (IMAGE.has(ext)) return "image"
  if (ext === "pdf") return "pdf"
  if (TABLE.has(ext)) return "table"
  if (TEXT.has(ext) || ext === "") return "text"
  return "other"
}

// What the panel can show itself; anything else is downloaded.
export const PREVIEW_MAX_BYTES = 512 * 1024

export function canPreview(entry: SandboxEntry): boolean {
  if (entry.type !== "file") return false
  const ext = extension(entry.name)
  const kind = kindOf(entry)
  const textual = kind === "text" || ext === "csv" || ext === "tsv"
  return (kind === "image" || textual) && (entry.size ?? 0) <= PREVIEW_MAX_BYTES
}

export function formatSize(bytes: number | null): string {
  if (bytes === null) return ""
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB"]
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}

// [{name, path}] from the working directory down to `path`: "" is the sandbox itself.
export function crumbs(path: string): { name: string; path: string }[] {
  const parts = path.split("/").filter(Boolean)
  return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join("/") }))
}

export function parentOf(path: string): string {
  const i = path.lastIndexOf("/")
  return i < 0 ? "" : path.slice(0, i)
}
