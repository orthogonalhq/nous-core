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
  },
  hardware: {
    getSpec: (): Promise<unknown> => ipcRenderer.invoke('hardware:getSpec'),
    getRecommendations: (): Promise<unknown> => ipcRenderer.invoke('hardware:getRecommendations'),
  },
  firstRun: {
    getWizardState: (): Promise<unknown> => ipcRenderer.invoke('firstRun:getWizardState'),
    checkPrerequisites: (): Promise<unknown> => ipcRenderer.invoke('firstRun:checkPrerequisites'),
    downloadModel: (model: string): Promise<unknown> => ipcRenderer.invoke('firstRun:downloadModel', { model }),
    configureProvider: (modelSpec: string): Promise<unknown> => ipcRenderer.invoke('firstRun:configureProvider', { modelSpec }),
    assignRoles: (assignments: unknown[]): Promise<unknown> => ipcRenderer.invoke('firstRun:assignRoles', { assignments }),
    completeStep: (step: string): Promise<unknown> => ipcRenderer.invoke('firstRun:completeStep', { step }),
    resetWizard: (): Promise<unknown> => ipcRenderer.invoke('firstRun:resetWizard'),
  },
  appInstall: {
    prepare: (input: unknown): Promise<unknown> => ipcRenderer.invoke('app-install:prepare', input),
    install: (input: unknown): Promise<unknown> => ipcRenderer.invoke('app-install:install', input),
  },
  appSettings: {
    prepare: (input: unknown): Promise<unknown> => ipcRenderer.invoke('app-settings:prepare', input),
    save: (input: unknown): Promise<unknown> => ipcRenderer.invoke('app-settings:save', input),
  },
  health: {
    systemStatus: (): Promise<unknown> => ipcRenderer.invoke('health:systemStatus'),
    providerHealth: (): Promise<unknown> => ipcRenderer.invoke('health:providerHealth'),
    agentStatus: (): Promise<unknown> => ipcRenderer.invoke('health:agentStatus'),
  },
  mao: {
    getAgentProjections: (projectId: string): Promise<unknown[]> =>
      ipcRenderer.invoke('mao:getAgentProjections', projectId),
    getProjectControlProjection: (projectId: string): Promise<unknown> =>
      ipcRenderer.invoke('mao:getProjectControlProjection', projectId),
    getProjectSnapshot: (input: unknown): Promise<unknown> =>
      ipcRenderer.invoke('mao:getProjectSnapshot', input),
    requestProjectControl: (input: unknown): Promise<unknown> =>
      ipcRenderer.invoke('mao:requestProjectControl', input),
  },
  preferences: {
    getApiKeys: (): Promise<unknown[]> => ipcRenderer.invoke('preferences:getApiKeys'),
    setApiKey: (input: unknown): Promise<unknown> => ipcRenderer.invoke('preferences:setApiKey', input),
    deleteApiKey: (input: unknown): Promise<unknown> => ipcRenderer.invoke('preferences:deleteApiKey', input),
    testApiKey: (input: unknown): Promise<unknown> => ipcRenderer.invoke('preferences:testApiKey', input),
    getSystemStatus: (): Promise<unknown> => ipcRenderer.invoke('preferences:getSystemStatus'),
    getAvailableModels: (): Promise<unknown> => ipcRenderer.invoke('preferences:getAvailableModels'),
    getModelSelection: (): Promise<unknown> => ipcRenderer.invoke('preferences:getModelSelection'),
    setModelSelection: (input: unknown): Promise<unknown> => ipcRenderer.invoke('preferences:setModelSelection', input),
    getRoleAssignments: (): Promise<unknown> => ipcRenderer.invoke('preferences:getRoleAssignments'),
    setRoleAssignment: (input: unknown): Promise<unknown> => ipcRenderer.invoke('preferences:setRoleAssignment', input),
  },
  appPanels: {
    list: (): Promise<unknown[]> => ipcRenderer.invoke('app-panels:list'),
  },
  mode: {
    get: (): Promise<string | null> => ipcRenderer.invoke('mode:get'),
    set: (mode: string): Promise<void> => ipcRenderer.invoke('mode:set', mode),
  },
})
