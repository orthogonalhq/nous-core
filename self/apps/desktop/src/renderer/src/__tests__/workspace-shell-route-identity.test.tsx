// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssetSidebar, ContentRouter, type ContentRouterRenderProps } from '@nous/ui/components'
import { DESKTOP_TOP_NAV, buildDesktopSidebarSections } from '../desktop-sidebar-config'
import { BASE_SIMPLE_MODE_ROUTE_IDENTITIES } from '../desktop-routes'

let container: HTMLDivElement
let root: Root

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function flush() {
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

function RouteProbe({ params, routeIdentity }: ContentRouterRenderProps) {
  return (
    <div data-testid="route-probe">
      {routeIdentity?.label}:{routeIdentity?.surface}:{params?.definitionId as string ?? params?.taskId as string ?? 'none'}
    </div>
  )
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
    await flush()
  })
  container.remove()
})

describe('desktop workspace shell route identity', () => {
  it('keeps Chat in the desktop asset-sidebar top-nav component path', () => {
    const chat = DESKTOP_TOP_NAV.find((item) => item.id === 'chat')

    expect(chat).toMatchObject({ id: 'chat', label: 'Chat', routeId: 'chat' })
    expect(BASE_SIMPLE_MODE_ROUTE_IDENTITIES.chat).toMatchObject({
      routeId: 'chat',
      label: 'Chat',
      surface: 'chat',
    })
  })

  it('maps desktop detail routes to visible route ID plus params without URL state', async () => {
    await act(async () => {
      root.render(
        <ContentRouter
          activeRoute="workflow-detail"
          routes={{ 'workflow-detail': RouteProbe }}
          routeIdentities={BASE_SIMPLE_MODE_ROUTE_IDENTITIES}
          navigationParams={{ definitionId: 'wf-1' }}
        />,
      )
      await flush()
    })

    const router = container.querySelector('.nous-content-router') as HTMLElement
    expect(router.dataset.workspaceRouteId).toBe('workflow-detail')
    expect(router.dataset.workspaceRouteSurface).toBe('project')
    expect(container.textContent).toContain('Workflow Detail:project:wf-1')
    expect(window.location.href).not.toContain('wf-1')
  })

  it('renders Project and Chat selections as asset-sidebar content, not status or menu chrome', async () => {
    const onNavigate = vi.fn()
    await act(async () => {
      root.render(
        <AssetSidebar
          projectName="Client onboarding"
          topNav={DESKTOP_TOP_NAV}
          sections={buildDesktopSidebarSections()}
          activeRoute="chat"
          onNavigate={onNavigate}
        />,
      )
      await flush()
    })

    const chat = container.querySelector('[data-list-item="chat"]') as HTMLButtonElement
    expect(chat).toBeTruthy()
    expect(chat.getAttribute('data-state')).toBe('active')
    expect(container.querySelector('[data-shell-component="status-bar"]')).toBeNull()
    expect(container.querySelector('[data-shell-component="menu-bar"]')).toBeNull()

    await act(async () => {
      chat.click()
      await flush()
    })
    expect(onNavigate).toHaveBeenCalledWith('chat')
  })
})
