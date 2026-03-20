/// <reference types="vite/client" />

import type {
  AppInstallPreparation,
  AppInstallRequest,
  AppInstallResult,
  AppSettingsPreparation,
  AppSettingsSaveRequest,
  AppSettingsSaveResult,
} from '@nous/shared'

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
  appInstall: {
    prepare: (input: {
      project_id: string
      package_id: string
      release_id?: string
    }) => Promise<AppInstallPreparation>
    install: (input: AppInstallRequest) => Promise<AppInstallResult>
  }
  appSettings: {
    prepare: (input: {
      project_id: string
      package_id: string
    }) => Promise<AppSettingsPreparation>
    save: (input: AppSettingsSaveRequest) => Promise<AppSettingsSaveResult>
  }
  appPanels: {
    list: () => Promise<{
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
      src: string
    }[]>
  }
  backend: {
    getStatus: () => Promise<{
      ready: boolean
      port: number | null
      trpcUrl: string | null
    }>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
