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
import { AutoPilotLogo } from '~/components/brand'
import { Settings } from 'lucide-react'

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
      { title: 'AutoPilot' },
      { name: 'theme-color', content: '#171717' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
      { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/site.webmanifest' },
    ],
  }),
  component: RootComponent,
})

function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-12 max-w-[1800px] items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80">
            <AutoPilotLogo />
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              to="/"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors data-[status=active]:text-foreground"
            >
              Dashboard
            </Link>
            <Link
              to="/settings"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors data-[status=active]:text-foreground"
            >
              <Settings className="h-4 w-4" />
            </Link>
          </nav>
        </div>
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
      <body className="min-h-dvh bg-background text-foreground antialiased overflow-x-hidden">
        {children}
        <Scripts />
      </body>
    </html>
  )
}
