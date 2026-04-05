import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { splitMessageSegments } from '../chat/message-segments'
import { registerNousCard, _clearRegistry } from '../../components/chat/openui-adapter/registry'
import type { NousCardDefinition } from '../../components/chat/openui-adapter/types'
import { z } from 'zod'

// Minimal card definition for testing — the splitter only uses registry.list()
function makeCardDef(name: string): NousCardDefinition {
  return {
    name,
    description: `${name} test definition`,
    propsSchema: z.object({}) as z.ZodType<unknown>,
    renderer: (() => null) as unknown as NousCardDefinition['renderer'],
  }
}

describe('splitMessageSegments', () => {
  beforeEach(() => {
    registerNousCard(makeCardDef('StatusCard'))
    registerNousCard(makeCardDef('ActionCard'))
    registerNousCard(makeCardDef('ApprovalCard'))
    registerNousCard(makeCardDef('WorkflowCard'))
    registerNousCard(makeCardDef('FollowUpBlock'))
  })

  afterEach(() => {
    _clearRegistry()
  })

  // ---------------------------------------------------------------------------
  // 1. Text-only input
  // ---------------------------------------------------------------------------
  it('text-only input returns single text segment', () => {
    const result = splitMessageSegments('Hello world')
    expect(result).toEqual([{ type: 'text', content: 'Hello world' }])
  })

  // ---------------------------------------------------------------------------
  // 2. Card-only input (self-closing)
  // ---------------------------------------------------------------------------
  it('card-only input (self-closing) returns single card segment', () => {
    const input = '<StatusCard title="Test" status="active" description="Hello" />'
    const result = splitMessageSegments(input)
    expect(result).toEqual([{ type: 'card', content: input }])
  })

  // ---------------------------------------------------------------------------
  // 3. Card-only input (open/close)
  // ---------------------------------------------------------------------------
  it('card-only input (open/close tags) returns single card segment', () => {
    const input = '<ActionCard title="Act" description="Do">Some content</ActionCard>'
    const result = splitMessageSegments(input)
    expect(result).toEqual([{ type: 'card', content: input }])
  })

  // ---------------------------------------------------------------------------
  // 4. Mixed text + card
  // ---------------------------------------------------------------------------
  it('mixed text + card returns 3 segments', () => {
    const input = 'Hello\n<StatusCard title="Test" status="active" description="Hi" />\nGoodbye'
    const result = splitMessageSegments(input)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ type: 'text', content: 'Hello\n' })
    expect(result[1]).toEqual({
      type: 'card',
      content: '<StatusCard title="Test" status="active" description="Hi" />',
    })
    expect(result[2]).toEqual({ type: 'text', content: '\nGoodbye' })
  })

  // ---------------------------------------------------------------------------
  // 5. Multiple cards with text
  // ---------------------------------------------------------------------------
  it('multiple cards with text between returns 5 segments', () => {
    const input =
      'A\n<StatusCard title="S" status="active" description="M" />\nB\n<FollowUpBlock suggestions={[{"label":"Go"}]} />\nC'
    const result = splitMessageSegments(input)
    expect(result).toHaveLength(5)
    expect(result[0].type).toBe('text')
    expect(result[1].type).toBe('card')
    expect(result[2].type).toBe('text')
    expect(result[3].type).toBe('card')
    expect(result[4].type).toBe('text')
  })

  // ---------------------------------------------------------------------------
  // 6. Adjacent cards (no text between)
  // ---------------------------------------------------------------------------
  it('adjacent cards with only whitespace between returns 2 card segments', () => {
    const input =
      '<StatusCard title="S" status="active" description="M" />\n<FollowUpBlock suggestions={[{"label":"Go"}]} />'
    const result = splitMessageSegments(input)
    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('card')
    expect(result[1].type).toBe('card')
  })

  // ---------------------------------------------------------------------------
  // 7. %%openui\n prefix stripped
  // ---------------------------------------------------------------------------
  it('strips %%openui\\n prefix before splitting', () => {
    const input = '%%openui\n<StatusCard title="Test" status="active" description="Hello" />'
    const result = splitMessageSegments(input)
    expect(result).toEqual([
      {
        type: 'card',
        content: '<StatusCard title="Test" status="active" description="Hello" />',
      },
    ])
  })

  // ---------------------------------------------------------------------------
  // 8. Malformed XML (unclosed tag) — does not throw
  // ---------------------------------------------------------------------------
  it('malformed XML (unclosed tag) does not throw', () => {
    const input = '<StatusCard title="test"'
    expect(() => splitMessageSegments(input)).not.toThrow()
    const result = splitMessageSegments(input)
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  // ---------------------------------------------------------------------------
  // 9. Empty string
  // ---------------------------------------------------------------------------
  it('empty string returns empty array', () => {
    expect(splitMessageSegments('')).toEqual([])
  })

  // ---------------------------------------------------------------------------
  // 10. Unregistered tag not treated as card
  // ---------------------------------------------------------------------------
  it('unregistered tag is not treated as a card segment', () => {
    const input = '<CustomWidget title="x" />'
    const result = splitMessageSegments(input)
    expect(result).toEqual([{ type: 'text', content: '<CustomWidget title="x" />' }])
  })

  // ---------------------------------------------------------------------------
  // 11. Self-closing ApprovalCard
  // ---------------------------------------------------------------------------
  it('self-closing ApprovalCard returns single card segment', () => {
    const input = '<ApprovalCard title="Approve" tier="t1" command="deploy" />'
    const result = splitMessageSegments(input)
    expect(result).toEqual([{ type: 'card', content: input }])
  })

  // ---------------------------------------------------------------------------
  // 12. Prefix + mixed content
  // ---------------------------------------------------------------------------
  it('%%openui\\n prefix + mixed content strips prefix and splits correctly', () => {
    const input =
      '%%openui\nHello\n<StatusCard title="Test" status="active" description="Hi" />'
    const result = splitMessageSegments(input)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ type: 'text', content: 'Hello\n' })
    expect(result[1]).toEqual({
      type: 'card',
      content: '<StatusCard title="Test" status="active" description="Hi" />',
    })
  })

  // ---------------------------------------------------------------------------
  // 13. Whitespace-only input
  // ---------------------------------------------------------------------------
  it('whitespace-only input returns empty array', () => {
    expect(splitMessageSegments('   \n  ')).toEqual([])
  })

  // ---------------------------------------------------------------------------
  // 14. Null/undefined guard (via empty check)
  // ---------------------------------------------------------------------------
  it('null-ish input returns empty array', () => {
    expect(splitMessageSegments(null as unknown as string)).toEqual([])
    expect(splitMessageSegments(undefined as unknown as string)).toEqual([])
  })
})
