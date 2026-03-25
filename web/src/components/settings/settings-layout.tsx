'use client'

import { useIsMobile } from '~/hooks/use-media-query'
import { Skeleton } from '~/components/ui/skeleton'
import { Card } from '~/components/ui/card'
import { useSettings } from '~/hooks/use-settings'
import { toastManager } from '~/components/ui/toast'
import { SettingsSidebar, MobileSettingsSidebar } from './settings-sidebar'
import { SaveButton } from './save-button'
import { SectionGeneral } from './section-general'
import { SectionRunner } from './section-runner'
import { SectionMemory } from './section-memory'
import { SectionLogging } from './section-logging'
import { SectionJobDefaults } from './section-job-defaults'
import { SectionNotifications } from './section-notifications'

export function SettingsLayout() {
  const isMobile = useIsMobile()

  const {
    config,
    modelTable,
    systemInfo,
    formValues,
    setField,
    resetField,
    isDirty,
    dirtyCount,
    isSaving,
    save,
    isLoading,
  } = useSettings()

  // Shared props for all section components
  const sectionProps = {
    config: config ?? {},
    formValues,
    setField,
    resetField,
    systemInfo,
  }

  const handleSave = async () => {
    const result = await save()
    if (result.ok) {
      toastManager.add({
        title: 'Settings saved',
        description: `${dirtyCount} section(s) updated`,
        type: 'success',
      })
    } else {
      toastManager.add({
        title: 'Save failed',
        description: 'Check field errors and try again',
        type: 'error',
      })
    }
  }

  return (
    <div className="mx-auto max-w-[1800px]">
      {isMobile ? <MobileSettingsSidebar /> : null}
      <div className="flex gap-0 px-4 py-6 sm:px-8 lg:gap-8">
        {!isMobile ? <SettingsSidebar /> : null}
        <main className="min-w-0 flex-1 space-y-8">
          {/* Loading skeleton */}
          {isLoading ? (
            <div className="space-y-8">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="p-6">
                  <Skeleton className="mb-4 h-6 w-32" />
                  <div className="space-y-4">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-3/4" />
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <>
              {/* Section: General */}
              <section id="section-general" className="scroll-mt-20">
                <SectionGeneral {...sectionProps} />
              </section>

              {/* Section: Runner */}
              <section id="section-runner" className="scroll-mt-20">
                <SectionRunner {...sectionProps} />
              </section>

              {/* Section: Memory */}
              <section id="section-memory" className="scroll-mt-20">
                <SectionMemory {...sectionProps} />
              </section>

              {/* Section: Job Defaults */}
              <section id="section-job-defaults" className="scroll-mt-20">
                <SectionJobDefaults
                  {...sectionProps}
                  customModes={modelTable?.customModes}
                />
              </section>

              {/* Section: Notifications */}
              <section id="section-notifications" className="scroll-mt-20">
                <SectionNotifications {...sectionProps} />
              </section>

              {/* Section: Logging */}
              <section id="section-logging" className="scroll-mt-20">
                <SectionLogging {...sectionProps} />
              </section>

              {/* Section: Models — placeholder (Plan 03) */}
              <section id="section-models" className="scroll-mt-20">
                <Card className="p-6">
                  <h2 className="mb-2 text-lg font-semibold">Models</h2>
                  <p className="text-sm text-muted-foreground">
                    Model configuration coming in the next plan...
                  </p>
                </Card>
              </section>

              {/* Section: Projects — placeholder (Plan 03) */}
              <section id="section-projects" className="scroll-mt-20">
                <Card className="p-6">
                  <h2 className="mb-2 text-lg font-semibold">Projects</h2>
                  <p className="text-sm text-muted-foreground">
                    Project management coming in the next plan...
                  </p>
                </Card>
              </section>

              {/* Section: Skills — placeholder (Plan 03) */}
              <section id="section-skills" className="scroll-mt-20">
                <Card className="p-6">
                  <h2 className="mb-2 text-lg font-semibold">Skills</h2>
                  <p className="text-sm text-muted-foreground">
                    Skills management coming in the next plan...
                  </p>
                </Card>
              </section>
            </>
          )}
        </main>
      </div>

      {/* Floating save button */}
      <SaveButton
        isDirty={isDirty}
        dirtyCount={dirtyCount}
        isSaving={isSaving}
        onSave={() => void handleSave()}
      />
    </div>
  )
}
