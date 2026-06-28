const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function initAndImport() {
  await db.query(`CREATE TABLE IF NOT EXISTS materias (
    id SERIAL PRIMARY KEY, nombre TEXT UNIQUE NOT NULL, descripcion TEXT,
    activo INTEGER DEFAULT 1, creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY, usuario TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
    nombre_completo TEXT NOT NULL, rol TEXT NOT NULL DEFAULT 'estudiante',
    activo INTEGER DEFAULT 1, creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS preguntas (
    id SERIAL PRIMARY KEY, texto TEXT NOT NULL, imagen TEXT,
    opcion_a TEXT NOT NULL, opcion_b TEXT NOT NULL, opcion_c TEXT NOT NULL, opcion_d TEXT NOT NULL,
    respuesta_correcta TEXT NOT NULL, materia_id INTEGER REFERENCES materias(id),
    creado_por INTEGER REFERENCES usuarios(id), creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    imagen_opcion_a TEXT, imagen_opcion_b TEXT, imagen_opcion_c TEXT, imagen_opcion_d TEXT
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS cuestionarios (
    id SERIAL PRIMARY KEY, titulo TEXT NOT NULL, descripcion TEXT,
    materia_id INTEGER REFERENCES materias(id), tiempo_limite INTEGER DEFAULT 60,
    activo INTEGER DEFAULT 1, creado_por INTEGER REFERENCES usuarios(id),
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS cuestionario_preguntas (
    id SERIAL PRIMARY KEY, cuestionario_id INTEGER NOT NULL REFERENCES cuestionarios(id) ON DELETE CASCADE,
    pregunta_id INTEGER NOT NULL REFERENCES preguntas(id) ON DELETE CASCADE, orden INTEGER DEFAULT 0
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS intentos (
    id SERIAL PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    cuestionario_id INTEGER NOT NULL REFERENCES cuestionarios(id),
    puntuacion INTEGER DEFAULT 0, total_preguntas INTEGER DEFAULT 0, completado INTEGER DEFAULT 0,
    inicio_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP, fin_en TIMESTAMP
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS intento_respuestas (
    id SERIAL PRIMARY KEY, intento_id INTEGER NOT NULL REFERENCES intentos(id) ON DELETE CASCADE,
    pregunta_id INTEGER NOT NULL REFERENCES preguntas(id),
    respuesta_seleccionada TEXT, es_correcta INTEGER DEFAULT 0
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS user_sessions (
    sid TEXT PRIMARY KEY, sess JSON NOT NULL, expire TIMESTAMP NOT NULL
  )`);
  console.log('Tablas creadas');

  const data = JSON.parse(fs.readFileSync('backup_data.json', 'utf8'));

  for (const m of data.materias) {
    await db.query('INSERT INTO materias (id, nombre, descripcion, activo, creado_en) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (nombre) DO NOTHING', [m.id, m.nombre, m.descripcion, m.activo, m.creado_en]);
  }
  console.log('Materias:', data.materias.length);

  for (const u of data.usuarios) {
    await db.query('INSERT INTO usuarios (id, usuario, password, nombre_completo, rol, activo, creado_en) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (usuario) DO NOTHING', [u.id, u.usuario, u.password, u.nombre_completo, u.rol, u.activo, u.creado_en]);
  }
  console.log('Usuarios:', data.usuarios.length);

  for (const p of data.preguntas) {
    await db.query('INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, creado_en, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT DO NOTHING', [p.id, p.texto, p.imagen, p.opcion_a, p.opcion_b, p.opcion_c, p.opcion_d, p.respuesta_correcta, p.materia_id, p.creado_por, p.creado_en, p.imagen_opcion_a, p.imagen_opcion_b, p.imagen_opcion_c, p.imagen_opcion_d]);
  }
  console.log('Preguntas:', data.preguntas.length);

  for (const c of data.cuestionarios) {
    await db.query('INSERT INTO cuestionarios (id, titulo, descripcion, materia_id, tiempo_limite, activo, creado_por, creado_en) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING', [c.id, c.titulo, c.descripcion, c.materia_id, c.tiempo_limite, c.activo, c.creado_por, c.creado_en]);
  }
  console.log('Cuestionarios:', data.cuestionarios.length);

  for (const cp of data.cuestionario_preguntas) {
    await db.query('INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [cp.id, cp.cuestionario_id, cp.pregunta_id, cp.orden]);
  }
  console.log('Cuestionario-preguntas:', data.cuestionario_preguntas.length);

  await db.query("SELECT setval('materias_id_seq', (SELECT COALESCE(MAX(id),1) FROM materias))");
  await db.query("SELECT setval('usuarios_id_seq', (SELECT COALESCE(MAX(id),1) FROM usuarios))");
  await db.query("SELECT setval('preguntas_id_seq', (SELECT COALESCE(MAX(id),1) FROM preguntas))");
  await db.query("SELECT setval('cuestionarios_id_seq', (SELECT COALESCE(MAX(id),1) FROM cuestionarios))");
  await db.query("SELECT setval('cuestionario_preguntas_id_seq', (SELECT COALESCE(MAX(id),1) FROM cuestionario_preguntas))");

  console.log('Importacion completada');
  await db.end();
}

initAndImport().catch(e => { console.error(e); process.exit(1); });
