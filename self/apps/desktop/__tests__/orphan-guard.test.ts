import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requireState = vi.hoisted(() => ({
  error: null as Error | null,
}))
const namedFunctionMocks = vi.hoisted(() => new Map<string, ReturnType<typeof vi.fn>>())
const loadKoffiMock = vi.hoisted(() => vi.fn())
const loadMock = vi.hoisted(() => vi.fn())
const sizeofMock = vi.hoisted(() => vi.fn())
const structMock = vi.hoisted(() => vi.fn())
const pointerMock = vi.hoisted(() => vi.fn())
const opaqueMock = vi.hoisted(() => vi.fn())

function extractFunctionName(definition: string): string {
  const match = definition.match(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/)
  if (!match) {
    throw new Error(`Unable to parse Koffi definition: ${definition}`)
  }

  return match[1]
}

function getFunctionMock(name: string): ReturnType<typeof vi.fn> {
  let fn = namedFunctionMocks.get(name)
  if (!fn) {
    fn = vi.fn()
    namedFunctionMocks.set(name, fn)
  }

  return fn
}

const funcFactoryMock = vi.hoisted(() =>
  vi.fn((definition: string) => getFunctionMock(extractFunctionName(definition))),
)

vi.mock('../src/main/orphan-guard-koffi', () => ({
  loadKoffi: loadKoffiMock,
}))

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: platform,
  })
}

function restorePlatform(): void {
  if (originalPlatformDescriptor) {
    Object.defineProperty(process, 'platform', originalPlatformDescriptor)
  }
}

function resetKoffiMockState(): void {
  requireState.error = null
  namedFunctionMocks.clear()
  loadKoffiMock.mockReset()
  loadKoffiMock.mockImplementation(() => {
    if (requireState.error) {
      throw requireState.error
    }

    return {
      load: loadMock,
      sizeof: sizeofMock,
      struct: structMock,
      pointer: pointerMock,
      opaque: opaqueMock,
    }
  })
  loadMock.mockReset()
  loadMock.mockReturnValue({ func: funcFactoryMock })
  sizeofMock.mockReset()
  sizeofMock.mockReturnValue(144)
  structMock.mockReset()
  structMock.mockImplementation((nameOrDef: unknown, maybeDef?: unknown) => ({
    name: typeof nameOrDef === 'string' ? nameOrDef : undefined,
    def: maybeDef ?? nameOrDef,
  }))
  pointerMock.mockReset()
  pointerMock.mockImplementation((...args: unknown[]) => ({ kind: 'pointer', args }))
  opaqueMock.mockReset()
  opaqueMock.mockImplementation((name?: string | null) => ({ kind: 'opaque', name: name ?? null }))
  funcFactoryMock.mockClear()

  getFunctionMock('CreateJobObjectW').mockReturnValue({ kind: 'job-handle' })
  getFunctionMock('SetInformationJobObject').mockReturnValue(1)
  getFunctionMock('OpenProcess').mockReturnValue({ kind: 'process-handle' })
  getFunctionMock('AssignProcessToJobObject').mockReturnValue(1)
  getFunctionMock('CloseHandle').mockReturnValue(1)
}

async function loadModule(): Promise<typeof import('../src/main/orphan-guard')> {
  return import('../src/main/orphan-guard')
}

describe('desktop orphan guard', () => {
  beforeEach(() => {
    vi.resetModules()
    restorePlatform()
    resetKoffiMockState()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    restorePlatform()
    vi.restoreAllMocks()
  })

  it('initOrphanGuard() on Windows calls CreateJobObjectW and SetInformationJobObject', async () => {
    setPlatform('win32')
    const { initOrphanGuard } = await loadModule()

    initOrphanGuard()

    expect(loadMock).toHaveBeenCalledWith('kernel32.dll')
    expect(getFunctionMock('CreateJobObjectW')).toHaveBeenCalledWith(null, null)
    expect(getFunctionMock('SetInformationJobObject')).toHaveBeenCalledTimes(1)

    const [, infoClass, info, infoSize] = getFunctionMock('SetInformationJobObject').mock.calls[0]
    expect(infoClass).toBe(9)
    expect(infoSize).toBe(144)
    expect(info).toMatchObject({
      BasicLimitInformation: {
        LimitFlags: 0x00002000,
      },
    })
  })

  it('initOrphanGuard() on POSIX is a no-op and does not require koffi', async () => {
    setPlatform('linux')
    const { initOrphanGuard } = await loadModule()

    initOrphanGuard()

    expect(loadMock).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith(
      '[nous:desktop] orphan-guard: POSIX platform, using process groups (no-op)',
    )
  })

  it('registerChild(pid) on Windows calls OpenProcess and AssignProcessToJobObject', async () => {
    setPlatform('win32')
    const { initOrphanGuard, registerChild } = await loadModule()

    initOrphanGuard()
    registerChild(1234)

    const jobHandle = getFunctionMock('CreateJobObjectW').mock.results[0]?.value
    const processHandle = getFunctionMock('OpenProcess').mock.results[0]?.value

    expect(getFunctionMock('OpenProcess')).toHaveBeenCalledWith(0x0101, false, 1234)
    expect(getFunctionMock('AssignProcessToJobObject')).toHaveBeenCalledWith(jobHandle, processHandle)
    expect(getFunctionMock('CloseHandle')).toHaveBeenCalledWith(processHandle)
  })

  it('registerChild(pid) on POSIX is a no-op', async () => {
    setPlatform('linux')
    const { initOrphanGuard, registerChild } = await loadModule()

    initOrphanGuard()
    registerChild(1234)

    expect(getFunctionMock('OpenProcess')).not.toHaveBeenCalled()
    expect(getFunctionMock('AssignProcessToJobObject')).not.toHaveBeenCalled()
  })

  it('initOrphanGuard() is idempotent and the second call is a no-op', async () => {
    setPlatform('win32')
    const { initOrphanGuard } = await loadModule()

    initOrphanGuard()
    initOrphanGuard()

    expect(getFunctionMock('CreateJobObjectW')).toHaveBeenCalledTimes(1)
    expect(getFunctionMock('SetInformationJobObject')).toHaveBeenCalledTimes(1)
  })

  it('registerChild() before initOrphanGuard() is a silent no-op', async () => {
    setPlatform('win32')
    const { registerChild } = await loadModule()

    registerChild(1234)

    expect(getFunctionMock('OpenProcess')).not.toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('registerChild() after failed initOrphanGuard() is a silent no-op', async () => {
    setPlatform('win32')
    requireState.error = new Error('cannot find module')
    const { initOrphanGuard, registerChild } = await loadModule()

    initOrphanGuard()
    registerChild(1234)

    expect(getFunctionMock('OpenProcess')).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(
      '[nous:desktop] orphan-guard: initialization failed:',
      expect.any(Error),
    )
  })

  it('initOrphanGuard() logs an error when the koffi require fails and does not throw', async () => {
    setPlatform('win32')
    requireState.error = new Error('cannot find module')
    const { initOrphanGuard } = await loadModule()

    expect(() => initOrphanGuard()).not.toThrow()
    expect(console.error).toHaveBeenCalledWith(
      '[nous:desktop] orphan-guard: initialization failed:',
      expect.any(Error),
    )
  })

  it('initOrphanGuard() logs an error when CreateJobObjectW returns NULL', async () => {
    setPlatform('win32')
    getFunctionMock('CreateJobObjectW').mockReturnValue(null)
    const { initOrphanGuard, registerChild } = await loadModule()

    initOrphanGuard()
    registerChild(1234)

    expect(getFunctionMock('SetInformationJobObject')).not.toHaveBeenCalled()
    expect(getFunctionMock('OpenProcess')).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(
      '[nous:desktop] orphan-guard: initialization failed:',
      expect.any(Error),
    )
  })

  it('initOrphanGuard() cleans up the job handle when SetInformationJobObject fails', async () => {
    setPlatform('win32')
    getFunctionMock('SetInformationJobObject').mockReturnValue(0)
    const { initOrphanGuard, registerChild } = await loadModule()

    initOrphanGuard()
    registerChild(1234)

    const jobHandle = getFunctionMock('CreateJobObjectW').mock.results[0]?.value

    expect(getFunctionMock('CloseHandle')).toHaveBeenCalledWith(jobHandle)
    expect(getFunctionMock('OpenProcess')).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(
      '[nous:desktop] orphan-guard: initialization failed:',
      expect.any(Error),
    )
  })

  it('registerChild() logs an error when OpenProcess returns NULL and does not throw', async () => {
    setPlatform('win32')
    getFunctionMock('OpenProcess').mockReturnValue(null)
    const { initOrphanGuard, registerChild } = await loadModule()

    initOrphanGuard()

    expect(() => registerChild(1234)).not.toThrow()
    expect(getFunctionMock('AssignProcessToJobObject')).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(
      '[nous:desktop] orphan-guard: failed to register child pid=1234:',
      expect.any(Error),
    )
  })

  it('registerChild() closes the process handle when AssignProcessToJobObject fails', async () => {
    setPlatform('win32')
    getFunctionMock('AssignProcessToJobObject').mockReturnValue(0)
    const { initOrphanGuard, registerChild } = await loadModule()

    initOrphanGuard()
    registerChild(1234)

    const processHandle = getFunctionMock('OpenProcess').mock.results[0]?.value

    expect(getFunctionMock('CloseHandle')).toHaveBeenCalledWith(processHandle)
    expect(console.error).toHaveBeenCalledWith(
      '[nous:desktop] orphan-guard: failed to register child pid=1234:',
      expect.any(Error),
    )
  })

  it('registerChild(undefined/null/NaN) returns early without any FFI calls', async () => {
    setPlatform('win32')
    const { initOrphanGuard, registerChild } = await loadModule()

    initOrphanGuard()
    registerChild(undefined as unknown as number)
    registerChild(null as unknown as number)
    registerChild(Number.NaN)

    expect(getFunctionMock('OpenProcess')).not.toHaveBeenCalled()
    expect(getFunctionMock('AssignProcessToJobObject')).not.toHaveBeenCalled()
  })
})
