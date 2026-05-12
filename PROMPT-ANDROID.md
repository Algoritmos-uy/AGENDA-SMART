Actúa como un Arquitecto Backend Senior y Lead Engineer especializado en aplicaciones Android offline-first, sincronización multiplataforma y sistemas SaaS escalables.

IMPORTANTE:
Este proyecto ya existe y se encuentra funcional en Android v1.3.6.
Todo el frontend, lógica principal de agenda, notificaciones, TTS y estructura general ya están implementados.

NO debes replantear la aplicación desde cero.

Debes trabajar sobre una aplicación ya desarrollada llamada “AgendaIA Smart”, manteniendo compatibilidad con la arquitectura y lógica existente.

El objetivo actual es implementar únicamente la infraestructura backend necesaria para:

1. Login/autenticación
2. Backup cloud
3. Sincronización futura entre Android, Web y Desktop

La aplicación actualmente funciona offline-first con persistencia local.

# CONTEXTO FUNCIONAL

La app ya permite:

- Crear/editar/eliminar eventos
- Agenda diaria/semanal/mensual
- Recordatorios inteligentes
- Notificaciones Android robustas
- Configuración TTS
- Asistente conversacional “CoordinalIA”
- Persistencia local completa

La lógica principal de negocio ya existe.

El backend debe complementar el sistema existente sin romper la experiencia offline.

# OBJETIVO TÉCNICO

Diseñar e implementar un backend moderno, escalable y preparado para producción.

Debe permitir:

- Autenticación segura
- Sincronización cloud
- Backup automático
- Restauración de datos
- Multi dispositivo futuro
- Escalabilidad para Web/Desktop

# REQUERIMIENTO PRINCIPAL

La aplicación debe seguir funcionando correctamente incluso sin internet.

La nube debe actuar como:

- sincronización
- respaldo
- coordinación entre dispositivos

NO como dependencia obligatoria.

# AUTENTICACIÓN

Implementar:

- Login con Google
- Registro email/password
- JWT + refresh token
- Persistencia de sesión
- Recuperación de contraseña

Preparar estructura para:

- Free plan
- Premium plan

# SINCRONIZACIÓN

Diseñar un sistema de sincronización incremental.

Requisitos:

- Android será el primer cliente
- Web/Desktop serán futuros clientes
- Offline-first obligatorio
- Cola de sincronización
- Resolución de conflictos
- Timestamp de actualización
- Versionado
- Soft delete
- Reintentos automáticos

Necesito una estrategia robusta y simple de mantener.

# BACKUP

Implementar:

- Backup automático cloud
- Restauración tras reinstalación
- Migración entre dispositivos
- Recuperación completa de eventos

# BASE DE DATOS

Diseñar una base de datos preparada para:

- usuarios
- eventos
- sincronización
- dispositivos
- auditoría futura

Evaluar especialmente:

- PostgreSQL
- Supabase
- Firebase
- MongoDB

Explicar ventajas y desventajas para este proyecto específico.

# BACKEND

Evaluar y recomendar:

- NestJS
- Express
- Fastify
- Supabase Backend
- Firebase Backend

La solución debe priorizar:

- escalabilidad
- simplicidad
- mantenimiento
- costo razonable
- integración futura con IA

# NECESITO

1. Arquitectura backend recomendada
2. Modelo de base de datos
3. Estrategia de sincronización
4. Estrategia offline-first
5. Flujo de autenticación
6. Endpoints principales
7. Roadmap de implementación
8. Buenas prácticas
9. Riesgos técnicos
10. Estructura de carpetas backend

# IMPORTANTE

NO generar teoría innecesaria.

Priorizar:

- implementación real
- decisiones concretas
- estructura profesional
- compatibilidad con Android actual
- crecimiento futuro hacia Web/Desktop

La respuesta debe estar orientada a producción rea