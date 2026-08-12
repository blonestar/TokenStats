import { contextBridge, ipcRenderer } from 'electron'
import type { TokenStatsApi } from '../shared/contracts'
const api: TokenStatsApi = { getDashboard: (query) => ipcRenderer.invoke('tokenstats:getDashboard', query), getVersion: () => ipcRenderer.invoke('tokenstats:getVersion'), scanAll: () => ipcRenderer.invoke('tokenstats:scanAll') }
contextBridge.exposeInMainWorld('tokenStats', api)
