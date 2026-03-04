# Agenda Online (Web + Electron)

Aplicación de agenda con CRUD local, vistas diaria/semanal/mensual, notificaciones locales con sonido y temas claro/oscuro. Incluye empaquetado de escritorio con Electron para Windows y Linux.

## Características

- CRUD de eventos con almacenamiento en `localStorage`.
- Vistas diaria, semanal y mensual; lista cronológica de próximos eventos.
- Notificaciones locales 10 minutos antes (API Web) con sonido `assets/audio/alerta.mp3`.
- Tema claro/oscuro con persistencia en `localStorage`.
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

- Concede permiso al navegador. Se disparan 10 min antes mientras la app está abierta.
- Sonido: `assets/audio/alerta.mp3`.

## Electron (dev y empaquetado)

```bash
npm install
npm run start        # dev
npm run dist         # build instalador/portable (Win: NSIS/portable, Linux: AppImage/deb)
npm run build:win    # solo Windows
npm run build:linux  # solo Linux
```

## CoordinalIA (IA) y API key

La IA usa la API de DeepSeek. Necesitas definir `DEEPSEEK_API_KEY` antes de arrancar:

1. Copia `.env.example` a `.env` y reemplaza el valor de la clave.
2. Alternativamente, exporta la variable en la consola.

Ejemplo rápido (PowerShell):

```pwsh
$env:DEEPSEEK_API_KEY = "tu-api-key"
npm run start
```

Variables disponibles:

- `DEEPSEEK_API_KEY` (obligatoria)
- `DEEPSEEK_MODEL` (opcional, por defecto `deepseek-chat`)
- `DEEPSEEK_API_URL` (opcional, por defecto `https://api.deepseek.com/v1/chat/completions`)

## Iconos

- Windows: `assets/icons/agenda.ico`
- Linux: `assets/icons/agenda.png`

## Requisitos

- Node.js 18+
- (Opcional) Electron Builder para empaquetar.
