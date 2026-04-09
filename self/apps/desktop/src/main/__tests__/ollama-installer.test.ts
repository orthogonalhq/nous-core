import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'

// Mock child_process.spawn
const mockSpawn = vi.fn()
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}))

// Helper to create a fake child process
function createFakeProcess(options?: {
  pid?: number
  exitCode?: number
  stdout?: string
  stderr?: string
  emitError?: Error
  delay?: number
}) {
  const proc = new EventEmitter() as EventEmitter & {
    pid: number | undefined
    stdout: EventEmitter | null
    stderr: EventEmitter | null
    kill: ReturnType<typeof vi.fn>
    unref: ReturnType<typeof vi.fn>
  }
  proc.pid = options?.pid ?? 1234
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  proc.kill = vi.fn()
  proc.unref = vi.fn()

  // Schedule events
  const delay = options?.delay ?? 10
  setTimeout(() => {
    if (options?.stdout) {
      proc.stdout!.emit('data', Buffer.from(options.stdout))
    }
    if (options?.stderr) {
      proc.stderr!.emit('data', Buffer.from(options.stderr))
    }
    if (options?.emitError) {
      proc.emit('error', options.emitError)
    } else {
      proc.emit('close', options?.exitCode ?? 0)
    }
  }, delay)

  return proc
}

// We need to re-import the module for each test to reset singleton state
async function loadModule() {
  // Clear module cache to reset singleton guard
  const modulePath = '../ollama-installer'
  vi.resetModules()
  // Re-mock spawn after resetModules
  vi.doMock('node:child_process', () => ({
    spawn: (...args: unknown[]) => mockSpawn(...args),
  }))
  return await import(modulePath)
}

describe('ollama-installer', () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    mockSpawn.mockReset()
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  function setPlatform(platform: string) {
    Object.defineProperty(process, 'platform', { value: platform })
  }

  describe('isPackageManagerAvailable', () => {
    it('returns true when probe succeeds', async () => {
      setPlatform('win32')
      mockSpawn.mockReturnValue(createFakeProcess({ exitCode: 0, stdout: 'v1.0' }))
      const { isPackageManagerAvailable } = await loadModule()
      const result = await isPackageManagerAvailable()
      expect(result).toBe(true)
      expect(mockSpawn).toHaveBeenCalledWith('winget', ['--version'], expect.any(Object))
    })

    it('returns false when probe fails', async () => {
      setPlatform('darwin')
      mockSpawn.mockReturnValue(createFakeProcess({ exitCode: 1 }))
      const { isPackageManagerAvailable } = await loadModule()
      const result = await isPackageManagerAvailable()
      expect(result).toBe(false)
    })

    it('probes brew on darwin', async () => {
      setPlatform('darwin')
      mockSpawn.mockReturnValue(createFakeProcess({ exitCode: 0 }))
      const { isPackageManagerAvailable } = await loadModule()
      await isPackageManagerAvailable()
      expect(mockSpawn).toHaveBeenCalledWith('brew', ['--version'], expect.any(Object))
    })

    it('probes curl on linux', async () => {
      setPlatform('linux')
      mockSpawn.mockReturnValue(createFakeProcess({ exitCode: 0 }))
      const { isPackageManagerAvailable } = await loadModule()
      await isPackageManagerAvailable()
      expect(mockSpawn).toHaveBeenCalledWith('curl', ['--version'], expect.any(Object))
    })

    it('returns false on unsupported platform', async () => {
      setPlatform('freebsd')
      const { isPackageManagerAvailable } = await loadModule()
      const result = await isPackageManagerAvailable()
      expect(result).toBe(false)
    })

    it('returns false when probe times out', async () => {
      setPlatform('win32')
      // Create a process that never closes (will be killed by timeout)
      const proc = new EventEmitter() as EventEmitter & {
        pid: number | undefined
        stdout: EventEmitter | null
        stderr: EventEmitter | null
        kill: ReturnType<typeof vi.fn>
        unref: ReturnType<typeof vi.fn>
      }
      proc.pid = 1234
      proc.stdout = new EventEmitter()
      proc.stderr = new EventEmitter()
      proc.kill = vi.fn()
      proc.unref = vi.fn()

      // Mock taskkill spawn for killProcessTree
      let spawnCallCount = 0
      mockSpawn.mockImplementation(() => {
        spawnCallCount++
        if (spawnCallCount === 1) return proc // The probe command
        // taskkill mock for killProcessTree
        const killer = new EventEmitter() as EventEmitter & { unref: ReturnType<typeof vi.fn> }
        killer.unref = vi.fn()
        return killer
      })

      const { isPackageManagerAvailable } = await loadModule()
      // This will time out at 8 seconds — we need to use fake timers
      vi.useFakeTimers()
      const promise = isPackageManagerAvailable()
      vi.advanceTimersByTime(9000) // Past the 8s probe timeout
      vi.useRealTimers()
      const result = await promise
      expect(result).toBe(false)
    })
  })

  describe('installOllama', () => {
    it('selects winget on win32', async () => {
      setPlatform('win32')
      // First call: probe (winget --version), second call: install command (spawn direct)
      mockSpawn
        .mockReturnValueOnce(createFakeProcess({ exitCode: 0, stdout: 'v1.0' })) // probe
        .mockReturnValueOnce(createFakeProcess({ exitCode: 0 })) // install

      const { installOllama } = await loadModule()
      const onProgress = vi.fn()
      const result = await installOllama(onProgress)

      expect(result.success).toBe(true)
      // Second spawn call should be winget install
      expect(mockSpawn.mock.calls[1][0]).toBe('winget')
      expect(mockSpawn.mock.calls[1][1]).toContain('install')
      expect(mockSpawn.mock.calls[1][1]).toContain('Ollama.Ollama')
    })

    it('selects brew on darwin', async () => {
      setPlatform('darwin')
      mockSpawn
        .mockReturnValueOnce(createFakeProcess({ exitCode: 0 })) // probe
        .mockReturnValueOnce(createFakeProcess({ exitCode: 0 })) // install

      const { installOllama } = await loadModule()
      const onProgress = vi.fn()
      const result = await installOllama(onProgress)

      expect(result.success).toBe(true)
      expect(mockSpawn.mock.calls[1][0]).toBe('brew')
      expect(mockSpawn.mock.calls[1][1]).toEqual(['install', 'ollama'])
    })

    it('selects sh -c curl on linux', async () => {
      setPlatform('linux')
      mockSpawn
        .mockReturnValueOnce(createFakeProcess({ exitCode: 0 })) // probe
        .mockReturnValueOnce(createFakeProcess({ exitCode: 0 })) // install

      const { installOllama } = await loadModule()
      const onProgress = vi.fn()
      const result = await installOllama(onProgress)

      expect(result.success).toBe(true)
      expect(mockSpawn.mock.calls[1][0]).toBe('sh')
      expect(mockSpawn.mock.calls[1][1]).toEqual(['-c', 'curl -fsSL https://ollama.com/install.sh | sh'])
    })

    it('returns success on zero exit code', async () => {
      setPlatform('win32')
      mockSpawn
        .mockReturnValueOnce(createFakeProcess({ exitCode: 0 })) // probe
        .mockReturnValueOnce(createFakeProcess({ exitCode: 0 })) // install

      const { installOllama } = await loadModule()
      const onProgress = vi.fn()
      const result = await installOllama(onProgress)

      expect(result.success).toBe(true)
      expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'checking' }))
      expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'downloading' }))
      expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'installing' }))
      expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'verifying' }))
    })

    it('returns packageManagerMissing when probe fails', async () => {
      setPlatform('win32')
      mockSpawn.mockReturnValue(createFakeProcess({ exitCode: 1 })) // probe fails

      const { installOllama } = await loadModule()
      const onProgress = vi.fn()
      const result = await installOllama(onProgress)

      expect(result.success).toBe(false)
      expect(result.packageManagerMissing).toBe(true)
    })

    it('detects elevation error on win32 (access denied)', async () => {
      setPlatform('win32')
      mockSpawn
        .mockReturnValueOnce(createFakeProcess({ exitCode: 0 })) // probe
        .mockReturnValueOnce(createFakeProcess({ exitCode: 1, stderr: 'Access is denied' })) // install

      const { installOllama } = await loadModule()
      const onProgress = vi.fn()
      const result = await installOllama(onProgress)

      expect(result.success).toBe(false)
      expect(result.elevationError).toBe(true)
      expect(result.error).toContain('elevated permissions')
    })

    it('detects elevation error on darwin (permission denied)', async () => {
      setPlatform('darwin')
      mockSpawn
        .mockReturnValueOnce(createFakeProcess({ exitCode: 0 })) // probe
        .mockReturnValueOnce(createFakeProcess({ exitCode: 1, stderr: 'Error: Permission denied' })) // install

      const { installOllama } = await loadModule()
      const onProgress = vi.fn()
      const result = await installOllama(onProgress)

      expect(result.success).toBe(false)
      expect(result.elevationError).toBe(true)
    })

    it('detects elevation error on linux (sudo required)', async () => {
      setPlatform('linux')
      mockSpawn
        .mockReturnValueOnce(createFakeProcess({ exitCode: 0 })) // probe
        .mockReturnValueOnce(createFakeProcess({ exitCode: 1, stderr: 'must be run as root or with sudo' })) // install

      const { installOllama } = await loadModule()
      const onProgress = vi.fn()
      const result = await installOllama(onProgress)

      expect(result.success).toBe(false)
      expect(result.elevationError).toBe(true)
    })

    it('treats win32 "already installed" as success', async () => {
      setPlatform('win32')
      mockSpawn
        .mockReturnValueOnce(createFakeProcess({ exitCode: 0 })) // probe
        .mockReturnValueOnce(createFakeProcess({
          exitCode: 1,
          stdout: 'existing package already installed',
        })) // install

      const { installOllama } = await loadModule()
      const onProgress = vi.fn()
      const result = await installOllama(onProgress)

      expect(result.success).toBe(true)
    })

    it('rejects concurrent install attempts (singleton guard)', async () => {
      setPlatform('win32')

      // First install: hangs forever
      const hangingProc = new EventEmitter() as EventEmitter & {
        pid: number | undefined
        stdout: EventEmitter | null
        stderr: EventEmitter | null
        kill: ReturnType<typeof vi.fn>
        unref: ReturnType<typeof vi.fn>
      }
      hangingProc.pid = 9999
      hangingProc.stdout = new EventEmitter()
      hangingProc.stderr = new EventEmitter()
      hangingProc.kill = vi.fn()
      hangingProc.unref = vi.fn()

      // Probe succeeds, install hangs
      mockSpawn
        .mockReturnValueOnce(createFakeProcess({ exitCode: 0 })) // probe for first install
        .mockReturnValueOnce(hangingProc) // hanging install

      const { installOllama } = await loadModule()
      const onProgress1 = vi.fn()
      const onProgress2 = vi.fn()

      // Start first install (don't await — it will hang)
      const firstInstall = installOllama(onProgress1)

      // Wait for probe to complete so singleton guard is active
      await new Promise((r) => setTimeout(r, 50))

      // Second install should be rejected
      const result2 = await installOllama(onProgress2)
      expect(result2.success).toBe(false)
      expect(result2.error).toContain('already in progress')

      // Clean up: close the hanging process
      hangingProc.emit('close', 0)
      await firstInstall
    })

    it('returns error on spawn failure', async () => {
      setPlatform('win32')
      mockSpawn
        .mockReturnValueOnce(createFakeProcess({ exitCode: 0 })) // probe
        .mockReturnValueOnce(createFakeProcess({ emitError: new Error('ENOENT: command not found') })) // install fails

      const { installOllama } = await loadModule()
      const onProgress = vi.fn()
      const result = await installOllama(onProgress)

      expect(result.success).toBe(false)
    })

    it('returns error for unsupported platform', async () => {
      setPlatform('freebsd')
      const { installOllama } = await loadModule()
      const onProgress = vi.fn()
      const result = await installOllama(onProgress)

      // Will fail at the probe stage since freebsd returns false from isPackageManagerAvailable
      expect(result.success).toBe(false)
      expect(result.packageManagerMissing).toBe(true)
    })

    it('emits progress phases in order: checking, downloading, installing, verifying', async () => {
      setPlatform('darwin')
      mockSpawn
        .mockReturnValueOnce(createFakeProcess({ exitCode: 0 })) // probe
        .mockReturnValueOnce(createFakeProcess({ exitCode: 0 })) // install

      const { installOllama } = await loadModule()
      const phases: string[] = []
      const onProgress = vi.fn((p: { phase: string }) => phases.push(p.phase))
      await installOllama(onProgress)

      expect(phases).toEqual(['checking', 'downloading', 'installing', 'verifying'])
    })
  })
})
