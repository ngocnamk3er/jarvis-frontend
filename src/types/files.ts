export type FileNodeType = "folder" | "file"

export type FileNode = {
  id: string
  parent_id: string | null
  name: string
  type: FileNodeType
  mime_type: string | null
  size_bytes: number | null
  // pending|extracting|embedding|done|failed|skipped — see backend
  // jarvis-file-service's FileNode.indexing_status.
  indexing_status: string
  created_at: string
  updated_at: string
}

// GET /api/v1/files/nodes/{id} — adds extracted_text, used for the text
// preview path (images/PDFs preview from raw bytes instead, see
// fetchContent in use-files.ts).
export type FileNodeDetail = FileNode & {
  extracted_text: string | null
}

// GET /api/v1/files/spaces — the user's own files ("personal") and each department they belong to ("dept:<slug>").
// A department's members read its files; only its editors may change them (can_edit).
export type FileSpace = {
  id: string
  name: string
  kind: "personal" | "department"
  can_edit: boolean
}

export const PERSONAL_SPACE = "personal"
