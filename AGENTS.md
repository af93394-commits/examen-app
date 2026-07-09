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
- **Local:** SQLite (examen.db) para desarrollo
- **Cloud:** PostgreSQL en Render para produccion
- **Cuestionario activo:** ID 9 "MATEMATICAS 3-Z1-2" con 36 preguntas

## Reglas estrictas
1. **TEXTO DE PREGUNTAS:** Debe ser 100% identico al original. No resumir, no modificar, no corregir ortografia.
2. **RESPETAR:** Espacios, saltos de linea, puntuacion exacta del usuario.
3. **ORDEN:** Las preguntas van en orden secuencial (1, 2, 3... dentro del cuestionario).
4. **NO tocar:** Clave admin, estructura de cuestionarios existentes.
5. **IMAGENES:** Solo insertar el TEXTO de las preguntas. Las imagenes las sube el usuario manualmente desde el admin panel. NO pegar imagenes en el texto.

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
- DATABASE_URL (PostgreSQL)
- SESSION_SECRET (clave aleatoria larga)
- CLOUD_NAME, CLOUD_API_KEY, CLOUD_API_SECRET (Cloudinary)
- ALLOWED_ORIGINS (CORS)
- NODE_ENV=production
