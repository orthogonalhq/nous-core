import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  layout: {
    get: (): Promise<unknown> => ipcRenderer.invoke('layout:get'),
    set: (layout: unknown): Promise<void> => ipcRenderer.invoke('layout:set', layout),
  },
  fs: {
    readDir: (path: string): Promise<{ name: string; isDirectory: boolean; path: string }[]> => ipcRenderer.invoke('fs:readDir', path),
    readFile: (path: string): Promise<string | null> => ipcRenderer.invoke('fs:readFile', path),
  },
  usage: {
    getSnapshot: (): Promise<unknown> => ipcRenderer.invoke('usage:getSnapshot'),
  },
  win: {
    minimize:         (): Promise<void>    => ipcRenderer.invoke('win:minimize'),
    maximize:         (): Promise<void>    => ipcRenderer.invoke('win:maximize'),
    close:            (): Promise<void>    => ipcRenderer.invoke('win:close'),
    isMaximized:      (): Promise<boolean> => ipcRenderer.invoke('win:isMaximized'),
    toggleDevTools:   (): Promise<void>    => ipcRenderer.invoke('win:toggleDevTools'),
    toggleFullScreen: (): Promise<void>    => ipcRenderer.invoke('win:toggleFullScreen'),
    isFullScreen:     (): Promise<boolean> => ipcRenderer.invoke('win:isFullScreen'),
  },
  app: {
    quit:      (): Promise<void> => ipcRenderer.invoke('app:quit'),
    newWindow: (): Promise<void> => ipcRenderer.invoke('app:newWindow'),
  },
  backend: {
    getStatus: (): Promise<{
      ready: boolean
      port: number | null
      trpcUrl: string | null
    }> => ipcRenderer.invoke('backend:getStatus'),
    getPort: (): Promise<number | null> => ipcRenderer.invoke('backend:getPort'),
    getOllamaStatus: (): Promise<{
      installed: boolean
      running: boolean
      state: 'not_installed' | 'installed_stopped' | 'starting' | 'running' | 'stopping' | 'error'
      models: string[]
      defaultModel: string | null
      error?: string
    }> => ipcRenderer.invoke('backend:getOllamaStatus'),
  },
  ollama: {
    getStatus: (): Promise<{
      installed: boolean
      running: boolean
      state: 'not_installed' | 'installed_stopped' | 'starting' | 'running' | 'stopping' | 'error'
      models: string[]
      defaultModel: string | null
      error?: string
    }> => ipcRenderer.invoke('ollama:getStatus'),
    start: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('ollama:start'),
    stop: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('ollama:stop'),
    pullModel: (modelId: string): Promise<void> => ipcRenderer.invoke('ollama:pullModel', modelId),
    onPullProgress: (
      callback: (progress: {
        status: string
        digest?: string
        total?: number
        completed?: number
        percent?: number
      }) => void,
    ): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: {
        status: string
        digest?: string
        total?: number
        completed?: number
        percent?: number
      }) => callback(progress)
      ipcRenderer.on('ollama:pullProgress', listener)
      return () => {
        ipcRenderer.removeListener('ollama:pullProgress', listener)
      }
    },
    onStateChange: (
      callback: (status: {
        installed: boolean
        running: boolean
        state: 'not_installed' | 'installed_stopped' | 'starting' | 'running' | 'stopping' | 'error'
        models: string[]
        defaultModel: string | null
        error?: string
      }) => void,
    ): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: {
        installed: boolean
        running: boolean
        state: 'not_installed' | 'installed_stopped' | 'starting' | 'running' | 'stopping' | 'error'
        models: string[]
        defaultModel: string | null
        error?: string
      }) => callback(status)
      ipcRenderer.on('ollama:stateChanged', listener)
      return () => {
        ipcRenderer.removeListener('ollama:stateChanged', listener)
      }
    },
    install: (): Promise<unknown> => ipcRenderer.invoke('ollama:install'),
    onInstallProgress: (
      callback: (progress: { phase: string; message?: string }) => void,
    ): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: { phase: string; message?: string }) =>
        callback(progress)
      ipcRenderer.on('ollama:install-progress', listener)
      return () => {
        ipcRenderer.removeListener('ollama:install-progress', listener)
      }
    },
    checkUpdate: (): Promise<unknown> => ipcRenderer.invoke('ollama:checkUpdate'),
    update: (): Promise<unknown> => ipcRenderer.invoke('ollama:update'),
    getVersion: (): Promise<unknown> => ipcRenderer.invoke('ollama:getVersion'),
  },
  mode: {
    get: (): Promise<string | null> => ipcRenderer.invoke('mode:get'),
    set: (mode: string): Promise<void> => ipcRenderer.invoke('mode:set', mode),
  },
})
