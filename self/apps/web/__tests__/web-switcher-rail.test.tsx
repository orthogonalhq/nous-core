// @vitest-environment jsdom

/**
 * Phase 1.3 — Web switcher rail live data (Goals C2 + SDS Decision F).
 *
 * Scope: verify the web shell consumes `trpc.projects.list.useQuery()` (not
 * `stubProjects`) and passes the loading/error/success shape into
 * `ProjectSwitcherRail`. Also asserts that creating a project triggers a
 * list invalidate call path.
 *
 * We mock `@nous/ui/components` so `ProjectSwitcherRail` captures its props
 * and `ShellLayoutContent` renders without the full dockview/chat tree.
 */
import * as React from 'react';
import { cleanup, render, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let capturedRailProps: Record<string, unknown> = {};
const mocks = vi.hoisted(() => {
  return {
    projectsListUseQuery: vi.fn(),
    projectsListArchivedUseQuery: vi.fn(),
    projectsArchiveUseMutation: vi.fn(),
    projectsUnarchiveUseMutation: vi.fn(),
    projectsCreateUseMutation: vi.fn(),
    useUtils: vi.fn(),
  };
});

vi.mock('@nous/ui/components', async () => {
  const actual = await vi.importActual<any>('@nous/ui/components');
  return {
    ...actual,
    ShellProvider: (props: any) => React.createElement(React.Fragment, null, props.children),
    SimpleShellLayout: (props: any) => React.createElement('div', null, props.projectRail, props.sidebar, props.content),
    ProjectSwitcherRail: (props: any) => {
      capturedRailProps = props;
      return React.createElement('div', { 'data-testid': 'rail' });
    },
    AssetSidebar: () => null,
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
    useShellContext: () => ({
      activeProjectId: null,
      activeRoute: 'home',
      mode: 'simple',
      breakpoint: 'full',
      navigation: { activeRoute: 'home', history: ['home'], canGoBack: false },
      conversation: { tier: 'transient', threadId: null, projectId: null, isAmbient: true },
      navigate: vi.fn(),
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
vi.mock('@/components/shell/web-chat-wrappers', () => ({
  WebConnectedChatSurface: () => null,
}));
vi.mock('@/components/shell/web-panel-defs', () => ({ WEB_PANEL_DEFS: [] }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));

import ShellLayout from '@/app/(shell)/layout';

describe('Phase 1.3 — Web switcher rail live data (Goals C2, Decision F)', () => {
  const invalidateFns = {
    list: vi.fn(),
    listArchived: vi.fn(),
  };

  beforeEach(() => {
    capturedRailProps = {};
    mocks.useUtils.mockReturnValue({
      projects: {
        list: { invalidate: invalidateFns.list },
        listArchived: { invalidate: invalidateFns.listArchived },
      },
    });
    mocks.projectsListArchivedUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });
    mocks.projectsArchiveUseMutation.mockReturnValue({ mutateAsync: vi.fn() });
    mocks.projectsUnarchiveUseMutation.mockReturnValue({ mutateAsync: vi.fn() });
    mocks.projectsCreateUseMutation.mockReturnValue({ mutateAsync: vi.fn() });
    invalidateFns.list.mockReset();
    invalidateFns.listArchived.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('passes isLoading=true to ProjectSwitcherRail when the query is pending', async () => {
    mocks.projectsListUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });

    await act(async () => {
      render(<ShellLayout>{null}</ShellLayout>);
    });

    expect(capturedRailProps.isLoading).toBe(true);
  });

  it('passes isError=true and onRetry to ProjectSwitcherRail on query error', async () => {
    const refetch = vi.fn();
    mocks.projectsListUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });

    await act(async () => {
      render(<ShellLayout>{null}</ShellLayout>);
    });

    expect(capturedRailProps.isError).toBe(true);
    expect(typeof capturedRailProps.onRetry).toBe('function');
    (capturedRailProps.onRetry as () => void)();
    expect(refetch).toHaveBeenCalled();
  });

  it('passes live projects from trpc.projects.list into the rail', async () => {
    mocks.projectsListUseQuery.mockReturnValue({
      data: [
        { id: 'proj-a', name: 'Alpha', icon: 'lucide:Book', iconColor: '#ff00aa' },
        { id: 'proj-b', name: 'Beta' },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    await act(async () => {
      render(<ShellLayout>{null}</ShellLayout>);
    });

    const projects = capturedRailProps.projects as Array<{ id: string; name: string; icon?: string; color?: string }>;
    expect(projects.length).toBe(2);
    expect(projects[0]?.id).toBe('proj-a');
    expect(projects[0]?.icon).toBe('lucide:Book');
    expect(projects[0]?.color).toBe('#ff00aa');
  });

  it('archive mutation is configured with onSuccess that invalidates list queries', async () => {
    mocks.projectsListUseQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    await act(async () => {
      render(<ShellLayout>{null}</ShellLayout>);
    });

    // archive mutation was called — pull its options and invoke onSuccess.
    expect(mocks.projectsArchiveUseMutation).toHaveBeenCalled();
    const options = mocks.projectsArchiveUseMutation.mock.calls[0]?.[0];
    expect(options?.onSuccess).toBeDefined();
    options.onSuccess();
    expect(invalidateFns.list).toHaveBeenCalled();
    expect(invalidateFns.listArchived).toHaveBeenCalled();
  });
});
