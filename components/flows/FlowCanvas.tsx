"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { flowNodeTypes, nodeSummary } from "@/components/flows/FlowNodes"
import type { FlowGraph, FlowNodeType } from "@/lib/flows/types"

const PALETTE: Array<{ type: FlowNodeType; label: string }> = [
  { type: "send_message", label: "Message" },
  { type: "public_reply", label: "Comment" },
  { type: "condition", label: "Condition" },
  { type: "add_tag", label: "Tag" },
  { type: "set_field", label: "Field" },
  { type: "ai_agent", label: "AI Agent" },
  { type: "smart_delay", label: "Delay" },
  { type: "handoff", label: "Handoff" },
  { type: "webhook", label: "Webhook" },
  { type: "jump", label: "Jump" },
  { type: "product_card", label: "Product" },
  { type: "capture_order", label: "Order" },
]

interface Stat {
  node_id: string
  runs: number
  clicks: number
}

function toFlowNodes(graph: FlowGraph, stats: Stat[]): Node[] {
  const byId = new Map(stats.map((row) => [row.node_id, row]))
  return graph.nodes.map((node) => {
    const stat = byId.get(node.id)
    return {
      id: node.id,
      type: node.type,
      position: node.position || { x: 80, y: 80 },
      data: {
        ...node.data,
        kind: node.type,
        summary: nodeSummary(node.type, node.data),
        runs: stat?.runs || 0,
        clicks: stat?.clicks || 0,
      },
    }
  })
}

function toFlowEdges(graph: FlowGraph): Edge[] {
  return graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle || "default",
    label: edge.sourceHandle && edge.sourceHandle !== "default" ? edge.sourceHandle : undefined,
    style: { stroke: "#cbd5e1" },
  }))
}

export function graphFrom(nodes: Node[], edges: Edge[]): FlowGraph {
  return {
    nodes: nodes.map((node) => {
      const data = { ...(node.data as Record<string, unknown>) }
      delete data.kind
      delete data.summary
      delete data.runs
      delete data.clicks
      return {
        id: node.id,
        type: (node.type || "send_message") as FlowNodeType,
        position: node.position,
        data,
      }
    }),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle || "default",
    })),
  }
}

export default function FlowCanvas({
  flowId,
  name,
  channel,
  status,
  version,
  graph,
  stats,
  performance,
  onSaved,
}: {
  flowId: string
  name: string
  channel: string
  status: string
  version: number
  graph: FlowGraph
  stats: Stat[]
  performance: { runs: number; waiting: number; completed: number; clicks: number }
  onSaved: () => void
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(toFlowNodes(graph, stats))
  const [edges, setEdges, onEdgesChange] = useEdgesState(toFlowEdges(graph))
  const [selected, setSelected] = useState<string | null>(graph.nodes[0]?.id || null)
  const [title, setTitle] = useState(name)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    setNodes(toFlowNodes(graph, stats))
    setEdges(toFlowEdges(graph))
  }, [flowId]) // reload when opening another flow

  const selectedNode = nodes.find((node) => node.id === selected) || null

  const onConnect = useCallback((connection: Connection) => {
    setEdges((current) => addEdge({ ...connection, id: `e_${connection.source}_${connection.target}_${connection.sourceHandle || "default"}` }, current))
  }, [setEdges])

  function addNode(type: FlowNodeType) {
    const id = `${type}_${Math.random().toString(36).slice(2, 7)}`
    const data = defaultData(type)
    setNodes((current) => [
      ...current,
      {
        id,
        type,
        position: { x: 120 + current.length * 24, y: 80 + current.length * 36 },
        data: { ...data, kind: type, summary: nodeSummary(type, data), runs: 0, clicks: 0 },
      },
    ])
    setSelected(id)
  }

  async function save(publish = false) {
    setSaving(true)
    setMessage("")
    const next = graphFrom(nodes, edges)
    const saved = await fetch(`/api/flows/${flowId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: title, channel, graph: next }),
    })
    if (!saved.ok) {
      const body = await saved.json().catch(() => ({}))
      setSaving(false)
      setMessage(body.error || "Save failed")
      return
    }
    if (publish) {
      const published = await fetch(`/api/flows/${flowId}/publish`, { method: "POST" })
      if (!published.ok) {
        setSaving(false)
        setMessage("Saved, but publish failed")
        return
      }
    }
    setSaving(false)
    setMessage(publish ? "Published" : "Saved")
    onSaved()
  }

  const live = status === "live"
  const inspector = useMemo(() => (selectedNode ? (selectedNode.data as Record<string, unknown>) : null), [selectedNode])

  function patchSelected(partial: Record<string, unknown>) {
    if (!selected) return
    setNodes((current) =>
      current.map((node) => {
        if (node.id !== selected) return node
        const data = { ...(node.data as Record<string, unknown>), ...partial }
        data.summary = nodeSummary(String(node.type), data)
        return { ...node, data }
      }),
    )
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-[#f4f5f7] text-slate-800">
      <header className="h-14 shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur flex items-center justify-between px-4 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <a href="/dashboard/flows" className="text-xs text-slate-400 hover:text-slate-700">Flows</a>
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="text-sm font-semibold bg-transparent outline-none min-w-0" />
          <span className="text-[11px] uppercase tracking-wide text-slate-400">{channel}</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${live ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{live ? "Live" : status}</span>
          <span className="text-[11px] text-slate-400">v{version}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{message}</span>
          <button onClick={() => save(false)} disabled={saving} className="h-8 px-3 rounded-lg border border-slate-200 text-xs">Save</button>
          <button onClick={() => save(true)} disabled={saving} className="h-8 px-3 rounded-lg bg-[#5b4dff] text-white text-xs font-medium">Publish changes</button>
        </div>
      </header>
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 relative"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            const type = event.dataTransfer.getData("application/cyreax-node") as FlowNodeType
            if (type) addNode(type)
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={flowNodeTypes}
            onNodeClick={(_event, node) => setSelected(node.id)}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={18} size={1.4} color="#d5d8e0" />
            <Controls />
          </ReactFlow>
          <div className="absolute start-4 bottom-16 bg-white rounded-2xl shadow border border-slate-200 px-4 py-3 text-xs">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Flow performance</div>
            <div className="flex gap-4">
              <Metric label="Runs" value={performance.runs} />
              <Metric label="Waiting" value={performance.waiting} />
              <Metric label="Completed" value={performance.completed} />
              <Metric label="Clicks" value={performance.clicks} />
            </div>
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 bottom-3 flex gap-1 bg-white border border-slate-200 rounded-2xl shadow px-2 py-1.5">
            {PALETTE.map((item) => (
              <button
                key={item.type}
                draggable
                onDragStart={(event) => event.dataTransfer.setData("application/cyreax-node", item.type)}
                onClick={() => addNode(item.type)}
                className="px-2.5 py-1.5 rounded-xl text-[11px] text-slate-600 hover:bg-slate-50"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <aside className="w-[320px] shrink-0 border-s border-slate-200 bg-white overflow-y-auto p-4">
          {inspector && selectedNode ? (
            <Inspector nodeId={selectedNode.id} type={String(selectedNode.type)} data={inspector} onChange={patchSelected} />
          ) : (
            <p className="text-sm text-slate-400">Select a step to edit it.</p>
          )}
        </aside>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  )
}

function defaultData(type: FlowNodeType): Record<string, unknown> {
  if (type === "send_message") return { text: "Hello", waitFor: "none", buttons: [], quickReplies: [] }
  if (type === "public_reply") return { variants: ["Check your inbox"] }
  if (type === "condition") return { label: "Has tag", match: "all", clauses: [{ type: "tag", tag: "vip", present: true }] }
  if (type === "add_tag") return { tags: ["lead"] }
  if (type === "remove_tag") return { tags: ["lead"] }
  if (type === "set_field") return { key: "city", value: "" }
  if (type === "smart_delay") return { delayMs: 2 * 60 * 60 * 1000, respectWindow: true, skipIfReplied: true }
  if (type === "ai_agent") return { agentName: "Assistant", goal: "Answer the question and offer the next step.", sendReply: true }
  if (type === "handoff") return { reason: "Needs a person" }
  if (type === "webhook") return { url: "https://example.com/hook", method: "POST", body: "{\"id\":\"{{external_id}}\"}" }
  if (type === "jump") return { targetId: "" }
  if (type === "product_card") return { productIds: [], text: "" }
  if (type === "capture_order") return { productIds: [] }
  return {}
}

function Inspector({
  nodeId,
  type,
  data,
  onChange,
}: {
  nodeId: string
  type: string
  data: Record<string, unknown>
  onChange: (partial: Record<string, unknown>) => void
}) {
  const trigger = (data.trigger || {}) as Record<string, unknown>
  return (
    <div className="space-y-3 text-sm">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-400">Step</div>
        <div className="font-medium capitalize">{type.replace(/_/g, " ")}</div>
        <div className="text-[11px] text-slate-400 mt-1">{nodeId}</div>
      </div>
      {type === "trigger" && (
        <>
          <Field label="Trigger">
            <select className={input} value={String(trigger.type || "keyword_dm")} onChange={(event) => onChange({ trigger: { ...trigger, type: event.target.value } })}>
              <option value="keyword_dm">Keyword DM</option>
              <option value="comment">Comment on a post</option>
              <option value="story_reply">Story reply</option>
              <option value="story_mention">Story mention</option>
              <option value="ice_breaker">Ice breaker</option>
              <option value="website_visitor">Website visitor</option>
              <option value="tiktok_dm">TikTok DM</option>
              <option value="ref">Ref link</option>
              <option value="order_status">Order status</option>
            </select>
          </Field>
          {trigger.type === "order_status" ? (
            <Field label="Order statuses">
              <input className={input} value={String(trigger.keywords || "")} placeholder="paid, fulfilled, or any" onChange={(event) => onChange({ trigger: { ...trigger, keywords: event.target.value } })} />
            </Field>
          ) : (
            <Field label="Keywords">
              <input className={input} value={String(trigger.keywords || "")} onChange={(event) => onChange({ trigger: { ...trigger, keywords: event.target.value, match: "keyword" } })} />
            </Field>
          )}
          <Field label="Post or Reel id">
            <input className={input} value={String(trigger.mediaId || "")} placeholder="Empty = any post" onChange={(event) => onChange({ trigger: { ...trigger, mediaId: event.target.value || null, anyPost: !event.target.value } })} />
          </Field>
          <Field label="Ref code">
            <input className={input} value={String(trigger.refCode || "")} onChange={(event) => onChange({ trigger: { ...trigger, refCode: event.target.value } })} />
          </Field>
        </>
      )}
      {type === "send_message" && (
        <>
          <Field label="Text">
            <textarea className={input} rows={4} value={String(data.text || "")} onChange={(event) => onChange({ text: event.target.value })} />
          </Field>
          <Field label="Media URL">
            <input className={input} value={String((data.media as { url?: string } | undefined)?.url || "")} onChange={(event) => onChange({ media: event.target.value ? { type: "image", url: event.target.value } : null })} />
          </Field>
          <Field label="WhatsApp template">
            <input className={input} value={String(data.templateName || "")} placeholder="Approved template name" onChange={(event) => onChange({ templateName: event.target.value })} />
          </Field>
          <p className="text-[11px] text-slate-400">Buttons and quick replies are hidden on channels that cannot send them. TikTok sends text only.</p>
        </>
      )}
      {type === "public_reply" && (
        <Field label="Variants, one per line">
          <textarea className={input} rows={4} value={Array.isArray(data.variants) ? data.variants.join("\n") : ""} onChange={(event) => onChange({ variants: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean) })} />
        </Field>
      )}
      {type === "condition" && (
        <Field label="Tag must be present">
          <input className={input} value={String(((data.clauses as Array<{ tag?: string }> | undefined)?.[0]?.tag) || "")} onChange={(event) => onChange({ label: `Tag ${event.target.value}`, clauses: [{ type: "tag", tag: event.target.value, present: true }] })} />
        </Field>
      )}
      {(type === "add_tag" || type === "remove_tag") && (
        <Field label="Tags">
          <input className={input} value={Array.isArray(data.tags) ? data.tags.join(", ") : ""} onChange={(event) => onChange({ tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} />
        </Field>
      )}
      {type === "set_field" && (
        <>
          <Field label="Field"><input className={input} value={String(data.key || "")} onChange={(event) => onChange({ key: event.target.value })} /></Field>
          <Field label="Value"><input className={input} value={String(data.value || "")} onChange={(event) => onChange({ value: event.target.value })} /></Field>
        </>
      )}
      {type === "smart_delay" && (
        <Field label="Minutes">
          <input className={input} type="number" value={Math.round(Number(data.delayMs || 0) / 60000)} onChange={(event) => onChange({ delayMs: Number(event.target.value) * 60000, respectWindow: true, skipIfReplied: true })} />
        </Field>
      )}
      {type === "ai_agent" && (
        <Field label="Goal">
          <textarea className={input} rows={4} value={String(data.goal || "")} onChange={(event) => onChange({ goal: event.target.value })} />
        </Field>
      )}
      {type === "webhook" && (
        <Field label="HTTPS URL">
          <input className={input} value={String(data.url || "")} onChange={(event) => onChange({ url: event.target.value, method: "POST" })} />
        </Field>
      )}
      {(type === "product_card" || type === "capture_order") && (
        <Field label="Product ids, comma separated">
          <input className={input} value={Array.isArray(data.productIds) ? data.productIds.join(", ") : ""} placeholder="Empty sends the first 10" onChange={(event) => onChange({ productIds: event.target.value.split(",").map((id) => id.trim()).filter(Boolean) })} />
        </Field>
      )}
      {type === "jump" && (
        <Field label="Target node id">
          <input className={input} value={String(data.targetId || "")} onChange={(event) => onChange({ targetId: event.target.value })} />
        </Field>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] text-slate-500">{label}</span>
      {children}
    </label>
  )
}

const input = "w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-slate-400"
