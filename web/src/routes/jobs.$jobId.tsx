import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/jobs/$jobId')({
  component: () => <div>Loading job detail...</div>,
})
