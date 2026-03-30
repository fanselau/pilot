import { Link } from '@tanstack/react-router'
import type { ProjectWithStats } from '@pilot/core/types.js'
import { Badge } from '~/components/ui/badge'
import { Card } from '~/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '~/components/ui/empty'
import {
  Tooltip,
  TooltipTrigger,
  TooltipPopup,
  TooltipProvider,
} from '~/components/ui/tooltip'

// ── Helpers ──────────────────────────────────────────────────────────────

function shortProject(path: string): string {
  return path.split('/').pop() ?? path
}

// ── Summary Stats ────────────────────────────────────────────────────────

function ProjectsSummary({ projects }: { projects: ProjectWithStats[] }) {
  const blockedCount = projects.filter((p) => p.status === 'blocked').length
  const activeCount = projects.filter((p) => p.status === 'active').length
  const totalActiveJobs = projects.reduce((sum, p) => sum + p.activeJobCount, 0)

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 text-sm text-muted-foreground">
      <span>{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
      {activeCount > 0 && (
        <Badge variant="success" size="sm">{activeCount} active</Badge>
      )}
      {blockedCount > 0 && (
        <Badge variant="destructive" size="sm">{blockedCount} blocked</Badge>
      )}
      {totalActiveJobs > 0 && (
        <Badge variant="info" size="sm">
          {totalActiveJobs} running job{totalActiveJobs !== 1 ? 's' : ''}
        </Badge>
      )}
    </div>
  )
}

// ── Project Card ─────────────────────────────────────────────────────────

function ProjectCard({ project }: { project: ProjectWithStats }) {
  const isBlocked = project.status === 'blocked'
  const displayName = shortProject(project.path)

  return (
    <Link
      to="/projects/$projectPath"
      params={{ projectPath: encodeURIComponent(project.path) }}
      className="block h-full"
    >
      <Card
        className={`cursor-pointer transition-colors hover:bg-muted/50 h-full ${
          isBlocked ? 'border-destructive/30 bg-destructive/5' : ''
        }`}
      >
        <div className="p-4 flex flex-col gap-2 h-full">
          {/* Header: project name + status badge */}
          <div className="flex items-start justify-between gap-2">
            <span className="font-semibold text-sm leading-tight break-words min-w-0">
              {displayName}
            </span>
            <Badge
              variant={isBlocked ? 'destructive' : 'success'}
              size="sm"
              className="shrink-0"
            >
              {project.status}
            </Badge>
          </div>

          {/* Notification routes */}
          <div className="flex flex-wrap gap-1">
            {project.notifyRoutes && project.notifyRoutes.length > 0 ? (
              project.notifyRoutes.map((r, i) => {
                const labels: Record<string, string> = {
                  kimaki: 'Kimaki',
                  'openclaw-agent-deliver': 'OpenClaw',
                  webhook: 'Webhook',
                  telegram: 'Telegram',
                }
                return (
                  <Badge key={`${r.kind}-${i}`} variant="outline" size="sm">
                    {labels[r.kind] ?? r.kind}
                  </Badge>
                )
              })
            ) : (
              <span className="text-xs italic text-muted-foreground">No notification routes</span>
            )}
          </div>

          {/* Path — truncated with tooltip */}
          <Tooltip>
            <TooltipTrigger className="text-xs text-muted-foreground font-mono truncate max-w-full text-left cursor-default">
              {project.path}
            </TooltipTrigger>
            <TooltipPopup className="max-w-sm break-all text-xs">
              {project.path}
            </TooltipPopup>
          </Tooltip>

          {/* Block reason */}
          {isBlocked && project.blockedReason && (
            <p className="text-xs text-destructive/80 line-clamp-2">
              {project.blockedReason}
            </p>
          )}

          {/* Stats row */}
          <div className="flex items-center gap-2 flex-wrap mt-auto pt-1">
            {project.activeJobCount > 0 ? (
              <Badge variant="info" size="sm">
                {project.activeJobCount} active
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">
                {project.activeJobCount} active
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {project.completedJobCount} done
            </span>
            {project.failedJobCount > 0 ? (
              <Badge variant="destructive" size="sm">
                {project.failedJobCount} failed
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">
                {project.failedJobCount} failed
              </span>
            )}
          </div>
        </div>
      </Card>
    </Link>
  )
}

// ── Main Component ────────────────────────────────────────────────────────

export function ProjectsList({ projects }: { projects: ProjectWithStats[] }) {
  if (projects.length === 0) {
    return (
      <Empty className="py-8 md:py-8">
        <EmptyHeader>
          <EmptyTitle className="text-base">No projects registered</EmptyTitle>
          <EmptyDescription>
            Use{' '}
            <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
              pilot setup &lt;dir&gt;
            </code>{' '}
            to register a project directory.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <TooltipProvider>
      <ProjectsSummary projects={projects} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((project) => (
          <ProjectCard key={project.path} project={project} />
        ))}
      </div>
    </TooltipProvider>
  )
}
