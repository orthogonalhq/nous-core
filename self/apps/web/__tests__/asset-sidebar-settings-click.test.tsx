// @vitest-environment jsdom

/**
 * Phase 1.3 — Web AssetSidebar.onSettingsClick wiring (Goals C4).
 *
 * Captures `onSettingsClick` on the web `AssetSidebar` composition and
 * asserts it routes to the `settings` route when invoked.
 */
import * as React from 'react';
import { cleanup, render, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let capturedSidebarProps: Record<string, unknown> = {};
const navigateSpy = vi.fn();

const mocks = vi.hoisted(() => ({
  projectsListUseQuery: vi.fn(),
  projectsListArchivedUseQuery: vi.fn(),
  projectsArchiveUseMutation: vi.fn(),
  projectsUnarchiveUseMutation: vi.fn(),
  projectsCreateUseMutation: vi.fn(),
  useUtils: vi.fn(),
}));

vi.mock('@nous/ui/components', async () => {
  const actual = await vi.importActual<any>('@nous/ui/components');
  return {
    ...actual,
    ShellProvider: (props: any) => React.createElement(React.Fragment, null, props.children),
    SimpleShellLayout: (props: any) =>
      React.createElement('div', null, props.projectRail, props.sidebar, props.content),
    ProjectSwitcherRail: () => null,
    AssetSidebar: (props: any) => {
      capturedSidebarProps = props;
      return React.createElement('div', { 'data-testid': 'asset-sidebar' });
    },
    CommandPalette: () => null,
    ContentRouter: () => null,
    ObservePanel: () => null,
    isHomeSidebarEnabled: () => false,
    HOME_TOP_NAV: [],
    buildHomeSidebarSections: () => [],
    NotificationProvider: (props: any) => React.createElement(React.Fragment, null, props.children),
    useNotificationBadge: () => 0,
    useChatStageManager: () => ({
      chatStage: 'small',
      isPinned: false,
      signalSending: vi.fn(),
      signalInferenceStart: vi.fn(),
      signalPfcDecision: vi.fn(),
      signalTurnComplete: vi.fn(),
      signalUnreadMessage: vi.fn(),
      signalMessagesRead: vi.fn(),
      expandToAmbientLarge: vi.fn(),
      expandToFull: vi.fn(),
      collapseToAmbientSmall: vi.fn(),
      minimizeToAmbientLarge: vi.fn(),
      collapseToSmall: vi.fn(),
      handleClickOutside: vi.fn(),
      togglePin: vi.fn(),
      signalInputFocus: vi.fn(),
    }),
    useLayoutState: () => ({ state: { sidebarCollapsed: false }, setState: vi.fn(), hydrated: true }),
    // The WebAssetSidebarConnected reads navigate from useShellContext.
    useShellContext: () => ({
      activeProjectId: 'proj-1',
      activeRoute: 'home',
      mode: 'simple',
      breakpoint: 'full',
      navigation: { activeRoute: 'home', history: ['home'], canGoBack: false },
      conversation: { tier: 'transient', threadId: null, projectId: 'proj-1', isAmbient: false },
      navigate: navigateSpy,
      goBack: vi.fn(),
    }),
    useArchiveFlow: () => ({ archive: vi.fn(), unarchive: vi.fn(), isRunning: false }),
  };
});

vi.mock('@nous/transport', () => ({
  useEventSubscription: vi.fn(),
  useChatApi: vi.fn(() => ({ send: vi.fn(), getHistory: vi.fn().mockResolvedValue([]) })),
  trpc: {
    projects: {
      list: { useQuery: mocks.projectsListUseQuery },
      listArchived: { useQuery: mocks.projectsListArchivedUseQuery },
      archive: { useMutation: mocks.projectsArchiveUseMutation },
      unarchive: { useMutation: mocks.projectsUnarchiveUseMutation },
      create: { useMutation: mocks.projectsCreateUseMutation },
    },
    useUtils: mocks.useUtils,
  },
}));

vi.mock('@nous/ui/hooks/useTasks', () => ({
  useTasks: () => ({ tasks: [], tasksLoading: false, tasksError: null }),
  buildTasksSection: () => ({ id: 'tasks', label: 'TASKS', items: [], collapsible: true }),
}));

vi.mock('@/components/shell/web-chrome-shell', () => ({
  WebChromeShell: (props: any) => React.createElement('div', null, props.children),
}));

vi.mock('@/components/shell/web-rail-config', () => ({ webRailSections: [] }));
vi.mock('@/components/shell/web-shell-routes', () => ({ createWebShellRoutes: () => ({}) }));
vi.mock('@/components/shell/web-command-config', () => ({ buildWebCommands: () => [] }));
vi.mock('@/components/shell/web-sidebar-config', () => ({
  WEB_TOP_NAV: [],
  buildWebSidebarSections: () => [],
}));
vi.mock('@/components/shell/web-chat-wrappers', () => ({ WebConnectedChatSurface: () => null }));
vi.mock('@/components/shell/web-panel-defs', () => ({ WEB_PANEL_DEFS: [] }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

vi.mock('next/dynamic', () => ({ default: () => () => null }));

import ShellLayout from '@/app/(shell)/layout';

describe('Phase 1.3 — web AssetSidebar.onSettingsClick wiring (Goals C4)', () => {
  beforeEach(() => {
    capturedSidebarProps = {};
    navigateSpy.mockReset();
    mocks.projectsListUseQuery.mockReturnValue({
      data: [{ id: 'proj-1', name: 'Alpha' }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.projectsListArchivedUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });
    mocks.projectsArchiveUseMutation.mockReturnValue({ mutateAsync: vi.fn() });
    mocks.projectsUnarchiveUseMutation.mockReturnValue({ mutateAsync: vi.fn() });
    mocks.projectsCreateUseMutation.mockReturnValue({ mutateAsync: vi.fn() });
    mocks.useUtils.mockReturnValue({
      projects: {
        list: { invalidate: vi.fn() },
        listArchived: { invalidate: vi.fn() },
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('clicking settings-gear invokes navigate("settings")', async () => {
    await act(async () => {
      render(<ShellLayout>{null}</ShellLayout>);
    });

    const onSettingsClick = capturedSidebarProps.onSettingsClick as (() => void) | undefined;
    expect(typeof onSettingsClick).toBe('function');
    onSettingsClick?.();
    expect(navigateSpy).toHaveBeenCalledWith('settings');
  });
});
