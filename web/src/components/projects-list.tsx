import { Link } from '@tanstack/react-router'
import type { ProjectWithStats } from '@pilot/core/types.js'
import { Badge } from '~/components/ui/badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '~/components/ui/table'
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

// ── Main Component ────────────────────────────────────────────────────────

export function ProjectsList({ projects }: { projects: ProjectWithStats[] }) {
  if (projects.length === 0) {
    return (
      <Empty className="py-8 md:py-8">
        <EmptyHeader>
          <EmptyTitle className="text-base">No projects registered</EmptyTitle>
          <EmptyDescription>
            Use <code className="font-mono text-xs">pilot setup &lt;dir&gt;</code> to register a
            project.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <TooltipProvider>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Project</TableHead>
            <TableHead className="w-32">Owner</TableHead>
            <TableHead className="w-24">Status</TableHead>
            <TableHead className="w-20 text-right">Active</TableHead>
            <TableHead className="w-24 text-right">Completed</TableHead>
            <TableHead className="w-20 text-right">Failed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => {
            const isBlocked = project.status === 'blocked'
            const displayName = shortProject(project.path)
            return (
              <TableRow
                key={project.path}
                className={`cursor-pointer hover:bg-muted/50 ${isBlocked ? 'bg-destructive/5' : ''}`}
              >
                <TableCell>
                  <div className="space-y-0.5">
                    <Link
                      to="/projects/$projectPath"
                      params={{ projectPath: encodeURIComponent(project.path) }}
                      className="font-medium text-sm hover:underline"
                    >
                      {displayName}
                    </Link>
                    {isBlocked && project.blockedReason && (
                      <p className="text-xs text-muted-foreground truncate max-w-sm">
                        {project.blockedReason}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {project.owner ?? '—'}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={isBlocked ? 'destructive' : 'success'}
                    size="sm"
                  >
                    {project.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {project.activeJobCount > 0 ? (
                    <Badge variant="info" size="sm">
                      {project.activeJobCount}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {project.completedJobCount}
                </TableCell>
                <TableCell className="text-right">
                  {project.failedJobCount > 0 ? (
                    <Badge variant="destructive" size="sm">
                      {project.failedJobCount}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TooltipProvider>
  )
}
