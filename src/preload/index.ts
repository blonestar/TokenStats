import { contextBridge, ipcRenderer } from 'electron'
import type { TokenStatsApi } from '../shared/contracts'
const api: TokenStatsApi = {
  getDashboard: (query) => ipcRenderer.invoke('tokenstats:getDashboard', query),
  getVersion: () => ipcRenderer.invoke('tokenstats:getVersion'),
  scanAll: () => ipcRenderer.invoke('tokenstats:scanAll'),
  resetDatabase: () => ipcRenderer.invoke('tokenstats:resetDatabase'),
  getUpdateState: () => ipcRenderer.invoke('tokenstats:getUpdateState'),
  setUpdateSettings: (settings) => ipcRenderer.invoke('tokenstats:setUpdateSettings', settings),
  checkForUpdates: () => ipcRenderer.invoke('tokenstats:checkForUpdates'),
  downloadUpdate: () => ipcRenderer.invoke('tokenstats:downloadUpdate'),
  installUpdate: () => ipcRenderer.invoke('tokenstats:installUpdate'),
  onUpdateState: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: Parameters<typeof listener>[0]) => listener(state)
    ipcRenderer.on('tokenstats:updateState', handler)
    return () => ipcRenderer.removeListener('tokenstats:updateState', handler)
  }
}
contextBridge.exposeInMainWorld('tokenStats', api)
