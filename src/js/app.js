// app.js — Lógica principal de Escaner Albedo

// ── Estado ────────────────────────────────────────────────────────────────────
const state = {
  savedDevice:   { id: '', name: '' }, // escáner recordado
  pages:         [],
  currentPage:   -1,
  destFolder:    null,
  lastSavedPath: null,
  cropMode:      false,
  autoCropRect:  null,
}

// ── Editor ────────────────────────────────────────────────────────────────────
const editor = new ImageEditor('main-canvas', 'crop-canvas')

// ── Refs DOM ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id)

const savedDeviceName   = $('saved-device-name')
const savedDeviceSub    = $('saved-device-sub')
const btnChangeScanner  = $('btn-change-scanner')
const statusDot         = $('status-dot')
const statusText        = $('status-text')

const pagesList         = $('pages-list')
const noPagesMsg        = $('no-pages-msg')
const btnScan           = $('btn-scan')
const scanBtnText       = $('scan-btn-text')
const btnScanNative     = $('btn-scan-native')
const btnClearAll       = $('btn-clear-all')

const toolCrop          = $('tool-crop')
const toolAutoCrop      = $('tool-autocrop')
const toolCropApply     = $('tool-crop-apply')
const toolCropCancel    = $('tool-crop-cancel')
const toolRotLeft       = $('tool-rot-left')
const toolRotRight      = $('tool-rot-right')
const toolFlipH         = $('tool-flip-h')
const toolZoomIn        = $('tool-zoom-in')
const toolZoomOut       = $('tool-zoom-out')
const toolZoomFit       = $('tool-zoom-fit')
const zoomLabel         = $('zoom-label')
const toolResetEdits    = $('tool-reset-edits')

const autocropBanner    = $('autocrop-banner')
const bannerAccept      = $('banner-accept')
const bannerDismiss     = $('banner-dismiss')

const canvasWrapper     = $('canvas-wrapper')
const canvasContainer   = $('canvas-container')
const canvasPlaceholder = $('canvas-placeholder')

const cfgDPI            = $('cfg-dpi')
const cfgColor          = $('cfg-color')
const cfgBrightness     = $('cfg-brightness')
const cfgContrast       = $('cfg-contrast')
const lblBrightness     = $('lbl-brightness')
const lblContrast       = $('lbl-contrast')
const imgBrightness     = $('img-brightness')
const imgContrast       = $('img-contrast')
const imgSharpness      = $('img-sharpness')
const lblImgBrightness  = $('lbl-img-brightness')
const lblImgContrast    = $('lbl-img-contrast')
const lblImgSharpness   = $('lbl-img-sharpness')

const cfgFormat         = $('cfg-format')
const cfgPageSize       = $('cfg-page-size')
const pdfOptions        = $('pdf-options')
const btnPickFolder     = $('btn-pick-folder')
const destFolderLabel   = $('dest-folder-label')
const btnExport         = $('btn-export')
const btnOpenFolder     = $('btn-open-folder')

const scanOverlay       = $('scan-overlay')
const toastContainer    = $('toast-container')

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info', duration = 3000) {
  const el = document.createElement('div')
  el.className = `toast ${type}`
  const icons = { success: '✅', error: '❌', info: 'ℹ️' }
  el.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`
  toastContainer.appendChild(el)
  setTimeout(() => el.remove(), duration + 300)
}

// ── Dispositivo recordado ─────────────────────────────────────────────────────
function updateDeviceDisplay() {
  const { id, name } = state.savedDevice
  if (id && name) {
    savedDeviceName.textContent = name
    savedDeviceSub.textContent  = 'Escáner recordado ✓'
    statusDot.className         = 'status-dot ok'
    statusText.textContent      = 'Listo'
    btnScan.disabled            = false
  } else {
    savedDeviceName.textContent = '—'
    savedDeviceSub.textContent  = 'Pulsa Escanear para seleccionar'
    statusDot.className         = 'status-dot warn'
    statusText.textContent      = 'Sin seleccionar'
    btnScan.disabled            = false // siempre habilitado; mostrará el selector la 1ª vez
  }
}

async function loadSavedDevice() {
  try {
    const cfg = await window.electronAPI.getConfig()
    if (cfg.deviceId) {
      state.savedDevice = { id: cfg.deviceId, name: cfg.deviceName || 'Escáner' }
    }
  } catch {}
  updateDeviceDisplay()
}

// Botón "Cambiar escáner" → fuerza mostrar el selector de Windows
btnChangeScanner.addEventListener('click', async () => {
  await window.electronAPI.resetDevice()
  state.savedDevice = { id: '', name: '' }
  updateDeviceDisplay()
  toast('Selecciona tu escáner en el próximo escaneo', 'info')
})

// ── Escaneo inteligente ───────────────────────────────────────────────────────
async function doScan(forceSelect = false) {
  const needsDialog = !state.savedDevice.id || forceSelect

  if (needsDialog) {
    scanOverlay.classList.add('visible')
    document.querySelector('.scan-overlay-text').textContent = 'Selecciona tu escáner…'
    document.querySelector('.scan-overlay-sub').textContent  = 'La app se minimizará — elige el escáner en el diálogo'
    await new Promise(r => setTimeout(r, 700))
    scanOverlay.classList.remove('visible')
  } else {
    scanOverlay.classList.add('visible')
    document.querySelector('.scan-overlay-text').textContent = 'Escaneando…'
    document.querySelector('.scan-overlay-sub').textContent  = 'Por favor no mueva el documento'
  }

  btnScan.disabled = true
  btnScan.classList.add('scanning')
  scanBtnText.textContent = needsDialog ? 'Seleccionando…' : 'Escaneando…'

  try {
    const result = await window.electronAPI.scanSmart({
      deviceId:    state.savedDevice.id || '',
      forceSelect,
      dpi:         parseInt(cfgDPI.value),
      colorMode:   parseInt(cfgColor.value),
      brightness:  parseInt(cfgBrightness.value),
      contrast:    parseInt(cfgContrast.value),
    })

    if (result.cancelled) { toast('Escaneo cancelado', 'info'); return }
    if (!result.success)  throw new Error(result.error)

    // Guardar el escáner si vino uno nuevo
    if (result.deviceId && result.deviceId !== state.savedDevice.id) {
      state.savedDevice = { id: result.deviceId, name: result.deviceName || 'Escáner' }
      updateDeviceDisplay()
      toast(`Escáner guardado: ${result.deviceName}`, 'success', 4000)
    }

    const page = { base64: result.base64, tempPath: result.tempPath }
    state.pages.push(page)
    state.currentPage = state.pages.length - 1

    addPageThumb(page, state.currentPage)
    await showPage(state.currentPage)
    toast('Escaneo completado', 'success')

  } catch (e) {
    toast('Error al escanear: ' + e.message, 'error', 5000)
  } finally {
    scanOverlay.classList.remove('visible')
    document.querySelector('.scan-overlay-text').textContent = 'Escaneando…'
    document.querySelector('.scan-overlay-sub').textContent  = 'Por favor no mueva el documento'
    btnScan.disabled = false
    btnScan.classList.remove('scanning')
    scanBtnText.textContent = 'Escanear'
    updateUI()
  }
}

btnScan.addEventListener('click',       () => doScan(false))
btnScanNative?.addEventListener('click', () => doScan(true))  // forceSelect

// ── Páginas ───────────────────────────────────────────────────────────────────
function addPageThumb(page, index) {
  noPagesMsg.style.display = 'none'
  const div = document.createElement('div')
  div.className = 'page-thumb'
  div.dataset.index = index
  div.innerHTML = `
    <img src="${page.base64}" alt="Página ${index + 1}"/>
    <span class="page-num">${index + 1}</span>
    <button class="page-del" title="Eliminar" data-index="${index}">✕</button>
  `
  div.addEventListener('click', (e) => {
    if (e.target.classList.contains('page-del')) return
    showPage(parseInt(div.dataset.index))
  })
  div.querySelector('.page-del').addEventListener('click', (e) => {
    e.stopPropagation()
    deletePage(parseInt(e.target.dataset.index))
  })
  pagesList.appendChild(div)
  div.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

function deletePage(index) {
  state.pages.splice(index, 1)
  rebuildPagesList()
  if (state.pages.length === 0) { state.currentPage = -1; showPlaceholder() }
  else { state.currentPage = Math.min(index, state.pages.length - 1); showPage(state.currentPage) }
  updateUI()
}

function rebuildPagesList() {
  pagesList.innerHTML = ''
  if (state.pages.length === 0) { noPagesMsg.style.display = 'block'; return }
  noPagesMsg.style.display = 'none'
  state.pages.forEach((p, i) => addPageThumb(p, i))
}

async function showPage(index) {
  if (index < 0 || index >= state.pages.length) return
  state.currentPage = index
  document.querySelectorAll('.page-thumb').forEach((t, i) => t.classList.toggle('active', i === index))
  canvasPlaceholder.style.display = 'none'
  canvasContainer.style.display   = 'inline-block'
  await editor.loadBase64(state.pages[index].base64)
  editor.fitToWrapper(canvasWrapper)
  updateZoomLabel()
  enableEditorTools(true)
  imgBrightness.value = 0; lblImgBrightness.textContent = '0'
  imgContrast.value   = 0; lblImgContrast.textContent   = '0'
  imgSharpness.value  = 0; lblImgSharpness.textContent  = '0'
  checkAutoCrop()
}

function showPlaceholder() {
  canvasPlaceholder.style.display = 'flex'
  canvasContainer.style.display   = 'none'
  enableEditorTools(false)
  autocropBanner.classList.remove('visible')
}

function checkAutoCrop() {
  const rect = editor.detectWhiteMargins()
  state.autoCropRect = rect
  autocropBanner.classList.toggle('visible', !!rect)
}

btnClearAll.addEventListener('click', () => {
  state.pages = []; state.currentPage = -1
  rebuildPagesList(); showPlaceholder(); updateUI()
})

// ── Auto-crop banner ──────────────────────────────────────────────────────────
bannerAccept.addEventListener('click', () => {
  editor.applyAutoCrop(state.autoCropRect)
  updateCurrentPageThumb()
  autocropBanner.classList.remove('visible')
  updateZoomLabel()
  toast('Auto-recorte aplicado', 'success')
})
bannerDismiss.addEventListener('click', () => autocropBanner.classList.remove('visible'))

// ── Herramientas ──────────────────────────────────────────────────────────────
function enableEditorTools(on) {
  [toolCrop, toolAutoCrop, toolRotLeft, toolRotRight, toolFlipH,
   toolZoomIn, toolZoomOut, toolZoomFit, toolResetEdits].forEach(t => t.disabled = !on)
}

toolCrop.addEventListener('click', () => {
  if (state.cropMode) {
    editor.exitCropMode(); state.cropMode = false
    toolCrop.classList.remove('active')
    toolCropApply.style.display = toolCropCancel.style.display = 'none'
    toolCropApply.disabled = toolCropCancel.disabled = true
  } else {
    editor.enterCropMode(); state.cropMode = true
    toolCrop.classList.add('active')
    toolCropApply.style.display = toolCropCancel.style.display = 'flex'
    toolCropApply.disabled = toolCropCancel.disabled = false
    autocropBanner.classList.remove('visible')
    toast('Dibuja el área de recorte con el ratón', 'info', 2500)
  }
})

toolCropApply.addEventListener('click', () => {
  editor.applyCrop(); exitCropUI(); updateCurrentPageThumb(); updateZoomLabel()
})
toolCropCancel.addEventListener('click', () => { editor.cancelCrop(); exitCropUI() })

function exitCropUI() {
  state.cropMode = false; toolCrop.classList.remove('active')
  toolCropApply.style.display = toolCropCancel.style.display = 'none'
  toolCropApply.disabled = toolCropCancel.disabled = true
}

toolAutoCrop.addEventListener('click', () => {
  const rect = editor.detectWhiteMargins()
  if (!rect) { toast('No se detectó margen blanco significativo', 'info'); return }
  editor.applyAutoCrop(rect); updateCurrentPageThumb(); updateZoomLabel()
  toast('Auto-recorte aplicado', 'success')
})

toolRotLeft.addEventListener('click',  () => { editor.rotateLeft();     updateZoomLabel(); updateCurrentPageThumb() })
toolRotRight.addEventListener('click', () => { editor.rotateRight();    updateZoomLabel(); updateCurrentPageThumb() })
toolFlipH.addEventListener('click',   () => { editor.flipHorizontal(); updateCurrentPageThumb() })

toolZoomIn.addEventListener('click',  () => { editor.zoomIn();  updateZoomLabel() })
toolZoomOut.addEventListener('click', () => { editor.zoomOut(); updateZoomLabel() })
toolZoomFit.addEventListener('click', () => { editor.fitToWrapper(canvasWrapper); updateZoomLabel() })

toolResetEdits.addEventListener('click', () => {
  editor.resetCrop()
  imgBrightness.value = 0; lblImgBrightness.textContent = '0'
  imgContrast.value   = 0; lblImgContrast.textContent   = '0'
  imgSharpness.value  = 0; lblImgSharpness.textContent  = '0'
  updateZoomLabel(); updateCurrentPageThumb(); checkAutoCrop()
  toast('Ajustes restablecidos', 'info')
})

function updateZoomLabel() { zoomLabel.textContent = editor.zoomPercent() }

// ── Sliders ───────────────────────────────────────────────────────────────────
function onImgSlider() {
  const b = parseInt(imgBrightness.value), c = parseInt(imgContrast.value)
  lblImgBrightness.textContent = b; lblImgContrast.textContent = c
  lblImgSharpness.textContent = imgSharpness.value
  editor.setFilters({ brightness: b, contrast: c })
}
imgBrightness.addEventListener('input',  onImgSlider)
imgContrast.addEventListener('input',    onImgSlider)
imgSharpness.addEventListener('input',   onImgSlider)
// Guardar estado editado al soltar el slider (para que el export lo use)
imgBrightness.addEventListener('change', updateCurrentPageThumb)
imgContrast.addEventListener('change',   updateCurrentPageThumb)
imgSharpness.addEventListener('change',  updateCurrentPageThumb)
cfgBrightness.addEventListener('input', () => lblBrightness.textContent = cfgBrightness.value)
cfgContrast.addEventListener('input',   () => lblContrast.textContent   = cfgContrast.value)

// ── Exportar ──────────────────────────────────────────────────────────────────
cfgFormat.addEventListener('change', () => {
  pdfOptions.style.display = cfgFormat.value === 'pdf' ? 'block' : 'none'
})

btnPickFolder.addEventListener('click', async () => {
  const result = await window.electronAPI.showOpenFolder()
  if (!result.canceled && result.filePaths.length > 0) {
    state.destFolder = result.filePaths[0]
    destFolderLabel.textContent = state.destFolder
    btnOpenFolder.disabled = false
  }
})

btnOpenFolder.addEventListener('click', async () => {
  window.electronAPI.openPath(state.destFolder || await window.electronAPI.getDocsPath())
})

btnExport.addEventListener('click', exportPages)

async function exportPages() {
  if (state.pages.length === 0) return
  const format  = cfgFormat.value
  const folder  = state.destFolder || await window.electronAPI.getDocsPath()
  const ts      = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

  // Antes de exportar: asegurarnos de guardar el estado editado de la página actual
  if (state.currentPage >= 0) updateCurrentPageThumb()

  try {
    if (format === 'pdf') {
      const tempPaths = await prepareExportImages()
      const destPath  = `${folder}\\Albedo_${ts}.pdf`
      const result    = await window.electronAPI.savePDF({ imagePaths: tempPaths, destPath, pageSize: cfgPageSize.value })
      if (!result.success) throw new Error(result.error)
      state.lastSavedPath = destPath
      toast(`PDF guardado: Albedo_${ts}.pdf`, 'success', 4000)
    } else {
      const mime = format === 'jpg' ? 'image/jpeg' : 'image/png'
      for (let i = 0; i < state.pages.length; i++) {
        // Usar la versión editada si existe, si no la original
        const base64   = state.pages[i].editedBase64 || state.pages[i].base64
        const destPath = `${folder}\\Albedo_${ts}_p${i+1}.${format}`
        const result   = await window.electronAPI.saveImage({ base64, destPath })
        if (!result.success) throw new Error(result.error)
      }
      toast(`${state.pages.length} imagen(es) guardada(s)`, 'success', 4000)
    }
    state.destFolder = folder
    destFolderLabel.textContent = folder
    btnOpenFolder.disabled = false
  } catch (e) {
    toast('Error al exportar: ' + e.message, 'error', 5000)
  }
}

async function prepareExportImages() {
  const paths    = []
  const docsPath = await window.electronAPI.getDocsPath()

  for (let i = 0; i < state.pages.length; i++) {
    const page = state.pages[i]

    if (page.editedBase64) {
      // Usar la versión editada (caché) directamente — sin re-cargar ni resetear edits
      const tempPath = `${docsPath}\\export_p${i+1}_${Date.now()}.png`
      const result   = await window.electronAPI.saveImage({ base64: page.editedBase64, destPath: tempPath })
      paths.push(result.success ? tempPath : page.tempPath)
    } else {
      // Sin edits: usar la imagen original escaneada directamente
      paths.push(page.tempPath)
    }
  }

  return paths
}

function updateCurrentPageThumb() {
  const index = state.currentPage
  if (index < 0) return
  const base64 = editor.exportBase64('image/png')
  // Guardar estado editado en la página ("caché" de edición)
  state.pages[index].editedBase64 = base64
  // Actualizar miniatura
  const thumb = pagesList.children[index]
  if (thumb) { const img = thumb.querySelector('img'); if (img) img.src = base64 }
}

function updateUI() {
  const has = state.pages.length > 0
  btnClearAll.disabled  = !has
  btnExport.disabled    = !has
  const btnClearEdits   = $('btn-clear-edits')
  if (btnClearEdits) btnClearEdits.disabled = !has
}

// Botón "Limpiar ediciones" — descarta edits, restaura imágenes originales
const btnClearEdits = $('btn-clear-edits')
if (btnClearEdits) {
  btnClearEdits.addEventListener('click', async () => {
    if (!confirm('¿Descartar todas las ediciones (recortes, rotaciones, ajustes)?\nLas imágenes escaneadas originales no se borran.')) return

    // Eliminar editedBase64 de todas las páginas
    state.pages.forEach(p => { delete p.editedBase64 })

    // Si hay página activa, recargar la imagen original
    if (state.currentPage >= 0) {
      await showPage(state.currentPage)
    }

    // Restaurar sliders de imagen
    imgBrightness.value = 0; lblImgBrightness.textContent = '0'
    imgContrast.value   = 0; lblImgContrast.textContent   = '0'
    imgSharpness.value  = 0; lblImgSharpness.textContent  = '0'

    // Reconstruir miniaturas con imágenes originales
    rebuildPagesList()
    if (state.currentPage >= 0) await showPage(state.currentPage)

    toast('Ediciones descartadas — imágenes originales restauradas', 'info', 3500)
  })
}

// ── Titlebar ──────────────────────────────────────────────────────────────────
$('btn-min').addEventListener('click',   () => window.electronAPI.minimizeWindow())
$('btn-max').addEventListener('click',   () => window.electronAPI.maximizeWindow())
$('btn-close').addEventListener('click', () => window.electronAPI.closeWindow())

// ── Zoom con rueda ────────────────────────────────────────────────────────────
canvasWrapper.addEventListener('wheel', (e) => {
  if (!editor.sourceImage) return
  e.preventDefault()
  e.deltaY < 0 ? editor.zoomIn() : editor.zoomOut()
  updateZoomLabel()
}, { passive: false })

// ── Init ──────────────────────────────────────────────────────────────────────
;(async () => {
  enableEditorTools(false)
  pdfOptions.style.display = 'block'
  await loadSavedDevice()
  const docsPath = await window.electronAPI.getDocsPath()
  destFolderLabel.textContent = docsPath
})()
