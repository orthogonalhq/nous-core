import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readdir, readFile } from 'node:fs/promises'
import Store from 'electron-store'
import { createTRPCClient, httpBatchLink } from '@trpc/client'

interface StoredLayout {
  version: 1
  layout: unknown
  savedAt: string
}

const store = new Store<{ layoutStore: StoredLayout | undefined }>()
const execFileAsync = promisify(execFile)

// Hoisted window reference — needed by IPC handlers registered before createWindow
let win: BrowserWindow | null = null

type JsonRecord = Record<string, unknown>

interface UsageWindowSnapshot {
  usedPercent: number | null
  windowMinutes: number | null
  resetsAt: string | null
}

interface ProviderUsageSnapshot {
  primary: UsageWindowSnapshot | null
  secondary: UsageWindowSnapshot | null
  tertiary: UsageWindowSnapshot | null
  updatedAt: string | null
  accountEmail: string | null
  accountOrganization: string | null
  loginMethod: string | null
}

interface ProviderStatusSnapshot {
  indicator: string
  description: string | null
  updatedAt: string | null
  url: string | null
}

interface ProviderUsageEntry {
  provider: string
  displayName: string
  sourceLabel: string | null
  usage: ProviderUsageSnapshot | null
  creditsRemaining: number | null
  codeReviewRemainingPercent: number | null
  extraUsageUsedUsd: number | null
  extraUsageLimitUsd: number | null
  todayCostUsd: number | null
  todayTokens: number | null
  last30DaysCostUsd: number | null
  last30DaysTokens: number | null
  status: ProviderStatusSnapshot | null
  errors: string[]
}

interface DesktopUsageSnapshot {
  generatedAt: string
  source: 'codexbar-cli' | 'fallback'
  warning?: string
  providers: ProviderUsageEntry[]
}

interface WebHostAppPanel {
  app_id: string
  panel_id: string
  label: string
  route_path: string
  dockview_panel_id: string
  config_version: string
  preserve_state: boolean
  position?: 'left' | 'right' | 'bottom' | 'main'
  config_snapshot: Record<string, {
    value: unknown
    source: 'manifest_default' | 'project_config' | 'system'
  }>
}

interface DesktopAppPanel extends WebHostAppPanel {
  src: string
}

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  codex: 'Codex',
  claude: 'Claude',
  cursor: 'Cursor',
  opencode: 'OpenCode',
  factory: 'Factory',
  gemini: 'Gemini',
  antigravity: 'Antigravity',
  copilot: 'Copilot',
  zai: 'z.ai',
  minimax: 'MiniMax',
  kimi: 'Kimi',
  kimik2: 'Kimi K2',
  kiro: 'Kiro',
  vertexai: 'Vertex AI',
  augment: 'Augment',
  jetbrains: 'JetBrains AI',
  amp: 'Amp',
  ollama: 'Ollama',
  synthetic: 'Synthetic',
  warp: 'Warp',
  openrouter: 'OpenRouter',
}

const DEFAULT_WEB_SERVER_BASE_URL = 'http://localhost:3000'

function asRecord(value: unknown): JsonRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as JsonRecord
}

function pickString(record: JsonRecord | null, ...keys: string[]): string | null {
  if (!record) return null
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

function pickNumber(record: JsonRecord | null, ...keys: string[]): number | null {
  if (!record) return null
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

function parseWindow(value: unknown): UsageWindowSnapshot | null {
  const record = asRecord(value)
  if (!record) return null
  return {
    usedPercent: pickNumber(record, 'usedPercent', 'used_percent'),
    windowMinutes: pickNumber(record, 'windowMinutes', 'window_minutes'),
    resetsAt: pickString(record, 'resetsAt', 'resets_at'),
  }
}

function parseUsage(value: unknown): ProviderUsageSnapshot | null {
  const record = asRecord(value)
  if (!record) return null
  const identity = asRecord(record['identity'])
  return {
    primary: parseWindow(record['primary']),
    secondary: parseWindow(record['secondary']),
    tertiary: parseWindow(record['tertiary'] ?? record['model_specific']),
    updatedAt: pickString(record, 'updatedAt', 'updated_at'),
    accountEmail: pickString(record, 'accountEmail', 'account_email') ??
      pickString(identity, 'accountEmail', 'account_email'),
    accountOrganization: pickString(record, 'accountOrganization', 'account_organization') ??
      pickString(identity, 'accountOrganization', 'account_organization'),
    loginMethod: pickString(record, 'loginMethod', 'login_method') ??
      pickString(identity, 'loginMethod', 'login_method'),
  }
}

function parseStatus(value: unknown): ProviderStatusSnapshot | null {
  const record = asRecord(value)
  if (!record) return null
  return {
    indicator: (pickString(record, 'indicator') ?? 'unknown').toLowerCase(),
    description: pickString(record, 'description'),
    updatedAt: pickString(record, 'updatedAt', 'updated_at'),
    url: pickString(record, 'url'),
  }
}

function parseErrors(record: JsonRecord): string[] {
  const list: string[] = []
  const directError = record['error']
  if (typeof directError === 'string' && directError.length > 0) {
    list.push(directError)
  }
  const errors = record['errors']
  if (Array.isArray(errors)) {
    for (const entry of errors) {
      if (typeof entry === 'string' && entry.length > 0) list.push(entry)
    }
  }
  return list
}

function providerDisplayName(providerId: string): string {
  const normalized = providerId.toLowerCase()
  return PROVIDER_DISPLAY_NAMES[normalized] ?? providerId
}

function getWebServerBaseUrl(): string {
  return process.env['NOUS_WEB_BASE_URL']?.trim() || DEFAULT_WEB_SERVER_BASE_URL
}

function buildWebServerUrl(pathname: string): string {
  return new URL(pathname, getWebServerBaseUrl()).toString()
}

function parseProviderEntry(value: unknown): ProviderUsageEntry | null {
  const record = asRecord(value)
  if (!record) return null

  const providerId = (pickString(record, 'provider', 'id') ?? 'unknown').toLowerCase()
  const displayName = pickString(record, 'displayName', 'display_name') ?? providerDisplayName(providerId)
  const usage = parseUsage(record['usage'])
  const status = parseStatus(record['status'])
  const credits = asRecord(record['credits'])
  const cost = asRecord(record['cost'])
  const tokenUsage = asRecord(
    record['tokenUsage'] ??
      record['token_usage'] ??
      record['totals']
  )
  const dashboard = asRecord(record['openaiDashboard'] ?? record['openAIDashboard'])

  const entry: ProviderUsageEntry = {
    provider: providerId,
    displayName,
    sourceLabel: pickString(record, 'sourceLabel', 'source'),
    usage,
    creditsRemaining: pickNumber(credits, 'remaining') ??
      pickNumber(record, 'creditsRemaining', 'credits_remaining'),
    codeReviewRemainingPercent: pickNumber(dashboard, 'codeReviewRemainingPercent', 'code_review_remaining_percent'),
    extraUsageUsedUsd: pickNumber(cost, 'used', 'sessionCostUSD', 'session_cost_usd') ??
      pickNumber(record, 'extraUsageUsedUsd', 'extra_usage_used_usd'),
    extraUsageLimitUsd: pickNumber(cost, 'limit', 'sessionLimitUSD', 'session_limit_usd') ??
      pickNumber(record, 'extraUsageLimitUsd', 'extra_usage_limit_usd'),
    todayCostUsd: pickNumber(tokenUsage, 'sessionCostUSD', 'session_cost_usd', 'todayCostUSD', 'today_cost_usd') ??
      pickNumber(record, 'todayCostUsd', 'today_cost_usd', 'sessionCostUSD', 'session_cost_usd'),
    todayTokens: pickNumber(tokenUsage, 'sessionTokens', 'session_tokens', 'todayTokens', 'today_tokens') ??
      pickNumber(record, 'todayTokens', 'today_tokens', 'sessionTokens', 'session_tokens'),
    last30DaysCostUsd: pickNumber(tokenUsage, 'last30DaysCostUSD', 'last30_days_cost_usd', 'monthCostUSD', 'month_cost_usd') ??
      pickNumber(record, 'last30DaysCostUsd', 'last30_days_cost_usd', 'monthCostUSD', 'month_cost_usd'),
    last30DaysTokens: pickNumber(tokenUsage, 'last30DaysTokens', 'last30_days_tokens', 'monthTokens', 'month_tokens') ??
      pickNumber(record, 'last30DaysTokens', 'last30_days_tokens', 'monthTokens', 'month_tokens'),
    status,
    errors: parseErrors(record),
  }

  return entry
}

function ensureText(value: string | Buffer): string {
  return typeof value === 'string' ? value : value.toString('utf8')
}

function extractJsonPayload(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed

  const firstObject = trimmed.indexOf('{')
  const firstArray = trimmed.indexOf('[')
  let startIndex = -1
  let closingChar = '}'

  if (firstObject >= 0 && firstArray >= 0) {
    if (firstObject < firstArray) {
      startIndex = firstObject
      closingChar = '}'
    } else {
      startIndex = firstArray
      closingChar = ']'
    }
  } else if (firstObject >= 0) {
    startIndex = firstObject
    closingChar = '}'
  } else if (firstArray >= 0) {
    startIndex = firstArray
    closingChar = ']'
  }

  if (startIndex < 0) return null
  const endIndex = trimmed.lastIndexOf(closingChar)
  if (endIndex <= startIndex) return null
  return trimmed.slice(startIndex, endIndex + 1)
}

function parseCodexBarProviders(raw: string): ProviderUsageEntry[] {
  const payload = extractJsonPayload(raw)
  if (!payload) return []

  try {
    const decoded: unknown = JSON.parse(payload)
    const entries = Array.isArray(decoded) ? decoded : [decoded]
    return entries
      .map(parseProviderEntry)
      .filter((entry): entry is ProviderUsageEntry => entry !== null)
  } catch {
    return []
  }
}

function fallbackUsageSnapshot(reason: string): DesktopUsageSnapshot {
  const now = Date.now()
  const inHours = (hours: number) => new Date(now + hours * 60 * 60 * 1000).toISOString()
  const inDays = (days: number) => new Date(now + days * 24 * 60 * 60 * 1000).toISOString()

  return {
    generatedAt: new Date().toISOString(),
    source: 'fallback',
    warning: reason,
    providers: [
      {
        provider: 'codex',
        displayName: 'Codex',
        sourceLabel: 'demo',
        usage: {
          primary: { usedPercent: 34, windowMinutes: 300, resetsAt: inHours(2) },
          secondary: { usedPercent: 57, windowMinutes: 10080, resetsAt: inDays(4) },
          tertiary: null,
          updatedAt: new Date().toISOString(),
          accountEmail: null,
          accountOrganization: null,
          loginMethod: 'Plus',
        },
        creditsRemaining: 74.2,
        codeReviewRemainingPercent: 100,
        extraUsageUsedUsd: 0,
        extraUsageLimitUsd: 2000,
        todayCostUsd: 0.04,
        todayTokens: 15000,
        last30DaysCostUsd: 254.24,
        last30DaysTokens: 218000000,
        status: { indicator: 'none', description: 'Operational', updatedAt: new Date().toISOString(), url: 'https://status.openai.com' },
        errors: [],
      },
      {
        provider: 'claude',
        displayName: 'Claude',
        sourceLabel: 'demo',
        usage: {
          primary: { usedPercent: 22, windowMinutes: 300, resetsAt: inHours(1.5) },
          secondary: { usedPercent: 63, windowMinutes: 10080, resetsAt: inDays(3) },
          tertiary: { usedPercent: 71, windowMinutes: 10080, resetsAt: inDays(3) },
          updatedAt: new Date().toISOString(),
          accountEmail: null,
          accountOrganization: null,
          loginMethod: 'Pro',
        },
        creditsRemaining: null,
        codeReviewRemainingPercent: null,
        extraUsageUsedUsd: 0,
        extraUsageLimitUsd: 2000,
        todayCostUsd: 0.01,
        todayTokens: 6500,
        last30DaysCostUsd: 89.52,
        last30DaysTokens: 72000000,
        status: { indicator: 'none', description: 'Operational', updatedAt: new Date().toISOString(), url: 'https://status.anthropic.com' },
        errors: [],
      },
      {
        provider: 'cursor',
        displayName: 'Cursor',
        sourceLabel: 'demo',
        usage: {
          primary: { usedPercent: 76, windowMinutes: 43200, resetsAt: inDays(18) },
          secondary: null,
          tertiary: null,
          updatedAt: new Date().toISOString(),
          accountEmail: null,
          accountOrganization: null,
          loginMethod: null,
        },
        creditsRemaining: null,
        codeReviewRemainingPercent: null,
        extraUsageUsedUsd: null,
        extraUsageLimitUsd: null,
        todayCostUsd: null,
        todayTokens: null,
        last30DaysCostUsd: null,
        last30DaysTokens: null,
        status: { indicator: 'minor', description: 'Minor incident', updatedAt: new Date().toISOString(), url: 'https://status.cursor.com' },
        errors: [],
      },
    ],
  }
}

async function runCodexBar(args: string[]): Promise<ProviderUsageEntry[] | null> {
  try {
    const result = await execFileAsync('codexbar', args, {
      encoding: 'utf8',
      timeout: 12_000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    })
    const providers = parseCodexBarProviders(ensureText(result.stdout))
    return providers.length > 0 ? providers : null
  } catch {
    return null
  }
}

async function loadUsageSnapshot(): Promise<DesktopUsageSnapshot> {
  const attempts: string[][] = [
    ['usage', '--format', 'json', '--provider', 'all', '--status'],
    ['usage', '--format', 'json', '--provider', 'all'],
    ['--format', 'json', '--provider', 'all', '--status'],
    ['--format', 'json', '--provider', 'all'],
  ]

  for (const args of attempts) {
    const providers = await runCodexBar(args)
    if (providers) {
      return {
        generatedAt: new Date().toISOString(),
        source: 'codexbar-cli',
        providers,
      }
    }
  }

  return fallbackUsageSnapshot(
    'codexbar CLI unavailable or returned unparseable JSON. Install CodexBar CLI to enable live usage data.'
  )
}

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

ipcMain.handle('usage:getSnapshot', async () => loadUsageSnapshot())

// Window control handlers — used by the custom frameless titlebar
ipcMain.handle('win:minimize',         () => win?.minimize())
ipcMain.handle('win:maximize',         () => {
  if (!win) return
  if (win.isMaximized()) {
    win.unmaximize()
    return
  }
  win.maximize()
})
ipcMain.handle('win:close',            () => win?.close())
ipcMain.handle('win:isMaximized',      () => win?.isMaximized() ?? false)
ipcMain.handle('win:toggleDevTools',   () => win?.webContents.toggleDevTools())
ipcMain.handle('win:toggleFullScreen', () => win?.setFullScreen(!win?.isFullScreen()))
ipcMain.handle('win:isFullScreen',     () => win?.isFullScreen() ?? false)
ipcMain.handle('app:quit',             () => app.quit())
ipcMain.handle('app:newWindow',        () => createWindow())

// Chat handlers — tRPC proxy to localhost:3000 with mock fallback
// Lazy tRPC client — created on first use
let trpcClient: ReturnType<typeof createTRPCClient> | null = null

function getTrpcClient() {
  if (!trpcClient) {
    trpcClient = createTRPCClient({
      links: [httpBatchLink({ url: buildWebServerUrl('/api/trpc') })],
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
ipcMain.handle('app-install:prepare', async (_event, input: unknown) => {
  const client = getTrpcClient() as any
  return client.packages.prepareAppInstall.query(input)
})
ipcMain.handle('app-install:install', async (_event, input: unknown) => {
  const client = getTrpcClient() as any
  return client.packages.installApp.mutate(input)
})
ipcMain.handle('app-settings:prepare', async (_event, input: unknown) => {
  const client = getTrpcClient() as any
  return client.packages.prepareAppSettings.query(input)
})
ipcMain.handle('app-settings:save', async (_event, input: unknown) => {
  const client = getTrpcClient() as any
  return client.packages.saveAppSettings.mutate(input)
})
ipcMain.handle('app-panels:list', async (): Promise<DesktopAppPanel[]> => {
  try {
    const client = getTrpcClient() as any
    const panels = await client.packages.listAppPanels.query()
    if (!Array.isArray(panels)) return []
    return panels.map((panel: WebHostAppPanel) => ({
      ...panel,
      src: buildWebServerUrl(panel.route_path),
    }))
  } catch {
    return []
  }
})

function createWindow(): void {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1e1e1e',  // --nous-bg — flash-prevention; must match renderer
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
    win.webContents.on('context-menu', (_e, params) => {
      win?.webContents.inspectElement(params.x, params.y)
    })
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
