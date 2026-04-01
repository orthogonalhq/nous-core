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

  it('signalSending: small -> ambient_small', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.signalSending())
    expect(result.current.chatStage).toBe('ambient_small')
  })

  it('signalSending: ambient_small stays ambient_small', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.signalSending())
    act(() => result.current.signalSending())
    expect(result.current.chatStage).toBe('ambient_small')
  })

  it('signalInferenceStart: small -> ambient_small', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.signalInferenceStart())
    expect(result.current.chatStage).toBe('ambient_small')
  })

  it('signalInferenceStart: full stays full', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.expandToFull())
    act(() => result.current.signalInferenceStart())
    expect(result.current.chatStage).toBe('full')
  })

  it('signalPfcDecision: ambient_small -> ambient_large', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.signalSending()) // small -> ambient_small
    act(() => result.current.signalPfcDecision())
    expect(result.current.chatStage).toBe('ambient_large')
  })

  it('signalPfcDecision: small stays small (no-op)', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.signalPfcDecision())
    expect(result.current.chatStage).toBe('small')
  })

  it('signalPfcDecision: full stays full', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.expandToFull())
    act(() => result.current.signalPfcDecision())
    expect(result.current.chatStage).toBe('full')
  })

  // --- Idle timers ---

  it('signalTurnComplete: ambient_large -> ambient_small after 5s, then small after 3s', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.signalSending()) // small -> ambient_small
    act(() => result.current.signalPfcDecision()) // ambient_small -> ambient_large
    act(() => result.current.signalTurnComplete())

    // Before timer fires
    expect(result.current.chatStage).toBe('ambient_large')

    // After 5s: ambient_large -> ambient_small
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current.chatStage).toBe('ambient_small')

    // After 3s more: ambient_small -> small
    act(() => vi.advanceTimersByTime(3000))
    expect(result.current.chatStage).toBe('small')
  })

  it('signalTurnComplete: ambient_small -> small after 3s', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.signalSending()) // small -> ambient_small
    act(() => result.current.signalTurnComplete())

    // Before timer fires
    expect(result.current.chatStage).toBe('ambient_small')

    // After 3s
    act(() => vi.advanceTimersByTime(3000))
    expect(result.current.chatStage).toBe('small')
  })

  it('new activity cancels idle timers', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.signalSending()) // small -> ambient_small
    act(() => result.current.signalTurnComplete()) // start idle timer

    // Before timer, new activity
    act(() => vi.advanceTimersByTime(1500))
    act(() => result.current.signalInferenceStart()) // cancels timer, stays ambient_small

    // After original timer would have fired
    act(() => vi.advanceTimersByTime(3000))
    expect(result.current.chatStage).toBe('ambient_small')
  })

  // --- User-initiated transitions ---

  it('expandToAmbientLarge: any state -> ambient_large', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.expandToAmbientLarge())
    expect(result.current.chatStage).toBe('ambient_large')
  })

  it('expandToFull: any state -> full', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.expandToFull())
    expect(result.current.chatStage).toBe('full')
  })

  it('collapseToAmbientSmall: ambient_large -> ambient_small', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.expandToAmbientLarge())
    act(() => result.current.collapseToAmbientSmall())
    expect(result.current.chatStage).toBe('ambient_small')
  })

  it('minimizeToAmbientLarge: full -> ambient_large', () => {
    const { result } = renderHook(() => useChatStageManager())
    act(() => result.current.expandToFull())
    act(() => result.current.minimizeToAmbientLarge())
    expect(result.current.chatStage).toBe('ambient_large')
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
    act(() => result.current.expandToAmbientLarge())
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
    act(() => result.current.signalSending()) // -> ambient_small
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
