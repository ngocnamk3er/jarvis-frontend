"use client"

import { useParams } from "next/navigation"
import { ReactFlowProvider } from "@xyflow/react"
import { FlowEditor } from "@/components/flows/flow-editor"

// /flows/new starts a new flow; /flows/<id> opens a saved one.
export default function FlowPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <ReactFlowProvider>
      <FlowEditor flowId={id} />
    </ReactFlowProvider>
  )
}
