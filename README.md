# Escaner Albedo

Aplicación de escritorio para Windows que permite escanear documentos e imágenes usando la API nativa **WIA (Windows Image Acquisition)** — el mismo motor que usa "Fax y Escáner de Windows" — pero con una interfaz moderna, soporte para escáneres WiFi/red, edición de imágenes y exportación a PDF.

---

## ✨ Características

- **Detección automática de escáner** — funciona con USB y WiFi/red vía WIA
- **Escáner recordado** — seleccionas el dispositivo una sola vez, las siguientes veces escanea directo
- **Configuración completa** — DPI (75/150/300/600), color / escala de grises / blanco y negro, brillo y contraste
- **Escaneo multipágina** — escanea varias páginas con miniaturas en el panel lateral
- **Editor de imágenes**
  - Recorte manual con guías de regla de tercios
  - Auto-recorte de márgenes en blanco
  - Rotación (90°, 180°, 270°) y volteo horizontal
  - Ajuste de brillo y contraste post-escaneo
  - Zoom con rueda del ratón
- **Exportación**
  - JPG / PNG por página
  - PDF multipágina (tamaño A4 o Carta)
- **Diseño dark moderno** con glassmorphism
- **Ventana frameless** con barra de título personalizada

---

## 🖥️ Requisitos

| Requisito | Versión mínima |
|-----------|---------------|
| Windows   | 10 / 11       |
| Node.js   | 18+           |
| npm       | 9+            |
| Escáner   | Cualquiera compatible con WIA (USB o WiFi) |

---

## 🚀 Instalación y uso en desarrollo

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/escaner-albedo.git
cd escaner-albedo

# 2. Instalar dependencias
npm install

# 3. Ejecutar en modo desarrollo
npm start
```

La app abrirá automáticamente con DevTools adjuntos.

---

## 📦 Generar instalador `.exe`

```bash
npm run build
```

El instalador `Escaner-Albedo-Setup-x64.exe` se generará en la carpeta `dist/`.

El instalador permite elegir el directorio de instalación y crea un acceso directo en el escritorio.

---

## 📁 Estructura del proyecto

```
escaner-albedo/
├── main.js              # Proceso principal de Electron
├── preload.js           # Bridge seguro renderer ↔ main (contextBridge)
├── package.json
├── scripts/
│   ├── list-scanners.ps1     # WIA: enumerar dispositivos
│   ├── scan.ps1              # WIA: escanear con parámetros
│   ├── scan-with-select.ps1  # WIA: selector de dispositivo + escaneo directo
│   └── scan-native.ps1       # WIA: diálogo nativo completo (fallback)
├── src/
│   ├── index.html
│   ├── styles/
│   │   └── main.css          # Tema dark glassmorphism
│   └── js/
│       ├── app.js            # Lógica principal y estado
│       └── editor.js         # Editor Canvas: crop, auto-crop, zoom, filtros
└── assets/
    └── icon.png
```

---

## 🔧 Tecnologías

| Tecnología | Uso |
|------------|-----|
| [Electron](https://www.electronjs.org/) | Framework de escritorio |
| [PowerShell + WIA](https://learn.microsoft.com/en-us/windows/win32/wia/-wia-startpage) | API nativa de escaneo de Windows |
| [pdfkit](https://pdfkit.org/) | Generación de PDFs multipágina |
| HTML5 Canvas API | Editor de imágenes |
| Vanilla CSS | Estilos (glassmorphism dark theme) |
| [electron-builder](https://www.electron.build/) | Empaquetado e instalador NSIS |

---

## 📖 Cómo funciona el escaneo WiFi

Windows registra los escáneres de red (WiFi/WSD) como dispositivos WIA igual que los USB. La app:

1. **Primera vez**: muestra el selector nativo de Windows para elegir el dispositivo (la misma ventana que "Fax y Escáner de Windows")
2. **Guarda el ID del escáner** en `%AppData%\escaner-albedo\albedo-config.json`
3. **Siguientes escaneos**: conecta directamente al escáner sin ningún diálogo, usando los ajustes configurados en la app

Para cambiar de escáner usa el botón **"🔄 Cambiar escáner"** en el panel lateral.

---

## 📄 Licencia

MIT — úsalo libremente.
