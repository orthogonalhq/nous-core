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

  it('has single Navigate section matching desktop', () => {
    expect(webRailSections.length).toBe(1)
    expect(webRailSections[0].id).toBe('main')
    expect(webRailSections[0].label).toBe('Navigate')
  })

  it('all expected item IDs present and match desktop', () => {
    const allItemIds = webRailSections.flatMap((s) => s.items.map((i) => i.id))
    const expectedIds = ['home', 'threads', 'workflows', 'skills', 'apps', 'settings']
    expect(allItemIds).toEqual(expectedIds)
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
})
