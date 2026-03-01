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
  params?: { fsApi?: FsAPI; initialPath?: string }
}

export function FileBrowserPanel({ params }: FileBrowserPanelProps) {
  const fsApi = params?.fsApi
  const [currentPath, setCurrentPath] = useState(params?.initialPath ?? '/')
  const [entries, setEntries] = useState<FsEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (!fsApi) return
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#1e1e1e', color: '#cccccc', fontSize: '13px' }}>
      {/* Path bar */}
      <div style={{ padding: '5px 8px', borderBottom: '1px solid #3c3c3c', display: 'flex', alignItems: 'center', gap: '6px', background: '#252526' }}>
        <button
          onClick={goUp}
          style={{ background: 'none', border: 'none', color: '#9d9d9d', cursor: 'pointer', padding: '2px 4px', borderRadius: '3px', display: 'flex', alignItems: 'center' }}
          title="Go up"
        >
          <i className="codicon codicon-arrow-up" style={{ fontSize: '13px' }} />
        </button>
        <span style={{ color: '#6a6a6a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>{currentPath}</span>
      </div>
      {/* File list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '2px 0' }}>
        {!fsApi && <div style={{ padding: '16px', color: '#6a6a6a', textAlign: 'center' }}>File system API not connected.</div>}
        {loading && <div style={{ padding: '16px', color: '#6a6a6a', textAlign: 'center' }}>Loading...</div>}
        {!loading && entries.map(entry => (
          <div
            key={entry.path}
            onClick={() => {
              if (entry.isDirectory) { setCurrentPath(entry.path); setSelected(null) }
              else setSelected(entry.path)
            }}
            style={{
              padding: '3px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
              background: selected === entry.path ? '#094771' : 'transparent',
              color: '#cccccc',
            }}
            onMouseEnter={e => { if (selected !== entry.path) (e.currentTarget as HTMLElement).style.background = '#2a2d2e' }}
            onMouseLeave={e => { if (selected !== entry.path) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <i
              className={`codicon ${entry.isDirectory ? 'codicon-folder' : 'codicon-file'}`}
              style={{ fontSize: '14px', flexShrink: 0, color: entry.isDirectory ? '#dcb67a' : '#9d9d9d' }}
            />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
          </div>
        ))}
      </div>
      {/* Status bar */}
      {selected && (
        <div style={{ padding: '3px 12px', borderTop: '1px solid #3c3c3c', color: '#6a6a6a', fontSize: '11px', background: '#252526', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected}
        </div>
      )}
    </div>
  )
}
