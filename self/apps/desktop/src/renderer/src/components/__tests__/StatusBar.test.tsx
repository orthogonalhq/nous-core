import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusBar } from '../StatusBar'

describe('StatusBar', () => {
  it('renders no mode chip in simple mode', () => {
    render(<StatusBar mode="simple" />)

    expect(screen.queryByText('Simple')).not.toBeInTheDocument()
    expect(screen.queryByText('Developer')).not.toBeInTheDocument()
  })

  it('renders the developer mode chip', () => {
    render(<StatusBar mode="developer" />)

    expect(screen.getByText('Developer')).toBeInTheDocument()
  })

  it('does not render the placeholder version string', () => {
    render(<StatusBar mode="simple" />)

    expect(screen.queryByText('v0.0.1')).not.toBeInTheDocument()
  })
})
