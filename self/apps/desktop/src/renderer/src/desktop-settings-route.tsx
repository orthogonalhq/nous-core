import { PreferencesPanel } from '@nous/ui/panels'

type PreferencesPanelParams = Parameters<typeof PreferencesPanel>[0]['params']

export function SettingsRoute({
  preferencesPanelParams,
}: {
  preferencesPanelParams: PreferencesPanelParams
}) {
  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        background: 'var(--nous-content-bg)',
      }}
    >
      <PreferencesPanel
        api={{} as never}
        containerApi={{} as never}
        params={preferencesPanelParams}
      />
    </div>
  )
}
