// ---------------------------------------------------------------------------
// parser.ts — Parse OpenUI-like markup into NousCardTree
// ---------------------------------------------------------------------------
// FALLBACK IMPLEMENTATION: @openuidev/react-lang v0.1.4 is not available on
// npm. This module implements a simple custom parser for the OpenUI-like
// markup syntax (XML-style tags with JSON-encoded props). The public API
// (parseCardContent) remains identical — when/if @openuidev packages become
// available, only this file needs to change.
//
// Expected markup format:
//   <StatusCard title="..." status="active" message="..." />
//   <ActionCard title="..." description="...">
//     ... nested content ...
//   </ActionCard>
//
// Props can be:
//   - Quoted strings: key="value"
//   - JSON values: key={42} or key={true} or key={["a","b"]}
//   - Object values: key={{ "nested": "object" }}
// ---------------------------------------------------------------------------

import type { NousCardElement, NousCardTree, NousParseResult } from './types'

/**
 * Parse a string containing OpenUI-like card markup into a NousCardTree.
 *
 * **Never throws.** Returns `{ ok: true, tree }` on success,
 * `{ ok: false, raw, error }` on any failure.
 */
export function parseCardContent(content: string): NousParseResult {
  try {
    if (content == null || typeof content !== 'string') {
      return { ok: false, raw: String(content ?? ''), error: 'Invalid input: expected string' }
    }

    const trimmed = content.trim()
    if (trimmed === '') {
      return { ok: false, raw: '', error: 'Empty content' }
    }

    const elements = parseElements(trimmed)
    if (elements.length === 0) {
      return { ok: false, raw: content, error: 'No card elements found in content' }
    }

    return { ok: true, tree: elements }
  } catch (err) {
    return {
      ok: false,
      raw: typeof content === 'string' ? content : '',
      error: err instanceof Error ? err.message : 'Unknown parse error',
    }
  }
}

// ---------------------------------------------------------------------------
// Internal parsing helpers
// ---------------------------------------------------------------------------

function parseElements(input: string): NousCardTree {
  const elements: NousCardTree = []
  let pos = 0

  while (pos < input.length) {
    // Skip whitespace
    while (pos < input.length && /\s/.test(input[pos])) pos++
    if (pos >= input.length) break

    if (input[pos] === '<') {
      // Check for closing tag — means we've hit a parent's end
      if (input[pos + 1] === '/') break

      const result = parseElement(input, pos)
      if (result) {
        elements.push(result.element)
        pos = result.end
      } else {
        // Cannot parse further; stop
        break
      }
    } else {
      // Text content — gather until next tag
      const textEnd = input.indexOf('<', pos)
      if (textEnd === -1) break
      pos = textEnd
    }
  }

  return elements
}

interface ParseElementResult {
  element: NousCardElement
  end: number
}

function parseElement(input: string, start: number): ParseElementResult | null {
  // Match opening tag: <TagName
  const tagMatch = input.slice(start).match(/^<([A-Z][A-Za-z0-9]*)/)
  if (!tagMatch) return null

  const tagName = tagMatch[1]
  let pos = start + tagMatch[0].length

  // Parse props
  const props: Record<string, unknown> = {}
  while (pos < input.length) {
    // Skip whitespace
    while (pos < input.length && /\s/.test(input[pos])) pos++
    if (pos >= input.length) return null

    // Self-closing tag: />
    if (input[pos] === '/' && input[pos + 1] === '>') {
      return {
        element: { type: tagName, props, children: [] },
        end: pos + 2,
      }
    }

    // End of opening tag: >
    if (input[pos] === '>') {
      pos++ // skip '>'
      break
    }

    // Parse prop: key="value" or key={value}
    const propResult = parseProp(input, pos)
    if (propResult) {
      props[propResult.key] = propResult.value
      pos = propResult.end
    } else {
      pos++ // skip unrecognized character
    }
  }

  // Parse children until closing tag
  const children: (NousCardElement | string)[] = []
  while (pos < input.length) {
    // Skip whitespace
    const wsStart = pos
    while (pos < input.length && /\s/.test(input[pos])) pos++

    // Check for closing tag
    const closeTag = `</${tagName}>`
    if (input.slice(pos).startsWith(closeTag)) {
      return {
        element: { type: tagName, props, children },
        end: pos + closeTag.length,
      }
    }

    if (pos >= input.length) break

    if (input[pos] === '<' && input[pos + 1] !== '/') {
      // Nested element
      const childResult = parseElement(input, pos)
      if (childResult) {
        children.push(childResult.element)
        pos = childResult.end
      } else {
        break
      }
    } else if (input[pos] === '<' && input[pos + 1] === '/') {
      // Closing tag (for this or parent element)
      if (input.slice(pos).startsWith(closeTag)) {
        return {
          element: { type: tagName, props, children },
          end: pos + closeTag.length,
        }
      }
      // Mismatched close tag — bail
      break
    } else {
      // Text content
      const textEnd = input.indexOf('<', pos)
      const text = textEnd === -1 ? input.slice(pos) : input.slice(pos, textEnd)
      if (text.trim()) {
        children.push(text.trim())
      }
      pos = textEnd === -1 ? input.length : textEnd
    }
  }

  // If we exit without finding closing tag, still return what we have
  return {
    element: { type: tagName, props, children },
    end: pos,
  }
}

interface PropResult {
  key: string
  value: unknown
  end: number
}

function parseProp(input: string, start: number): PropResult | null {
  // Match key=
  const keyMatch = input.slice(start).match(/^([a-zA-Z_][a-zA-Z0-9_]*)=/)
  if (!keyMatch) return null

  const key = keyMatch[1]
  let pos = start + keyMatch[0].length

  if (pos >= input.length) return null

  // String value: "..."
  if (input[pos] === '"') {
    pos++ // skip opening quote
    let value = ''
    while (pos < input.length && input[pos] !== '"') {
      if (input[pos] === '\\' && pos + 1 < input.length) {
        value += input[pos + 1]
        pos += 2
      } else {
        value += input[pos]
        pos++
      }
    }
    if (pos < input.length) pos++ // skip closing quote
    return { key, value, end: pos }
  }

  // JSX expression value: {...}
  if (input[pos] === '{') {
    const braceResult = extractBraceContent(input, pos)
    if (braceResult) {
      let parsed: unknown
      try {
        parsed = JSON.parse(braceResult.content)
      } catch {
        parsed = braceResult.content
      }
      return { key, value: parsed, end: braceResult.end }
    }
  }

  return null
}

interface BraceResult {
  content: string
  end: number
}

function extractBraceContent(input: string, start: number): BraceResult | null {
  if (input[start] !== '{') return null

  let depth = 0
  let pos = start

  while (pos < input.length) {
    if (input[pos] === '{') depth++
    else if (input[pos] === '}') {
      depth--
      if (depth === 0) {
        return {
          content: input.slice(start + 1, pos),
          end: pos + 1,
        }
      }
    } else if (input[pos] === '"') {
      // Skip string contents
      pos++
      while (pos < input.length && input[pos] !== '"') {
        if (input[pos] === '\\') pos++
        pos++
      }
    }
    pos++
  }

  return null
}
