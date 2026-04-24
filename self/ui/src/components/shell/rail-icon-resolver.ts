import type { ComponentType } from 'react'
import * as Lucide from 'lucide-react'

const LUCIDE_PREFIX = 'lucide:'
const EMOJI_PREFIX = 'emoji:'

export type ResolvedIcon =
  | {
      kind: 'lucide'
      Component: ComponentType<{ size?: number | string; color?: string }>
    }
  | { kind: 'emoji'; glyph: string }
  | { kind: 'fallback' }

/**
 * Resolve a `ProjectItem.icon` string into a render plan for the rail.
 *
 * Discriminator contract (SDS § Rail icon rendering dispatch):
 *  - `lucide:<PascalCaseName>` -> named lucide-react icon component.
 *  - `emoji:<glyph>`           -> single-grapheme emoji rendering.
 *  - anything else (undefined, malformed, unknown lucide name) -> fallback
 *    (initial-letter rendering handled by the caller).
 *
 * INV-4: the fallback branch is total — every unresolved input falls here,
 * so the rail always renders some avatar for every project.
 */
export function resolveRailIcon(icon: string | undefined): ResolvedIcon {
  if (!icon) return { kind: 'fallback' }

  if (icon.startsWith(LUCIDE_PREFIX)) {
    const name = icon.slice(LUCIDE_PREFIX.length)
    if (!name) return { kind: 'fallback' }
    const maybe = (Lucide as unknown as Record<string, unknown>)[name]
    // lucide-react exports icons as forwardRef components; they register as
    // `object` after being wrapped by React.forwardRef, but may surface as
    // `function` in some bundler outputs. Accept both.
    if (typeof maybe === 'function' || (typeof maybe === 'object' && maybe !== null)) {
      return {
        kind: 'lucide',
        Component: maybe as ComponentType<{ size?: number | string; color?: string }>,
      }
    }
    return { kind: 'fallback' }
  }

  if (icon.startsWith(EMOJI_PREFIX)) {
    const glyph = icon.slice(EMOJI_PREFIX.length)
    if (glyph.length === 0) return { kind: 'fallback' }
    return { kind: 'emoji', glyph }
  }

  return { kind: 'fallback' }
}
