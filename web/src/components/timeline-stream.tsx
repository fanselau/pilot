/**
 * Timeline item renderers.
 *
 * Each tool type gets a visually distinct mini-component:
 * - bash: terminal-style code block
 * - edit: diff viewer with red/green backgrounds
 * - read/write: file path cards
 * - grep/glob: search pattern display
 * - task: subagent spawn indicator
 * - activity: markdown prose
 * - reasoning: collapsed thinking block
 */

import { useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import type {
  StepTimelineItem,
  TimelineActivityItem,
  TimelineToolSummaryItem,
} from '@pilot/core/types.js'
import { getFullMessageFn } from '~/lib/server-fns'
import {
  Terminal,
  FileEdit,
  FileText,
  FolderOpen,
  Search,
  GitFork,
  Package,
  Wrench,
  Brain,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────

function formatTime(epoch: number): string {
  return new Date(epoch).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })
}

function truncLines(text: string, n: number): { text: string; more: number } {
  const lines = text.split('\n')
  if (lines.length <= n) return { text, more: 0 }
  return { text: lines.slice(0, n).join('\n'), more: lines.length - n }
}

function shortPath(p: string): string {
  const parts = p.split('/')
  return parts.length <= 3 ? p : `…/${parts.slice(-2).join('/')}`
}

function parseRaw(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

// ── Shared chrome ─────────────────────────────────────────────────────────

function ToolChrome({
  icon: Icon,
  label,
  detail,
  status,
  time,
  children,
  className,
}: {
  icon: typeof Terminal
  label: string
  detail?: string
  status?: string
  time: number
  children?: React.ReactNode
  className?: string
}) {
  const isErr = status === 'error'
  const isRunning = status === 'running'

  return (
    <div className={`rounded border overflow-hidden ${isErr ? 'border-red-500/30 bg-red-500/[0.03]' : 'border-border/50 bg-muted/20'} ${className ?? ''}`}>
      {/* Header bar */}
      <div className={`flex items-center gap-1.5 px-2 py-0.5 text-[10px] ${isErr ? 'bg-red-500/10' : 'bg-muted/30'}`}>
        <Icon className={`h-3 w-3 shrink-0 ${isErr ? 'text-red-400' : 'text-muted-foreground/50'} ${isRunning ? 'animate-pulse' : ''}`} />
        <span className={`font-mono font-medium ${isErr ? 'text-red-400' : 'text-muted-foreground/70'}`}>{label}</span>
        {detail && (
          <span className="font-mono text-foreground/60 truncate min-w-0">{detail}</span>
        )}
        <span className="ml-auto text-muted-foreground/30 tabular-nums font-mono shrink-0">{formatTime(time)}</span>
        {isErr && <span className="text-red-400 font-medium">error</span>}
        {isRunning && <span className="text-sky-400 animate-pulse">running</span>}
      </div>
      {/* Body */}
      {children && <div className="px-2 py-1">{children}</div>}
    </div>
  )
}

// ── Tool renderers ────────────────────────────────────────────────────────

function BashRow({ item }: { item: TimelineToolSummaryItem }) {
  const [showOutput, setShowOutput] = useState(item.toolStatus === 'error')
  const [fullOutput, setFullOutput] = useState<string | null>(null)
  const raw = parseRaw(item.toolInputRaw)
  const desc = raw && typeof raw.description === 'string' ? raw.description : null
  const cmd = item.toolInput ?? ''
  const out = fullOutput ?? item.toolOutput
  const isErr = item.toolStatus === 'error'
  const previewLines = 6
  const { text: outPreview, more } = out ? truncLines(out, previewLines) : { text: '', more: 0 }

  async function handleShowFull() {
    const result = await getFullMessageFn({ data: { sessionId: item.sessionId, partId: item.partId } })
    if (result?.toolOutput) setFullOutput(result.toolOutput)
  }

  return (
    <ToolChrome icon={Terminal} label="bash" detail={desc ?? undefined} status={item.toolStatus} time={item.createdAt}>
      {/* Command block */}
      <div className="bg-muted/30 rounded px-2.5 py-1.5 font-mono text-[11px] leading-snug whitespace-pre-wrap break-all">
        <span className="text-muted-foreground/40 select-none">$ </span>
        <span className="text-foreground/80">{cmd}</span>
      </div>

      {/* Output section */}
      {out ? (
        <div className="mt-1">
          {/* Toggle bar */}
          <button type="button" onClick={() => setShowOutput(!showOutput)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground/70 mb-0.5">
            {showOutput ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
            <span>output</span>
            {!showOutput && (
              <span className="text-muted-foreground/25 font-mono ml-1 truncate max-w-[300px]">{out.split('\n')[0]}</span>
            )}
          </button>

          {showOutput && (
            <div className={`rounded px-2.5 py-1.5 font-mono text-[10px] leading-snug whitespace-pre-wrap break-all ${isErr ? 'bg-red-500/[0.06] text-red-300' : 'bg-muted/20 text-muted-foreground/70'}`}>
              {more > 0 && !fullOutput ? outPreview : out}
              {more > 0 && !fullOutput && (
                <div className="mt-1 pt-1 border-t border-zinc-800/50">
                  <button type="button" onClick={() => void handleShowFull()}
                    className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground/70">
                    …{more} more lines · show full output
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : item.toolStatus === 'completed' ? (
        <div className="mt-0.5 text-[10px] text-muted-foreground/30 italic">no output</div>
      ) : null}
    </ToolChrome>
  )
}

function EditRow({ item }: { item: TimelineToolSummaryItem }) {
  const [showDiff, setShowDiff] = useState(true)
  const raw = parseRaw(item.toolInputRaw)
  const filePath = item.toolInput ?? ''
  const oldStr = raw && typeof raw.oldString === 'string' ? raw.oldString : null
  const newStr = raw && typeof raw.newString === 'string' ? raw.newString : null
  const hasDiff = oldStr != null && newStr != null
  const oldLines = oldStr?.split('\n') ?? []
  const newLines = newStr?.split('\n') ?? []
  const maxPreview = 15

  return (
    <ToolChrome icon={FileEdit} label="edit" detail={shortPath(filePath)} status={item.toolStatus} time={item.createdAt}>
      {hasDiff && (
        <>
          {/* Toggle */}
          <button type="button" onClick={() => setShowDiff(!showDiff)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground/70 mb-1">
            {showDiff ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
            <span>{showDiff ? 'hide diff' : 'show diff'}</span>
            <span className="text-muted-foreground/25">−{oldLines.length} +{newLines.length}</span>
          </button>

          {/* Side-by-side diff */}
          {showDiff && (
            <div className="grid grid-cols-2 gap-px rounded overflow-hidden border border-border/40">
              {/* Old (removed) */}
              <div className="bg-red-950/50 min-w-0 overflow-hidden">
                <div className="px-2 py-0.5 text-[9px] font-mono text-red-300 bg-red-900/40 border-b border-red-800/40 select-none">− removed</div>
                <pre className="px-2 py-1.5 font-mono text-[10px] leading-snug text-red-100 whitespace-pre-wrap break-all">
                  {oldLines.slice(0, maxPreview).join('\n')}
                </pre>
                {oldLines.length > maxPreview && (
                  <div className="px-2 pb-1 text-[9px] text-red-300/70">…{oldLines.length - maxPreview} more lines</div>
                )}
              </div>
              {/* New (added) */}
              <div className="bg-emerald-950/50 min-w-0 overflow-hidden">
                <div className="px-2 py-0.5 text-[9px] font-mono text-emerald-300 bg-emerald-900/40 border-b border-emerald-800/40 select-none">+ added</div>
                <pre className="px-2 py-1.5 font-mono text-[10px] leading-snug text-emerald-100 whitespace-pre-wrap break-all">
                  {newLines.slice(0, maxPreview).join('\n')}
                </pre>
                {newLines.length > maxPreview && (
                  <div className="px-2 pb-1 text-[9px] text-emerald-300/70">…{newLines.length - maxPreview} more lines</div>
                )}
              </div>
            </div>
          )}
        </>
      )}
      {item.toolStatus === 'error' && item.toolOutput && (
        <pre className="mt-1 font-mono text-[10px] text-red-300 whitespace-pre-wrap break-all bg-red-500/[0.06] rounded px-2 py-1">{item.toolOutput}</pre>
      )}
    </ToolChrome>
  )
}

function WriteRow({ item }: { item: TimelineToolSummaryItem }) {
  const [showContent, setShowContent] = useState(false)
  const [fullContent, setFullContent] = useState<string | null>(null)
  const filePath = item.toolInput ?? ''
  const raw = parseRaw(item.toolInputRaw)
  const content = fullContent ?? (raw && typeof raw.content === 'string' ? raw.content : null)
  const { text: preview, more } = content ? truncLines(content, 25) : { text: '', more: 0 }
  const isErr = item.toolStatus === 'error'

  async function handleShowFull() {
    const result = await getFullMessageFn({ data: { sessionId: item.sessionId, partId: item.partId } })
    if (result?.toolInputRaw) {
      const full = parseRaw(result.toolInputRaw)
      if (full && typeof full.content === 'string') setFullContent(full.content)
    }
  }

  return (
    <ToolChrome icon={FileText} label="write" detail={shortPath(filePath)} status={item.toolStatus} time={item.createdAt}>
      {isErr && item.toolOutput && (
        <pre className="font-mono text-[10px] text-red-300 whitespace-pre-wrap break-all bg-red-500/[0.06] rounded px-2 py-1">{item.toolOutput}</pre>
      )}
      {content && (
        <div className="rounded overflow-hidden border border-border/30">
          {/* File tab header */}
          <button type="button" onClick={() => setShowContent(!showContent)}
            className="flex items-center gap-1.5 w-full text-left px-2 py-0.5 bg-emerald-950/30 hover:bg-emerald-950/40 border-b border-emerald-900/20">
            {showContent ? <ChevronDown className="h-2.5 w-2.5 text-emerald-400/50" /> : <ChevronRight className="h-2.5 w-2.5 text-emerald-400/50" />}
            <FileText className="h-2.5 w-2.5 text-emerald-400/60" />
            <span className="text-[10px] font-mono text-emerald-200/80">{filePath.split('/').pop()}</span>
            <span className="text-[9px] text-emerald-400/40 ml-auto">new file</span>
          </button>
          {showContent && (
            <div className="bg-emerald-950/15">
              <pre className="px-2.5 py-1.5 font-mono text-[10px] leading-snug whitespace-pre-wrap break-all text-emerald-100/80">
                {more > 0 && !fullContent ? preview : content}
              </pre>
              {more > 0 && !fullContent && (
                <div className="px-2 pb-1 border-t border-emerald-900/15">
                  <button type="button" onClick={() => void handleShowFull()}
                    className="text-[10px] text-emerald-400/50 hover:text-emerald-400/80">
                    …{more} more lines · show full
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {!content && !isErr && (
        <span className="text-[10px] text-muted-foreground/30 italic">file written</span>
      )}
    </ToolChrome>
  )
}

function ReadRow({ item }: { item: TimelineToolSummaryItem }) {
  return (
    <ToolChrome icon={FolderOpen} label="read" detail={shortPath(item.toolInput ?? '')} status={item.toolStatus} time={item.createdAt}>
      {item.toolStatus === 'error' && item.toolOutput && (
        <pre className="font-mono text-[10px] text-red-300 whitespace-pre-wrap break-all">{item.toolOutput}</pre>
      )}
    </ToolChrome>
  )
}

function SearchRow({ item }: { item: TimelineToolSummaryItem }) {
  const raw = parseRaw(item.toolInputRaw)
  const include = raw && typeof raw.include === 'string' ? raw.include : null

  const detail = [item.toolInput ?? '', include ? `in ${include}` : ''].filter(Boolean).join('  ')

  return (
    <ToolChrome icon={Search} label={item.tool} detail={detail} status={item.toolStatus} time={item.createdAt}>
      {item.toolStatus === 'error' && item.toolOutput && (
        <pre className="font-mono text-[10px] text-red-300 whitespace-pre-wrap break-all">{item.toolOutput}</pre>
      )}
    </ToolChrome>
  )
}

function TaskRow({ item }: { item: TimelineToolSummaryItem }) {
  const raw = parseRaw(item.toolInputRaw)
  const sub = raw && typeof raw.subagent_type === 'string' ? raw.subagent_type : null
  const desc = raw && typeof raw.description === 'string' ? raw.description : null

  return (
    <ToolChrome icon={GitFork} label="task" detail={sub ?? undefined} status={item.toolStatus} time={item.createdAt}>
      {desc && (
        <p className="text-[11px] text-muted-foreground/70 italic leading-snug">{desc}</p>
      )}
    </ToolChrome>
  )
}

function PatchRow({ item }: { item: TimelineToolSummaryItem }) {
  const files = item.patchFiles ?? []
  return (
    <ToolChrome icon={Package} label="patch" detail={`${files.length} file${files.length !== 1 ? 's' : ''} changed`} status={item.toolStatus} time={item.createdAt}>
      {files.length > 0 && (
        <div className="rounded overflow-hidden border border-amber-900/30">
          <div className="px-2 py-0.5 text-[9px] font-mono text-amber-300 bg-amber-900/30 border-b border-amber-900/20 select-none">
            changes applied
          </div>
          {files.map((f, i) => (
            <div key={f} className={`flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono ${i > 0 ? 'border-t border-amber-900/10' : ''} bg-amber-950/20`}>
              <FileEdit className="h-2.5 w-2.5 text-amber-400/60 shrink-0" />
              <span className="text-amber-100/70 truncate min-w-0">{f}</span>
            </div>
          ))}
        </div>
      )}
    </ToolChrome>
  )
}

function GenericToolRow({ item }: { item: TimelineToolSummaryItem }) {
  const [expanded, setExpanded] = useState(item.toolStatus === 'error')
  const payload = item.toolInput
  const out = item.toolOutput

  return (
    <ToolChrome icon={Wrench} label={item.tool} status={item.toolStatus} time={item.createdAt}>
      {payload && (
        <pre className="font-mono text-[10px] text-muted-foreground/70 whitespace-pre-wrap break-all leading-snug line-clamp-2">{payload}</pre>
      )}
      {out && (
        expanded ? (
          <pre className={`mt-1 font-mono text-[10px] whitespace-pre-wrap break-all leading-snug ${item.toolStatus === 'error' ? 'text-red-300' : 'text-muted-foreground/50'}`}>
            {out}
          </pre>
        ) : (
          <button type="button" onClick={() => setExpanded(true)}
            className="mt-1 text-[10px] text-muted-foreground/30 hover:text-muted-foreground/60 flex items-center gap-0.5">
            <ChevronRight className="h-2.5 w-2.5" /> output
          </button>
        )
      )}
    </ToolChrome>
  )
}

// ── Tool dispatcher ───────────────────────────────────────────────────────

export function ToolSummaryRow({ item }: { item: TimelineToolSummaryItem }) {
  switch (item.tool) {
    case 'bash': return <BashRow item={item} />
    case 'edit': return <EditRow item={item} />
    case 'write': return <WriteRow item={item} />
    case 'read': case 'list_directory': return <ReadRow item={item} />
    case 'glob': case 'grep': case 'search': return <SearchRow item={item} />
    case 'task': return <TaskRow item={item} />
    case 'patch': return <PatchRow item={item} />
    default: return <GenericToolRow item={item} />
  }
}

// ── Activity: markdown prose ──────────────────────────────────────────────

const mdClass = [
  'max-w-none text-xs leading-snug',
  '[&_p]:text-muted-foreground [&_p]:my-0.5',
  '[&_h1]:text-xs [&_h1]:font-bold [&_h1]:text-foreground/90 [&_h1]:mt-2 [&_h1]:mb-0.5',
  '[&_h2]:text-xs [&_h2]:font-semibold [&_h2]:text-foreground/85 [&_h2]:mt-1.5 [&_h2]:mb-0.5',
  '[&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-foreground/80 [&_h3]:mt-1 [&_h3]:mb-0.5',
  '[&_code]:text-[10px] [&_code]:font-mono [&_code]:bg-muted/40 [&_code]:px-1 [&_code]:py-px [&_code]:rounded [&_code]:text-foreground/70',
  '[&_pre]:bg-muted/30 [&_pre]:rounded [&_pre]:px-3 [&_pre]:py-2 [&_pre]:my-1 [&_pre]:text-[11px] [&_pre]:font-mono [&_pre]:leading-snug [&_pre]:whitespace-pre-wrap [&_pre]:break-all [&_pre]:text-muted-foreground',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit',
  '[&_ul]:my-0.5 [&_ul]:pl-4 [&_ol]:my-0.5 [&_ol]:pl-4',
  '[&_li]:text-muted-foreground [&_li]:my-0',
  '[&_li::marker]:text-muted-foreground/40',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground/20 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground/70 [&_blockquote]:italic [&_blockquote]:my-1',
  '[&_a]:text-sky-400/80 [&_a]:underline [&_a]:decoration-sky-400/30',
  '[&_strong]:font-semibold [&_strong]:text-foreground/90',
  '[&_em]:italic',
  '[&_hr]:border-border/50 [&_hr]:my-2',
].join(' ')

export function ActivityRow({ item, isLastMessage, accentClass, accentBorder }: {
  item: TimelineActivityItem
  isLastMessage?: boolean
  /** Step's subBgClass for summary highlight background. */
  accentClass?: string
  /** Step's borderClass for summary highlight border. */
  accentBorder?: string
}) {
  const [fullText, setFullText] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(!item.isReasoning)

  const displayText = fullText ?? item.text
  const { text: preview, more } = useMemo(
    () => truncLines(displayText, item.isReasoning ? 3 : 50),
    [displayText, item.isReasoning],
  )

  async function handleShowFull() {
    const result = await getFullMessageFn({ data: { sessionId: item.sessionId, partId: item.partId } })
    if (result?.text) setFullText(result.text)
  }

  // Reasoning / thinking
  if (item.isReasoning) {
    return (
      <div className="rounded border border-border/30 bg-muted/10 overflow-hidden">
        <button type="button" onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 px-2 py-0.5 w-full text-left bg-muted/20 hover:bg-muted/30">
          <Brain className="h-3 w-3 text-violet-400/50" />
          <span className="text-[10px] font-mono text-muted-foreground/40 italic">thinking</span>
          {expanded
            ? <ChevronDown className="h-2.5 w-2.5 text-muted-foreground/30" />
            : <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/30" />
          }
          <span className="ml-auto text-[10px] font-mono text-muted-foreground/25 tabular-nums">{formatTime(item.createdAt)}</span>
        </button>
        {expanded && (
          <div className="px-3 py-1.5">
            <pre className="text-[10px] font-mono text-muted-foreground/40 italic whitespace-pre-wrap break-words leading-relaxed">
              {fullText ? displayText : preview}
            </pre>
            {more > 0 && !fullText && (
              <button type="button" onClick={() => void handleShowFull()}
                className="text-[10px] font-mono text-muted-foreground/25 hover:text-muted-foreground/50 mt-0.5">
                …{more} more lines
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // Regular text (assistant / user)
  const isUser = item.role === 'user'
  const [userExpanded, setUserExpanded] = useState(false)

  // Last assistant message in section = summary — show fully, highlighted
  const isSummary = isLastMessage && !isUser
  const shownText = isSummary
    ? (fullText ?? displayText)
    : (fullText ? displayText : preview)
  const showMoreBtn = isSummary ? (!fullText && more > 0) : (more > 0 && !fullText)

  // User messages: collapsed by default, show first line as preview
  if (isUser) {
    const firstLine = displayText.split('\n')[0]?.slice(0, 120) ?? ''
    return (
      <div className="group">
        <button type="button" onClick={() => setUserExpanded(!userExpanded)}
          className="flex items-center gap-1.5 w-full text-left py-px">
          <span className="text-[10px] font-mono text-muted-foreground/25 tabular-nums">{formatTime(item.createdAt)}</span>
          <span className="text-[10px] font-mono text-muted-foreground/30">user</span>
          {userExpanded
            ? <ChevronDown className="h-2.5 w-2.5 text-muted-foreground/25" />
            : <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/25" />
          }
          {!userExpanded && (
            <span className="text-[10px] text-muted-foreground/30 truncate min-w-0">{firstLine}</span>
          )}
        </button>
        {userExpanded && (
          <div className={`mt-0.5 pl-3 border-l border-muted-foreground/10 ${mdClass} opacity-60`}>
            <Markdown remarkPlugins={[remarkBreaks]}>{fullText ?? displayText}</Markdown>
            {!fullText && more > 0 && (
              <button type="button" onClick={() => void handleShowFull()}
                className="text-[10px] font-mono text-muted-foreground/25 hover:text-muted-foreground/50 mt-0.5">
                …{more} more lines
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={isSummary ? `rounded-md border ${accentBorder ?? 'border-border/30'} ${accentClass ?? 'bg-muted/20'} px-3 py-2 -mx-1` : ''}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-[10px] font-mono text-muted-foreground/30 tabular-nums">{formatTime(item.createdAt)}</span>
        <span className="text-[10px] font-mono text-sky-400/50">assistant</span>
        {isSummary && (
          <span className="text-[9px] font-mono text-muted-foreground/40 ml-auto">summary</span>
        )}
      </div>
      <div className={mdClass}>
        <Markdown remarkPlugins={[remarkBreaks]}>{shownText}</Markdown>
      </div>
      {showMoreBtn && (
        <button type="button" onClick={() => void handleShowFull()}
          className="text-[10px] font-mono text-muted-foreground/30 hover:text-muted-foreground/60 mt-0.5">
          …{more} more lines
        </button>
      )}
    </div>
  )
}

// ── Dispatcher ────────────────────────────────────────────────────────────

export function TimelineItemRenderer({ item, isLastMessage, accentClass, accentBorder }: {
  item: StepTimelineItem
  isLastMessage?: boolean
  accentClass?: string
  accentBorder?: string
}) {
  switch (item.kind) {
    case 'activity': return <ActivityRow item={item} isLastMessage={isLastMessage} accentClass={accentClass} accentBorder={accentBorder} />
    case 'tool-summary': return <ToolSummaryRow item={item} />
    default: return null
  }
}
