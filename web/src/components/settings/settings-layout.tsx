import { useIsMobile } from '~/hooks/use-media-query'
import { SettingsSidebar, MobileSettingsSidebar, SECTIONS } from './settings-sidebar'

export function SettingsLayout() {
  const isMobile = useIsMobile()

  return (
    <div className="mx-auto max-w-[1800px]">
      {isMobile ? <MobileSettingsSidebar /> : null}
      <div className="flex gap-0 lg:gap-8 px-4 sm:px-8 py-6">
        {!isMobile ? <SettingsSidebar /> : null}
        <main className="flex-1 min-w-0 space-y-8">
          {SECTIONS.map((section) => (
            <section
              key={section.id}
              id={`section-${section.id}`}
              className="scroll-mt-20"
            >
              <div className="rounded-lg border bg-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <section.icon className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">{section.label}</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  {section.label} settings will be available here.
                </p>
              </div>
            </section>
          ))}
        </main>
      </div>
    </div>
  )
}
