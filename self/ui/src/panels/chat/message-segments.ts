// ---------------------------------------------------------------------------
// message-segments.ts — Segment splitter for mixed-content chat messages
// ---------------------------------------------------------------------------
// Splits a chat message into ordered text and card segments so that prose
// and card markup can be interleaved in a single assistant response.
// Uses getCardRegistry().list() for registry-driven tag detection.
// ---------------------------------------------------------------------------

import { getCardRegistry } from '../../components/chat/openui-adapter/registry'

/**
 * A segment of a chat message -- either prose text or card markup.
 */
export type MessageSegment =
  | { type: 'text'; content: string }
  | { type: 'card'; content: string }

const OPENUI_PREFIX = '%%openui\n'

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Find the end position of a card tag starting at `start` in `content`.
 * Handles self-closing tags (`/>`), matched close tags (`</TagName>`),
 * and falls back gracefully for malformed markup.
 */
export function findCardTagEnd(content: string, start: number, tagName: string): number {
  const fragment = content.slice(start)

  // Check for self-closing tag: <TagName ... />
  const selfCloseRegex = new RegExp(`^<${escapeRegex(tagName)}[^>]*/>`)
  const selfCloseMatch = fragment.match(selfCloseRegex)
  if (selfCloseMatch) {
    return start + selfCloseMatch[0].length
  }

  // Find matching closing tag: </TagName>
  const closeTag = `</${tagName}>`
  const closeIndex = content.indexOf(closeTag, start)
  if (closeIndex !== -1) {
    return closeIndex + closeTag.length
  }

  // No closing tag found -- best-effort: find > on this line
  const nextNewline = content.indexOf('\n', start)
  if (nextNewline !== -1) {
    const lineEnd = content.slice(start, nextNewline)
    const gtIndex = lineEnd.lastIndexOf('>')
    if (gtIndex !== -1) {
      return start + gtIndex + 1
    }
  }

  // Absolute fallback: consume to end of content
  return content.length
}

/**
 * Split a chat message into ordered text and card segments.
 *
 * - Strips legacy `%%openui\n` prefix before splitting.
 * - Queries `getCardRegistry().list()` for registered card tag names.
 * - Never throws. Malformed content falls through as text segments.
 *
 * @param content     The raw message content string.
 * @param registeredTags  Optional override for registered tag names (for testing).
 */
export function splitMessageSegments(
  content: string,
  registeredTags?: string[],
): MessageSegment[] {
  // 1. Guard: empty/null input
  if (!content || content.trim() === '') return []

  // 2. Strip legacy %%openui\n prefix
  let working = content
  if (working.startsWith(OPENUI_PREFIX)) {
    working = working.slice(OPENUI_PREFIX.length)
  }

  // 3. Get registered card tag names
  const cardNames = registeredTags ?? getCardRegistry().list()
  if (cardNames.length === 0) {
    return [{ type: 'text', content: working }]
  }

  // 4. Build regex to find card tag opening positions
  const tagNamesPattern = cardNames.map(escapeRegex).join('|')
  const openTagRegex = new RegExp(`<(${tagNamesPattern})(?=[\\s/>])`, 'g')

  // 5. Find all opening tag positions
  const tagStarts: number[] = []
  let match: RegExpExecArray | null
  while ((match = openTagRegex.exec(working)) !== null) {
    tagStarts.push(match.index)
  }

  // 6. No card tags found -- entire content is text
  if (tagStarts.length === 0) {
    return [{ type: 'text', content: working }]
  }

  // 7. Walk through content, splitting at tag boundaries
  const segments: MessageSegment[] = []
  let cursor = 0

  for (const tagStart of tagStarts) {
    // Skip if this position is inside a previously consumed card segment
    if (tagStart < cursor) continue

    // 7a. Text before this card tag
    if (tagStart > cursor) {
      const textContent = working.slice(cursor, tagStart)
      if (textContent.trim() !== '') {
        segments.push({ type: 'text', content: textContent })
      }
    }

    // 7b. Find the tag name at this position
    const tagNameMatch = working.slice(tagStart).match(/^<([A-Z][A-Za-z0-9]*)/)
    if (!tagNameMatch) {
      cursor = tagStart + 1
      continue
    }
    const tagName = tagNameMatch[1]

    // 7c. Find the end of this card element
    const tagEnd = findCardTagEnd(working, tagStart, tagName)

    // 7d. Extract card content
    const cardContent = working.slice(tagStart, tagEnd)
    segments.push({ type: 'card', content: cardContent })
    cursor = tagEnd
  }

  // 8. Text after the last card tag
  if (cursor < working.length) {
    const trailing = working.slice(cursor)
    if (trailing.trim() !== '') {
      segments.push({ type: 'text', content: trailing })
    }
  }

  // 9. If no segments produced (edge case), return entire content as text
  if (segments.length === 0) {
    return [{ type: 'text', content: working }]
  }

  return segments
}
