# Manual Android — Agenda Inteligente (v1.3.6)

Este documento reúne **solo los temas de uso y operación en Android**.

---

## 1) Qué puedes hacer en Android

- Crear, editar y eliminar eventos (título, fecha, hora, descripción, color, recordatorio).
- Ver agenda en modo diario, semanal, mensual y próximos.
- Usar **CoordinalIA** por chat y por voz.
- Configurar **STT** (voz a texto) y **TTS** (texto a voz) desde el chat.

---

## 2) Primer inicio en el teléfono

1. Instala y abre la app Android.
2. Concede permisos cuando se soliciten:
   - **Micrófono** (para dictado por voz).
   - **Notificaciones** (para alertas visibles de eventos).
3. Crea un evento de prueba para verificar hora, recordatorio y sonido.

> Recomendación: en algunos dispositivos, si Android restringe batería en segundo plano, las alertas pueden demorarse. Excluye la app de optimización de batería si buscas máxima fiabilidad.

---

## 3) Uso rápido de CoordinalIA en Android

### Chat

- Abre CoordinalIA desde el botón de cabecera.
- Puedes pedir consultas locales sin API, por ejemplo:
  - “eventos de hoy”
  - “eventos de la semana”
  - “eventos del mes”

### Voz

- Pulsa `🎤 Hablar` para dictar.
- Si hay más de un evento posible al eliminar, el asistente te pedirá elegir por número (`1`, `2`, `3`, ...).

---

## 4) Comandos Android para STT/TTS (desde el chat)

### 4.1 Seleccionar proveedor STT

- `/sttprovider browser`
- `/sttprovider elevenlabs`
- `/sttprovider openai`
- `/sttprovider google`

### 4.2 Guardar API key STT

- `/sttkey TU_CLAVE`
- `/sttkey elevenlabs TU_CLAVE`
- `/sttkey openai TU_CLAVE`
- `/sttkey google TU_CLAVE`

### 4.3 Seleccionar proveedor TTS

- `/ttsprovider auto`
- `/ttsprovider elevenlabs`
- `/ttsprovider openai`
- `/ttsprovider google`
- `/ttsprovider gemini`

### 4.4 Guardar API key TTS

- `/ttskey TU_CLAVE`
- `/ttskey elevenlabs TU_CLAVE`
- `/ttskey openai TU_CLAVE`
- `/ttskey google TU_CLAVE`
- `/ttskey gemini TU_CLAVE`

### 4.5 Elegir voz

- `/ttsfemale`  
  Activa voz femenina por defecto.
- `/ttsvoice VOICE_ID`  
  Define una voz específica (proveedores compatibles).

---

## 5) Configuraciones recomendadas en Android

### Opción A — sin depender de APIs para STT

- `/sttprovider browser`
- `/ttsprovider auto`

### Opción B — mejor precisión STT con OpenAI

- `/sttprovider openai`
- `/sttkey openai TU_CLAVE_OPENAI`
- `/ttsprovider openai`
- `/ttskey openai TU_CLAVE_OPENAI`

### Opción C — stack Google Speech

- `/sttprovider google`
- `/sttkey google TU_CLAVE_GOOGLE`
- `/ttsprovider google`
- `/ttskey google TU_CLAVE_GOOGLE`

### Opción D — Gemini TTS (preview)

- `/ttsprovider gemini`
- `/ttskey gemini TU_CLAVE_GEMINI`

---

## 6) Comportamiento de voz y fallback en Android

- Si `ttsprovider` está en `auto`, la app intenta usar un proveedor disponible según configuración.
- Si un proveedor responde con error de cuota/saldo (por ejemplo, plan agotado), la app puede degradar a otros caminos de voz disponibles en dispositivo.
- Si no hay síntesis disponible, se mantiene el mensaje en chat sin audio.

---

## 7) Solución de problemas (Android)

### No transcribe voz

- Verifica permiso de micrófono.
- Revisa proveedor STT activo (`/sttprovider ...`).
- Revisa API key STT (`/sttkey ...`).
- Si aparece `401/402`, valida clave, plan y saldo del proveedor.

### No se escucha la voz del asistente

- Verifica que TTS esté habilitado en la interfaz.
- Revisa proveedor TTS activo (`/ttsprovider ...`).
- Revisa API key TTS (`/ttskey ...`).
- Si ElevenLabs quedó sin saldo, cambia a OpenAI o Google:
  - `/ttsprovider openai`
  - `/ttskey openai TU_CLAVE_OPENAI`

### Alertas no aparecen

- Confirma permiso de notificaciones.
- Revisa fecha/hora del evento.
- Comprueba restricciones de batería del fabricante.

---

## 8) Matriz oficial de audios de recordatorio (Android)

Esta es la lógica vigente para reproducción de audio de alertas en Android según:

- idioma del dispositivo (`es`, `pt`, `en`),
- género TTS activo (`/ttsfemale` o `/ttsmale`),
- tipo de recordatorio (30 min, 15 min o programado/custom).

### 8.1 Recordatorio por defecto

- El recordatorio por defecto del formulario es **30 minutos antes**.

### 8.2 Audio para 30 minutos

| Género TTS   | Idioma dispositivo | Audio                |
| ------------ | ------------------ | -------------------- |
| `/ttsfemale` | Español            | `evento-30.mp3`      |
| `/ttsfemale` | Portugués          | `evento-30-pt.mp3`   |
| `/ttsfemale` | Inglés             | `evento-30-en.mp3`   |
| `/ttsmale`   | Español            | `m-evento-30-es.mp3` |
| `/ttsmale`   | Portugués          | `m-evento-30-pt.mp3` |
| `/ttsmale`   | Inglés             | `m-evento-30-en.mp3` |

### 8.3 Audio para 15 minutos

| Género TTS   | Idioma dispositivo | Audio                |
| ------------ | ------------------ | -------------------- |
| `/ttsfemale` | Español            | `evento-15.mp3`      |
| `/ttsfemale` | Portugués          | `evento-15-pt.mp3`   |
| `/ttsfemale` | Inglés             | `evento-15-en.mp3`   |
| `/ttsmale`   | Español            | `m-evento-15-es.mp3` |
| `/ttsmale`   | Portugués          | `m-evento-15-pt.mp3` |
| `/ttsmale`   | Inglés             | `m-evento-15-en.mp3` |

### 8.4 Audio para recordatorio programado por usuario (custom)

> Aplica cuando el usuario asigna un tiempo distinto de 15 o 30 minutos.

| Género TTS   | Idioma dispositivo | Audio             |
| ------------ | ------------------ | ----------------- |
| `/ttsfemale` | Español            | `f-evento-es.mp3` |
| `/ttsfemale` | Portugués          | `f-evento-pt.mp3` |
| `/ttsfemale` | Inglés             | `f-evento-en.mp3` |
| `/ttsmale`   | Español            | `m-evento-es.mp3` |
| `/ttsmale`   | Portugués          | `m-evento-pt.mp3` |
| `/ttsmale`   | Inglés             | `m-evento-en.mp3` |

### 8.5 Notas técnicas de empaquetado Android

- Los audios se sincronizan automáticamente a `android/app/src/main/res/raw` con:
  - `npm run android:sync:reminder-audio`
- Si agregas/renombras audios, actualiza también:
  - `tools/sync-android-reminder-audio.js`
  - canales de notificación en `src/js/notifications.js`.

---

## 9) Compilar Android (equipo técnico)

Scripts disponibles del proyecto:

- `npm run build:android`
- `npm run build:android:release`
- `npm run build:android:apk:release`
- `npm run build:android:aab:release`

Sincronización manual de cambios web hacia Android:

- `npx cap sync android`

> Nota: para publicación en Play Store usa preferentemente **AAB** (`build:android:aab:release`).

---

## 10) Empaquetado para Google Play Store (AAB firmado)

### 9.1 Prerrequisitos

- Tener `android/keystore.properties` completo (archivo local, no versionado).
- Tener el archivo `.jks` accesible en la ruta indicada por `storeFile`.
- Verificar que `applicationId` final sea el definitivo para Play Console.

### 9.2 Versionado recomendado

- `versionName`: versión visible en tienda (ej.: `1.3.6`).
- `versionCode`: entero incremental obligatorio para cada subida.

En este proyecto Android se usa actualmente:

- `versionName = 1.3.6`
- `versionCode = 10306`

> Regla práctica: en cada release nuevo, subir siempre `versionCode`.

### 9.3 Generar bundle AAB de release

Desde la raíz del proyecto:

```powershell
npm run build:android:aab:release
```

Salida esperada:

- `android/app/build/outputs/bundle/release/app-release.aab`

### 9.4 Validaciones mínimas antes de subir a Play Console

- Abrir la app release en dispositivo real y verificar:
  - creación/edición/eliminación de eventos,
  - recordatorios con sonido,
  - chat y voz de CoordinalIA,
  - fallback de TTS (si un proveedor falla).
- Confirmar permisos Android (micrófono/notificaciones).
- Confirmar que no existan errores críticos en logs de ejecución.

### 9.5 Material recomendado para Play Console

Guardar en `android/playstore/`:

- ícono de alta resolución (ya existe `playstore-icon-512.png`),
- screenshots móvil,
- texto corto/largo de descripción,
- política de privacidad y datos de contacto.

---

## 11) Buen cierre de operación diaria (Android)

- Deja proveedor STT/TTS configurado y con clave válida.
- Realiza una prueba rápida de voz (frase corta).
- Verifica al menos un recordatorio de evento futuro.
- Si hubo errores de cuota, documenta proveedor alternativo activo para el siguiente turno.
