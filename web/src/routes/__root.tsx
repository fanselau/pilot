/// <reference types="vite/client" />
import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
  useNavigate,
  useMatches,
} from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import appCss from '~/styles.css?url'
import { ToastProvider } from '~/components/ui/toast'
import { CommandPalette } from '~/components/command-palette'
import { Kbd } from '~/components/ui/kbd'
import { useIsMobile } from '~/hooks/use-media-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      refetchOnWindowFocus: true,
    },
  },
})

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Pilot Dashboard' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootComponent,
})

function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-12 max-w-[1800px] items-center justify-between px-4 sm:px-8">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight hover:opacity-80">
          <span className="text-lg">Pilot</span>
        </Link>
        <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
          <Kbd>⌘K</Kbd>
          <span>Command palette</span>
        </div>
      </div>
    </header>
  )
}

function AppShell() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const matches = useMatches()

  // Hide the app header on mobile when viewing a job-detail page.
  // The breadcrumb inside the job detail already provides "← Dashboard".
  const isJobDetailRoute = matches.some((m) => m.routeId.startsWith('/jobs/$jobId'))
  const hideHeader = isMobile && isJobDetailRoute

  return (
    <ToastProvider position="bottom-right">
      {!hideHeader && <AppHeader />}
      <CommandPalette
        ctx={{
          navigate: (to) => navigate({ to }),
        }}
      />
      <Outlet />
    </ToastProvider>
  )
}

function RootComponent() {
  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        <AppShell />
      </QueryClientProvider>
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased overflow-x-hidden">
        {children}
        <Scripts />
      </body>
    </html>
  )
}
