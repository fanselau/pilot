import { useEffect, useRef, useState } from 'react'
import {
  Settings2,
  Play,
  MemoryStick,
  ListChecks,
  Bell,
  FileText,
  Cpu,
  FolderGit2,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Separator } from '~/components/ui/separator'

type SectionDef = {
  id: string
  label: string
  icon: LucideIcon
  separator?: boolean
}

export const SECTIONS: SectionDef[] = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'runner', label: 'Runner', icon: Play },
  { id: 'memory', label: 'Memory', icon: MemoryStick },
  { id: 'job-defaults', label: 'Job Defaults', icon: ListChecks },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'logging', label: 'Logging', icon: FileText },
  // separator before models
  { id: 'models', label: 'Models', icon: Cpu, separator: true },
  { id: 'projects', label: 'Projects', icon: FolderGit2 },
  { id: 'skills', label: 'Skills', icon: Wrench },
]

function useSectionScrollSpy(sectionIds: string[]): string {
  const [activeId, setActiveId] = useState(sectionIds[0] ?? '')

  useEffect(() => {
    const observers: IntersectionObserver[] = []

    const callback = (id: string) => (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setActiveId(id)
        }
      }
    }

    for (const id of sectionIds) {
      const el = document.getElementById(`section-${id}`)
      if (!el) continue
      const observer = new IntersectionObserver(callback(id), {
        rootMargin: '-10% 0px -80% 0px',
        threshold: 0,
      })
      observer.observe(el)
      observers.push(observer)
    }

    return () => {
      for (const observer of observers) {
        observer.disconnect()
      }
    }
  }, [sectionIds])

  return activeId
}

export function SettingsSidebar() {
  const sectionIds = SECTIONS.map(s => s.id)
  const activeId = useSectionScrollSpy(sectionIds)

  const scrollToSection = (id: string) => {
    const el = document.getElementById(`section-${id}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <aside className="w-[220px] shrink-0 sticky top-[calc(3rem+1rem)] max-h-[calc(100vh-5rem)] overflow-y-auto">
      <nav className="flex flex-col gap-1">
        {SECTIONS.map((section) => (
          <div key={section.id}>
            {section.separator && (
              <Separator className="my-2" />
            )}
            <button
              type="button"
              onClick={() => scrollToSection(section.id)}
              className={[
                'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors text-left',
                activeId === section.id
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              ].join(' ')}
            >
              <section.icon className="h-4 w-4 shrink-0" />
              {section.label}
            </button>
          </div>
        ))}
      </nav>
    </aside>
  )
}

export function MobileSettingsSidebar() {
  const sectionIds = SECTIONS.map(s => s.id)
  const activeId = useSectionScrollSpy(sectionIds)

  const scrollToSection = (id: string) => {
    const el = document.getElementById(`section-${id}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-b px-4 py-2">
      <div className="flex gap-2 min-w-max">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => scrollToSection(section.id)}
            className={[
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
              activeId === section.id
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            ].join(' ')}
          >
            <section.icon className="h-3.5 w-3.5 shrink-0" />
            {section.label}
          </button>
        ))}
      </div>
    </div>
  )
}
