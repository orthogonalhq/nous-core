// @vitest-environment jsdom

import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useChatStageManager } from '../useChatStageManager'

describe('useChatStageManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts in small state', () => {
    const { result } = renderHook(() => useChatStageManager())
    expect(result.current.chatStage).toBe('small')
  })

  // --- Signal transitions ---

  it('signalSending: small -> large', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.signalSending())
    expect(result.current.chatStage).toBe('large')
  })

  it('signalSending: large stays large', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.expandToLarge())
    act(() => result.current.signalSending())
    expect(result.current.chatStage).toBe('large')
  })

  it('signalInferenceStart: small -> large', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.signalInferenceStart())
    expect(result.current.chatStage).toBe('large')
  })

  it('signalInferenceStart: full stays full', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.expandToFull())
    act(() => result.current.signalInferenceStart())
    expect(result.current.chatStage).toBe('full')
  })

  // --- Idle timers ---

  it('signalTurnComplete: large -> small after idle timer', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.signalSending()) // small -> large
    act(() => result.current.signalTurnComplete())

    // Before timer fires
    expect(result.current.chatStage).toBe('large')

    // After 4s
    act(() => vi.advanceTimersByTime(4000))
    expect(result.current.chatStage).toBe('small')
  })

  it('new activity cancels idle timers', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.signalSending()) // small -> large
    act(() => result.current.signalTurnComplete()) // start idle timer

    // Before timer, new activity
    act(() => vi.advanceTimersByTime(2000))
    act(() => result.current.signalInferenceStart()) // cancels timer, stays large

    // After original timer would have fired
    act(() => vi.advanceTimersByTime(3000))
    expect(result.current.chatStage).toBe('large')
  })

  // --- User-initiated transitions ---

  it('expandToLarge: any state -> large', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.expandToLarge())
    expect(result.current.chatStage).toBe('large')
  })

  it('expandToFull: any state -> full', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.expandToFull())
    expect(result.current.chatStage).toBe('full')
  })

  it('minimizeToLarge: full -> large', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.expandToFull())
    act(() => result.current.minimizeToLarge())
    expect(result.current.chatStage).toBe('large')
  })

  it('collapseToSmall: any state -> small', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.expandToFull())
    act(() => result.current.collapseToSmall())
    expect(result.current.chatStage).toBe('small')
  })

  // --- Click outside ---

  it('handleClickOutside: non-small -> small', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.expandToLarge())
    act(() => result.current.handleClickOutside())
    expect(result.current.chatStage).toBe('small')
  })

  it('handleClickOutside: small stays small (no-op)', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.handleClickOutside())
    expect(result.current.chatStage).toBe('small')
  })

  it('handleClickOutside cancels idle timers', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.signalSending()) // -> large
    act(() => result.current.signalTurnComplete()) // start idle timer
    act(() => result.current.handleClickOutside()) // -> small immediately, cancel timer
    expect(result.current.chatStage).toBe('small')
  })

  // --- User-initiated states persist (no idle decay) ---

  it('full does not decay to small on turn complete', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.expandToFull())
    act(() => result.current.signalTurnComplete())

    act(() => vi.advanceTimersByTime(30000))
    expect(result.current.chatStage).toBe('full')
  })
})
