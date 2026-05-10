// editor.js — Canvas image editor: display, crop, auto-crop, rotate, flip, filters

class ImageEditor {
  constructor(canvasId, cropCanvasId) {
    this.canvas     = document.getElementById(canvasId)
    this.cropCanvas = document.getElementById(cropCanvasId)
    this.ctx        = this.canvas.getContext('2d')
    this.cropCtx    = this.cropCanvas.getContext('2d')

    // Source image (original, unmodified)
    this.sourceImage = null   // HTMLImageElement
    this.zoom        = 1.0

    // Current edits
    this.rotation  = 0        // 0, 90, 180, 270
    this.flipH     = false
    this.cropRect  = null     // { x, y, w, h } in source-image coords
    this.filters   = { brightness: 0, contrast: 0, sharpness: 0 }

    // Crop mode
    this.cropMode   = false
    this.cropDragging = false
    this.cropStart  = null
    this.cropEnd    = null

    this._bindCropEvents()
  }

  // ── Load ──────────────────────────────────────────────────────────────────
  loadBase64(base64) {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        this.sourceImage = img
        this.rotation    = 0
        this.flipH       = false
        this.cropRect    = null
        this.zoom        = 1.0
        this.render()
        resolve()
      }
      img.src = base64
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  render() {
    if (!this.sourceImage) return

    const src = this.sourceImage

    // Effective source region
    const rx = this.cropRect ? this.cropRect.x : 0
    const ry = this.cropRect ? this.cropRect.y : 0
    const rw = this.cropRect ? this.cropRect.w : src.width
    const rh = this.cropRect ? this.cropRect.h : src.height

    // Canvas display size (accounting for rotation)
    const swapped = this.rotation === 90 || this.rotation === 270
    const dispW   = Math.round((swapped ? rh : rw) * this.zoom)
    const dispH   = Math.round((swapped ? rw : rh) * this.zoom)

    this.canvas.width  = dispW
    this.canvas.height = dispH
    this.cropCanvas.width  = dispW
    this.cropCanvas.height = dispH

    const ctx = this.ctx
    ctx.save()

    // Apply CSS filters
    ctx.filter = this._buildFilter()

    // Translate to center, rotate, flip
    ctx.translate(dispW / 2, dispH / 2)
    ctx.rotate((this.rotation * Math.PI) / 180)
    if (this.flipH) ctx.scale(-1, 1)

    const dw = swapped ? rh * this.zoom : rw * this.zoom
    const dh = swapped ? rw * this.zoom : rh * this.zoom
    ctx.drawImage(src, rx, ry, rw, rh, -dw / 2, -dh / 2, dw, dh)

    ctx.restore()

    // Resize crop canvas overlay
    this.cropCtx.clearRect(0, 0, dispW, dispH)
  }

  _buildFilter() {
    const b = this.filters.brightness // -100 to 100 → 0 to 200%
    const c = this.filters.contrast   // -100 to 100 → 0 to 200%
    const bPct = 100 + b
    const cPct = 100 + c
    return `brightness(${bPct}%) contrast(${cPct}%)`
  }

  // ── Zoom ──────────────────────────────────────────────────────────────────
  zoomIn()  { this.zoom = Math.min(4, +(this.zoom + 0.2).toFixed(1)); this.render() }
  zoomOut() { this.zoom = Math.max(0.1, +(this.zoom - 0.2).toFixed(1)); this.render() }
  zoomPercent() { return Math.round(this.zoom * 100) + '%' }

  fitToWrapper(wrapper) {
    if (!this.sourceImage) return
    const src = this.sourceImage
    const swapped = this.rotation === 90 || this.rotation === 270
    const srcW = this.cropRect ? this.cropRect.w : src.width
    const srcH = this.cropRect ? this.cropRect.h : src.height
    const effW = swapped ? srcH : srcW
    const effH = swapped ? srcW : srcH
    const pad = 40
    const zw = (wrapper.clientWidth  - pad) / effW
    const zh = (wrapper.clientHeight - pad) / effH
    this.zoom = +Math.min(zw, zh, 2).toFixed(2)
    this.render()
  }

  // ── Rotation ──────────────────────────────────────────────────────────────
  rotateLeft()  { this.rotation = (this.rotation + 270) % 360; this.render() }
  rotateRight() { this.rotation = (this.rotation +  90) % 360; this.render() }
  flipHorizontal() { this.flipH = !this.flipH; this.render() }

  // ── Filters ───────────────────────────────────────────────────────────────
  setFilters(f) { Object.assign(this.filters, f); this.render() }
  resetFilters() { this.filters = { brightness: 0, contrast: 0, sharpness: 0 }; this.render() }

  // ── Crop ──────────────────────────────────────────────────────────────────
  enterCropMode() {
    this.cropMode = true
    this.cropCanvas.classList.add('drawing')
    this.cropDragging = false
    this.cropStart = null
    this.cropEnd   = null
    this.cropCtx.clearRect(0, 0, this.cropCanvas.width, this.cropCanvas.height)
  }

  exitCropMode() {
    this.cropMode = false
    this.cropCanvas.classList.remove('drawing')
    this.cropCtx.clearRect(0, 0, this.cropCanvas.width, this.cropCanvas.height)
  }

  applyCrop() {
    if (!this.cropStart || !this.cropEnd || !this.sourceImage) return

    const sel = this._getSelectionInSourceCoords()
    if (!sel || sel.w < 4 || sel.h < 4) return

    const prev = this.cropRect || { x: 0, y: 0, w: this.sourceImage.width, h: this.sourceImage.height }

    // Compose with existing crop
    this.cropRect = {
      x: prev.x + sel.x,
      y: prev.y + sel.y,
      w: sel.w,
      h: sel.h
    }

    this.exitCropMode()
    this.render()
  }

  cancelCrop() {
    this.exitCropMode()
  }

  resetCrop() {
    this.cropRect  = null
    this.rotation  = 0
    this.flipH     = false
    this.filters   = { brightness: 0, contrast: 0, sharpness: 0 }
    this.zoom      = 1.0
    this.render()
  }

  // ── Auto-crop ─────────────────────────────────────────────────────────────
  /**
   * Detecta el bounding box del contenido no-blanco.
   * Devuelve { x, y, w, h } en coords del sourceImage, o null si no hay nada que recortar.
   */
  detectWhiteMargins(threshold = 240, minMargin = 10) {
    if (!this.sourceImage) return null

    const offscreen = document.createElement('canvas')
    const src = this.sourceImage
    const rx = this.cropRect?.x ?? 0
    const ry = this.cropRect?.y ?? 0
    const rw = this.cropRect?.w ?? src.width
    const rh = this.cropRect?.h ?? src.height

    offscreen.width  = rw
    offscreen.height = rh
    const octx = offscreen.getContext('2d')
    octx.drawImage(src, rx, ry, rw, rh, 0, 0, rw, rh)

    const data = octx.getImageData(0, 0, rw, rh).data

    const isWhite = (px) => {
      const i = px * 4
      return data[i] >= threshold && data[i+1] >= threshold && data[i+2] >= threshold
    }

    let top = 0, bottom = rh - 1, left = 0, right = rw - 1
    let found = false

    // Top
    outer: for (let y = 0; y < rh; y++) {
      for (let x = 0; x < rw; x++) {
        if (!isWhite(y * rw + x)) { top = y; found = true; break outer }
      }
    }
    if (!found) return null

    // Bottom
    outer2: for (let y = rh - 1; y >= top; y--) {
      for (let x = 0; x < rw; x++) {
        if (!isWhite(y * rw + x)) { bottom = y; break outer2 }
      }
    }

    // Left
    outer3: for (let x = 0; x < rw; x++) {
      for (let y = top; y <= bottom; y++) {
        if (!isWhite(y * rw + x)) { left = x; break outer3 }
      }
    }

    // Right
    outer4: for (let x = rw - 1; x >= left; x--) {
      for (let y = top; y <= bottom; y++) {
        if (!isWhite(y * rw + x)) { right = x; break outer4 }
      }
    }

    // Add padding
    const pad = 8
    const x = Math.max(0, left - pad)
    const y = Math.max(0, top  - pad)
    const w = Math.min(rw, right  - left + pad * 2)
    const h = Math.min(rh, bottom - top  + pad * 2)

    // Only suggest if we're cutting at least minMargin pixels
    const tooSmall = (x < minMargin && y < minMargin &&
                      rw - (x + w) < minMargin && rh - (y + h) < minMargin)
    if (tooSmall) return null

    // Return in sourceImage coords
    const baseX = this.cropRect?.x ?? 0
    const baseY = this.cropRect?.y ?? 0
    return { x: baseX + x, y: baseY + y, w, h }
  }

  applyAutoCrop(rect) {
    if (!rect) return
    this.cropRect = rect
    this.exitCropMode()
    this.render()
  }

  // ── Export current view as base64 ─────────────────────────────────────────
  exportBase64(format = 'image/png', quality = 0.92) {
    return this.canvas.toDataURL(format, quality)
  }

  // ── Crop overlay drawing ──────────────────────────────────────────────────
  _bindCropEvents() {
    this.cropCanvas.addEventListener('mousedown', (e) => {
      if (!this.cropMode) return
      this.cropDragging = true
      this.cropStart = this._canvasPos(e)
      this.cropEnd   = { ...this.cropStart }
    })

    this.cropCanvas.addEventListener('mousemove', (e) => {
      if (!this.cropMode || !this.cropDragging) return
      this.cropEnd = this._canvasPos(e)
      this._drawCropOverlay()
    })

    this.cropCanvas.addEventListener('mouseup', () => {
      if (!this.cropMode) return
      this.cropDragging = false
    })
  }

  _canvasPos(e) {
    const rect = this.cropCanvas.getBoundingClientRect()
    const scaleX = this.cropCanvas.width  / rect.width
    const scaleY = this.cropCanvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY
    }
  }

  _drawCropOverlay() {
    const ctx = this.cropCtx
    const w   = this.cropCanvas.width
    const h   = this.cropCanvas.height
    ctx.clearRect(0, 0, w, h)

    if (!this.cropStart || !this.cropEnd) return

    const x = Math.min(this.cropStart.x, this.cropEnd.x)
    const y = Math.min(this.cropStart.y, this.cropEnd.y)
    const sw = Math.abs(this.cropEnd.x - this.cropStart.x)
    const sh = Math.abs(this.cropEnd.y - this.cropStart.y)

    // Dim outer
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, 0, w, h)
    ctx.clearRect(x, y, sw, sh)

    // Border
    ctx.strokeStyle = '#00b4d8'
    ctx.lineWidth = 1.5
    ctx.strokeRect(x, y, sw, sh)

    // Rule of thirds
    ctx.strokeStyle = 'rgba(0,180,216,0.3)'
    ctx.lineWidth = 0.5
    for (let i = 1; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(x + sw * i/3, y); ctx.lineTo(x + sw * i/3, y + sh); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x, y + sh * i/3); ctx.lineTo(x + sw, y + sh * i/3); ctx.stroke()
    }

    // Corner handles
    const hs = 8
    ctx.fillStyle = '#00b4d8'
    const corners = [[x, y],[x+sw, y],[x, y+sh],[x+sw, y+sh]]
    for (const [cx, cy] of corners) ctx.fillRect(cx - hs/2, cy - hs/2, hs, hs)
  }

  _getSelectionInSourceCoords() {
    if (!this.cropStart || !this.cropEnd) return null

    const cw = this.cropCanvas.width
    const ch = this.cropCanvas.height

    const sw = this.cropRect ? this.cropRect.w : (this.sourceImage?.width ?? cw)
    const sh = this.cropRect ? this.cropRect.h : (this.sourceImage?.height ?? ch)

    // Canvas coords → source image coords (accounting for zoom, rotation)
    // For simplicity when not rotated:
    const scaleX = sw / cw
    const scaleY = sh / ch

    const x = Math.round(Math.min(this.cropStart.x, this.cropEnd.x) * scaleX)
    const y = Math.round(Math.min(this.cropStart.y, this.cropEnd.y) * scaleY)
    const w = Math.round(Math.abs(this.cropEnd.x - this.cropStart.x) * scaleX)
    const h = Math.round(Math.abs(this.cropEnd.y - this.cropStart.y) * scaleY)

    return { x, y, w, h }
  }
}

window.ImageEditor = ImageEditor
