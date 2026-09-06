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
