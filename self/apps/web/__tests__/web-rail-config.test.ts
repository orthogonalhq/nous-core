import { describe, it, expect } from 'vitest'
import { webRailSections } from '@/components/shell/web-rail-config'

describe('webRailSections', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(webRailSections)).toBe(true)
    expect(webRailSections.length).toBeGreaterThan(0)
  })

  it('each section has required fields: id, label, items', () => {
    for (const section of webRailSections) {
      expect(typeof section.id).toBe('string')
      expect(section.id.length).toBeGreaterThan(0)
      expect(typeof section.label).toBe('string')
      expect(section.label.length).toBeGreaterThan(0)
      expect(Array.isArray(section.items)).toBe(true)
      expect(section.items.length).toBeGreaterThan(0)
    }
  })

  it('Main, Discover, System sections exist', () => {
    const sectionIds = webRailSections.map((s) => s.id)
    expect(sectionIds).toContain('main')
    expect(sectionIds).toContain('discover')
    expect(sectionIds).toContain('system')
  })

  it('all expected item IDs present', () => {
    const allItemIds = webRailSections.flatMap((s) => s.items.map((i) => i.id))
    const expectedIds = ['home', 'chat', 'projects', 'mao', 'marketplace', 'traces', 'memory', 'config', 'settings']
    for (const id of expectedIds) {
      expect(allItemIds).toContain(id)
    }
  })

  it('each item has required fields: id, label, icon', () => {
    for (const section of webRailSections) {
      for (const item of section.items) {
        expect(typeof item.id).toBe('string')
        expect(item.id.length).toBeGreaterThan(0)
        expect(typeof item.label).toBe('string')
        expect(item.label.length).toBeGreaterThan(0)
        expect(item.icon).toBeDefined()
      }
    }
  })

  it('System section is collapsible', () => {
    const system = webRailSections.find((s) => s.id === 'system')
    expect(system?.collapsible).toBe(true)
  })
})
