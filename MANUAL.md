# Manual de uso — Agenda Inteligente (v1.3.6)

## Resumen de funcionalidades

Agenda Inteligente permite:

- Crear, editar y eliminar eventos con título, fecha, hora inicio/fin, descripción, color y recordatorio.
- Visualizar eventos en vistas **diaria**, **semanal**, **mensual** y lista de **próximos**.
- Recibir alertas locales (con sonido) antes del evento.
- Usar **CoordinalIA** por chat y por voz para consultar y crear eventos.
- Configurar inicio automático al encender el sistema (en escritorio, según soporte del sistema operativo).
- Interfaz y asistente con detección de idioma: **Español, Inglés y Portugués**.

---

## Primeros pasos

1. Inicia la app web o de escritorio.
2. Verifica que la fecha base esté en el día actual.
3. (Recomendado) Permite notificaciones del sistema para ver banners emergentes.
4. Si usarás IA, configura `.env` en la raíz del proyecto y reinicia la app.

Variables comunes:

- `DEEPSEEK_API_KEY` para chat de CoordinalIA con DeepSeek.
- `OPENAI_API_KEY` para transcripción de voz avanzada (fallback STT).

---

## Gestión de eventos

### Crear o editar

1. Completa **Título**, **Fecha**, **Hora inicio** y **Hora fin**.
2. Opcional: **Descripción**, **Color** y selección de **Recordatorio**.
3. Pulsa **Guardar**.
4. Para editar, selecciona un evento, modifica y guarda.

### Eliminar

- Selecciona el evento y pulsa **Eliminar**.

---

## Vistas de agenda

- **Diaria**: bloques horarios del día base.
- **Semanal**: semana completa (lunes a domingo) del día base.
- **Mensual**: calendario del mes.
- **Próximos**: lista cronológica de eventos futuros.

---

## Alertas y sonidos

### Comportamiento actual

- La app programa alertas a:
  - **30 minutos antes** del evento.
  - **15 minutos antes** del evento.
- El audio **ya no se reproduce al iniciar la aplicación**.

### Archivos de audio usados (por idioma)

- 30 min:
  - Inglés: `assets/audio/evento-30-en.mp3`
  - Portugués: `assets/audio/evento-30-pt.mp3`
  - Español / fallback: `assets/audio/evento-30.mp3`
- 15 min:
  - Inglés: `assets/audio/evento-15-en.mp3`
  - Portugués: `assets/audio/evento-15-pt.mp3`
  - Español / fallback: `assets/audio/evento-15.mp3`

> Nota: Las alertas se disparan con la app abierta. Si no hay permiso de notificación, el banner puede no mostrarse, pero el audio de alerta se intenta reproducir igualmente.

---

## CoordinalIA (chat + voz)

### Chat

- Abre CoordinalIA desde el botón en cabecera.
- Detecta idioma de la app/bot en `es`, `en`, `pt`.
- El hilo se conserva entre aperturas.
- Puedes vaciar historial con **Vaciar chat**.
- Soporta proveedor configurable (**DeepSeek** / **OpenAI**) para chat según configuración.

### Consultas rápidas locales

Sin consumir API, puedes pedir:

- “eventos de hoy”
- “eventos de la semana”
- “eventos del mes”

(también funciona en inglés/portugués)

### Creación de eventos por IA

Si el asistente detecta una acción `create_event`, guarda el evento automáticamente.

Mejora v1.3.6:

- Si falta la hora de fin (`end`), la app la **autocompleta +60 min** desde la hora de inicio y lo informa en el chat.

### Voz a texto

- Botón `🎤 Hablar` para dictado.
- Reconocimiento principal con Web Speech API.
- Si hay problemas de red del reconocimiento, cambia a modo grabación + transcripción backend (requiere `OPENAI_API_KEY`).
- Flujo UX mejorado: “Preparando envío...” antes del envío automático del mensaje de voz.

---

## Inicio automático con el sistema

En escritorio, puedes activar **Iniciar con el sistema** desde la cabecera.

- Si el sistema operativo lo soporta, la app puede iniciar en segundo plano al loguearte.
- Si no lo soporta, el control aparece deshabilitado.

---

## Tema y experiencia de uso

- Botón **Claro/Oscuro** con persistencia.
- Reloj en vivo en cabecera.
- Navegación rápida por fecha base en vistas semanal/mensual.

---

## Solución rápida de problemas

### No responde CoordinalIA

- Verifica API key del proveedor en `.env`.
- Reinicia app después de editar `.env`.

### Voz no transcribe

- Revisa permisos de micrófono.
- Si aparece error STT (`401/402`), valida plan/saldo y `OPENAI_API_KEY`.

### No sonó alerta 30 min

- Confirma que el evento se creó con suficiente anticipación (si faltan menos de 30 min, esa ventana ya no se agenda).
- Verifica existencia de archivos de audio de 30 min.

---

## Recomendaciones

- Mantén la app abierta para garantizar disparo de alertas locales.
- Usa colores y descripciones para mejorar legibilidad.
- Si usas voz, prueba primero una frase corta para validar permisos y dispositivo de entrada.
