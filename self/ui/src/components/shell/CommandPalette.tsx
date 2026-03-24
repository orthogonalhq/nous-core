'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { CommandPaletteProps, CommandItem, CommandGroup } from './types'

/** Internal match result for fuzzy search scoring and character highlighting */
interface MatchResult {
  item: CommandItem
  score: number
  matchIndices: number[]
}

/**
 * Fuzzy match: character-by-character matching of query against label.
 * Returns null if no match. Contiguous matches score higher (lower score = better).
 */
function fuzzyMatch(query: string, label: string): MatchResult | null {
  if (!query) return null

  const lowerQuery = query.toLowerCase()
  const lowerLabel = label.toLowerCase()
  const matchIndices: number[] = []
  let queryIdx = 0
  let gaps = 0
  let lastMatchIdx = -1

  for (let i = 0; i < lowerLabel.length && queryIdx < lowerQuery.length; i++) {
    if (lowerLabel[i] === lowerQuery[queryIdx]) {
      matchIndices.push(i)
      if (lastMatchIdx >= 0 && i > lastMatchIdx + 1) {
        gaps += i - lastMatchIdx - 1
      }
      lastMatchIdx = i
      queryIdx++
    }
  }

  if (queryIdx < lowerQuery.length) return null

  return {
    item: null as unknown as CommandItem, // filled by caller
    score: gaps,
    matchIndices,
  }
}

/**
 * Renders a command label with fuzzy match character highlighting.
 * Matched characters are wrapped in <mark> elements.
 */
function HighlightedLabel({
  label,
  matchIndices,
}: {
  label: string
  matchIndices: number[]
}) {
  if (matchIndices.length === 0) return <>{label}</>

  const indexSet = new Set(matchIndices)
  const segments: Array<{ text: string; highlighted: boolean }> = []
  let current = ''
  let currentHighlighted = false

  for (let i = 0; i < label.length; i++) {
    const isMatch = indexSet.has(i)
    if (i === 0) {
      current = label[i]
      currentHighlighted = isMatch
    } else if (isMatch === currentHighlighted) {
      current += label[i]
    } else {
      segments.push({ text: current, highlighted: currentHighlighted })
      current = label[i]
      currentHighlighted = isMatch
    }
  }
  if (current) {
    segments.push({ text: current, highlighted: currentHighlighted })
  }

  return (
    <>
      {segments.map((seg, idx) =>
        seg.highlighted ? (
          <mark
            key={idx}
            style={{
              background: 'transparent',
              color: 'var(--nous-palette-match-fg)',
              fontWeight: 600,
            }}
          >
            {seg.text}
          </mark>
        ) : (
          <span key={idx}>{seg.text}</span>
        ),
      )}
    </>
  )
}

/**
 * Controlled command palette overlay with fuzzy search, keyboard navigation,
 * grouped commands, and character-level match highlighting.
 *
 * Visibility is controlled externally via `isOpen`/`onClose` props.
 * Runtime-agnostic — no Electron imports, no IPC.
 */
export function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset state when closing
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('')
      setSelectedIndex(0)
    }
  }, [isOpen])

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      // Schedule to allow DOM to render
      const raf = requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
      return () => cancelAnimationFrame(raf)
    }
  }, [isOpen])

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [searchQuery])

  // Flatten all commands and apply fuzzy filter
  const { filteredGroups, flatFiltered } = useMemo(() => {
    if (!searchQuery.trim()) {
      const flat: Array<{ item: CommandItem; matchIndices: number[] }> = []
      for (const group of commands) {
        for (const cmd of group.commands) {
          flat.push({ item: cmd, matchIndices: [] })
        }
      }
      return {
        filteredGroups: commands,
        flatFiltered: flat,
      }
    }

    const matchedGroups: Array<CommandGroup & { matchData: Map<string, number[]> }> = []
    const flat: Array<{ item: CommandItem; matchIndices: number[] }> = []

    for (const group of commands) {
      const matchedCommands: CommandItem[] = []
      const matchData = new Map<string, number[]>()

      for (const cmd of group.commands) {
        const match = fuzzyMatch(searchQuery, cmd.label)
        if (match) {
          matchedCommands.push(cmd)
          matchData.set(cmd.id, match.matchIndices)
          flat.push({ item: cmd, matchIndices: match.matchIndices })
        }
      }

      if (matchedCommands.length > 0) {
        matchedGroups.push({
          ...group,
          commands: matchedCommands,
          matchData,
        })
      }
    }

    return {
      filteredGroups: matchedGroups,
      flatFiltered: flat,
    }
  }, [commands, searchQuery])

  // Find match indices for a given command ID
  const getMatchIndices = useCallback(
    (cmdId: string): number[] => {
      const entry = flatFiltered.find((f) => f.item.id === cmdId)
      return entry?.matchIndices ?? []
    },
    [flatFiltered],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault()
          if (flatFiltered.length > 0) {
            setSelectedIndex((prev) => (prev + 1) % flatFiltered.length)
          }
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          if (flatFiltered.length > 0) {
            setSelectedIndex((prev) =>
              prev <= 0 ? flatFiltered.length - 1 : prev - 1,
            )
          }
          break
        }
        case 'Enter': {
          e.preventDefault()
          if (flatFiltered.length > 0 && selectedIndex < flatFiltered.length) {
            const selected = flatFiltered[selectedIndex]
            try {
              selected.item.action()
            } catch {
              // action errors do not prevent palette close
            } finally {
              onClose()
            }
          }
          break
        }
        case 'Escape': {
          e.preventDefault()
          onClose()
          break
        }
      }
    },
    [flatFiltered, selectedIndex, onClose],
  )

  if (!isOpen) return null

  let flatIdx = 0

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="command-palette-backdrop"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 'var(--nous-z-overlay)' as unknown as number,
          background: 'var(--nous-overlay-bg)',
          backdropFilter: 'blur(var(--nous-blur-md))',
          WebkitBackdropFilter: 'blur(var(--nous-blur-md))',
        }}
      />

      {/* Palette container */}
      <div
        role="dialog"
        aria-label="Command palette"
        className="nous-animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        style={{
          position: 'fixed',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: '560px',
          zIndex: 'var(--nous-z-modal)' as unknown as number,
          background: 'var(--nous-palette-bg)',
          border: '1px solid var(--nous-palette-border)',
          borderRadius: 'var(--nous-radius-lg)',
          boxShadow: 'var(--nous-palette-shadow)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          maxHeight: '60vh',
        }}
      >
        {/* Search input */}
        <div
          style={{
            padding: 'var(--nous-space-lg)',
            borderBottom: '1px solid var(--nous-palette-border)',
          }}
        >
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search commands"
            style={{
              width: '100%',
              background: 'var(--nous-input-bg)',
              border: '1px solid var(--nous-input-border)',
              borderRadius: 'var(--nous-input-radius)',
              padding: 'var(--nous-space-sm) var(--nous-space-md)',
              color: 'var(--nous-input-fg)',
              fontSize: 'var(--nous-font-size-base)',
              fontFamily: 'inherit',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Results */}
        <div
          style={{
            overflowY: 'auto',
            flex: 1,
          }}
        >
          {flatFiltered.length === 0 ? (
            <div
              role="status"
              style={{
                padding: 'var(--nous-space-2xl)',
                textAlign: 'center',
                color: 'var(--nous-fg-muted)',
                fontSize: 'var(--nous-font-size-base)',
              }}
            >
              No commands found
            </div>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.id} role="group" aria-label={group.label}>
                {/* Group header */}
                <div
                  style={{
                    padding:
                      'var(--nous-space-sm) var(--nous-space-lg)',
                    fontSize: 'var(--nous-font-size-xs)',
                    color: 'var(--nous-fg-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {group.label}
                </div>

                {/* Commands */}
                {group.commands.map((cmd) => {
                  const currentFlatIdx = flatIdx++
                  const isSelected = currentFlatIdx === selectedIndex
                  const matchIndices = getMatchIndices(cmd.id)

                  return (
                    <div
                      key={cmd.id}
                      role="option"
                      aria-selected={isSelected}
                      data-testid={`command-item-${cmd.id}`}
                      onClick={() => {
                        try {
                          cmd.action()
                        } catch {
                          // action errors do not prevent palette close
                        } finally {
                          onClose()
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding:
                          'var(--nous-space-sm) var(--nous-space-lg)',
                        cursor: 'pointer',
                        background: isSelected
                          ? 'var(--nous-palette-item-hover)'
                          : 'transparent',
                        color: 'var(--nous-fg)',
                        fontSize: 'var(--nous-font-size-base)',
                      }}
                    >
                      <span>
                        <HighlightedLabel
                          label={cmd.label}
                          matchIndices={matchIndices}
                        />
                      </span>
                      {cmd.shortcut ? (
                        <span
                          style={{
                            fontSize: 'var(--nous-font-size-xs)',
                            color: 'var(--nous-fg-muted)',
                            marginLeft: 'var(--nous-space-lg)',
                          }}
                        >
                          {cmd.shortcut}
                        </span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
