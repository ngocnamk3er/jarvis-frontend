export function formatSize(bytes: number | null): string {
  if (bytes === null) return ""
  if (bytes < 1024) return `${bytes}B`
  const units = ["KB", "MB", "GB"]
  let n = bytes / 1024
  for (const unit of units) {
    if (n < 1024) return `${n.toFixed(1)}${unit}`
    n /= 1024
  }
  return `${n.toFixed(1)}TB`
}

// A plain <a href> can't carry the bearer token the backend needs, so the
// caller fetch()es the bytes as a Blob and this saves it.
export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** What kind of inline preview a present_file attachment supports, based on
 * its mime type (falling back to the filename extension for the generic
 * mimes `mimetypes.guess_type` sometimes returns, e.g. `.md`/`.csv`). */
export type PreviewKind = "image" | "pdf" | "markdown" | "csv" | "text" | "none"

export function previewKind(mime: string, name: string): PreviewKind {
  if (mime.startsWith("image/")) return "image"
  if (mime === "application/pdf") return "pdf"
  if (mime === "text/markdown" || /\.(md|markdown)$/i.test(name)) return "markdown"
  if (mime === "text/csv" || /\.csv$/i.test(name)) return "csv"
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    /\.(json|py|js|jsx|ts|tsx|log|ya?ml|toml|sh|sql|txt)$/i.test(name)
  ) {
    return "text"
  }
  return "none"
}

export const TEXT_PREVIEW_CHAR_LIMIT = 20_000
const CSV_PREVIEW_ROW_LIMIT = 50

/** Minimal RFC-4180 CSV parser (handles quoted fields, embedded commas,
 * `""`-escaped quotes) — just enough to render a faithful preview table;
 * not a full CSV library. Stops once it has `maxRows` data rows. */
export function parseCsvPreview(
  text: string,
  maxRows = CSV_PREVIEW_ROW_LIMIT,
): { header: string[] | null; rows: string[][]; truncated: boolean } {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  const endField = () => {
    row.push(field)
    field = ""
  }
  const endRow = () => {
    endField()
    if (row.some((f) => f !== "")) rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length && rows.length <= maxRows; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
      continue
    }
    if (c === '"') inQuotes = true
    else if (c === ",") endField()
    else if (c === "\r") continue
    else if (c === "\n") endRow()
    else field += c
  }
  if (field !== "" || row.length > 0) endRow()

  const truncated = rows.length > maxRows
  const trimmed = rows.slice(0, maxRows)
  return { header: trimmed[0] ?? null, rows: trimmed.slice(1), truncated }
}
