import * as React from 'react'

/**
 * WR-141 interim persistence hook for the whole-sidebar collapse flag.
 *
 * The literal `'nous-asset-sidebar-collapsed'` is a distinct namespace from the
 * section-collapse prefix `'nous-sidebar-collapse-'` at
 * `self/ui/src/components/shell/AssetSidebar.tsx:16`. The whole-sidebar key is a
 * full literal (no trailing section id) and the section-collapse keys are a
 * prefix + section id pattern — they do not collide. See
 * `.architecture/.decisions/2026-04-08-asset-sidebar-collapse-button/asset-sidebar-collapse-contract-v1.md § Persistence Key (item a)`.
 *
 * This hook is the WR-140 absorption swap point. See
 * `.architecture/.decisions/2026-04-08-asset-sidebar-collapse-button/asset-sidebar-collapse-wr140-absorption-contract-v1.md § Swap Point`.
 * Do not change the file path, the exported function signature, or the key
 * literal without revising that contract — WR-140's migration plan depends on
 * this being a clean find-and-replace swap.
 */
const COLLAPSED_KEY = 'nous-asset-sidebar-collapsed'

function readInitial(): boolean {
    try {
        return localStorage.getItem(COLLAPSED_KEY) === 'true'
    } catch {
        /* localStorage unavailable (privacy mode, SSR, ITP, restricted iframe) */
        return false
    }
}

export function useSidebarCollapsed(): [boolean, (next: boolean) => void] {
    const [collapsed, setCollapsed] = React.useState<boolean>(readInitial)

    React.useEffect(() => {
        try {
            localStorage.setItem(COLLAPSED_KEY, String(collapsed))
        } catch {
            /* localStorage unavailable (quota exceeded, privacy mode) */
        }
    }, [collapsed])

    return [collapsed, setCollapsed]
}
