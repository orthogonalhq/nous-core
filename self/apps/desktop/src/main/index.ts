import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { readdir, readFile } from 'node:fs/promises'
import Store from 'electron-store'
import { createTRPCClient, httpBatchLink } from '@trpc/client'

interface StoredLayout {
  version: 1
  layout: unknown
  savedAt: string
}

const store = new Store<{ layoutStore: StoredLayout | undefined }>()

// Hoisted window reference — needed by IPC handlers registered before createWindow
let win: BrowserWindow | null = null

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

// Window control handlers — used by the custom frameless titlebar
ipcMain.handle('win:minimize',    () => win?.minimize())
ipcMain.handle('win:maximize',    () => { if (win) win.isMaximized() ? win.unmaximize() : win.maximize() })
ipcMain.handle('win:close',       () => win?.close())
ipcMain.handle('win:isMaximized', () => win?.isMaximized() ?? false)

// Chat handlers — tRPC proxy to localhost:3000 with mock fallback
// Lazy tRPC client — created on first use
let trpcClient: ReturnType<typeof createTRPCClient> | null = null

function getTrpcClient() {
  if (!trpcClient) {
    trpcClient = createTRPCClient({
      links: [httpBatchLink({ url: 'http://localhost:3000/api/trpc' })],
    })
  }
  return trpcClient
}

const chatHistory: { role: string; content: string; timestamp: string }[] = []

ipcMain.handle('chat:send', async (_event, message: string) => {
  chatHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() })
  try {
    const client = getTrpcClient() as any
    const result = await client.chat.sendMessage.mutate({ message })
    chatHistory.push({ role: 'assistant', content: result.response, timestamp: new Date().toISOString() })
    return { response: result.response, traceId: result.traceId }
  } catch {
    // Fallback mock response for demo
    const mockResponse = `[Demo mode] Nous received: "${message}". The tRPC server is not running — start the web app with \`pnpm dev:web\` to enable live responses.`
    chatHistory.push({ role: 'assistant', content: mockResponse, timestamp: new Date().toISOString() })
    return { response: mockResponse, traceId: 'demo-' + Date.now() }
  }
})

ipcMain.handle('chat:getHistory', () => chatHistory)

function createWindow(): void {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#18181b',
    frame: false,
    titleBarStyle: 'hidden',
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

  win.on('closed', () => { win = null })
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
