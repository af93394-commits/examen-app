const fs = require('fs');
const d = JSON.parse(fs.readFileSync('backup_data.json','utf8'));
let sql = '';

sql += 'CREATE TABLE IF NOT EXISTS materias (id SERIAL PRIMARY KEY, nombre TEXT UNIQUE NOT NULL, descripcion TEXT, activo INTEGER DEFAULT 1, creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP);\n';
sql += 'CREATE TABLE IF NOT EXISTS usuarios (id SERIAL PRIMARY KEY, usuario TEXT UNIQUE NOT NULL, password TEXT NOT NULL, nombre_completo TEXT NOT NULL, rol TEXT NOT NULL DEFAULT \'estudiante\', activo INTEGER DEFAULT 1, creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP);\n';
sql += 'CREATE TABLE IF NOT EXISTS preguntas (id SERIAL PRIMARY KEY, texto TEXT NOT NULL, imagen TEXT, opcion_a TEXT NOT NULL, opcion_b TEXT NOT NULL, opcion_c TEXT NOT NULL, opcion_d TEXT NOT NULL, respuesta_correcta TEXT NOT NULL, materia_id INTEGER REFERENCES materias(id), creado_por INTEGER REFERENCES usuarios(id), creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP, imagen_opcion_a TEXT, imagen_opcion_b TEXT, imagen_opcion_c TEXT, imagen_opcion_d TEXT);\n';
sql += 'CREATE TABLE IF NOT EXISTS cuestionarios (id SERIAL PRIMARY KEY, titulo TEXT NOT NULL, descripcion TEXT, materia_id INTEGER REFERENCES materias(id), tiempo_limite INTEGER DEFAULT 60, activo INTEGER DEFAULT 1, creado_por INTEGER REFERENCES usuarios(id), creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP);\n';
sql += 'CREATE TABLE IF NOT EXISTS cuestionario_preguntas (id SERIAL PRIMARY KEY, cuestionario_id INTEGER NOT NULL REFERENCES cuestionarios(id) ON DELETE CASCADE, pregunta_id INTEGER NOT NULL REFERENCES preguntas(id) ON DELETE CASCADE, orden INTEGER DEFAULT 0);\n';
sql += 'CREATE TABLE IF NOT EXISTS intentos (id SERIAL PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id), cuestionario_id INTEGER NOT NULL REFERENCES cuestionarios(id), puntuacion INTEGER DEFAULT 0, total_preguntas INTEGER DEFAULT 0, completado INTEGER DEFAULT 0, inicio_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP, fin_en TIMESTAMP);\n';
sql += 'CREATE TABLE IF NOT EXISTS intento_respuestas (id SERIAL PRIMARY KEY, intento_id INTEGER NOT NULL REFERENCES intentos(id) ON DELETE CASCADE, pregunta_id INTEGER NOT NULL REFERENCES preguntas(id), respuesta_seleccionada TEXT, es_correcta INTEGER DEFAULT 0);\n';
sql += 'CREATE TABLE IF NOT EXISTS user_sessions (sid TEXT PRIMARY KEY, sess JSON NOT NULL, expire TIMESTAMP NOT NULL);\n\n';

function esc(s) { return (s||'').replace(/'/g, "''"); }

d.materias.forEach(function(m) {
  sql += "INSERT INTO materias (id, nombre, descripcion, activo) VALUES (" + m.id + ", '" + esc(m.nombre) + "', '" + esc(m.descripcion) + "', " + m.activo + ") ON CONFLICT (nombre) DO NOTHING;\n";
});

d.usuarios.forEach(function(u) {
  sql += "INSERT INTO usuarios (id, usuario, password, nombre_completo, rol, activo) VALUES (" + u.id + ", '" + esc(u.usuario) + "', '" + u.password + "', '" + esc(u.nombre_completo) + "', '" + u.rol + "', " + u.activo + ") ON CONFLICT (usuario) DO NOTHING;\n";
});

d.preguntas.forEach(function(p) {
  sql += "INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (" + p.id + ", '" + esc(p.texto) + "', " + (p.imagen ? "'" + p.imagen + "'" : "NULL") + ", '" + esc(p.opcion_a) + "', '" + esc(p.opcion_b) + "', '" + esc(p.opcion_c) + "', '" + esc(p.opcion_d) + "', '" + p.respuesta_correcta + "', " + (p.materia_id || "NULL") + ", " + (p.creado_por || "NULL") + ", " + (p.imagen_opcion_a ? "'" + p.imagen_opcion_a + "'" : "NULL") + ", " + (p.imagen_opcion_b ? "'" + p.imagen_opcion_b + "'" : "NULL") + ", " + (p.imagen_opcion_c ? "'" + p.imagen_opcion_c + "'" : "NULL") + ", " + (p.imagen_opcion_d ? "'" + p.imagen_opcion_d + "'" : "NULL") + ") ON CONFLICT DO NOTHING;\n";
});

d.cuestionarios.forEach(function(c) {
  sql += "INSERT INTO cuestionarios (id, titulo, descripcion, materia_id, tiempo_limite, activo, creado_por) VALUES (" + c.id + ", '" + esc(c.titulo) + "', '" + esc(c.descripcion) + "', " + (c.materia_id || "NULL") + ", " + (c.tiempo_limite || 60) + ", " + c.activo + ", " + (c.creado_por || "NULL") + ") ON CONFLICT DO NOTHING;\n";
});

d.cuestionario_preguntas.forEach(function(cp) {
  sql += "INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (" + cp.id + ", " + cp.cuestionario_id + ", " + cp.pregunta_id + ", " + cp.orden + ") ON CONFLICT DO NOTHING;\n";
});

sql += "\nSELECT setval('materias_id_seq', (SELECT COALESCE(MAX(id),1) FROM materias));\n";
sql += "SELECT setval('usuarios_id_seq', (SELECT COALESCE(MAX(id),1) FROM usuarios));\n";
sql += "SELECT setval('preguntas_id_seq', (SELECT COALESCE(MAX(id),1) FROM preguntas));\n";
sql += "SELECT setval('cuestionarios_id_seq', (SELECT COALESCE(MAX(id),1) FROM cuestionarios));\n";
sql += "SELECT setval('cuestionario_preguntas_id_seq', (SELECT COALESCE(MAX(id),1) FROM cuestionario_preguntas));\n";

fs.writeFileSync('import.sql', sql);
console.log('SQL generado: import.sql (' + sql.split('\n').length + ' lineas)');
