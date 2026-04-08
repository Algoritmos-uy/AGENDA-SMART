# Licenciamiento para escritorio (Electron)

Este documento describe una implementación recomendada para exigir **serial/licencia** en las versiones de escritorio de AgendIA, tanto:

- **Instalable**
- **Portable**

El objetivo es que el usuario no pueda usar la aplicación sin una licencia válida, manteniendo una experiencia razonable cuando no hay internet.

---

## 1) Estrategia recomendada (resumen)

1. Definir modelo de licencia (online obligatoria o híbrida offline temporal).
2. Ejecutar validación siempre en el **proceso main** de Electron.
3. Crear un **servidor de licencias** que valide seriales y emita tokens firmados.
4. Vincular la licencia al dispositivo (fingerprint) con tolerancia controlada.
5. Guardar localmente un token de licencia (cifrado/obfuscado) y revalidar periódicamente.
6. Aplicar la misma lógica para instalable y portable, ajustando política de almacenamiento.

---

## 2) Modelo de licenciamiento

### Opción A: Activación online obligatoria

- El usuario ingresa un serial (`XXXX-XXXX-XXXX-XXXX`).
- La app consulta el backend.
- Si es válido, backend devuelve token firmado.
- Sin respuesta válida, no se habilita uso.

**Ventaja:** máximo control y revocación inmediata.  
**Desventaja:** dependencia total de internet.

### Opción B (recomendada): Híbrida online + uso offline temporal

- Activación inicial online obligatoria.
- Luego la app puede funcionar offline por un período de gracia.
- La app revalida cada X días (ej. 7, 14 o 30).

**Ventaja:** mejor experiencia para usuario final.  
**Desventaja:** requiere lógica adicional (gracia, reintentos, bloqueo progresivo).

---

## 3) Arquitectura técnica

## Componentes

- **App Electron (cliente):**
  - `main`: validación, activación, persistencia local de licencia.
  - `preload`: API mínima segura para UI.
  - `renderer`: formulario de serial y mensajes.
- **Licensing API (backend):**
  - valida seriales,
  - controla activaciones simultáneas,
  - emite y revoca tokens.
- **Base de datos de licencias:** serial, estado, activaciones, historial.

### Regla clave de seguridad

Toda validación crítica debe ejecutarse en `main` o backend.  
No confiar en flags/variables del `renderer`.

---

## 4) Flujo funcional de activación

1. Arranca la app.
2. `main` intenta cargar licencia local.
3. Si no existe o es inválida:
   - abrir ventana/pantalla de activación.
4. Usuario ingresa serial.
5. App envía al backend:
   - serial,
   - fingerprint,
   - versión de app,
   - tipo de build (`portable` o `installer`).
6. Backend responde con:
   - estado (`valid`, `invalid`, `blocked`, `expired`),
   - token de licencia firmado,
   - próxima fecha de revalidación.
7. Si válido:
   - guardar token local,
   - abrir aplicación principal.
8. En segundo plano:
   - revalidaciones periódicas,
   - si revocada/expirada: gracia o bloqueo según política.

---

## 5) Token de licencia recomendado

Usar un token firmado (por ejemplo JWT con firma asimétrica):

- **Backend firma** con clave privada.
- **Cliente verifica** con clave pública embebida.

### Campos sugeridos en payload

- `licenseId`
- `serialMasked`
- `plan` (perpetua, suscripción, etc.)
- `maxActivations`
- `deviceId` o `fingerprintHash`
- `issuedAt`
- `expiresAt`
- `nextValidationAt`
- `features` (módulos habilitados)

---

## 6) Fingerprint (vinculación al equipo)

Generar una huella estable y no invasiva (hash de varios componentes), por ejemplo:

- ID de máquina/sistema,
- nombre de host,
- datos de hardware básicos,
- sal propia de la app.

### Recomendación

- No depender de un único dato (cambia con facilidad).
- Aplicar tolerancia a cambios menores de hardware.
- Guardar solo hash, no datos crudos sensibles.

---

## 7) Portable vs instalable

La validación debe ser la misma en ambos formatos. Cambia principalmente el almacenamiento y política de uso:

### Instalable

- Guardar licencia en `app.getPath('userData')`.
- Comportamiento ligado al usuario/equipo local.

### Portable

Definir una política clara:

1. **Portable ligado a equipo:** más seguro, menos flexible.
2. **Portable trasladable:** requiere reactivación al cambiar de PC.

### Recomendación práctica

Permitir traslado con límites:

- ejemplo: 1 activación activa + 2 reactivaciones/mes,
- panel de desactivación desde cuenta usuario (si aplica).

---

## 8) Seguridad mínima obligatoria

- HTTPS/TLS obligatorio en API de licencias.
- Rate limiting y anti-bruteforce en endpoint de activación.
- No incluir secretos del backend en el cliente.
- Verificación de firma del token en cada arranque.
- Detección básica de manipulación de reloj local.
- Obfuscación del cliente (complementaria, no sustituto de backend).
- Logs de auditoría (activaciones, intentos fallidos, revocaciones).

---

## 9) UX sugerida para licencias

- Pantalla limpia de activación con:
  - campo serial,
  - botón activar,
  - estado de conectividad,
  - enlace a soporte.
- Mensajes claros:
  - serial inválido,
  - límite de dispositivos alcanzado,
  - licencia vencida,
  - modo gracia (con días restantes).
- Nunca mostrar detalles técnicos sensibles al usuario final.

---

## 10) Contrato API sugerido (referencial)

### `POST /licenses/activate`

Entrada:

- `serial`
- `fingerprintHash`
- `appVersion`
- `channel` (`stable`, `beta`)
- `distribution` (`installer`, `portable`)

Salida:

- `status`
- `licenseToken`
- `nextValidationAt`
- `gracePolicy`

### `POST /licenses/validate`

Entrada:

- `licenseToken`
- `fingerprintHash`

Salida:

- `status`
- `reason` (opcional)
- `nextValidationAt`

### `POST /licenses/deactivate`

Entrada:

- `licenseId`
- `fingerprintHash`

Salida:

- `status`

---

## 11) Políticas de negocio a definir antes de implementar

1. Tipo de licencia:
   - perpetua,
   - suscripción,
   - trial.
2. Máximo de activaciones simultáneas.
3. Política de recambio de equipo.
4. Días de gracia offline.
5. Condiciones de revocación/bloqueo.
6. Diferencias (si existen) entre portable e instalable.

---

## 12) Plan de implementación por fases

### Fase 1 (MVP)

- Activación por serial online.
- Emisión de token firmado.
- Gate de arranque (sin licencia válida no abre app principal).

### Fase 2

- Fingerprint robusto.
- Revalidación periódica.
- Modo gracia offline.

### Fase 3

- Panel de administración de licencias.
- Revocación, reasignación y auditoría.
- Métricas de activación/retención/fraude.

---

## 13) Criterios de éxito

Se considera implementación lista cuando:

- ninguna build de escritorio inicia sin licencia válida,
- la activación funciona en primer uso,
- la revalidación maneja correctamente online/offline,
- revocaciones se aplican dentro de la ventana definida,
- se minimizan falsos bloqueos por cambios menores de hardware.

---

## 14) Nota final

No existe protección 100% invulnerable en cliente de escritorio.  
La estrategia correcta es **defensa en capas**: validación en backend + token firmado + controles de uso + buena UX de recuperación.
