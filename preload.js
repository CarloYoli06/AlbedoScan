// preload.js — Bridge seguro entre renderer y proceso principal
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Ventana
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow:    () => ipcRenderer.send('window:close'),

  // Config (escáner recordado, etc.)
  getConfig:      ()    => ipcRenderer.invoke('config:get'),
  setConfig:      (d)   => ipcRenderer.invoke('config:set', d),
  resetDevice:    ()    => ipcRenderer.invoke('config:reset-device'),

  // Escáner
  listScanners:   ()    => ipcRenderer.invoke('scanner:list'),
  scan:           (o)   => ipcRenderer.invoke('scanner:scan', o),
  scanSmart:      (o)   => ipcRenderer.invoke('scanner:scan-smart', o),   // ← nuevo

  // Archivos
  saveImage:      (d)   => ipcRenderer.invoke('file:save-image', d),
  savePDF:        (d)   => ipcRenderer.invoke('file:save-pdf', d),
  readBase64:     (p)   => ipcRenderer.invoke('file:read-base64', p),

  // Diálogos
  showSaveDialog: (o)   => ipcRenderer.invoke('dialog:save', o),
  showOpenFolder: ()    => ipcRenderer.invoke('dialog:open-folder'),

  // Misc
  getDocsPath:    ()    => ipcRenderer.invoke('app:get-docs-path'),
  openPath:       (p)   => ipcRenderer.invoke('shell:open-path', p),
})
