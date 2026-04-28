# Orden de trabajo por tecnología (roadmap operativo)

Fecha: 2026-04-15

Este documento resume el orden acordado para avanzar de forma organizada, tecnología por tecnología.

## 1) Prioridad actual: App Android (Capacitor)

Objetivo principal:

- Dejar el producto funcional en Android con prestaciones de IA (chat nativo + voz + agenda + recordatorios) sin dependencias de Electron.

Alcance clave:

- Chat IA nativo Android (sin `appBridge` de Electron).
- Configuración de API key por usuario en dispositivo.
- STT/TTS funcional y estable en Android.
- Creación/edición de eventos y recordatorios confiables.
- Pruebas funcionales en emulador y/o dispositivo real.
- Checklist de regresión Android IA: `REGRESION-ANDROID-IA.md`.

Criterio de cierre de esta etapa:

- Flujo completo validado en Android: chat IA, voz, creación de evento y alerta.

---

## 2) Siguiente etapa: Versión Web (SaaS)

Objetivo:

- Llevar las mismas prestaciones a versión web SaaS para producción.

Alcance:

- Paridad funcional con Android (chat IA, agenda, recordatorios compatibles web, experiencia consistente).
- Definición de arquitectura SaaS (autenticación, multiusuario, persistencia y costos IA).
- Endurecimiento de seguridad para manejo de claves/tokens en entorno web.

Criterio de cierre:

- Publicación SaaS con funcionalidades equivalentes y operación estable.

---

## 3) Etapa posterior: Escritorio Electron

Objetivo:

- Consolidar la versión desktop con la misma base funcional madura ya validada en Android y Web.

Alcance:

- Integración de features finales en flujo Electron.
- Ajustes específicos desktop (autostart, tray, permisos de medios, empaquetado instalable/portable).
- Validación cruzada de consistencia de comportamiento.

Criterio de cierre:

- Release desktop estable con paridad funcional.

---

## Notas de ejecución

- Enfoque de trabajo: cerrar completamente cada etapa antes de abrir la siguiente.
- Evitar dispersión: priorizar resolución de bloqueos críticos de la etapa activa.
- Mantener checklist de validación por etapa (funcional, build, pruebas, release).
