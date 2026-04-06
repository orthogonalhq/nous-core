'use client'

import type { HomeScreenProps } from './types'
import { isHomeSidebarEnabled } from './feature-flags'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

const STUB_RECENT_ACTIVITY = [
  { id: 'activity-1', label: 'Updated project roadmap' },
  { id: 'activity-2', label: 'Reviewed agent dispatch logs' },
  { id: 'activity-3', label: 'Completed skill configuration' },
]

const QUICK_ACTIONS = [
  { id: 'threads', label: 'Threads', routeId: 'threads' },
  { id: 'workflows', label: 'Workflows', routeId: 'workflows' },
  { id: 'skills', label: 'Skills', routeId: 'skills' },
]

export function HomeScreen(props: HomeScreenProps) {
  const { navigate, greeting, recentActivity } = props

  const displayGreeting = greeting ?? getGreeting()
  const displayActivity = recentActivity ?? STUB_RECENT_ACTIVITY
  const showQuickActions = !isHomeSidebarEnabled()

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: 'var(--nous-space-3xl)',
        color: 'var(--nous-fg)',
        gap: 'var(--nous-space-2xl)',
        overflowY: 'auto',
      }}
    >
      {/* Greeting */}
      <section>
        <h2
          style={{
            fontSize: 'var(--nous-font-size-xl)',
            fontWeight: 'var(--nous-font-weight-semibold)' as any,
            color: 'var(--nous-fg)',
            margin: 0,
          }}
        >
          {displayGreeting}, User
        </h2>
      </section>

      {/* Recent Activity */}
      <section>
        <h3
          style={{
            fontSize: 'var(--nous-font-size-sm)',
            fontWeight: 'var(--nous-font-weight-semibold)' as any,
            color: 'var(--nous-fg-muted)',
            margin: '0 0 var(--nous-space-md) 0',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          Recent Activity
        </h3>
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--nous-space-sm)',
          }}
        >
          {displayActivity.map((item) => (
            <li
              key={item.id}
              style={{
                padding: 'var(--nous-space-md) var(--nous-space-lg)',
                background: 'var(--nous-bg-elevated)',
                borderRadius: 'var(--nous-radius-md)',
                fontSize: 'var(--nous-font-size-base)',
                color: 'var(--nous-fg)',
              }}
            >
              {item.label}
            </li>
          ))}
        </ul>
      </section>

      {/* Quick Actions — hidden when home sidebar feature is enabled */}
      {showQuickActions && (
        <section>
          <h3
            style={{
              fontSize: 'var(--nous-font-size-sm)',
              fontWeight: 'var(--nous-font-weight-semibold)' as any,
              color: 'var(--nous-fg-muted)',
              margin: '0 0 var(--nous-space-md) 0',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Quick Actions
          </h3>
          <div
            style={{
              display: 'flex',
              gap: 'var(--nous-space-md)',
              flexWrap: 'wrap',
            }}
          >
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => navigate(action.routeId)}
                style={{
                  background: 'var(--nous-bg-elevated)',
                  border: '1px solid var(--nous-border-subtle)',
                  borderRadius: 'var(--nous-radius-md)',
                  padding: 'var(--nous-space-md) var(--nous-space-xl)',
                  color: 'var(--nous-fg)',
                  fontSize: 'var(--nous-font-size-base)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
