/// <reference types="vite/client" />

type OllamaLifecycleState =
  | 'not_installed'
  | 'installed_stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error'

type OllamaStatus = {
  installed: boolean
  running: boolean
  state: OllamaLifecycleState
  models: string[]
  defaultModel: string | null
  error?: string
}

type OllamaModelPullProgress = {
  status: string
  digest?: string
  total?: number
  completed?: number
  percent?: number
}

type OllamaOperationResult = {
  success: boolean
  error?: string
}

interface ElectronAPI {
  layout: {
    get: () => Promise<unknown>
    set: (layout: unknown) => Promise<void>
  }
  fs: {
    readDir: (path: string) => Promise<{ name: string; isDirectory: boolean; path: string }[]>
    readFile: (path: string) => Promise<string | null>
  }
  usage: {
    getSnapshot: () => Promise<unknown>
  }
  win: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
    toggleDevTools: () => Promise<void>
    toggleFullScreen: () => Promise<void>
    isFullScreen: () => Promise<boolean>
  }
  app: {
    quit: () => Promise<void>
    newWindow: () => Promise<void>
  }
  mode: {
    get: () => Promise<string | null>
    set: (mode: string) => Promise<void>
  }
  backend: {
    getStatus: () => Promise<{
      ready: boolean
      port: number | null
      trpcUrl: string | null
    }>
    getPort: () => Promise<number | null>
    /** @deprecated Use `window.electronAPI.ollama.getStatus()` instead. */
    getOllamaStatus: () => Promise<OllamaStatus>
  }
  ollama: {
    getStatus: () => Promise<OllamaStatus>
    start: () => Promise<OllamaOperationResult>
    stop: () => Promise<OllamaOperationResult>
    pullModel: (modelId: string) => Promise<void>
    onPullProgress: (callback: (progress: OllamaModelPullProgress) => void) => () => void
    onStateChange: (callback: (status: OllamaStatus) => void) => () => void
    install: () => Promise<unknown>
    onInstallProgress: (callback: (progress: { phase: string; message?: string }) => void) => () => void
    checkUpdate: () => Promise<unknown>
    update: () => Promise<unknown>
    getVersion: () => Promise<unknown>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
