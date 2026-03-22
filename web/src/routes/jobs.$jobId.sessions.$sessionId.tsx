import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * Old session drill-in route — now redirects to the job detail page.
 *
 * Subsessions are displayed inline in the execution tree via
 * BranchLifecycleBlock (collapsible), so there is no longer a separate
 * session detail page. This redirect ensures bookmarked or shared links
 * to the old route still resolve to a useful page.
 */
export const Route = createFileRoute('/jobs/$jobId/sessions/$sessionId')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/jobs/$jobId',
      params: { jobId: params.jobId },
    })
  },
  component: () => null,
})
