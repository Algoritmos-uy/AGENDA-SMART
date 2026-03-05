# Manual de usuario — Agenda-Smart Profesional (escritorio)

## Requisitos

- Windows 10/11 (64 bits) o Linux (AppImage/Debian-based).
- Node no es necesario para usar el instalador/portable (solo para construir).
- Permitir notificaciones en el sistema para alertas de eventos.

## Descarga y ejecución

### Windows (instalador NSIS)

1. Ejecuta el instalador (`Agenda-Smart Profesional Setup 1.3.5.exe`).
2. Sigue el asistente y finaliza. Se creará un acceso directo.
3. Abre la aplicación desde el menú Inicio. El título mostrará la versión.

### Windows (portable)

1. Descomprime el zip/portable (`Agenda-Smart Profesional-Portable-1.3.5.zip`).
2. Dentro, coloca un archivo `.env` (ver sección CoordinalIA) en la misma carpeta que el `.exe` si usarás la IA.
3. Ejecuta el `.exe` directamente. No requiere instalación ni permisos de admin.

### Linux

- **AppImage**: marca como ejecutable (`chmod +x Agenda-Smart-Profesional-1.3.5.AppImage`) y lánzalo. Opcionalmente, crea un `.env` junto al AppImage para la IA.
- **DEB**: instala con `sudo dpkg -i agenda-smart-profesional_1.3.5_amd64.deb` y lanza desde aplicaciones.

## Primer inicio

1. Abre la app. Verás la fecha base y el reloj en la cabecera.
2. Permite notificaciones cuando el sistema lo solicite.
3. Usa el selector de fecha base para navegar; las vistas (Día/Semana/Mes/Lista) muestran tus eventos locales.

## Crear y gestionar eventos

- Completa Título, Fecha, Inicio y Fin. Opcional: descripción y color.
- Guarda para crear; haz clic en un evento para editar; usa “Eliminar” en el formulario para borrarlo.
- Vistas: Diario (08:00–20:00), Semanal (L-D), Mensual y Próximos eventos.
- Notificaciones: se programan 10 min antes mientras la app está abierta; sonido `assets/audio/alerta.mp3`.

## CoordinalIA (asistente integrado)

- Abrir desde el botón **CoordinalIA** en la cabecera.
- Idioma: detecta es/en/pt según el sistema.
- Hilo: se guarda entre aperturas; botón **Vaciar chat** limpia el historial.
- Consultas rápidas locales: “eventos de hoy/semana/mes” (también en inglés/portugués) listan lo guardado sin usar la API.
- Crear eventos por chat: indica título, fecha (YYYY-MM-DD), hora inicio/fin (HH:MM) y descripción; el bot devolverá un JSON y la app lo guardará automáticamente.
- Si falta algún dato, el bot lo pedirá; si falta la API key, avisará.

### Configurar la API key

1. Crea un archivo `.env` con:

   ```bash
   DEEPSEEK_API_KEY=tu-clave
   # Opcional
   DEEPSEEK_MODEL=deepseek-chat
   DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions
   ```

2. Ubicación del `.env`:
   - En desarrollo: raíz del proyecto.
   - En app instalada/portable: mismo directorio que el ejecutable **o** dentro de `resources/.env`.
3. Reinicia la app tras guardar `.env`.

## Modo oscuro y accesos rápidos

- Botón **Modo oscuro** alterna tema y se recuerda.
- Navegación rápida: botones “Semana anterior/siguiente” y “Mes anterior/siguiente”.

## Solución de problemas

- No suenan notificaciones: revisa permisos del sistema y volumen, y mantén la app abierta.
- La IA dice que falta la clave: verifica `.env` en la ruta del ejecutable, sin comillas ni espacios, y reinicia.
- Eventos no guardan: revisa que hora de fin sea posterior a inicio y que la fecha sea válida.

## Construir por tu cuenta (opcional, requiere Node 18+)

```bash
npm install
npm run build          # genera /www
npm run dist           # instaladores
npm run build:win      # solo Windows
npm run build:linux    # solo Linux
```

## Soporte

Para incidencias, comparte sistema operativo, pasos realizados y si usas instalador o portable.
