import { describe, expect, it } from 'vitest';
import {
  ContentPayloadSchema,
  DEFAULT_LOCAL_USER_ID,
  FocusPayloadSchema,
  LayoutPayloadSchema,
  NavigationPayloadSchema,
  VIEW_STATE_COLLECTION,
  ViewStateClassSchema,
  ViewStateDocumentSchema,
  ViewStateGetInputSchema,
  ViewStateSetInputSchema,
  viewStateDocumentKey,
} from '../../types/view-state.js';

const NOW = '2026-04-18T00:00:00.000Z';

describe('ViewStateClassSchema', () => {
  it('accepts the four canonical classes', () => {
    for (const cls of ['layout', 'navigation', 'focus', 'content'] as const) {
      expect(ViewStateClassSchema.safeParse(cls).success).toBe(true);
    }
  });

  it('rejects unknown classes', () => {
    expect(ViewStateClassSchema.safeParse('settings').success).toBe(false);
  });
});

describe('LayoutPayloadSchema', () => {
  it('accepts empty payload (all fields optional)', () => {
    expect(LayoutPayloadSchema.safeParse({}).success).toBe(true);
  });

  it('accepts sidebarCollapsed boolean', () => {
    expect(
      LayoutPayloadSchema.safeParse({ sidebarCollapsed: true }).success,
    ).toBe(true);
  });

  it('accepts settingsNavExpandedCategories array', () => {
    expect(
      LayoutPayloadSchema.safeParse({
        settingsNavExpandedCategories: ['models', 'budget'],
      }).success,
    ).toBe(true);
  });

  it('passthrough allows future unknown keys', () => {
    const result = LayoutPayloadSchema.safeParse({
      sidebarCollapsed: false,
      futureFeature: { nested: true },
    });
    expect(result.success).toBe(true);
  });
});

describe('NavigationPayloadSchema', () => {
  it('accepts empty payload', () => {
    expect(NavigationPayloadSchema.safeParse({}).success).toBe(true);
  });

  it('accepts documented fields', () => {
    const result = NavigationPayloadSchema.safeParse({
      activeRoute: '/chat',
      navigationHistory: ['/home', '/chat'],
      navigationParams: { open: true },
    });
    expect(result.success).toBe(true);
  });
});

describe('FocusPayloadSchema', () => {
  it('accepts documented fields', () => {
    expect(
      FocusPayloadSchema.safeParse({
        sidebarSelection: 'task-123',
        panelFocus: 'chat',
      }).success,
    ).toBe(true);
  });
});

describe('ContentPayloadSchema', () => {
  it('accepts arbitrary records', () => {
    expect(
      ContentPayloadSchema.safeParse({
        chat: { draft: 'hello' },
        settings: { unsaved: true },
      }).success,
    ).toBe(true);
  });
});

describe('ViewStateDocumentSchema (envelope)', () => {
  const baseLayout = {
    userId: DEFAULT_LOCAL_USER_ID,
    projectId: 'project-1',
    class: 'layout' as const,
    payload: { sidebarCollapsed: true },
    updatedAt: NOW,
  };

  it('accepts a valid layout envelope', () => {
    expect(ViewStateDocumentSchema.safeParse(baseLayout).success).toBe(true);
  });

  it('rejects unknown envelope top-level fields (.strict())', () => {
    const result = ViewStateDocumentSchema.safeParse({
      ...baseLayout,
      attacker: 'extra',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing required envelope fields', () => {
    const { updatedAt: _u, ...missing } = baseLayout;
    expect(ViewStateDocumentSchema.safeParse(missing).success).toBe(false);
  });

  it('rejects non-ISO updatedAt', () => {
    expect(
      ViewStateDocumentSchema.safeParse({
        ...baseLayout,
        updatedAt: 'not-a-date',
      }).success,
    ).toBe(false);
  });

  it('discriminates payload shape by class — content accepts arbitrary record', () => {
    expect(
      ViewStateDocumentSchema.safeParse({
        userId: DEFAULT_LOCAL_USER_ID,
        projectId: 'p1',
        class: 'content',
        payload: { chat: { anything: 'here' } },
        updatedAt: NOW,
      }).success,
    ).toBe(true);
  });

  it('rejects non-object layout payload (discriminated-union structural check)', () => {
    expect(
      ViewStateDocumentSchema.safeParse({
        ...baseLayout,
        payload: 'not-an-object',
      }).success,
    ).toBe(false);
  });
});

describe('ViewStateGetInputSchema', () => {
  it('accepts a well-formed input', () => {
    expect(
      ViewStateGetInputSchema.safeParse({
        projectId: 'p1',
        class: 'layout',
      }).success,
    ).toBe(true);
  });

  it('rejects any userId field structurally (.strict())', () => {
    const result = ViewStateGetInputSchema.safeParse({
      projectId: 'p1',
      class: 'layout',
      userId: 'attacker',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty projectId', () => {
    expect(
      ViewStateGetInputSchema.safeParse({ projectId: '', class: 'layout' })
        .success,
    ).toBe(false);
  });
});

describe('ViewStateSetInputSchema', () => {
  it('accepts a layout set with valid payload', () => {
    expect(
      ViewStateSetInputSchema.safeParse({
        class: 'layout',
        projectId: 'p1',
        payload: { sidebarCollapsed: true },
        updatedAt: NOW,
      }).success,
    ).toBe(true);
  });

  it('rejects a layout set with non-object payload', () => {
    expect(
      ViewStateSetInputSchema.safeParse({
        class: 'layout',
        projectId: 'p1',
        payload: 'nope',
        updatedAt: NOW,
      }).success,
    ).toBe(false);
  });

  it('rejects a set with an injected userId', () => {
    const result = ViewStateSetInputSchema.safeParse({
      class: 'layout',
      projectId: 'p1',
      payload: {},
      updatedAt: NOW,
      userId: 'attacker',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown class literal', () => {
    expect(
      ViewStateSetInputSchema.safeParse({
        class: 'settings',
        projectId: 'p1',
        payload: {},
        updatedAt: NOW,
      }).success,
    ).toBe(false);
  });
});

describe('viewStateDocumentKey and constants', () => {
  it('returns the documented ${userId}:${projectId}:${class} format', () => {
    expect(viewStateDocumentKey('local', 'p1', 'layout')).toBe(
      'local:p1:layout',
    );
  });

  it('VIEW_STATE_COLLECTION is the literal "view_state"', () => {
    expect(VIEW_STATE_COLLECTION).toBe('view_state');
  });

  it('DEFAULT_LOCAL_USER_ID is the literal "local"', () => {
    expect(DEFAULT_LOCAL_USER_ID).toBe('local');
  });
});
