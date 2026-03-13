import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">Pilot Dashboard</h1>
        <p className="text-muted-foreground">Web UI scaffold — ready for server functions</p>
      </div>
    </div>
  )
}
