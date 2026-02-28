import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  layout: {
    get: (): Promise<unknown> => ipcRenderer.invoke('layout:get'),
    set: (layout: unknown): Promise<void> => ipcRenderer.invoke('layout:set', layout),
  },
  fs: {
    readDir: (path: string): Promise<null> => ipcRenderer.invoke('fs:readDir', path),
    readFile: (path: string): Promise<null> => ipcRenderer.invoke('fs:readFile', path),
  },
})
