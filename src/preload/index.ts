import { contextBridge, ipcRenderer } from 'electron'
import type { TokenStatsApi } from '../shared/contracts'
const api: TokenStatsApi = { getDashboard: (period) => ipcRenderer.invoke('tokenstats:getDashboard', period), scanAll: () => ipcRenderer.invoke('tokenstats:scanAll') }
contextBridge.exposeInMainWorld('tokenStats', api)
