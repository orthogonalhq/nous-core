'use client'

import { useState, useEffect, useCallback } from 'react'
import type { PreferencesApi, Provider, ApiKeyEntry, FeedbackState } from '../types'
import {
  sectionStyle,
  sectionTitleStyle,
  cardStyle,
  rowStyle,
  badgeStyle,
  btnStyle,
  inputStyle,
  selectStyle,
  feedbackStyle,
  PROVIDER_LABELS,
} from '../styles'
import { testStoredProviderKey, formatFeedbackError } from './helpers'

export interface ApiKeysPageProps {
  api: Pick<PreferencesApi, 'getApiKeys' | 'setApiKey' | 'deleteApiKey' | 'testApiKey'>
}

export function ApiKeysPage({ api }: ApiKeysPageProps) {
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([])
  const [addProvider, setAddProvider] = useState<Provider>('anthropic')
  const [addKey, setAddKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [testingProvider, setTestingProvider] = useState<Provider | null>(null)

  const loadKeys = useCallback(async () => {
    try {
      const keys = await api.getApiKeys()
      setApiKeys(keys)
    } catch {
      // ignore
    }
  }, [api])

  useEffect(() => {
    void loadKeys()
  }, [loadKeys])

  const handleSaveAndTest = async () => {
    if (!addKey.trim()) return
    setSaving(true)
    setFeedback(null)
    try {
      const testResult = await api.testApiKey({ provider: addProvider, key: addKey.trim() })
      if (!testResult.valid) {
        setFeedback({ message: `Invalid key: ${testResult.error ?? 'unknown error'}`, success: false })
        setSaving(false)
        return
      }
      await api.setApiKey({ provider: addProvider, key: addKey.trim() })
      setFeedback({ message: `${PROVIDER_LABELS[addProvider]} API key saved and verified.`, success: true })
      setAddKey('')
      await loadKeys()
    } catch (err) {
      setFeedback(formatFeedbackError(err))
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async (provider: Provider) => {
    setTestingProvider(provider)
    setFeedback(null)
    try {
      setFeedback(await testStoredProviderKey(api as PreferencesApi, provider))
    } catch (err) {
      setFeedback(formatFeedbackError(err))
    } finally {
      setTestingProvider(null)
    }
  }

  const handleDelete = async (provider: Provider) => {
    try {
      await api.deleteApiKey({ provider })
      setFeedback({ message: `${PROVIDER_LABELS[provider]} API key deleted.`, success: true })
      await loadKeys()
    } catch (err) {
      setFeedback(formatFeedbackError(err))
    }
  }

  return (
    <div data-testid="settings-page-api-keys">
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
              <div style={{ marginTop: 'var(--nous-space-sm)', fontFamily: 'var(--nous-font-family-mono)', fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-muted)' }}>
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
    </div>
  )
}
