/// <reference types="vite/client" />

interface ElectronAPI {
  layout: {
    get: () => Promise<unknown>
    set: (layout: unknown) => Promise<void>
  }
  fs: {
    readDir: (path: string) => Promise<{ name: string; isDirectory: boolean; path: string }[]>
    readFile: (path: string) => Promise<string | null>
  }
  chat: {
    send: (message: string) => Promise<{ response: string; traceId: string }>
    getHistory: () => Promise<{ role: string; content: string; timestamp: string }[]>
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
  appPanels: {
    list: () => Promise<{
      app_id: string
      panel_id: string
      label: string
      route_path: string
      dockview_panel_id: string
      preserve_state: boolean
      position?: 'left' | 'right' | 'bottom' | 'main'
      src: string
    }[]>
  }
}

interface Window {
  electronAPI: ElectronAPI
}
