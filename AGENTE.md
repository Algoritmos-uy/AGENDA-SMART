# AGENDA SMART CON ASISTENTE IA

## Mensaje sugerido sobre la actualización

> **Nueva actualización disponible de Agenda Inteligente** 🚀  
> Hemos mejorado la estabilidad general, la experiencia de recordatorios y el rendimiento de CoordinalIA para gestión de eventos y consultas generales.  
> **Próxima actualización en camino:** estaremos incorporando el **intercambio por voz** para interactuar con CoordinalIA de forma más rápida y natural.

Versión alternativa corta (redes o banner):

> Agenda Inteligente sigue creciendo: más estabilidad, mejor experiencia con CoordinalIA y muy pronto **interacción por voz**.

---

## Mini checklist operativa para testing (pre-lanzamiento)

### 1) Smoke test funcional (15–20 min)

- [ ] Abrir app en frío y validar carga sin errores.
- [ ] Crear evento manual (sin hora fin) y verificar autocompletado `+60 min`.
- [ ] Crear evento con CoordinalIA usando `duración 90 minutos` y validar hora fin.
- [ ] Editar y eliminar evento.
- [ ] Confirmar alertas 30/15 (audio + modal + detener + posponer 2 min).

### 2) Persistencia y recuperación

- [ ] Cerrar/reabrir app y validar que eventos siguen presentes.
- [ ] Verificar que configuración de CoordinalIA (proveedor/TTS) persiste.
- [ ] Validar que historial del chat se mantiene.

### 3) Calidad técnica mínima

- [ ] `lint` en verde.
- [ ] tests unitarios en verde.
- [ ] build web en verde.
- [ ] build Android debug/release en verde.

### 4) UX y compatibilidad

- [ ] Probar en al menos 2 tamaños de pantalla Android.
- [ ] Revisar textos i18n críticos (ES/EN/PT).
- [ ] Verificar iconos/logos/audio cargando desde `assets`.

### 5) Criterio para pasar a testing con usuarios reales

- [ ] 0 bloqueos críticos (crash).
- [ ] 0 pérdida de datos de eventos en flujo normal.
- [ ] 0 errores bloqueantes en creación/edición de eventos.

---

## Lista de 10 pasos para llegar a Google Play Store

1. **Congelar versión candidata**  
   Definir `versionName` y `versionCode` final para la release.

2. **Ejecutar quality gates finales**  
   Lint, tests, build web y build Android release sin errores.

3. **Generar artefacto de publicación**  
   Compilar `AAB` release (`app-release.aab`) para Play Console.

4. **Verificar firma**  
   Confirmar keystore correcta y trazabilidad de la clave de firma.

5. **Preparar ficha de tienda**  
   Título, descripción corta/larga, categoría, email/URL de soporte.

6. **Preparar assets de Store Listing**  
   Ícono, capturas (teléfono/tablet), banner gráfico (si aplica).

7. **Completar políticas obligatorias**  
   Privacidad de datos, permisos usados, sección de seguridad de datos y clasificación de contenido.

8. **Subir AAB a track interno/cerrado**  
   Crear release en **Internal testing** o **Closed testing** y agregar testers.

9. **Monitorear feedback y crash reports**  
   Corregir issues críticos detectados por testers reales.

10. **Promover a producción**  
    Publicar cuando métricas sean estables (sin crashes críticos, flujo principal validado, feedback favorable).

---

### Nota operativa recomendada

Antes de promover a producción, mantener al menos **3–7 días** de testing cerrado con usuarios reales para detectar problemas de uso real (red, dispositivos lentos, permisos, horarios/recordatorios).
