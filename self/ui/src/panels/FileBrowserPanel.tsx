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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#18181b', color: '#e4e4e7', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', fontSize: '13px' }}>
      {/* Path bar */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #3f3f46', display: 'flex', alignItems: 'center', gap: '8px', background: '#1c1c1f' }}>
        <button onClick={goUp} style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '2px 6px', borderRadius: '4px', fontSize: '14px' }}>↑</button>
        <span style={{ color: '#71717a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentPath}</span>
      </div>
      {/* File list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {!fsApi && <div style={{ padding: '16px', color: '#52525b', textAlign: 'center' }}>File system API not connected.</div>}
        {loading && <div style={{ padding: '16px', color: '#52525b', textAlign: 'center' }}>Loading...</div>}
        {!loading && entries.map(entry => (
          <div
            key={entry.path}
            onClick={() => {
              if (entry.isDirectory) { setCurrentPath(entry.path); setSelected(null) }
              else setSelected(entry.path)
            }}
            style={{
              padding: '5px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
              background: selected === entry.path ? '#2d2d30' : 'transparent',
              color: entry.isDirectory ? '#93c5fd' : '#e4e4e7',
            }}
            onMouseEnter={e => { if (selected !== entry.path) (e.currentTarget as HTMLElement).style.background = '#27272a' }}
            onMouseLeave={e => { if (selected !== entry.path) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <span style={{ fontSize: '12px', width: '16px', textAlign: 'center', flexShrink: 0 }}>
              {entry.isDirectory ? '📁' : '📄'}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
          </div>
        ))}
      </div>
      {/* Status bar */}
      {selected && (
        <div style={{ padding: '4px 12px', borderTop: '1px solid #3f3f46', color: '#71717a', fontSize: '11px', background: '#1c1c1f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected}
        </div>
      )}
    </div>
  )
}
