'use client'

import { useState, useEffect } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'

interface FsEntry {
  name: string
  isDirectory: boolean
  path: string
}

interface FsAPI {
  readDir: (path: string) => Promise<FsEntry[]>
}

interface FileBrowserPanelProps extends IDockviewPanelProps {
  params: { fsApi?: FsAPI; initialPath?: string }
}

export function FileBrowserPanel({ params }: FileBrowserPanelProps) {
  const fsApi = params?.fsApi
  const [currentPath, setCurrentPath] = useState(params?.initialPath ?? '/')
  const [entries, setEntries] = useState<FsEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (!fsApi?.readDir) return
    setLoading(true)
    fsApi.readDir(currentPath).then(result => {
      setEntries(result.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      }))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [currentPath, fsApi])

  const goUp = () => {
    const parts = currentPath.replace(/\\/g, '/').split('/').filter(Boolean)
    if (parts.length === 0) return
    parts.pop()
    setCurrentPath('/' + parts.join('/') || '/')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', color: 'var(--nous-fg)', fontSize: 'var(--nous-font-size-base)' }}>
      {/* Path bar */}
      <div style={{ padding: 'var(--nous-space-sm) var(--nous-space-md)', borderBottom: '1px solid var(--nous-border)', display: 'flex', alignItems: 'center', gap: 'var(--nous-space-sm)', background: 'var(--nous-bg-elevated)' }}>
        <button
          onClick={goUp}
          style={{ background: 'none', border: 'none', color: 'var(--nous-fg-muted)', cursor: 'pointer', padding: 'var(--nous-space-2xs) var(--nous-space-xs)', borderRadius: 'var(--nous-radius-sm)', display: 'flex', alignItems: 'center' }}
          title="Go up"
        >
          <i className="codicon codicon-arrow-up" style={{ fontSize: 'var(--nous-font-size-base)' }} />
        </button>
        <span style={{ color: 'var(--nous-fg-subtle)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--nous-font-size-sm)' }}>{currentPath}</span>
      </div>
      {/* File list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--nous-space-2xs) 0' }}>
        {!fsApi && <div style={{ padding: 'var(--nous-space-2xl)', color: 'var(--nous-fg-subtle)', textAlign: 'center' }}>File system API not connected.</div>}
        {loading && <div style={{ padding: 'var(--nous-space-2xl)', color: 'var(--nous-fg-subtle)', textAlign: 'center' }}>Loading...</div>}
        {!loading && entries.map(entry => (
          <div
            key={entry.path}
            onClick={() => {
              if (entry.isDirectory) { setCurrentPath(entry.path); setSelected(null) }
              else setSelected(entry.path)
            }}
            style={{
              padding: 'var(--nous-space-2xs) var(--nous-space-xl)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--nous-space-sm)',
              background: selected === entry.path ? 'var(--nous-selection)' : 'transparent',
              color: 'var(--nous-fg)',
            }}
            onMouseEnter={e => { if (selected !== entry.path) (e.currentTarget as HTMLElement).style.background = 'var(--nous-bg-hover)' }}
            onMouseLeave={e => { if (selected !== entry.path) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <i
              className={`codicon ${entry.isDirectory ? 'codicon-folder' : 'codicon-file'}`}
              style={{ fontSize: 'var(--nous-icon-size-sm)', flexShrink: 0, color: entry.isDirectory ? 'var(--nous-icon-folder)' : 'var(--nous-fg-muted)' }}
            />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
          </div>
        ))}
      </div>
      {/* Status bar */}
      {selected && (
        <div style={{ padding: 'var(--nous-space-2xs) var(--nous-space-xl)', borderTop: '1px solid var(--nous-border)', color: 'var(--nous-fg-subtle)', fontSize: 'var(--nous-font-size-xs)', background: 'var(--nous-bg-elevated)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected}
        </div>
      )}
    </div>
  )
}
