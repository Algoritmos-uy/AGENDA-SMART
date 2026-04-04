# Agenda Online (Web + Electron) — v1.3.6

Aplicación de agenda con CRUD local, vistas diaria/semanal/mensual, notificaciones locales con sonido y temas claro/oscuro. Incluye empaquetado de escritorio con Electron para Windows y Linux.

## Características

- CRUD de eventos con almacenamiento en `localStorage`.
- Vistas diaria, semanal y mensual; lista cronológica de próximos eventos.
- Alertas locales a 30 y 15 minutos antes del evento con audio dedicado por idioma (`es`/`en`/`pt`).
- Tema claro/oscuro con persistencia en `localStorage`.
- Interfaz i18n para Español, Inglés y Portugués (textos, placeholders, estados y formatos).
- Layout responsivo (ITCSS) y reloj en cabecera.
- Build de escritorio con Electron (iconos: `assets/icons/agenda.ico` Win, `assets/icons/agenda.png` Linux).
- Menú contextual (copiar/pegar/recargar/inspeccionar) en escritorio.

## Estructura

- `index.html` — Shell de la app.
- `src/css/` — Estilos ITCSS + `theme.css`.
- `src/js/` — Lógica (`scripts.js`), notificaciones (`notifications.js`), tema (`theme.js`).
- `assets/` — Iconos y audio de alerta.
- `src/main.js` / `src/preload.js` — Entradas Electron.
- `tools/build.js` — Copia fuentes a `www` para servir/empacar.
- `www/` — Salida web (generada).

## Uso web

```bash
npm install
npm run build   # genera www
# abrir index.html (o servir www/)
```

## Notificaciones

- Se programan alertas a **30 min** y **15 min** mientras la app está abierta.
- Audios por idioma (con fallback automático a español):
  - 30 min:
    - EN: `assets/audio/evento-30-en.mp3`
    - PT: `assets/audio/evento-30-pt.mp3`
    - ES/Fallback: `assets/audio/evento-30.mp3`
  - 15 min:
    - EN: `assets/audio/evento-15-en.mp3`
    - PT: `assets/audio/evento-15-pt.mp3`
    - ES/Fallback: `assets/audio/evento-15.mp3`
- El audio ya no se reproduce al iniciar la app.

## Electron (dev y empaquetado)

```bash
npm install
npm run start        # dev
npm run dist         # build instalador/portable (Win: NSIS/portable, Linux: AppImage/deb)
npm run build:win    # solo Windows
npm run build:linux  # solo Linux
```

## CoordinalIA (IA) y API key

CoordinalIA permite proveedor configurable (**DeepSeek** / **OpenAI**) y mantiene soporte de voz/transcripción. Necesitas configurar al menos una API key antes de arrancar:

1. Copia `.env.example` a `.env` y reemplaza el valor de la clave.
2. Alternativamente, exporta la variable en la consola.

Ejemplo rápido (PowerShell):

```pwsh
$env:DEEPSEEK_API_KEY = "tu-api-key"
npm run start
```

Variables disponibles:

- `DEEPSEEK_API_KEY` (obligatoria si usas proveedor DeepSeek)
- `DEEPSEEK_MODEL` (opcional, por defecto `deepseek-chat`)
- `DEEPSEEK_API_URL` (opcional, por defecto `https://api.deepseek.com/v1/chat/completions`)
- `OPENAI_API_KEY` (obligatoria si usas proveedor OpenAI; también para transcripción de voz backend/STT)
- `OPENAI_TRANSCRIBE_API_URL` (opcional)
- `OPENAI_STT_MODEL` (opcional)

## Novedades recientes (abril 2026)

- i18n completo de app y bot: ES/EN/PT.
- Audio de alertas adaptado al idioma activo con fallback robusto.
- Toggle de tema simplificado: botones **Claro/Oscuro** (sin prefijo “Modo”).
- Mejoras en flujo de voz y mensajes de estado del asistente.

## Iconos

- Windows: `assets/icons/agenda.ico`
- Linux: `assets/icons/agenda.png`

## Requisitos

- Node.js 18+
- (Opcional) Electron Builder para empaquetar.
