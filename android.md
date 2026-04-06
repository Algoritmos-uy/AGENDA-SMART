# Guía de empaquetado Android — Agenda Smart v1.3.6

Esta guía deja el proyecto listo para generar APK/AAB Android usando **Capacitor** sobre la versión web (`www`).

> Estado actual del repo:
>
> - `capacitor.config.json` ya existe con:
>   - `appId`: `com.algoritmia.agenda`
>   - `appName`: `agenda`
>   - `webDir`: `www`
> - El build web se genera con `npm run build`.

---

## 1) Requisitos previos

### Software necesario

- Node.js 18+ (recomendado LTS)
- Android Studio (última estable)
- JDK 21 (recomendado para Capacitor 7 + AGP 8.x en este proyecto)
- SDK Android + Platform Tools + Build Tools

### Variables de entorno (Windows)

Debes tener al menos:

- `JAVA_HOME` apuntando al JDK
- `ANDROID_HOME` o `ANDROID_SDK_ROOT` apuntando al SDK de Android
- En `PATH`:
  - `%JAVA_HOME%\bin`
  - `%ANDROID_HOME%\platform-tools`
  - `%ANDROID_HOME%\emulator`

Puedes validar rápido con el script del repo:

```powershell
./check-android-env.ps1
```

---

## 2) Preparar dependencias del proyecto

Desde la raíz del proyecto:

```powershell
npm install
```

Instala Capacitor CLI + core + plataforma Android (si aún no están):

```powershell
npm install @capacitor/core @capacitor/android
npm install -D @capacitor/cli
```

Inicializa Capacitor solo si fuera necesario (si ya tienes `capacitor.config.json`, normalmente no hace falta):

```powershell
npx cap init agenda com.algoritmia.agenda --web-dir www
```

---

## 3) Generar web y copiar a Android

Genera los assets web en `www`:

```powershell
npm run build
```

Agrega Android (solo la primera vez):

```powershell
npx cap add android
```

Sincroniza cambios web/config al proyecto nativo Android:

```powershell
npx cap sync android
```

> Repite `npm run build` + `npx cap sync android` cada vez que cambies frontend.

---

## 4) Abrir en Android Studio y compilar

Abre el proyecto Android:

```powershell
npx cap open android
```

En Android Studio:

1. Espera que Gradle termine de sincronizar.
2. Verifica `minSdk`, `targetSdk`, `compileSdk` según tus políticas.
3. Ejecuta en emulador/dispositivo (botón **Run**).

Para validar en dispositivo físico:

- Activa modo desarrollador + depuración USB.
- Comprueba conexión:

```powershell
adb devices
```

---

## 5) Generar APK de prueba (Debug)

Desde Android Studio:

- `Build` → `Build Bundle(s) / APK(s)` → `Build APK(s)`

O por Gradle (en carpeta `android`):

```powershell
cd android
./gradlew assembleDebug
```

Salida típica:

- `android/app/build/outputs/apk/debug/app-debug.apk`

---

## 6) Generar Release firmado (APK/AAB)

### Crear keystore (una sola vez)

```powershell
keytool -genkeypair -v -keystore agenda-smart-release.jks -alias agenda-smart -keyalg RSA -keysize 2048 -validity 10000
```

Guarda el keystore fuera del repo o en una ruta segura.

### Configurar `keystore.properties` para firmado automático

En `android/` crea `keystore.properties` a partir de `keystore.properties.example`:

```properties
storeFile=C:/ruta/segura/agenda-smart-release.jks
storePassword=TU_STORE_PASSWORD
keyAlias=agenda-smart
keyPassword=TU_KEY_PASSWORD
```

> `keystore.properties` está ignorado por git para no exponer secretos.

### Build release por terminal (recomendado CI/local)

Desde raíz del proyecto:

```powershell
npm run build:android:release:signed
```

Si no existe `keystore.properties`, el build release continúa pero se genera **unsigned**.

### Configurar firma en Android Studio

1. `Build` → `Generate Signed Bundle / APK`
2. Elige:
   - **Android App Bundle** (`.aab`) para Play Store (recomendado)
   - o **APK** para distribución directa
3. Selecciona keystore, alias y passwords.
4. Build type: `release`.

### Salidas típicas

- AAB: `android/app/build/outputs/bundle/release/app-release.aab`
- APK: `android/app/build/outputs/apk/release/app-release.apk`

---

## 7) Configuraciones recomendadas para esta app

### Permisos Android relevantes

Si usarás voz/micrófono en Android, revisa que el manifiesto incluya:

- `android.permission.RECORD_AUDIO`

Y solicita permiso en runtime si implementas grabación nativa/plugin.

### Comportamiento de funciones de escritorio

Esta app tiene funciones de Electron (`window.appBridge`) que en Android no existen.

- En Android correrá el frontend web dentro de WebView.
- Las partes condicionadas por `window.appBridge?.` no romperán la UI, pero pueden quedar sin funcionalidad nativa.
- Si deseas STT backend o persistencia nativa en Android, conviene crear bridge Capacitor/plugin específico.

### Notificaciones y alertas

- Las alertas locales 30/15 dependen de la app abierta (modelo web actual).
- Para notificaciones en segundo plano reales en Android, se recomienda plugin nativo de local notifications + scheduler nativo.

---

## 8) Flujo recomendado de release Android

Para cada entrega:

```powershell
npm install
npm run lint
npm run test
npm run build
npx cap sync android
```

Luego en Android Studio:

1. Probar en emulador/dispositivo.
2. Generar AAB firmado.
3. Subir a Play Console (testing interno primero).

---

## 9) Troubleshooting rápido

### Error: `SDK location not found`

- Define `ANDROID_HOME`/`ANDROID_SDK_ROOT` y revisa `local.properties` en `android/`.

### Error: Java/Gradle incompatible

- Usa JDK 21 y Gradle compatible con la versión del Android Gradle Plugin.

### No reconoce `npx cap`

- Verifica instalación de `@capacitor/cli` y ejecuta `npm install`.

### No se reflejan cambios web en Android

- Siempre ejecutar:

```powershell
npm run build
npx cap sync android
```

### Micrófono no funciona

- Revisar permisos Android (`RECORD_AUDIO`) y permisos runtime.

---

## 10) Checklist final de subida a Play Console

### A) Pre-flight técnico (antes de generar el AAB)

- [ ] `versionName` y `versionCode` actualizados en `android/app/build.gradle`.
- [ ] Misma keystore de releases anteriores (si la app ya existe en Play).
- [ ] `npm run lint` sin errores.
- [ ] `npm run test` sin errores.
- [ ] `npm run build` completado.
- [ ] `npx cap sync android` completado.
- [ ] Prueba en dispositivo físico real (arranque, navegación, formularios, notificaciones, voz si aplica).

### B) Build de release firmada

- [ ] `android/keystore.properties` presente y con `storeFile` válido (preferir `/` en la ruta).
- [ ] Ejecutado:

```powershell
npm run build:android:release:signed
```

- [ ] Artefacto AAB generado:
  - `android/app/build/outputs/bundle/release/app-release.aab`
- [ ] Verificación de firma del AAB:

```powershell
jarsigner -verify -certs "android/app/build/outputs/bundle/release/app-release.aab"
```

- [ ] Resultado esperado: `jar verified.`

### C) Play Console (subida)

- [ ] App seleccionada correcta en Play Console.
- [ ] Track elegido:
  - [ ] Internal testing (recomendado)
  - [ ] Closed testing
  - [ ] Production
- [ ] Subido `app-release.aab` correcto.
- [ ] Sin errores bloqueantes de compatibilidad/políticas.
- [ ] Notas de versión cargadas (ES/EN/PT si corresponde).

### D) Cumplimiento y ficha de tienda

- [ ] Data safety actualizado (si cambió algo de datos/permisos).
- [ ] Declaraciones de permisos sensibles actualizadas (micrófono, etc.).
- [ ] Política de privacidad vigente y URL válida (si aplica).
- [ ] Clasificación de contenido al día.

### E) Lanzamiento y verificación posterior

- [ ] Release guardado y enviado a revisión/publicación.
- [ ] Testers internos confirman instalación y arranque.
- [ ] Se valida versión instalada en dispositivo desde Play.
- [ ] Monitoreo inicial de crashes/ANRs en Play Console.

### Gate final (Go/No-Go)

- [ ] AAB firmado + validado
- [ ] Versionado correcto
- [ ] Pruebas básicas OK
- [ ] Checklist de Play completo
- [ ] Aprobado para publicar
