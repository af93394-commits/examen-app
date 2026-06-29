# Agents - examen_app

## Contexto del proyecto
Plataforma de examenes/cuestionarios ICFES para estudiantes colombianos.
- **Stack:** Node.js + Express + PostgreSQL + Cloudinary
- **Deploy:** Render free tier (https://examen-app-8dto.onrender.com/)
- **Repo:** https://github.com/af93394-commits/examen-app.git

## Credenciales
- Admin: admin / admin123
- Estudiante: (se registra nuevo)

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
4. **SIEMPRE incluir materia_id** al INSERTAR preguntas (1=Matemáticas, 2=Lectura Crítica)
5. Actualizar SESION_TRABAJO.md con los nuevos IDs y textos
6. **SIEMPRE commitear y pushear a GitHub** para que Render haga auto-deploy
7. Verificar que el deploy fue exitoso

## Archivos clave
- `server.js` - Servidor principal (API, rutas, uploads)
- `SESION_TRABAJO.md` - Memoria del proyecto (historial de cambios)
- `import.sql` - Script para poblar PostgreSQL en Render
- `backup_data.json` - Backup JSON de todos los datos

## Variables de entorno (Render)
- DATABASE_URL (PostgreSQL)
- SESSION_SECRET
- CLOUDINARY_URL
- NODE_ENV=production
