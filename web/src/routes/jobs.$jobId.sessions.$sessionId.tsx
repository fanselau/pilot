import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/jobs/$jobId/sessions/$sessionId')({
  component: () => <div>Loading session...</div>,
})
