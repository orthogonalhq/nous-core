import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { readdir, readFile } from 'node:fs/promises'
import Store from 'electron-store'

interface StoredLayout {
  version: 1
  layout: unknown
  savedAt: string
}

const store = new Store<{ layoutStore: StoredLayout | undefined }>()

// IPC handlers registered once — before any window is created
ipcMain.handle('layout:get', () => {
  const stored = store.get('layoutStore')
  return stored?.layout ?? null
})

ipcMain.handle('layout:set', (_event, layout: unknown) => {
  store.set('layoutStore', {
    version: 1,
    layout,
    savedAt: new Date().toISOString(),
  } satisfies StoredLayout)
})

// Filesystem handlers — implemented in ui/phase-1.4
ipcMain.handle('fs:readDir', async (_event, dirPath: string) => {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    return entries.map(e => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      path: dirPath.replace(/\\/g, '/') + '/' + e.name,
    }))
  } catch {
    return []
  }
})

ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
  try {
    const content = await readFile(filePath, 'utf-8')
    return content
  } catch {
    return null
  }
})

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#18181b',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env['NODE_ENV'] === 'development') {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] ?? 'http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
