/**
 * Silent Ollama installer for the Electron desktop app.
 *
 * Adapts platform commands from `scripts/install/src/ollama.ts` (RT-1: adapt, not import).
 * Streams phased progress via callback. Does not import from `main/index.ts`.
 */
import { spawn, execFile } from 'node:child_process'

// ━━━ Types ━━━

/** Phases of the install lifecycle, displayed to the user */
export type InstallPhase = 'checking' | 'downloading' | 'installing' | 'verifying'

/** Result of the install operation */
export type InstallResult = {
  success: boolean
  error?: string
  /** True when the error was a permission/elevation failure */
  elevationError?: boolean
  /** True when the package manager was not found */
  packageManagerMissing?: boolean
}

/** Progress payload sent via IPC */
export type InstallProgress = {
  phase: string
  message?: string
}

/** Callback for streaming progress to the renderer */
export type InstallProgressCallback = (progress: InstallProgress) => void

// ━━━ Internal exec types (adapted from CLI) ━━━

type ExecOptions = {
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
}

type ExecResult = {
  exitCode: number
  stdout: string
  stderr: string
  timedOut: boolean
}

// ━━━ Constants ━━━

const INSTALL_TIMEOUT_MS = 15 * 60_000
const PROBE_TIMEOUT_MS = 8_000

/** Elevation error detection patterns per platform */
const ELEVATION_PATTERNS: Record<string, RegExp[]> = {
  win32: [
    /access is denied/i,
    /requires elevation/i,
    /run as administrator/i,
    /0x80070005/i, // E_ACCESSDENIED
  ],
  darwin: [
    /permission denied/i,
    /operation not permitted/i,
    /sudo/i,
  ],
  linux: [
    /permission denied/i,
    /operation not permitted/i,
    /must be run as root/i,
    /sudo/i,
  ],
}

// ━━━ Internal helpers (adapted from CLI scripts/install/src/ollama.ts:45-126) ━━━

function killProcessTree(proc: ReturnType<typeof spawn>): void {
  if (!proc.pid) {
    return
  }

  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], {
      stdio: 'ignore',
    })
    killer.unref()
    return
  }

  try {
    proc.kill('SIGTERM')
  } catch {
    // Ignore kill failures and let process exit naturally.
  }
}

function exec(
  command: string,
  args: string[],
  options?: ExecOptions,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: options?.cwd,
      env: options?.env ?? process.env,
    })

    const timeoutMs = options?.timeoutMs ?? 0
    let stdout = ''
    let stderr = ''
    let settled = false
    let timedOut = false
    let timeoutHandle: NodeJS.Timeout | null = null

    const finish = (result: ExecResult) => {
      if (settled) {
        return
      }
      settled = true
      if (timeoutHandle) {
        clearTimeout(timeoutHandle)
      }
      resolve(result)
    }

    proc.stdout?.on('data', (d: Buffer) => (stdout += d.toString()))
    proc.stderr?.on('data', (d: Buffer) => (stderr += d.toString()))
    proc.on('error', (err) => {
      const message = err instanceof Error ? err.message : String(err)
      finish({
        exitCode: -1,
        stdout,
        stderr: stderr ? `${stderr}\n${message}` : message,
        timedOut,
      })
    })
    proc.on('close', (code) => {
      finish({
        exitCode: code ?? -1,
        stdout,
        stderr,
        timedOut,
      })
    })

    if (timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true
        killProcessTree(proc)
        const timeoutMessage = `Command "${command}" timed out after ${timeoutMs}ms`
        finish({
          exitCode: -1,
          stdout,
          stderr: stderr ? `${stderr}\n${timeoutMessage}` : timeoutMessage,
          timedOut,
        })
      }, timeoutMs)
      timeoutHandle.unref()
    }
  })
}

// ━━━ Runtime validation helpers (lightweight, no Zod dependency) ━━━

function validateInstallResult(value: unknown): InstallResult {
  if (typeof value !== 'object' || value === null) {
    return { success: false, error: 'Internal error: invalid install result' }
  }
  const obj = value as Record<string, unknown>
  return {
    success: Boolean(obj.success),
    ...(typeof obj.error === 'string' ? { error: obj.error } : {}),
    ...(typeof obj.elevationError === 'boolean' ? { elevationError: obj.elevationError } : {}),
    ...(typeof obj.packageManagerMissing === 'boolean' ? { packageManagerMissing: obj.packageManagerMissing } : {}),
  }
}

// ━━━ Singleton guard ━━━

let activeInstall: Promise<InstallResult> | null = null

// ━━━ Exported: isPackageManagerAvailable ━━━

/**
 * Check whether the platform package manager is available.
 * Used to decide whether to attempt install or go straight to browser fallback.
 */
export async function isPackageManagerAvailable(): Promise<boolean> {
  const platform = process.platform
  let cmd: string
  let args: string[]

  switch (platform) {
    case 'win32':
      cmd = 'winget'
      args = ['--version']
      break
    case 'darwin':
      cmd = 'brew'
      args = ['--version']
      break
    case 'linux':
      cmd = 'curl'
      args = ['--version']
      break
    default:
      return false
  }

  const result = await exec(cmd, args, { timeoutMs: PROBE_TIMEOUT_MS })
  return result.exitCode === 0 && !result.timedOut
}

// ━━━ Exported: installOllama ━━━

/**
 * Install Ollama using the platform-appropriate package manager.
 * Streams progress via the callback. Returns a result indicating
 * success or failure with error classification.
 *
 * @param onProgress - Callback for streaming progress phases to the renderer
 *
 * Note: child process is intentionally NOT registered with orphan-guard.
 * The install is awaited and short-lived; if Electron dies mid-install,
 * we want the package manager to keep running rather than killing it.
 */
export async function installOllama(
  onProgress: InstallProgressCallback,
): Promise<InstallResult> {
  // Singleton guard — reject concurrent installs
  if (activeInstall) {
    return { success: false, error: 'An install is already in progress.' }
  }

  const doInstall = async (): Promise<InstallResult> => {
    const platform = process.platform

    // Phase: checking
    onProgress({ phase: 'checking', message: 'Checking package manager availability...' })
    console.log(`[nous:desktop] ollama-installer: checking package manager (${platform})`)

    const pmAvailable = await isPackageManagerAvailable()
    if (!pmAvailable) {
      console.warn('[nous:desktop] ollama-installer: package manager not found, falling back to browser')
      return validateInstallResult({ success: false, packageManagerMissing: true })
    }

    // Select platform command
    let cmd: string
    let args: string[]

    switch (platform) {
      case 'win32':
        cmd = 'winget'
        args = [
          'install',
          '--id',
          'Ollama.Ollama',
          '--exact',
          '--silent',
          '--accept-package-agreements',
          '--accept-source-agreements',
          '--disable-interactivity',
        ]
        break
      case 'darwin':
        cmd = 'brew'
        args = ['install', 'ollama']
        break
      case 'linux':
        cmd = 'sh'
        args = ['-c', 'curl -fsSL https://ollama.com/install.sh | sh']
        break
      default:
        return validateInstallResult({
          success: false,
          error: `Unsupported platform: ${platform}`,
        })
    }

    console.log(`[nous:desktop] ollama-installer: package manager available (${cmd})`)

    // Phase: downloading
    onProgress({ phase: 'downloading', message: 'Downloading Ollama...' })

    // Phase: installing
    onProgress({ phase: 'installing', message: 'Installing Ollama...' })

    const startTime = Date.now()

    // Execute install command using spawn directly for PID access
    const result = await new Promise<ExecResult>((resolve) => {
      const proc = spawn(cmd, args, {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      })

      if (proc.pid != null) {
        console.log(`[nous:desktop] ollama-installer: install started (pid=${proc.pid})`)
      }

      let stdout = ''
      let stderr = ''
      let settled = false
      let timedOut = false
      let timeoutHandle: NodeJS.Timeout | null = null

      const finish = (res: ExecResult) => {
        if (settled) return
        settled = true
        if (timeoutHandle) clearTimeout(timeoutHandle)
        resolve(res)
      }

      proc.stdout?.on('data', (d: Buffer) => (stdout += d.toString()))
      proc.stderr?.on('data', (d: Buffer) => (stderr += d.toString()))
      proc.on('error', (err) => {
        const message = err instanceof Error ? err.message : String(err)
        finish({
          exitCode: -1,
          stdout,
          stderr: stderr ? `${stderr}\n${message}` : message,
          timedOut,
        })
      })
      proc.on('close', (code) => {
        finish({ exitCode: code ?? -1, stdout, stderr, timedOut })
      })

      timeoutHandle = setTimeout(() => {
        timedOut = true
        killProcessTree(proc)
        const timeoutMessage = `Command "${cmd}" timed out after ${INSTALL_TIMEOUT_MS}ms`
        finish({
          exitCode: -1,
          stdout,
          stderr: stderr ? `${stderr}\n${timeoutMessage}` : timeoutMessage,
          timedOut,
        })
      }, INSTALL_TIMEOUT_MS)
      timeoutHandle.unref()
    })

    const elapsed = Date.now() - startTime

    // Handle timeout
    if (result.timedOut) {
      console.error(`[nous:desktop] ollama-installer: install timed out after ${elapsed}ms`)
      return validateInstallResult({
        success: false,
        error: `Installation timed out after ${Math.round(elapsed / 1000)}s. You can install manually from https://ollama.com/download`,
      })
    }

    // Handle non-zero exit code
    if (result.exitCode !== 0) {
      const combined = `${result.stdout}\n${result.stderr}`

      // Check for "already installed" on Windows (mirrors CLI scripts/install/src/ollama.ts:420-428)
      if (platform === 'win32') {
        const alreadyInstalled =
          /existing package already installed/i.test(combined) ||
          /no available upgrade found/i.test(combined)
        if (alreadyInstalled) {
          console.log(`[nous:desktop] ollama-installer: install completed (exit=${result.exitCode}, elapsed=${elapsed}ms) [already installed]`)
          onProgress({ phase: 'verifying', message: 'Verifying installation...' })
          return validateInstallResult({ success: true })
        }
      }

      // Check for elevation errors
      const patterns = ELEVATION_PATTERNS[platform] ?? []
      const isElevation = patterns.some((re) => re.test(combined))

      if (isElevation) {
        console.error(`[nous:desktop] ollama-installer: install failed (exit=${result.exitCode}, elevation=true)`)
        return validateInstallResult({
          success: false,
          elevationError: true,
          error: `Installation requires elevated permissions. ${getElevationInstruction(platform)}`,
        })
      }

      console.error(`[nous:desktop] ollama-installer: install failed (exit=${result.exitCode}, elevation=false)`)
      const stderrExcerpt = result.stderr.slice(0, 500)
      return validateInstallResult({
        success: false,
        error: `Installation failed (exit code ${result.exitCode}). ${stderrExcerpt || 'No error details available.'}`,
      })
    }

    // Success
    console.log(`[nous:desktop] ollama-installer: install completed (exit=${result.exitCode}, elapsed=${elapsed}ms)`)
    onProgress({ phase: 'verifying', message: 'Verifying installation...' })
    return validateInstallResult({ success: true })
  }

  activeInstall = doInstall().finally(() => {
    activeInstall = null
  })

  return activeInstall
}

// ━━━ Tray-app suppression ━━━

/**
 * Kill the Ollama tray GUI process if it's running.
 *
 * Ollama's Inno Setup installer (Windows) launches `ollama app.exe` after install
 * via a `[Run]` section. We don't want the tray app — we manage `ollama serve`
 * (the headless API server) ourselves. This kills the GUI without affecting
 * our managed serve process.
 *
 * Safe to call even if the tray app isn't running.
 */
export async function killOllamaTrayApp(): Promise<void> {
  if (process.platform !== 'win32') {
    return // Tray app only exists on Windows
  }

  return new Promise((resolve) => {
    // Use taskkill to terminate the tray app by image name.
    // /F forces termination, /IM matches by image name.
    // We don't /T (tree kill) because we want to leave child processes alone.
    execFile('taskkill', ['/F', '/IM', 'ollama app.exe'], (err, stdout, stderr) => {
      if (err) {
        // Exit code 128 means "process not found" — that's fine, the tray wasn't running
        const combined = `${stdout}\n${stderr}`
        if (/not found|not running/i.test(combined)) {
          console.log('[nous:desktop] ollama-installer: tray app not running (nothing to kill)')
        } else {
          console.warn('[nous:desktop] ollama-installer: failed to kill tray app:', err.message)
        }
      } else {
        console.log('[nous:desktop] ollama-installer: killed Ollama tray app (ollama app.exe)')
      }
      resolve()
    })
  })
}

// ━━━ Helpers ━━━

function getElevationInstruction(platform: string): string {
  switch (platform) {
    case 'win32':
      return 'Try running the app as Administrator, or install Ollama manually from https://ollama.com/download'
    case 'darwin':
      return 'Try running: brew install ollama from your terminal, or install manually from https://ollama.com/download'
    case 'linux':
      return 'Try running: curl -fsSL https://ollama.com/install.sh | sudo sh from your terminal, or install manually from https://ollama.com/download'
    default:
      return 'Install Ollama manually from https://ollama.com/download'
  }
}
