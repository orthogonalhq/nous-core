/// <reference types="vite/client" />

interface ElectronAPI {
  layout: {
    get: () => Promise<unknown>
    set: (layout: unknown) => Promise<void>
  }
  fs: {
    readDir: (path: string) => Promise<null>
    readFile: (path: string) => Promise<null>
  }
}

interface Window {
  electronAPI: ElectronAPI
}
