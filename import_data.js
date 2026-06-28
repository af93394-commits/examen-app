const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function importData() {
  const data = JSON.parse(fs.readFileSync('backup_data.json', 'utf8'));

  for (const m of data.materias) {
    await db.query('INSERT INTO materias (id, nombre, descripcion, activo, creado_en) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (nombre) DO NOTHING', [m.id, m.nombre, m.descripcion, m.activo, m.creado_en]);
  }

  for (const u of data.usuarios) {
    await db.query('INSERT INTO usuarios (id, usuario, password, nombre_completo, rol, activo, creado_en) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (usuario) DO NOTHING', [u.id, u.usuario, u.password, u.nombre_completo, u.rol, u.activo, u.creado_en]);
  }

  for (const p of data.preguntas) {
    await db.query('INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, creado_en, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT DO NOTHING', [p.id, p.texto, p.imagen, p.opcion_a, p.opcion_b, p.opcion_c, p.opcion_d, p.respuesta_correcta, p.materia_id, p.creado_por, p.creado_en, p.imagen_opcion_a, p.imagen_opcion_b, p.imagen_opcion_c, p.imagen_opcion_d]);
  }

  for (const c of data.cuestionarios) {
    await db.query('INSERT INTO cuestionarios (id, titulo, descripcion, materia_id, tiempo_limite, activo, creado_por, creado_en) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING', [c.id, c.titulo, c.descripcion, c.materia_id, c.tiempo_limite, c.activo, c.creado_por, c.creado_en]);
  }

  for (const cp of data.cuestionario_preguntas) {
    await db.query('INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [cp.id, cp.cuestionario_id, cp.pregunta_id, cp.orden]);
  }

  // Reset sequences
  await db.query("SELECT setval('materias_id_seq', (SELECT COALESCE(MAX(id),1) FROM materias))");
  await db.query("SELECT setval('usuarios_id_seq', (SELECT COALESCE(MAX(id),1) FROM usuarios))");
  await db.query("SELECT setval('preguntas_id_seq', (SELECT COALESCE(MAX(id),1) FROM preguntas))");
  await db.query("SELECT setval('cuestionarios_id_seq', (SELECT COALESCE(MAX(id),1) FROM cuestionarios))");
  await db.query("SELECT setval('cuestionario_preguntas_id_seq', (SELECT COALESCE(MAX(id),1) FROM cuestionario_preguntas))");

  console.log('Datos importados correctamente');
  await db.end();
}

importData().catch(e => { console.error(e); process.exit(1); });
