# Manual de uso — Agenda Inteligente

## Qué hace

- Agenda eventos con título, fecha, hora de inicio/fin, color y descripción.
- Vistas diaria, semanal, mensual y lista de próximos eventos.
- Notificaciones locales 10 minutos antes (requiere permitir notificaciones) con sonido `assets/audio/alerta.mp3`.
- Tema claro/oscuro con persistencia.
- Reloj en cabecera y fecha base para navegar.

## Primeros pasos

1. Abre `index.html` en el navegador (o ejecuta la app de escritorio).
2. Permite notificaciones si el navegador lo solicita.
3. Revisa que la fecha base muestre el día actual.

## Crear o editar evento

1. Completa **Título**, **Fecha**, **Hora inicio** y **Hora fin** (requeridos).
2. Opcional: **Descripción** y **Color**.
3. Pulsa **Guardar**. El evento aparece en las vistas y lista.
4. Para editar, haz clic en el evento en cualquier vista, ajusta y guarda.

## Eliminar evento

- Haz clic en el evento y pulsa **Eliminar** en el formulario.

## Vistas

- **Diaria**: franjas horarias 08:00–20:00 del día base.
- **Semanal**: semana (L-D) del día base.
- **Mensual**: calendario del mes del día base.
- **Próximos**: lista cronológica futura.

## Notificaciones

- Se programan 10 min antes de la hora de inicio.
- Solo se disparan con la app abierta (web/Electron).
- El sonido se reproduce al mostrarse la notificación.

## Tema y reloj

- Botón **Modo oscuro** alterna el tema y lo recuerda.
- El reloj muestra la hora en vivo; la fecha base se puede cambiar con el selector.

## Consejos

- Mantén abierta la pestaña/app para recibir el aviso.
- Si no ves el icono de notificación, revisa permisos del navegador/sistema.
- Usa colores para distinguir tipos de eventos.
