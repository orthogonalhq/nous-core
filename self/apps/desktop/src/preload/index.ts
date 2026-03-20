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
  chat: {
    send: (message: string): Promise<{ response: string; traceId: string }> =>
      ipcRenderer.invoke('chat:send', message),
    getHistory: (): Promise<{ role: string; content: string; timestamp: string }[]> =>
      ipcRenderer.invoke('chat:getHistory'),
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
  appInstall: {
    prepare: (input: unknown): Promise<unknown> => ipcRenderer.invoke('app-install:prepare', input),
    install: (input: unknown): Promise<unknown> => ipcRenderer.invoke('app-install:install', input),
  },
  appSettings: {
    prepare: (input: unknown): Promise<unknown> => ipcRenderer.invoke('app-settings:prepare', input),
    save: (input: unknown): Promise<unknown> => ipcRenderer.invoke('app-settings:save', input),
  },
  appPanels: {
    list: (): Promise<unknown[]> => ipcRenderer.invoke('app-panels:list'),
  },
  backend: {
    getStatus: (): Promise<{ ready: boolean; port: number | null; trpcUrl: string | null }> =>
      ipcRenderer.invoke('backend:getStatus'),
    getOllamaStatus: (): Promise<{ installed: boolean; running: boolean; models: string[]; defaultModel: string | null }> =>
      ipcRenderer.invoke('backend:getOllamaStatus'),
  },
})
