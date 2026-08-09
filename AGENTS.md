# Agents - examen_app

## Contexto del proyecto
Plataforma de examenes/cuestionarios ICFES para estudiantes colombianos.
- **Stack:** Node.js + Express + PostgreSQL + Cloudinary
- **Deploy:** Render free tier (https://examen-app-8dto.onrender.com/)
- **Repo:** https://github.com/af93394-commits/examen-app.git

## Credenciales
- Admin: ver archivo .env ( nunca hardcoded en codigo)
- Estudiante: (se registra nuevo)

## SEGURIDAD - REGLAS CRITICAS
1. **NUNCA** subir credenciales a Git (DATABASE_URL, API keys, passwords)
2. **NUNCA** hardcodear secrets en server.js - usar process.env
3. **SIEMPRE** verificar .gitignore antes de commitear
4. **ROTAR** credenciales si se sospecha compromiso
5. Las credenciales van en .env (local) y en variables de entorno de Render (produccion)

## Base de datos
- **Local:** PostgreSQL - usa la DATABASE_URL del .env (ahora apunta a Neon)
- **Cloud:** PostgreSQL en Neon (proyecto "aplicacion de examen"), deploy en Render
- **Cuestionario activo:** ID 9 "MATEMATICAS 3-Z1-2" con 36 preguntas

## Reglas estrictas
1. **TEXTO DE PREGUNTAS:** Debe ser 100% identico al original. No resumir, no modificar, no corregir ortografia.
2. **RESPETAR:** Espacios, saltos de linea, puntuacion exacta del usuario.
3. **ORDEN:** Las preguntas van en orden secuencial (1, 2, 3... dentro del cuestionario).
4. **NO tocar:** Clave admin, estructura de cuestionarios existentes.
5. **IMAGENES:** Solo insertar el TEXTO de las preguntas. Las imagenes las sube el usuario manualmente desde el admin panel. NO pegar imagenes en el texto.

## Modulo Simulacro ICFES (estado al 2026-08-09, pausa v9)
- Los cambios al HTML de simulacro requieren cache-busting: actualizar `VERSION` dentro de `public/student/simulacro-presentar.html` Y el parametro `?v=N` en los enlaces de `simulacro-config.html` y `resultados.html` (en la v9: `?simulacro=..&v=9`).
- Probar SIEMPRE contra produccion con Edge headless antes de avisar al usuario (ver seccion "Simulacro" de SESION_TRABAJO.md).
- Hoja de borrador: la goma usa `globalCompositeOperation='destination-out'`; el borrador se limpia en `finalizarBloque` y `avanzarSiguiente`.
- Endpoint `GET /api/mis-simulacros` devuelve `puntaje_global_nivel` (nivel global sobre 5) usado por la pestana Simulacros en resultados.
- `puppeteer-core` esta instalado local con `--no-save` (si falta: `npm install puppeteer-core --no-save`).

## Pausa de simulacro v9 (2026-08-09)
- Endpoints: `PUT /api/simulacros/:id/pausar` y `/reanudar` (estudiante, solo su propio simulacro); `PUT /api/admin/simulacros/:id/pausar` y `/reanudar` (admin, cualquier simulacro); `GET /api/admin/simulacros/activos` (lista en curso).
- BD: columnas `simulacro_bloques.tiempo_usado_segundos` (tiempo consumido acumulado) y `pausado_en`. La migracion corre sola en `initDB` con `ADD COLUMN IF NOT EXISTS`.
- EL TIMER SOLO LO CONGELA EL SERVIDOR: al pausar se acumula el tiempo usado y al reanudar `iniciado_en=CURRENT_TIMESTAMP`; el cliente muestra el restante devuelto del server.
- El cliente auto-pausa al salir con `pagehide`/`visibilitychange` + `sendBeacon` (cerrar pestana/cambiar de pestana). Mientras esta pausado, `responder` y `finalizar` bloque devuelven 400.
- NO romper: pausar es idempotente (WHERE pausado_en IS NULL); `tiempoUsadoBloque()` NO suma (pausado_en - iniciado_en) cuando esta pausado (la ventana ya se acumulo al pausar).
- Local (Windows UTC-5) el cronometro muestra 5h de mas al iniciar (artefacto de zona horaria pre-existente; en produccion Render/Neon en UTC es correcto). Probar siempre contra produccion.

## Como agregar preguntas nuevas
1. Pedir al usuario el bloque de preguntas en texto
2. Insertar en PostgreSQL usando la URL de DATABASE_URL
3. Asociar al cuestionario correspondiente
4. **SIEMPRE incluir materia_id** al INSERTAR preguntas (1=Matematicas, 2=Lectura Critica)
5. Actualizar SESION_TRABAJO.md con los nuevos IDs y textos
6. **SIEMPRE commitear y pushear a GitHub** para que Render haga auto-deploy
7. Verificar que el deploy fue exitoso

## Archivos clave
- `server.js` - Servidor principal (API, rutas, uploads)
- `.env` - Variables de entorno (NUNCA subir a git)
- `.env.example` - Plantilla de variables de entorno
- `badges.js` - Motor de insignias
- `SESION_TRABAJO.md` - Memoria del proyecto (historial de cambios)
- `backup_data.json` - Backup JSON de los datos

## Variables de entorno
- DATABASE_URL (Neon - conexion directa, NO usar -pooler: enruta a compute vacio)
- SESSION_SECRET (clave aleatoria larga)
- CLOUD_NAME, CLOUD_API_KEY, CLOUD_API_SECRET (Cloudinary)
- ALLOWED_ORIGINS (CORS)
- NODE_ENV=production
