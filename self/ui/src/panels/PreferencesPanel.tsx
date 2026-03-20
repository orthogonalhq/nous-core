'use client'

import { useState, useEffect, useCallback } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Provider = 'anthropic' | 'openai'

interface ApiKeyEntry {
  provider: Provider
  configured: boolean
  maskedKey: string | null
  createdAt: string | null
}

interface OllamaInfo {
  running: boolean
  models: string[]
}

interface SystemStatus {
  ollama: OllamaInfo
  configuredProviders: string[]
  credentialVaultHealthy: boolean
}

interface TestResult {
  valid: boolean
  error: string | null
}

/** API surface the host must provide via panel params. */
export interface PreferencesApi {
  getApiKeys: () => Promise<ApiKeyEntry[]>
  setApiKey: (input: { provider: Provider; key: string }) => Promise<{ stored: boolean }>
  deleteApiKey: (input: { provider: Provider }) => Promise<{ deleted: boolean }>
  testApiKey: (input: { provider: Provider; key: string }) => Promise<TestResult>
  getSystemStatus: () => Promise<SystemStatus>
}

interface PreferencesPanelProps extends IDockviewPanelProps {
  params: {
    preferencesApi?: PreferencesApi
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  marginBottom: 'var(--nous-space-2xl)',
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-lg)',
  fontWeight: 'var(--nous-font-weight-semibold)' as never,
  color: 'var(--nous-fg)',
  marginBottom: 'var(--nous-space-lg)',
  paddingBottom: 'var(--nous-space-sm)',
  borderBottom: '1px solid var(--nous-header-border)',
}

const cardStyle: React.CSSProperties = {
  background: 'var(--nous-bg-elevated)',
  borderRadius: 'var(--nous-radius-md)',
  padding: 'var(--nous-space-lg)',
  marginBottom: 'var(--nous-space-md)',
  border: '1px solid var(--nous-header-border)',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--nous-space-md)',
}

const badgeStyle = (configured: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 8px',
  borderRadius: 'var(--nous-radius-sm)',
  fontSize: 'var(--nous-font-size-xs)',
  fontWeight: 'var(--nous-font-weight-medium)' as never,
  background: configured ? 'var(--nous-state-active)' : 'var(--nous-bg)',
  color: configured ? 'var(--nous-fg-on-color)' : 'var(--nous-fg-subtle)',
  border: configured ? 'none' : '1px solid var(--nous-header-border)',
})

const btnStyle = (variant: 'primary' | 'danger' | 'ghost'): React.CSSProperties => ({
  padding: 'var(--nous-space-sm) var(--nous-space-lg)',
  borderRadius: 'var(--nous-radius-md)',
  border: variant === 'ghost' ? '1px solid var(--nous-header-border)' : 'none',
  background:
    variant === 'primary'
      ? 'var(--nous-btn-primary-bg)'
      : variant === 'danger'
        ? 'var(--nous-state-blocked)'
        : 'transparent',
  color: variant === 'ghost' ? 'var(--nous-fg-muted)' : 'var(--nous-fg-on-color)',
  cursor: 'pointer',
  fontSize: 'var(--nous-font-size-sm)',
  fontWeight: 'var(--nous-font-weight-medium)' as never,
})

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'var(--nous-input-bg)',
  border: '1px solid var(--nous-header-border)',
  borderRadius: 'var(--nous-radius-md)',
  padding: 'var(--nous-space-sm) var(--nous-space-md)',
  color: 'var(--nous-fg)',
  fontSize: 'var(--nous-font-size-sm)',
  outline: 'none',
  fontFamily: 'monospace',
}

const selectStyle: React.CSSProperties = {
  background: 'var(--nous-input-bg)',
  border: '1px solid var(--nous-header-border)',
  borderRadius: 'var(--nous-radius-md)',
  padding: 'var(--nous-space-sm) var(--nous-space-md)',
  color: 'var(--nous-fg)',
  fontSize: 'var(--nous-font-size-sm)',
  outline: 'none',
}

const feedbackStyle = (success: boolean): React.CSSProperties => ({
  padding: 'var(--nous-space-sm) var(--nous-space-md)',
  borderRadius: 'var(--nous-radius-sm)',
  fontSize: 'var(--nous-font-size-sm)',
  background: success ? 'var(--nous-state-active)' : 'var(--nous-state-blocked)',
  color: 'var(--nous-fg-on-color)',
  marginTop: 'var(--nous-space-sm)',
})

const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PreferencesPanel({ params }: PreferencesPanelProps) {
  const api = params?.preferencesApi

  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([])
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [loading, setLoading] = useState(true)

  // Add key form
  const [addProvider, setAddProvider] = useState<Provider>('anthropic')
  const [addKey, setAddKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ message: string; success: boolean } | null>(null)

  // Per-provider testing state
  const [testingProvider, setTestingProvider] = useState<Provider | null>(null)

  const refresh = useCallback(async () => {
    if (!api) return
    try {
      const [keys, status] = await Promise.all([
        api.getApiKeys(),
        api.getSystemStatus(),
      ])
      setApiKeys(keys)
      setSystemStatus(status)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleSaveAndTest = async () => {
    if (!api || !addKey.trim()) return
    setSaving(true)
    setFeedback(null)
    try {
      // Test first
      const testResult = await api.testApiKey({ provider: addProvider, key: addKey.trim() })
      if (!testResult.valid) {
        setFeedback({ message: `Invalid key: ${testResult.error ?? 'unknown error'}`, success: false })
        setSaving(false)
        return
      }
      // Store
      await api.setApiKey({ provider: addProvider, key: addKey.trim() })
      setFeedback({ message: `${PROVIDER_LABELS[addProvider]} API key saved and verified.`, success: true })
      setAddKey('')
      await refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setFeedback({ message: `Error: ${msg}`, success: false })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async (provider: Provider) => {
    if (!api) return
    setTestingProvider(provider)
    try {
      const resolved = await api.getApiKeys()
      const entry = resolved.find((e) => e.provider === provider)
      if (!entry?.configured) {
        setFeedback({ message: `${PROVIDER_LABELS[provider]} key is not configured.`, success: false })
        return
      }
      // We cannot test without the actual key value (we only have masked).
      // The test endpoint requires the key. We'll indicate the key is stored.
      setFeedback({ message: `${PROVIDER_LABELS[provider]} key is stored. Re-enter the key to test.`, success: true })
    } finally {
      setTestingProvider(null)
    }
  }

  const handleDelete = async (provider: Provider) => {
    if (!api) return
    try {
      await api.deleteApiKey({ provider })
      setFeedback({ message: `${PROVIDER_LABELS[provider]} API key deleted.`, success: true })
      await refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setFeedback({ message: `Error: ${msg}`, success: false })
    }
  }

  if (!api) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--nous-fg-subtle)' }}>
        Preferences API not connected.
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--nous-fg-subtle)' }}>
        Loading preferences...
      </div>
    )
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 'var(--nous-space-2xl)', color: 'var(--nous-fg)' }}>
      {/* ── API Keys ─────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>API Keys</div>

        {apiKeys.map((entry) => (
          <div key={entry.provider} style={cardStyle}>
            <div style={rowStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nous-space-md)' }}>
                <span style={{ fontWeight: 'var(--nous-font-weight-semibold)' as never, fontSize: 'var(--nous-font-size-base)' }}>
                  {PROVIDER_LABELS[entry.provider]}
                </span>
                <span style={badgeStyle(entry.configured)}>
                  {entry.configured ? 'Configured' : 'Not configured'}
                </span>
              </div>
              {entry.configured && (
                <div style={{ display: 'flex', gap: 'var(--nous-space-sm)' }}>
                  <button
                    style={btnStyle('ghost')}
                    onClick={() => handleTest(entry.provider)}
                    disabled={testingProvider === entry.provider}
                  >
                    {testingProvider === entry.provider ? 'Testing...' : 'Test'}
                  </button>
                  <button
                    style={btnStyle('danger')}
                    onClick={() => handleDelete(entry.provider)}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
            {entry.configured && entry.maskedKey && (
              <div style={{ marginTop: 'var(--nous-space-sm)', fontFamily: 'monospace', fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-muted)' }}>
                {entry.maskedKey}
              </div>
            )}
            {entry.configured && entry.createdAt && (
              <div style={{ marginTop: 'var(--nous-space-xs)', fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-subtle)' }}>
                Added {new Date(entry.createdAt).toLocaleDateString()}
              </div>
            )}
          </div>
        ))}

        {/* Add API Key form */}
        <div style={{ ...cardStyle, marginTop: 'var(--nous-space-lg)' }}>
          <div style={{ fontSize: 'var(--nous-font-size-sm)', fontWeight: 'var(--nous-font-weight-medium)' as never, marginBottom: 'var(--nous-space-md)', color: 'var(--nous-fg-muted)' }}>
            Add API Key
          </div>
          <div style={{ display: 'flex', gap: 'var(--nous-space-sm)', alignItems: 'center' }}>
            <select
              style={selectStyle}
              value={addProvider}
              onChange={(e) => setAddProvider(e.target.value as Provider)}
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
            <input
              type="password"
              style={inputStyle}
              value={addKey}
              onChange={(e) => setAddKey(e.target.value)}
              placeholder="Paste your API key..."
            />
            <button
              style={{
                ...btnStyle('primary'),
                opacity: saving || !addKey.trim() ? 0.5 : 1,
                cursor: saving || !addKey.trim() ? 'not-allowed' : 'pointer',
              }}
              onClick={handleSaveAndTest}
              disabled={saving || !addKey.trim()}
            >
              {saving ? 'Saving...' : 'Save & Test'}
            </button>
          </div>
        </div>

        {feedback && (
          <div style={feedbackStyle(feedback.success)}>
            {feedback.message}
          </div>
        )}
      </div>

      {/* ── System Status ─────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>System Status</div>

        <div style={cardStyle}>
          <div style={{ ...rowStyle, marginBottom: 'var(--nous-space-md)' }}>
            <span>Ollama</span>
            <span style={badgeStyle(systemStatus?.ollama.running ?? false)}>
              {systemStatus?.ollama.running ? 'Running' : 'Not running'}
            </span>
          </div>
          {systemStatus?.ollama.running && systemStatus.ollama.models.length > 0 && (
            <div style={{ fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-muted)' }}>
              Models: {systemStatus.ollama.models.join(', ')}
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <div style={rowStyle}>
            <span>Active Providers</span>
            <span style={{ fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-muted)' }}>
              {systemStatus?.configuredProviders.length
                ? systemStatus.configuredProviders.map((p) => PROVIDER_LABELS[p as Provider] ?? p).join(', ')
                : 'None'}
            </span>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={rowStyle}>
            <span>Credential Vault</span>
            <span style={badgeStyle(systemStatus?.credentialVaultHealthy ?? false)}>
              {systemStatus?.credentialVaultHealthy ? 'Healthy' : 'Unavailable'}
            </span>
          </div>
        </div>
      </div>

      {/* ── About ─────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>About</div>

        <div style={cardStyle}>
          <div style={{ marginBottom: 'var(--nous-space-md)' }}>
            <span style={{ fontWeight: 'var(--nous-font-weight-semibold)' as never }}>Nous</span>
            <span style={{ marginLeft: 'var(--nous-space-sm)', fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-muted)' }}>
              v0.1.0
            </span>
          </div>
          <div style={{ display: 'flex', gap: 'var(--nous-space-lg)', fontSize: 'var(--nous-font-size-sm)' }}>
            <a
              href="https://github.com/nousai/nous-core"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--nous-btn-primary-bg)', textDecoration: 'underline' }}
            >
              GitHub
            </a>
            <a
              href="https://docs.nous.ai"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--nous-btn-primary-bg)', textDecoration: 'underline' }}
            >
              Documentation
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
