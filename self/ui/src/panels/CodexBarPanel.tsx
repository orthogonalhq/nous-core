'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { IDockviewPanelProps } from 'dockview-react'

type UsageWindow = {
  usedPercent: number | null
  windowMinutes: number | null
  resetsAt: string | null
}

type UsageSnapshot = {
  primary: UsageWindow | null
  secondary: UsageWindow | null
  tertiary: UsageWindow | null
  updatedAt: string | null
  accountEmail: string | null
  accountOrganization: string | null
  loginMethod: string | null
}

type ProviderStatus = {
  indicator: string
  description: string | null
  updatedAt: string | null
  url: string | null
} | null

type ProviderUsageSnapshot = {
  provider: string
  displayName: string
  sourceLabel: string | null
  usage: UsageSnapshot | null
  creditsRemaining: number | null
  codeReviewRemainingPercent: number | null
  extraUsageUsedUsd: number | null
  extraUsageLimitUsd: number | null
  todayCostUsd: number | null
  todayTokens: number | null
  last30DaysCostUsd: number | null
  last30DaysTokens: number | null
  status: ProviderStatus
  errors: string[]
}

type CodexBarUsageSnapshot = {
  generatedAt: string
  source: 'codexbar-cli' | 'fallback'
  warning?: string
  providers: ProviderUsageSnapshot[]
}

interface UsageAPI {
  getSnapshot: () => Promise<CodexBarUsageSnapshot>
}

type CodexBarPanelProps = IDockviewPanelProps<{ usageApi?: UsageAPI }>

export type CodexBarPanelApi = {
  refresh: () => void
}

type CodexBarApiListener = () => void
const _codexBarListeners = new Set<CodexBarApiListener>()
const _codexBarApis = new Map<string, CodexBarPanelApi>()

function setCodexBarApi(panelId: string, api: CodexBarPanelApi | null) {
  if (api) {
    _codexBarApis.set(panelId, api)
  } else {
    _codexBarApis.delete(panelId)
  }
  _codexBarListeners.forEach((listener) => listener())
}

export function useCodexBarApi(panelId?: string): CodexBarPanelApi | null {
  const [api, setApi] = useState<CodexBarPanelApi | null>(
    panelId ? (_codexBarApis.get(panelId) ?? null) : null,
  )

  useEffect(() => {
    const sync = () => {
      setApi(panelId ? (_codexBarApis.get(panelId) ?? null) : null)
    }
    sync()
    _codexBarListeners.add(sync)
    return () => { _codexBarListeners.delete(sync) }
  }, [panelId])

  return api
}

const STATUS_COLOR: Record<string, string> = {
  none: 'var(--nous-state-complete)',
  minor: 'var(--nous-state-waiting)',
  major: 'var(--nous-state-blocked)',
  critical: 'var(--nous-state-blocked)',
  maintenance: 'var(--nous-fg-subtle)',
  unknown: 'var(--nous-fg-subtle)',
}

const PROVIDER_GLYPH: Record<string, string> = {
  codex: '◎',
  claude: '✺',
  cursor: '◧',
  gemini: '✦',
  copilot: '◍',
  factory: '◇',
  zai: '◌',
}

const SETTINGS_MENU_ITEMS = ['Add account', 'Remove account', 'More settings']

export function CodexBarHeaderActions({ api }: { api: CodexBarPanelApi }) {
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const settingsBtnRef = useRef<HTMLButtonElement | null>(null)
  const settingsMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!settingsMenuOpen) return
    const onMouseDown = (event: MouseEvent) => {
      if (settingsBtnRef.current?.contains(event.target as Node)) return
      if (!settingsMenuRef.current) return
      if (!settingsMenuRef.current.contains(event.target as Node)) {
        setSettingsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [settingsMenuOpen])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nous-space-xs)', height: '100%' }}>
      <button
        onClick={() => api.refresh()}
        title="Refresh providers"
        style={{
          border: 'none',
          background: 'transparent',
          color: 'var(--nous-fg-muted)',
          borderRadius: 'var(--nous-menu-item-radius)',
          minWidth: 28,
          height: '100%',
          cursor: 'pointer',
          fontSize: 'var(--nous-icon-size-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ↻
      </button>
      <div>
        <button
          ref={settingsBtnRef}
          onClick={() => {
            setSettingsMenuOpen((open) => {
              if (!open && settingsBtnRef.current) {
                const rect = settingsBtnRef.current.getBoundingClientRect()
                setMenuPos({ top: rect.bottom + 2, left: rect.right })
              }
              return !open
            })
          }}
          title="Provider settings"
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--nous-fg-muted)',
            borderRadius: 'var(--nous-menu-item-radius)',
            minWidth: 28,
            height: '100%',
            cursor: 'pointer',
            fontSize: 'var(--nous-icon-size-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ⚙
        </button>
        {settingsMenuOpen && menuPos && createPortal(
          <div
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              transform: 'translateX(-100%)',
              minWidth: 160,
              background: 'var(--nous-menu-content-bg)',
              border: '1px solid var(--nous-menu-content-border)',
              borderRadius: 'var(--nous-menu-content-radius)',
              padding: 'var(--nous-space-xs) 0',
              zIndex: 'var(--nous-menu-content-z)' as any,
              boxShadow: 'var(--nous-menu-content-shadow)',
            }}
            ref={settingsMenuRef}
          >
            {SETTINGS_MENU_ITEMS.map((item) => (
              <button
                key={item}
                onClick={() => setSettingsMenuOpen(false)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--nous-menu-item-fg)',
                  fontSize: 'var(--nous-font-size-xs)',
                  padding: 'var(--nous-space-xs) var(--nous-space-md)',
                  borderRadius: 'var(--nous-menu-item-radius)',
                  cursor: 'pointer',
                  margin: '0 var(--nous-space-xs)',
                }}
              >
                {item}
              </button>
            ))}
          </div>,
          document.body,
        )}
      </div>
    </div>
  )
}

const cardStyle: CSSProperties = {
  background: 'var(--nous-card-bg)',
  border: '1px solid var(--nous-card-border)',
  borderRadius: 'var(--nous-card-radius)',
  padding: 'var(--nous-space-lg)',
}

const sectionDivider: CSSProperties = {
  height: 1,
  background: 'var(--nous-divider-subtle)',
  margin: 'var(--nous-space-md) 0',
}

const barTrackStyle: CSSProperties = {
  width: '100%',
  height: '8px',
  background: 'var(--nous-progress-track)',
  borderRadius: '999px',
  overflow: 'hidden',
}

function clampPercent(value: number | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function formatPercent(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a'
  return `${Math.round(value)}% used`
}

function formatRelativeCountdown(iso: string | null): string {
  if (!iso) return 'n/a'
  const target = new Date(iso)
  if (Number.isNaN(target.getTime())) return 'n/a'
  const diffMs = target.getTime() - Date.now()
  if (diffMs <= 0) return 'resetting'
  const totalMinutes = Math.floor(diffMs / 60_000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const mins = totalMinutes % 60
  if (days > 0) return `in ${days}d ${hours}h`
  if (hours > 0) return `in ${hours}h ${mins}m`
  return `in ${mins}m`
}

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return 'n/a'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'n/a'
  const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diffSeconds < 10) return 'just now'
  if (diffSeconds < 60) return `${diffSeconds}s ago`
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`
  return `${Math.floor(diffSeconds / 86400)}d ago`
}

function calculatePace(window: UsageWindow | null): string | null {
  if (!window || window.usedPercent === null || window.windowMinutes === null || !window.resetsAt) {
    return null
  }
  const resetsAt = new Date(window.resetsAt)
  if (Number.isNaN(resetsAt.getTime())) return null

  const remainingMinutes = (resetsAt.getTime() - Date.now()) / 60_000
  if (remainingMinutes <= 0) return null
  if (window.windowMinutes <= 0) return null

  const elapsed = window.windowMinutes - remainingMinutes
  const elapsedRatio = elapsed / window.windowMinutes
  if (elapsedRatio < 0.03) return null

  const expectedUsed = Math.max(0, Math.min(100, elapsedRatio * 100))
  const delta = window.usedPercent - expectedUsed
  if (Math.abs(delta) < 2) return 'Pace: On pace'
  if (delta > 0) return `Pace: Behind (+${Math.round(delta)}%)`
  return `Pace: In reserve (${Math.round(delta)}%)`
}

function formatCurrency(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a'
  return `$${value.toFixed(2)}`
}

function formatTokens(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a'
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B tokens`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M tokens`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K tokens`
  return `${Math.round(value)} tokens`
}

function getAverageUsed(provider: ProviderUsageSnapshot): number | null {
  const windows = [provider.usage?.primary, provider.usage?.secondary, provider.usage?.tertiary]
  const values = windows
    .map((window) => window?.usedPercent)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (values.length === 0) return null
  return values.reduce((acc, value) => acc + value, 0) / values.length
}

function getProviderGlyph(providerId: string): string {
  return PROVIDER_GLYPH[providerId.toLowerCase()] ?? '◈'
}

function UsageWindowRow({
  label,
  window,
}: {
  label: string
  window: UsageWindow | null
}) {
  if (!window) return null
  const used = clampPercent(window.usedPercent)
  const pace = label === 'Weekly' ? calculatePace(window) : null

  return (
    <div style={{ display: 'grid', gap: 'var(--nous-space-xs)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--nous-font-size-sm)' }}>
        <span style={{ color: 'var(--nous-fg)' }}>{label}</span>
        <span style={{ color: 'var(--nous-fg)' }}>{formatPercent(window.usedPercent)}</span>
      </div>
      <div style={barTrackStyle}>
        <div
          style={{
            height: '100%',
            width: `${used}%`,
            borderRadius: '999px',
            background: 'var(--nous-progress-fill)',
          }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--nous-font-size-xs)' }}>
        <span style={{ color: 'var(--nous-fg-subtle)' }}>{pace ?? ' '}</span>
        <span style={{ color: 'var(--nous-fg-subtle)' }}>{formatRelativeCountdown(window.resetsAt)}</span>
      </div>
    </div>
  )
}

export function CodexBarPanel({ api, params }: CodexBarPanelProps) {
  const usageApi = params?.usageApi ?? (
    typeof window !== 'undefined'
      ? ((window as any).electronAPI?.usage as UsageAPI | undefined)
      : undefined
  )
  const [snapshot, setSnapshot] = useState<CodexBarUsageSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!usageApi) {
      setError('Desktop usage API unavailable')
      setLoading(false)
      return
    }

    try {
      const next = await usageApi.getSnapshot()
      setSnapshot(next)
      setError(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load usage snapshot')
    } finally {
      setLoading(false)
    }
  }, [usageApi])

  const actionsApi = useMemo<CodexBarPanelApi>(
    () => ({ refresh: () => { void load() } }),
    [load],
  )

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => {
      void load()
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [load])

  useEffect(() => {
    const providers = snapshot?.providers ?? []
    if (providers.length === 0) {
      setSelectedProviderId(null)
      return
    }

    if (!selectedProviderId || !providers.some((provider) => provider.provider === selectedProviderId)) {
      setSelectedProviderId(providers[0]?.provider ?? null)
    }
  }, [snapshot?.providers, selectedProviderId])

  useEffect(() => {
    setCodexBarApi(api.id, actionsApi)
    return () => { setCodexBarApi(api.id, null) }
  }, [api.id, actionsApi])

  const generatedAtLabel = useMemo(() => {
    if (!snapshot?.generatedAt) return 'n/a'
    const date = new Date(snapshot.generatedAt)
    if (Number.isNaN(date.getTime())) return 'n/a'
    return date.toLocaleTimeString()
  }, [snapshot?.generatedAt])

  const providers = snapshot?.providers ?? []
  const selectedProvider = providers.find((provider) => provider.provider === selectedProviderId) ?? null
  const selectedIndicator = selectedProvider?.status?.indicator ?? 'unknown'
  const selectedStatusColor = STATUS_COLOR[selectedIndicator] ?? 'var(--nous-fg-subtle)'

  const extraUsagePercent = useMemo(() => {
    if (!selectedProvider) return null
    if (
      typeof selectedProvider.extraUsageUsedUsd === 'number' &&
      Number.isFinite(selectedProvider.extraUsageUsedUsd) &&
      typeof selectedProvider.extraUsageLimitUsd === 'number' &&
      Number.isFinite(selectedProvider.extraUsageLimitUsd) &&
      selectedProvider.extraUsageLimitUsd > 0
    ) {
      return clampPercent((selectedProvider.extraUsageUsedUsd / selectedProvider.extraUsageLimitUsd) * 100)
    }
    if (typeof selectedProvider.codeReviewRemainingPercent === 'number' && Number.isFinite(selectedProvider.codeReviewRemainingPercent)) {
      return clampPercent(100 - selectedProvider.codeReviewRemainingPercent)
    }
    return null
  }, [selectedProvider])

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        display: 'grid',
        gap: 'var(--nous-space-lg)',
        padding: 'var(--nous-space-lg)',
        color: 'var(--nous-fg)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--nous-space-sm)' }}>
        <div style={{ display: 'grid', gap: '2px' }}>
          <span style={{ fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg)' }}>AI Usage Snapshot</span>
          <span style={{ fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-subtle)' }}>Last update: {generatedAtLabel}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nous-space-sm)' }}>
          {snapshot?.source && (
            <span
              style={{
                fontSize: 'var(--nous-font-size-xs)',
                color: snapshot.source === 'codexbar-cli' ? 'var(--nous-state-complete)' : 'var(--nous-state-waiting)',
                border: '1px solid var(--nous-border-subtle)',
                borderRadius: '999px',
                padding: '2px 8px',
              }}
            >
              {snapshot.source}
            </span>
          )}
        </div>
      </div>

      {loading && (
        <div style={cardStyle}>
          <span style={{ color: 'var(--nous-fg-subtle)', fontSize: 'var(--nous-font-size-sm)' }}>Loading usage data...</span>
        </div>
      )}

      {error && (
        <div style={cardStyle}>
          <span style={{ color: 'var(--nous-state-blocked)', fontSize: 'var(--nous-font-size-sm)' }}>{error}</span>
        </div>
      )}

      {!loading && !error && snapshot?.warning && (
        <div style={cardStyle}>
          <span style={{ color: 'var(--nous-state-waiting)', fontSize: 'var(--nous-font-size-sm)' }}>{snapshot.warning}</span>
        </div>
      )}

      {!loading && !error && providers.length === 0 && (
        <div style={cardStyle}>
          <span style={{ color: 'var(--nous-fg-subtle)', fontSize: 'var(--nous-font-size-sm)' }}>No provider usage data returned.</span>
        </div>
      )}

      {!loading && !error && providers.length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nous-space-sm)', marginBottom: 'var(--nous-space-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nous-space-sm)' }}>
              <span style={{ color: 'var(--nous-fg-subtle)', fontSize: 'var(--nous-font-size-sm)' }}>◈</span>
              <span style={{ color: 'var(--nous-fg-muted)', fontSize: 'var(--nous-font-size-xs)' }}>Providers</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--nous-space-sm)', overflowX: 'auto', paddingBottom: 2 }}>
            {providers.map((provider) => {
              const isActive = provider.provider === selectedProviderId
              const average = getAverageUsed(provider)
              const averagePercent = clampPercent(average)
              const indicator = provider.status?.indicator ?? 'unknown'
              const tabColor = STATUS_COLOR[indicator] ?? 'var(--nous-accent)'

              return (
                <button
                  key={provider.provider}
                  onClick={() => setSelectedProviderId(provider.provider)}
                  style={{
                    minWidth: 120,
                    border: isActive ? '1px solid var(--nous-accent)' : '1px solid var(--nous-border-subtle)',
                    background: isActive ? 'var(--nous-btn-hover)' : 'var(--nous-bg)',
                    color: isActive ? 'var(--nous-fg)' : 'var(--nous-fg-muted)',
                    borderRadius: 'var(--nous-radius-sm)',
                    padding: '8px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'grid',
                    gap: '6px',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--nous-font-size-xs)' }}>
                    <span>{getProviderGlyph(provider.provider)}</span>
                    <span>{provider.displayName}</span>
                  </span>
                  <div style={{ ...barTrackStyle, height: 6 }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${averagePercent}%`,
                        borderRadius: 999,
                        background: tabColor,
                      }}
                    />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {!loading && !error && selectedProvider && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--nous-space-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nous-space-sm)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: selectedStatusColor, display: 'inline-block' }} />
              <span style={{ fontSize: 'calc(var(--nous-font-size-base) + 2px)', fontWeight: 'var(--nous-font-weight-semibold)' as any }}>
                {selectedProvider.displayName}
              </span>
            </div>
            <span style={{ fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-muted)' }}>
              {selectedProvider.usage?.loginMethod ?? 'n/a'}
            </span>
          </div>

          <div style={{ marginTop: 'var(--nous-space-xs)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-subtle)' }}>
              Updated {formatUpdatedAt(selectedProvider.usage?.updatedAt ?? snapshot?.generatedAt ?? null)}
            </span>
            <span style={{ fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-subtle)' }}>
              {selectedProvider.status?.description ?? 'Status unknown'}
            </span>
          </div>

          <div style={sectionDivider} />

          <div style={{ display: 'grid', gap: 'var(--nous-space-md)' }}>
            <UsageWindowRow label="Session" window={selectedProvider.usage?.primary ?? null} />
            <UsageWindowRow label="Weekly" window={selectedProvider.usage?.secondary ?? null} />
            <UsageWindowRow label="Model" window={selectedProvider.usage?.tertiary ?? null} />
          </div>

          <div style={sectionDivider} />

          <div style={{ display: 'grid', gap: 'var(--nous-space-sm)' }}>
            <div style={{ fontSize: 'calc(var(--nous-font-size-base) + 1px)', fontWeight: 'var(--nous-font-weight-semibold)' as any }}>
              Extra usage
            </div>
            <div style={barTrackStyle}>
              <div
                style={{
                  height: '100%',
                  width: `${clampPercent(extraUsagePercent)}%`,
                  borderRadius: 999,
                  background: 'var(--nous-progress-fill)',
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--nous-font-size-sm)' }}>
              <span style={{ color: 'var(--nous-fg-muted)' }}>
                {typeof selectedProvider.extraUsageUsedUsd === 'number' &&
                Number.isFinite(selectedProvider.extraUsageUsedUsd) &&
                typeof selectedProvider.extraUsageLimitUsd === 'number' &&
                Number.isFinite(selectedProvider.extraUsageLimitUsd)
                  ? `This month: ${formatCurrency(selectedProvider.extraUsageUsedUsd)} / ${formatCurrency(selectedProvider.extraUsageLimitUsd)}`
                  : typeof selectedProvider.creditsRemaining === 'number' && Number.isFinite(selectedProvider.creditsRemaining)
                    ? `Credits remaining: ${selectedProvider.creditsRemaining.toFixed(2)}`
                    : typeof selectedProvider.codeReviewRemainingPercent === 'number' && Number.isFinite(selectedProvider.codeReviewRemainingPercent)
                      ? `Code review remaining: ${Math.round(selectedProvider.codeReviewRemainingPercent)}%`
                      : 'No extra usage data'}
              </span>
              <span style={{ color: 'var(--nous-fg-subtle)' }}>
                {extraUsagePercent !== null ? `${Math.round(extraUsagePercent)}% used` : 'n/a'}
              </span>
            </div>
          </div>

          <div style={sectionDivider} />

          <div style={{ display: 'grid', gap: 'var(--nous-space-xs)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'calc(var(--nous-font-size-base) + 1px)', fontWeight: 'var(--nous-font-weight-semibold)' as any }}>
                Cost
              </span>
              <span style={{ color: 'var(--nous-fg-subtle)' }}>›</span>
            </div>
            <span style={{ fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-muted)' }}>
              Today: {formatCurrency(selectedProvider.todayCostUsd)} · {formatTokens(selectedProvider.todayTokens)}
            </span>
            <span style={{ fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-muted)' }}>
              Last 30 days: {formatCurrency(selectedProvider.last30DaysCostUsd)} · {formatTokens(selectedProvider.last30DaysTokens)}
            </span>
          </div>

          {selectedProvider.errors.length > 0 && (
            <>
              <div style={sectionDivider} />
              <div style={{ display: 'grid', gap: 'var(--nous-space-2xs)' }}>
                {selectedProvider.errors.map((entry, index) => (
                  <span key={index} style={{ fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-state-blocked)' }}>
                    {entry}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
