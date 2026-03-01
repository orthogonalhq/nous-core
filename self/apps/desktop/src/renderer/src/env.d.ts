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
}

interface Window {
  electronAPI: ElectronAPI
}
