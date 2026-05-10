// main.js — Proceso principal de Electron para Escaner Albedo
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path   = require('path')
const fs     = require('fs')
const { spawn } = require('child_process')

// ── Rutas ────────────────────────────────────────────────────────────────────
const isDev      = !app.isPackaged
const scriptsDir = isDev
  ? path.join(__dirname, 'scripts')
  : path.join(process.resourcesPath, 'scripts')

const tempDir    = path.join(app.getPath('temp'), 'EscanerAlbedo')

// ── Config persistente (guarda el escáner seleccionado, etc.) ─────────────────
let configPath   // inicializado en whenReady (necesita app.getPath)
function readConfig()  {
  try { return JSON.parse(fs.readFileSync(configPath, 'utf8')) } catch { return {} }
}
function writeConfig(data) {
  try {
    const c = readConfig()
    fs.writeFileSync(configPath, JSON.stringify({ ...c, ...data }, null, 2))
  } catch (e) { console.error('Config write:', e.message) }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

// Scripts de fondo: con -Sta (WIA lo necesita) pero SIN mostrar ventana
function runPowerShell(scriptPath, params = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      '-Sta',                      // ← WIA DeviceManager requiere STA
      '-NoProfile', '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath
    ]
    for (const [k, v] of Object.entries(params)) args.push(`-${k}`, String(v))

    const ps = spawn('powershell.exe', args, { windowsHide: true })
    let stdout = '', stderr = ''
    ps.stdout.on('data', d => { stdout += d.toString('utf8') })
    ps.stderr.on('data', d => { stderr += d.toString('utf8') })
    ps.on('close', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim() || `PS exit ${code}`)))
    ps.on('error', reject)
  })
}

// Scripts interactivos: con -Sta, SIN -NonInteractive → pueden mostrar diálogos WIA
function runPowerShellInteractive(scriptPath, params = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      '-Sta',
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath
    ]
    for (const [k, v] of Object.entries(params)) args.push(`-${k}`, String(v))

    const ps = spawn('powershell.exe', args, { windowsHide: false, detached: false })
    let stdout = '', stderr = ''
    ps.stdout.on('data', d => { stdout += d.toString('utf8') })
    ps.stderr.on('data', d => { stderr += d.toString('utf8') })
    ps.on('close', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim() || `PS exit ${code}`)))
    ps.on('error', reject)
  })
}

// ── Ventana principal ─────────────────────────────────────────────────────────
let mainWin

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1280, height: 820,
    minWidth: 960, minHeight: 640,
    frame: false,
    backgroundColor: '#0a0e1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false
  })
  mainWin.loadFile(path.join(__dirname, 'src', 'index.html'))
  mainWin.once('ready-to-show', () => mainWin.show())
  if (isDev) mainWin.webContents.openDevTools({ mode: 'detach' })
}

app.whenReady().then(() => {
  configPath = path.join(app.getPath('userData'), 'albedo-config.json')
  ensureDir(tempDir)
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// ── IPC: Ventana ──────────────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => mainWin?.minimize())
ipcMain.on('window:maximize', () => mainWin?.isMaximized() ? mainWin.unmaximize() : mainWin.maximize())
ipcMain.on('window:close',    () => mainWin?.close())

// ── IPC: Config ───────────────────────────────────────────────────────────────
ipcMain.handle('config:get', ()        => readConfig())
ipcMain.handle('config:set', (_e, d)   => { writeConfig(d); return readConfig() })
ipcMain.handle('config:reset-device',  () => { writeConfig({ deviceId: '', deviceName: '' }); return true })

// ── IPC: Escáner — listar ─────────────────────────────────────────────────────
ipcMain.handle('scanner:list', async () => {
  try {
    // Ahora usa -Sta → debería detectar escáneres WiFi/WSD
    const raw = await runPowerShell(path.join(scriptsDir, 'list-scanners.ps1'))
    if (!raw || raw === 'null') return []
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list : []
  } catch (e) {
    console.error('scanner:list error', e.message)
    return []
  }
})

// ── IPC: Escáner — escaneo inteligente (recuerda dispositivo) ──────────────────
// Primera vez: abre selector Windows → el usuario elige 1 vez → se guarda el ID
// Siguientes veces: escaneo directo sin ningún diálogo, con los ajustes de la app
ipcMain.handle('scanner:scan-smart', async (_e, opts = {}) => {
  try {
    ensureDir(tempDir)
    const ts  = Date.now()
    const out = path.join(tempDir, `scan_${ts}.png`)

    const cfg      = readConfig()
    const savedId  = opts.forceSelect ? '' : (cfg.deviceId || '')
    const needDialog = !savedId

    if (needDialog) {
      // Primera vez: minimizar para que el selector de Windows sea visible
      if (mainWin) { mainWin.setAlwaysOnTop(false); mainWin.minimize() }
      await new Promise(r => setTimeout(r, 400))
    }

    const params = {
      OutputPath: out,
      DPI:        opts.dpi        ?? cfg.dpi        ?? 300,
      ColorMode:  opts.colorMode  ?? cfg.colorMode  ?? 2,
      Brightness: opts.brightness ?? 0,
      Contrast:   opts.contrast   ?? 0
    }
    if (savedId) params.DeviceId = savedId

    let raw, json
    try {
      // Si hay diálogo → interactivo; si ya tenemos ID → background (más rápido)
      if (needDialog) {
        raw  = await runPowerShellInteractive(path.join(scriptsDir, 'scan-with-select.ps1'), params)
      } else {
        raw  = await runPowerShell(path.join(scriptsDir, 'scan-with-select.ps1'), params)
      }
    } finally {
      if (needDialog && mainWin) { mainWin.restore(); mainWin.focus() }
    }

    json = JSON.parse(raw)

    if (json.error === 'CANCELLED') return { success: false, cancelled: true }
    if (!json.success) return { success: false, error: json.error }

    // Guardar el device ID para la próxima vez
    if (json.deviceId) {
      writeConfig({ deviceId: json.deviceId, deviceName: json.deviceName })
    }

    const buf    = fs.readFileSync(json.path)
    const base64 = 'data:image/png;base64,' + buf.toString('base64')
    return {
      success:    true,
      base64,
      tempPath:   json.path,
      deviceId:   json.deviceId,
      deviceName: json.deviceName
    }

  } catch (e) {
    if (mainWin) { try { mainWin.restore(); mainWin.focus() } catch {} }
    return { success: false, error: e.message }
  }
})

// ── IPC: Escáner — escaneo clásico (con device ID del dropdown) ───────────────
ipcMain.handle('scanner:scan', async (_e, opts = {}) => {
  try {
    ensureDir(tempDir)
    const ts  = Date.now()
    const out = path.join(tempDir, `scan_${ts}.png`)
    const params = {
      OutputPath: out,
      DPI:        opts.dpi        ?? 300,
      ColorMode:  opts.colorMode  ?? 2,
      Brightness: opts.brightness ?? 0,
      Contrast:   opts.contrast   ?? 0
    }
    if (opts.deviceId) params.DeviceId = opts.deviceId

    const raw  = await runPowerShell(path.join(scriptsDir, 'scan.ps1'), params)
    const json = JSON.parse(raw)
    if (!json.success) return { success: false, error: json.error }

    const buf    = fs.readFileSync(json.path)
    const base64 = 'data:image/png;base64,' + buf.toString('base64')
    return { success: true, base64, tempPath: json.path }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ── IPC: Archivos ─────────────────────────────────────────────────────────────
ipcMain.handle('file:save-image', async (_e, { base64, destPath }) => {
  try {
    const data = base64.replace(/^data:image\/\w+;base64,/, '')
    fs.writeFileSync(destPath, Buffer.from(data, 'base64'))
    return { success: true, path: destPath }
  } catch (e) { return { success: false, error: e.message } }
})

ipcMain.handle('file:save-pdf', async (_e, { imagePaths, destPath, pageSize }) => {
  return new Promise((resolve) => {
    try {
      const PDFDocument = require('pdfkit')
      const doc = new PDFDocument({ autoFirstPage: false, margin: 0 })
      const ws  = fs.createWriteStream(destPath)
      doc.pipe(ws)

      const size = pageSize === 'letter' ? [612, 792] : [595.28, 841.89]
      for (const imgPath of imagePaths) {
        if (!fs.existsSync(imgPath)) continue
        doc.addPage({ size, margin: 0 })
        doc.image(imgPath, 0, 0, { fit: [size[0], size[1]], align: 'center', valign: 'center' })
      }

      doc.end()
      ws.on('finish', () => resolve({ success: true, path: destPath }))
      ws.on('error',  e  => resolve({ success: false, error: e.message }))
    } catch (e) { resolve({ success: false, error: e.message }) }
  })
})

ipcMain.handle('dialog:save',       async (_e, opts) => dialog.showSaveDialog(mainWin, opts))
ipcMain.handle('dialog:open-folder', async () => dialog.showOpenDialog(mainWin, {
  properties: ['openDirectory'], title: 'Seleccionar carpeta de destino'
}))
ipcMain.handle('app:get-docs-path', () => {
  const d = path.join(app.getPath('documents'), 'EscanerAlbedo')
  ensureDir(d); return d
})
ipcMain.handle('shell:open-path',   async (_e, p) => shell.openPath(p))
ipcMain.handle('file:read-base64',  async (_e, filePath) => {
  try {
    const buf  = fs.readFileSync(filePath)
    const ext  = path.extname(filePath).toLowerCase().replace('.', '')
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
    return { success: true, base64: `data:${mime};base64,${buf.toString('base64')}` }
  } catch (e) { return { success: false, error: e.message } }
})
