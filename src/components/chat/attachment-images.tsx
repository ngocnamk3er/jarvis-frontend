"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { apiFetch } from "@/lib/api-client"
import type { ToolImage } from "@/types/chat"

// The pictures view_image opened, shown under its step. They come from the
// backend's attachment store (GET /chat/attachments/{id}), not from the
// sandbox, so they are still there after a reload or once the sandbox is gone.
// Fetched with the access token and shown through a blob: URL, because an
// <img src> cannot send the Authorization header.
export function AttachmentImages({ images }: { images: ToolImage[] }) {
  return (
    <div>
      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
        viewed
      </span>
      <div className="flex flex-wrap gap-2">
        {images.map((img) => <AttachmentThumb key={img.id} image={img} />)}
      </div>
    </div>
  )
}

function AttachmentThumb({ image }: { image: ToolImage }) {
  const { data: session } = useSession()
  const accessToken = session?.accessToken
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!accessToken) return
    let revoke: string | null = null
    let cancelled = false
    apiFetch(`/api/v1/chat/attachments/${encodeURIComponent(image.id)}`, accessToken)
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
      .then((blob) => {
        if (cancelled) return
        revoke = URL.createObjectURL(blob)
        setUrl(revoke)
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => {
      cancelled = true
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [image.id, accessToken])

  const name = image.label?.split("/").pop() ?? "image"
  if (failed) return <span className="text-[11px] text-gray-400">{name} is no longer available</span>
  if (!url) return <div className="h-28 w-28 animate-pulse rounded-lg bg-gray-100" aria-label={`Loading ${name}`} />
  return (
    <a href={url} target="_blank" rel="noreferrer" title={name} className="block">
      {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL, next/image can't optimize it */}
      <img src={url} alt={name} className="max-h-40 max-w-[16rem] rounded-lg border border-[#E0E7FF] bg-white object-contain" />
      <span className="mt-0.5 block max-w-[16rem] truncate text-[10.5px] text-gray-400">{name}</span>
    </a>
  )
}
