'use client'

import { sectionStyle, sectionTitleStyle, cardStyle } from '../styles'

export interface AboutPageProps {}

export function AboutPage(_props: AboutPageProps) {
  return (
    <div data-testid="settings-page-about">
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>About</div>

        <div style={cardStyle}>
          <div style={{ marginBottom: 'var(--nous-space-md)' }}>
            <span style={{ fontWeight: 'var(--nous-font-weight-semibold)' as never }}>Nous</span>
            <span style={{ marginLeft: 'var(--nous-space-sm)', fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-muted)' }}>
              v0.1.0
            </span>
          </div>
          <div style={{ display: 'flex', gap: 'var(--nous-space-lg)', fontSize: 'var(--nous-font-size-sm)' }}>
            <a
              href="https://github.com/nousai/nous-core"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--nous-btn-primary-bg)', textDecoration: 'underline' }}
            >
              GitHub
            </a>
            <a
              href="https://docs.nous.ai"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--nous-btn-primary-bg)', textDecoration: 'underline' }}
            >
              Documentation
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
