const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const multer = require('multer');
const bcrypt = require('bcryptjs');
const cloudinary = require('cloudinary').v2;

const app = express();
const PORT = process.env.PORT || 3000;

const fs = require('fs');
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME || 'dqr6zgmed',
  api_key: process.env.CLOUD_API_KEY || '511682233551561',
  api_secret: process.env.CLOUD_API_SECRET || 'LT6349_n6nTFP4x3L7rBMf2T_VU'
});

function uploadToCloudinary(buffer, folder) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    uploadStream.end(buffer);
  });
}

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function initDB() {
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS materias (
      id SERIAL PRIMARY KEY,
      nombre TEXT UNIQUE NOT NULL,
      descripcion TEXT,
      activo INTEGER DEFAULT 1,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      usuario TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nombre_completo TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'estudiante',
      activo INTEGER DEFAULT 1,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS preguntas (
      id SERIAL PRIMARY KEY,
      texto TEXT NOT NULL,
      imagen TEXT,
      opcion_a TEXT NOT NULL,
      opcion_b TEXT NOT NULL,
      opcion_c TEXT NOT NULL,
      opcion_d TEXT NOT NULL,
      respuesta_correcta TEXT NOT NULL,
      materia_id INTEGER REFERENCES materias(id),
      creado_por INTEGER REFERENCES usuarios(id),
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      imagen_opcion_a TEXT,
      imagen_opcion_b TEXT,
      imagen_opcion_c TEXT,
      imagen_opcion_d TEXT
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS cuestionarios (
      id SERIAL PRIMARY KEY,
      titulo TEXT NOT NULL,
      descripcion TEXT,
      materia_id INTEGER REFERENCES materias(id),
      tiempo_limite INTEGER DEFAULT 60,
      activo INTEGER DEFAULT 1,
      creado_por INTEGER REFERENCES usuarios(id),
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS cuestionario_preguntas (
      id SERIAL PRIMARY KEY,
      cuestionario_id INTEGER NOT NULL REFERENCES cuestionarios(id) ON DELETE CASCADE,
      pregunta_id INTEGER NOT NULL REFERENCES preguntas(id) ON DELETE CASCADE,
      orden INTEGER DEFAULT 0
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS intentos (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      cuestionario_id INTEGER NOT NULL REFERENCES cuestionarios(id),
      puntuacion INTEGER DEFAULT 0,
      total_preguntas INTEGER DEFAULT 0,
      completado INTEGER DEFAULT 0,
      inicio_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      fin_en TIMESTAMP
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS intento_respuestas (
      id SERIAL PRIMARY KEY,
      intento_id INTEGER NOT NULL REFERENCES intentos(id) ON DELETE CASCADE,
      pregunta_id INTEGER NOT NULL REFERENCES preguntas(id),
      respuesta_seleccionada TEXT,
      es_correcta INTEGER DEFAULT 0,
      UNIQUE(intento_id, pregunta_id)
    )`);

    const m = await db.query('SELECT COUNT(*) as t FROM materias');
    if (parseInt(m.rows[0].t) === 0) {
      const materias = [
        ['Matematicas', 'Razonamiento cuantitativo, algebra y geometria'],
        ['Lectura Critica', 'Comprension lectora e interpretacion de textos'],
        ['Ciencias Naturales', 'Biologia, quimica y fisica'],
        ['Ciencias Sociales', 'Historia, geografia y constitution politica'],
        ['Ingles', 'Comprension y uso del idioma ingles']
      ];
      for (const mat of materias) {
        await db.query('INSERT INTO materias (nombre, descripcion) VALUES ($1, $2)', mat);
      }
      const adminPass = bcrypt.hashSync('admin123', 10);
      await db.query('INSERT INTO usuarios (usuario, password, nombre_completo, rol) VALUES ($1, $2, $3, $4)', ['admin', adminPass, 'Administrador', 'admin']);
    }

    const p = await db.query('SELECT COUNT(*) as t FROM preguntas');
    if (parseInt(p.rows[0].t) === 0 && fs.existsSync(path.join(__dirname, 'backup_data.json'))) {
      const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'backup_data.json'), 'utf8'));
      for (const u of data.usuarios) {
        await db.query('INSERT INTO usuarios (id, usuario, password, nombre_completo, rol, activo, creado_en) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (usuario) DO NOTHING', [u.id, u.usuario, u.password, u.nombre_completo, u.rol, u.activo, u.creado_en]);
      }
      for (const pre of data.preguntas) {
        await db.query('INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, creado_en, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT DO NOTHING', [pre.id, pre.texto, pre.imagen, pre.opcion_a, pre.opcion_b, pre.opcion_c, pre.opcion_d, pre.respuesta_correcta, pre.materia_id, pre.creado_por, pre.creado_en, pre.imagen_opcion_a, pre.imagen_opcion_b, pre.imagen_opcion_c, pre.imagen_opcion_d]);
      }
      for (const c of data.cuestionarios) {
        await db.query('INSERT INTO cuestionarios (id, titulo, descripcion, materia_id, tiempo_limite, activo, creado_por, creado_en) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING', [c.id, c.titulo, c.descripcion, c.materia_id, c.tiempo_limite, c.activo, c.creado_por, c.creado_en]);
      }
      for (const cp of data.cuestionario_preguntas) {
        await db.query('INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [cp.id, cp.cuestionario_id, cp.pregunta_id, cp.orden]);
      }
      await db.query("SELECT setval('materias_id_seq', (SELECT COALESCE(MAX(id),1) FROM materias))");
      await db.query("SELECT setval('usuarios_id_seq', (SELECT COALESCE(MAX(id),1) FROM usuarios))");
      await db.query("SELECT setval('preguntas_id_seq', (SELECT COALESCE(MAX(id),1) FROM preguntas))");
      await db.query("SELECT setval('cuestionarios_id_seq', (SELECT COALESCE(MAX(id),1) FROM cuestionarios))");
      await db.query("SELECT setval('cuestionario_preguntas_id_seq', (SELECT COALESCE(MAX(id),1) FROM cuestionario_preguntas))");
      console.log('Datos importados desde backup');
    }

    console.log('PostgreSQL conectado y tablas creadas');
  } catch (e) {
    console.error('Error DB:', e.message);
  }
}
initDB();

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(session({
  store: new PgSession({ pool: db, tableName: 'user_sessions' }),
  secret: process.env.SESSION_SECRET || 'icfes-cuestionarios-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000, secure: false }
}));

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) return cb(null, true);
    cb(new Error('Solo se permiten imagenes (jpg, png, gif, webp)'));
  }
});

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.status(401).json({ error: 'No autenticado' });
}
function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.rol === 'admin') return next();
  res.status(403).json({ error: 'Acceso denegado' });
}

// ============ AUTH ============
app.post('/api/login', async (req, res) => {
  try {
    const { usuario, password } = req.body;
    if (!usuario || !password) return res.status(400).json({ error: 'Usuario y password requeridos' });
    const r = await db.query('SELECT * FROM usuarios WHERE usuario = $1 AND activo = 1', [usuario]);
    const user = r.rows[0];
    if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Credenciales incorrectas' });
    req.session.user = { id: user.id, usuario: user.usuario, nombre: user.nombre_completo, rol: user.rol };
    res.json({ message: 'Login exitoso', user: req.session.user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ message: 'Sesion cerrada' }); });
app.get('/api/sesion', (req, res) => {
  if (req.session.user) res.json({ user: req.session.user });
  else res.status(401).json({ error: 'No autenticado' });
});

// ============ MATERIAS ============
app.get('/api/materias', requireAuth, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM materias WHERE activo = 1 ORDER BY nombre');
    res.json({ materias: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/materias/todas', requireAdmin, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM materias ORDER BY nombre');
    res.json({ materias: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/materias', requireAdmin, async (req, res) => {
  try {
    const { nombre, descripcion } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const r = await db.query('INSERT INTO materias (nombre, descripcion) VALUES ($1, $2) RETURNING id', [nombre, descripcion || '']);
    res.json({ id: r.rows[0].id, message: 'Materia creada' });
  } catch (e) {
    if (e.message.includes('unique')) return res.status(400).json({ error: 'La materia ya existe' });
    res.status(500).json({ error: e.message });
  }
});
app.put('/api/materias/:id', requireAdmin, async (req, res) => {
  try {
    const { nombre, descripcion, activo } = req.body;
    const r = await db.query('UPDATE materias SET nombre=$1, descripcion=$2, activo=$3 WHERE id=$4', [nombre, descripcion, activo, req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrada' });
    res.json({ message: 'Materia actualizada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/materias/:id', requireAdmin, async (req, res) => {
  try {
    const r = await db.query('DELETE FROM materias WHERE id = $1', [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrada' });
    res.json({ message: 'Materia eliminada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ USUARIOS ============
app.get('/api/usuarios', requireAdmin, async (req, res) => {
  try {
    const r = await db.query('SELECT id, usuario, nombre_completo, rol, activo, creado_en FROM usuarios ORDER BY id');
    res.json({ usuarios: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/usuarios', requireAdmin, async (req, res) => {
  try {
    const { usuario, password, nombre_completo, rol } = req.body;
    if (!usuario || !password || !nombre_completo) return res.status(400).json({ error: 'Todos los campos son requeridos' });
    const hash = bcrypt.hashSync(password, 10);
    const r = await db.query('INSERT INTO usuarios (usuario, password, nombre_completo, rol) VALUES ($1, $2, $3, $4) RETURNING id', [usuario, hash, nombre_completo, rol || 'estudiante']);
    res.json({ id: r.rows[0].id, message: 'Usuario creado' });
  } catch (e) {
    if (e.message.includes('unique')) return res.status(400).json({ error: 'El usuario ya existe' });
    res.status(500).json({ error: e.message });
  }
});
app.put('/api/usuarios/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre_completo, rol, activo, password } = req.body;
    if (password && password.trim()) {
      await db.query('UPDATE usuarios SET nombre_completo=$1, rol=$2, activo=$3, password=$4 WHERE id=$5', [nombre_completo, rol, activo, bcrypt.hashSync(password, 10), id]);
    } else {
      await db.query('UPDATE usuarios SET nombre_completo=$1, rol=$2, activo=$3 WHERE id=$4', [nombre_completo, rol, activo, id]);
    }
    res.json({ message: 'Usuario actualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/usuarios/:id', requireAdmin, async (req, res) => {
  try {
    const r = await db.query('DELETE FROM usuarios WHERE id = $1 AND rol != $2', [req.params.id, 'admin']);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Usuario no encontrado o es admin' });
    res.json({ message: 'Usuario eliminado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ PREGUNTAS ============
app.get('/api/preguntas', requireAuth, async (req, res) => {
  try {
    const { materia_id, page = 1, limit = 50, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let sql = 'SELECT p.*, m.nombre as materia_nombre FROM preguntas p LEFT JOIN materias m ON p.materia_id = m.id';
    let countSql = 'SELECT COUNT(*) as total FROM preguntas p';
    const conditions = [];
    const params = [];
    if (materia_id) { conditions.push('p.materia_id = $' + (params.length + 1)); params.push(materia_id); }
    if (search) { conditions.push('p.texto ILIKE $' + (params.length + 1)); params.push('%' + search + '%'); }
    if (conditions.length > 0) {
      const where = ' WHERE ' + conditions.join(' AND ');
      sql += where;
      countSql += where;
    }
    const countResult = await db.query(countSql, params);
    const total = parseInt(countResult.rows[0].total);
    sql += ' ORDER BY p.id DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(parseInt(limit), offset);
    const r = await db.query(sql, params);
    res.json({ preguntas: r.rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
const uploadPregunta = upload.fields([
  { name: 'imagen', maxCount: 1 },
  { name: 'imagen_opcion_a', maxCount: 1 },
  { name: 'imagen_opcion_b', maxCount: 1 },
  { name: 'imagen_opcion_c', maxCount: 1 },
  { name: 'imagen_opcion_d', maxCount: 1 }
]);

app.post('/api/preguntas', requireAdmin, uploadPregunta, async (req, res) => {
  try {
    const { texto, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, texto_lectura, cuestionario_id } = req.body;
    if (!texto || !opcion_a || !opcion_b || !opcion_c || !opcion_d || !respuesta_correcta) return res.status(400).json({ error: 'Todos los campos son requeridos' });
    let imagen = null, imgA = null, imgB = null, imgC = null, imgD = null;
    if (req.files && req.files['imagen']) imagen = await uploadToCloudinary(req.files['imagen'][0].buffer, 'examen/preguntas');
    if (req.files && req.files['imagen_opcion_a']) imgA = await uploadToCloudinary(req.files['imagen_opcion_a'][0].buffer, 'examen/opciones');
    if (req.files && req.files['imagen_opcion_b']) imgB = await uploadToCloudinary(req.files['imagen_opcion_b'][0].buffer, 'examen/opciones');
    if (req.files && req.files['imagen_opcion_c']) imgC = await uploadToCloudinary(req.files['imagen_opcion_c'][0].buffer, 'examen/opciones');
    if (req.files && req.files['imagen_opcion_d']) imgD = await uploadToCloudinary(req.files['imagen_opcion_d'][0].buffer, 'examen/opciones');
    const r = await db.query('INSERT INTO preguntas (texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d, texto_lectura) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id',
      [texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta.toUpperCase(), materia_id || null, req.session.user.id, imgA, imgB, imgC, imgD, texto_lectura || null]);
    const preguntaId = r.rows[0].id;
    if (cuestionario_id) {
      const maxOrd = await db.query('SELECT COALESCE(MAX(orden),0)+1 as next FROM cuestionario_preguntas WHERE cuestionario_id = $1', [cuestionario_id]);
      await db.query('INSERT INTO cuestionario_preguntas (cuestionario_id, pregunta_id, orden) VALUES ($1,$2,$3)', [cuestionario_id, preguntaId, maxOrd.rows[0].next]);
    }
    res.json({ id: preguntaId, message: 'Pregunta creada' + (cuestionario_id ? ' y asociada al cuestionario' : '') });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/preguntas/:id', requireAdmin, uploadPregunta, async (req, res) => {
  try {
    const { id } = req.params;
    const { texto, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, imagen_existente, materia_id, texto_lectura,
            imagen_opcion_a_existente, imagen_opcion_b_existente, imagen_opcion_c_existente, imagen_opcion_d_existente } = req.body;
    let imagen = imagen_existente || null;
    let imgA = imagen_opcion_a_existente || null;
    let imgB = imagen_opcion_b_existente || null;
    let imgC = imagen_opcion_c_existente || null;
    let imgD = imagen_opcion_d_existente || null;
    if (req.files && req.files['imagen']) imagen = await uploadToCloudinary(req.files['imagen'][0].buffer, 'examen/preguntas');
    if (req.files && req.files['imagen_opcion_a']) imgA = await uploadToCloudinary(req.files['imagen_opcion_a'][0].buffer, 'examen/opciones');
    if (req.files && req.files['imagen_opcion_b']) imgB = await uploadToCloudinary(req.files['imagen_opcion_b'][0].buffer, 'examen/opciones');
    if (req.files && req.files['imagen_opcion_c']) imgC = await uploadToCloudinary(req.files['imagen_opcion_c'][0].buffer, 'examen/opciones');
    if (req.files && req.files['imagen_opcion_d']) imgD = await uploadToCloudinary(req.files['imagen_opcion_d'][0].buffer, 'examen/opciones');
    const r = await db.query('UPDATE preguntas SET texto=$1, imagen=$2, opcion_a=$3, opcion_b=$4, opcion_c=$5, opcion_d=$6, respuesta_correcta=$7, materia_id=$8, imagen_opcion_a=$9, imagen_opcion_b=$10, imagen_opcion_c=$11, imagen_opcion_d=$12, texto_lectura=$13 WHERE id=$14',
      [texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta.toUpperCase(), materia_id || null, imgA, imgB, imgC, imgD, texto_lectura || null, id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrada' });
    res.json({ message: 'Pregunta actualizada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/preguntas/:id', requireAdmin, async (req, res) => {
  try {
    const r = await db.query('DELETE FROM preguntas WHERE id = $1', [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrada' });
    res.json({ message: 'Pregunta eliminada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ TEXTOS DE LECTURA ============
const uploadTexto = upload.fields([{ name: 'imagen', maxCount: 1 }]);

app.get('/api/cuestionarios/:id/textos', requireAuth, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM textos_lectura WHERE cuestionario_id = $1 ORDER BY orden, id', [req.params.id]);
    res.json({ textos: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/cuestionarios/:id/textos', requireAdmin, uploadTexto, async (req, res) => {
  try {
    const { titulo, texto, orden, imagen_existente } = req.body;
    if (!titulo || !texto) return res.status(400).json({ error: 'Titulo y texto requeridos' });
    let imagen = imagen_existente || null;
    if (req.files && req.files['imagen']) imagen = await uploadToCloudinary(req.files['imagen'][0].buffer, 'examen/textos');
    const r = await db.query('INSERT INTO textos_lectura (titulo, texto, cuestionario_id, orden, imagen) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [titulo, texto, req.params.id, orden || 0, imagen]);
    res.json({ id: r.rows[0].id, message: 'Texto creado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/textos/:id', requireAdmin, uploadTexto, async (req, res) => {
  try {
    const { titulo, texto, orden, imagen_existente } = req.body;
    let imagen = imagen_existente || null;
    if (req.files && req.files['imagen']) imagen = await uploadToCloudinary(req.files['imagen'][0].buffer, 'examen/textos');
    const r = await db.query('UPDATE textos_lectura SET titulo=$1, texto=$2, orden=$3, imagen=$4 WHERE id=$5',
      [titulo, texto, orden || 0, imagen, req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json({ message: 'Texto actualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/textos/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('UPDATE preguntas SET texto_lectura_id = NULL WHERE texto_lectura_id = $1', [req.params.id]);
    const r = await db.query('DELETE FROM textos_lectura WHERE id = $1', [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json({ message: 'Texto eliminado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/preguntas/:id/asignar-texto', requireAdmin, async (req, res) => {
  try {
    const { texto_lectura_id } = req.body;
    const r = await db.query('UPDATE preguntas SET texto_lectura_id = $1 WHERE id = $2', [texto_lectura_id || null, req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Pregunta no encontrada' });
    res.json({ message: 'Texto asignado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ CUESTIONARIOS ============
app.get('/api/cuestionarios', requireAuth, async (req, res) => {
  try {
    const isAdmin = req.session.user.rol === 'admin';
    const { materia_id } = req.query;
    let sql = `SELECT c.*, m.nombre as materia_nombre, 
      (SELECT COUNT(*) FROM cuestionario_preguntas WHERE cuestionario_id = c.id) as total_preguntas
      FROM cuestionarios c LEFT JOIN materias m ON c.materia_id = m.id`;
    let params = [];
    const conditions = [];
    if (!isAdmin) conditions.push('c.activo = 1');
    if (materia_id) { conditions.push('c.materia_id = $' + (params.length + 1)); params.push(materia_id); }
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY c.id DESC';
    const r = await db.query(sql, params);
    res.json({ cuestionarios: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/cuestionarios', requireAdmin, async (req, res) => {
  try {
    const { titulo, descripcion, tiempo_limite, materia_id } = req.body;
    if (!titulo) return res.status(400).json({ error: 'Titulo requerido' });
    const r = await db.query('INSERT INTO cuestionarios (titulo, descripcion, tiempo_limite, materia_id, creado_por) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [titulo, descripcion || '', tiempo_limite || 60, materia_id || null, req.session.user.id]);
    res.json({ id: r.rows[0].id, message: 'Cuestionario creado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/cuestionarios/:id', requireAdmin, async (req, res) => {
  try {
    const { titulo, descripcion, tiempo_limite, activo, materia_id } = req.body;
    const r = await db.query('UPDATE cuestionarios SET titulo=$1, descripcion=$2, tiempo_limite=$3, activo=$4, materia_id=$5 WHERE id=$6',
      [titulo, descripcion, tiempo_limite, activo, materia_id || null, req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json({ message: 'Actualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/cuestionarios/:id/publicar', requireAdmin, async (req, res) => {
  try {
    const { activo } = req.body;
    const r = await db.query('UPDATE cuestionarios SET activo=$1 WHERE id=$2', [activo ? 1 : 0, req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json({ message: activo ? 'Publicado' : 'Despublicado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/cuestionarios/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM cuestionarios WHERE id = $1', [req.params.id]);
    res.json({ message: 'Eliminado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/cuestionarios/:id/preguntas', requireAdmin, async (req, res) => {
  try {
    const { pregunta_id, orden } = req.body;
    const r = await db.query('INSERT INTO cuestionario_preguntas (cuestionario_id, pregunta_id, orden) VALUES ($1,$2,$3) RETURNING id',
      [req.params.id, pregunta_id, orden || 0]);
    res.json({ id: r.rows[0].id, message: 'Pregunta agregada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/cuestionarios/:cid/preguntas/:pid', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM cuestionario_preguntas WHERE cuestionario_id = $1 AND pregunta_id = $2', [req.params.cid, req.params.pid]);
    res.json({ message: 'Pregunta removida' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/cuestionarios/:id/preguntas', requireAuth, async (req, res) => {
  try {
    const r = await db.query(`SELECT p.*, m.nombre as materia_nombre, p.texto_lectura_id,
      t.texto as texto_lectura_contenido, t.titulo as texto_lectura_titulo, t.imagen as texto_lectura_imagen
      FROM preguntas p
      JOIN cuestionario_preguntas cp ON p.id = cp.pregunta_id
      LEFT JOIN materias m ON p.materia_id = m.id
      LEFT JOIN textos_lectura t ON p.texto_lectura_id = t.id
      WHERE cp.cuestionario_id = $1 ORDER BY cp.orden`, [req.params.id]);
    res.json({ preguntas: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ INTENTOS ============
app.post('/api/intentos', requireAuth, async (req, res) => {
  try {
    const { cuestionario_id } = req.body;
    const total = await db.query('SELECT COUNT(*) as total FROM cuestionario_preguntas WHERE cuestionario_id = $1', [cuestionario_id]);
    const r = await db.query('INSERT INTO intentos (usuario_id, cuestionario_id, total_preguntas) VALUES ($1,$2,$3) RETURNING id',
      [req.session.user.id, cuestionario_id, parseInt(total.rows[0].total)]);
    res.json({ id: r.rows[0].id, total: parseInt(total.rows[0].total) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/intentos/:id/responder', requireAuth, async (req, res) => {
  try {
    const { pregunta_id, respuesta } = req.body;
    const p = await db.query('SELECT respuesta_correcta FROM preguntas WHERE id = $1', [pregunta_id]);
    if (p.rows.length === 0) return res.status(404).json({ error: 'Pregunta no encontrada' });
    const esCorrecta = p.rows[0].respuesta_correcta === respuesta.toUpperCase() ? 1 : 0;
    await db.query(
      `INSERT INTO intento_respuestas (intento_id, pregunta_id, respuesta_seleccionada, es_correcta)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (intento_id, pregunta_id)
       DO UPDATE SET respuesta_seleccionada = $3, es_correcta = $4`,
      [req.params.id, pregunta_id, respuesta.toUpperCase(), esCorrecta]
    );
    res.json({ es_correcta: esCorrecta, correcta: p.rows[0].respuesta_correcta });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/intentos/:id/finalizar', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT COUNT(*) as correctas
       FROM intento_respuestas
       WHERE intento_id = $1 AND es_correcta = 1`,
      [req.params.id]
    );
    await db.query('UPDATE intentos SET puntuacion = $1, completado = 1, fin_en = CURRENT_TIMESTAMP WHERE id = $2', [parseInt(r.rows[0].correctas), req.params.id]);
    res.json({ puntuacion: parseInt(r.rows[0].correctas) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/intentos/:id/resultados', requireAuth, async (req, res) => {
  try {
    const resp = await db.query(`SELECT ir.*, p.texto, p.opcion_a, p.opcion_b, p.opcion_c, p.opcion_d, p.respuesta_correcta, p.imagen, p.imagen_opcion_a, p.imagen_opcion_b, p.imagen_opcion_c, p.imagen_opcion_d
      FROM intento_respuestas ir JOIN preguntas p ON ir.pregunta_id = p.id WHERE ir.intento_id = $1`, [req.params.id]);
    const intento = await db.query('SELECT * FROM intentos WHERE id = $1', [req.params.id]);
    res.json({ respuestas: resp.rows, intento: intento.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/mis-intentos', requireAuth, async (req, res) => {
  try {
    const r = await db.query(`SELECT i.*, COALESCE(c.titulo, 'Cuestionario eliminado') as cuestionario_titulo FROM intentos i
      LEFT JOIN cuestionarios c ON i.cuestionario_id = c.id
      WHERE i.usuario_id = $1 ORDER BY i.inicio_en DESC`, [req.session.user.id]);
    res.json({ intentos: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ INFORMES ============
app.get('/api/admin/estudiantes-con-intentos', requireAdmin, async (req, res) => {
  try {
    const r = await db.query(`SELECT u.id, u.usuario, u.nombre_completo,
      (SELECT COUNT(*) FROM intentos WHERE usuario_id = u.id) as total_intentos,
      (SELECT COUNT(*) FROM intentos WHERE usuario_id = u.id AND completado = 1) as intentos_completados,
      (SELECT ROUND(AVG(CASE WHEN total_preguntas > 0 THEN ROUND(puntuacion * 100.0 / total_preguntas) ELSE 0 END), 1) FROM intentos WHERE usuario_id = u.id AND completado = 1) as promedio
      FROM usuarios u WHERE u.rol = 'estudiante' AND u.activo = 1 ORDER BY u.nombre_completo`);
    res.json({ estudiantes: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/admin/usuarios/:id/intentos', requireAdmin, async (req, res) => {
  try {
    const r = await db.query(`SELECT i.*, c.titulo as cuestionario_titulo, c.materia_id,
      COALESCE(m.nombre, 'Cuestionario eliminado') as materia_nombre,
      (SELECT COUNT(*) FROM intento_respuestas WHERE intento_id = i.id AND es_correcta = 1) as correctas,
      (SELECT COUNT(*) FROM intento_respuestas WHERE intento_id = i.id AND es_correcta = 0) as incorrectas
      FROM intentos i
      LEFT JOIN cuestionarios c ON i.cuestionario_id = c.id
      LEFT JOIN materias m ON c.materia_id = m.id
      WHERE i.usuario_id = $1 ORDER BY i.inicio_en DESC`, [req.params.id]);
    res.json({ intentos: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/admin/intentos/:id/detalle', requireAdmin, async (req, res) => {
  try {
    const resp = await db.query(`SELECT ir.*, p.texto, p.opcion_a, p.opcion_b, p.opcion_c, p.opcion_d, p.respuesta_correcta, p.imagen
      FROM intento_respuestas ir JOIN preguntas p ON ir.pregunta_id = p.id WHERE ir.intento_id = $1 ORDER BY ir.id`, [req.params.id]);
    const intento = await db.query(`SELECT i.*, COALESCE(c.titulo, 'Cuestionario eliminado') as cuestionario_titulo, u.nombre_completo as estudiante_nombre, u.usuario as estudiante_usuario,
      COALESCE(m.nombre, 'Sin materia') as materia_nombre
      FROM intentos i
      LEFT JOIN cuestionarios c ON i.cuestionario_id = c.id
      JOIN usuarios u ON i.usuario_id = u.id
      LEFT JOIN materias m ON c.materia_id = m.id
      WHERE i.id = $1`, [req.params.id]);
    res.json({ respuestas: resp.rows, intento: intento.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ STATS ESTUDIANTE ============
app.get('/api/estudiante/progreso', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const materias = await db.query(`SELECT m.id, m.nombre,
      (SELECT COUNT(*) FROM cuestionarios c WHERE c.materia_id = m.id AND c.activo = 1) as total_cuestionarios
      FROM materias m WHERE m.activo = 1 ORDER BY m.nombre`);
    const intentos = await db.query(`SELECT c.materia_id,
      COUNT(DISTINCT i.cuestionario_id) as completados,
      ROUND(AVG(CASE WHEN i.total_preguntas > 0 THEN ROUND(i.puntuacion * 100.0 / i.total_preguntas) ELSE 0 END), 1) as promedio
      FROM intentos i JOIN cuestionarios c ON i.cuestionario_id = c.id
      WHERE i.usuario_id = $1 AND i.completado = 1
      GROUP BY c.materia_id`, [userId]);
    const intentMap = {};
    intentos.rows.forEach(r => { intentMap[r.materia_id] = r; });
    const totalCue = materias.rows.reduce((s, m) => s + parseInt(m.total_cuestionarios), 0);
    const totalComp = intentos.rows.reduce((s, r) => s + parseInt(r.completados), 0);
    const promedioGeneral = intentos.rows.length > 0
      ? Math.round(intentos.rows.reduce((s, r) => s + parseFloat(r.promedio || 0), 0) / intentos.rows.length)
      : 0;
    const porMateria = materias.rows.map(m => ({
      id: m.id, nombre: m.nombre,
      total: parseInt(m.total_cuestionarios),
      completados: intentMap[m.id] ? parseInt(intentMap[m.id].completados) : 0,
      promedio: intentMap[m.id] ? parseFloat(intentMap[m.id].promedio) : 0
    }));
    res.json({ totalCuestionarios: totalCue, completados: totalComp, porcentaje: totalCue > 0 ? Math.round(totalComp * 100 / totalCue) : 0, promedioGeneral, porMateria });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/estudiante/pendientes', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const cuestionarios = await db.query(`SELECT c.id, c.titulo, c.tiempo_limite, c.materia_id,
      m.nombre as materia_nombre,
      (SELECT COUNT(*) FROM cuestionario_preguntas WHERE cuestionario_id = c.id) as total_preguntas
      FROM cuestionarios c LEFT JOIN materias m ON c.materia_id = m.id
      WHERE c.activo = 1 ORDER BY c.materia_id, c.id`);
    const intentados = await db.query(`SELECT DISTINCT cuestionario_id FROM intentos WHERE usuario_id = $1 AND completado = 1`, [userId]);
    const intentadosSet = new Set(intentados.rows.map(r => r.cuestionario_id));
    const pendientes = cuestionarios.rows.filter(c => !intentadosSet.has(c.id));
    res.json({ pendientes, totalPendientes: pendientes.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/estudiante/historico', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const historico = await db.query(`SELECT i.id, i.cuestionario_id, c.titulo as cuestionario_titulo,
      c.materia_id, m.nombre as materia_nombre,
      i.puntuacion, i.total_preguntas,
      CASE WHEN i.total_preguntas > 0 THEN ROUND(i.puntuacion * 100.0 / i.total_preguntas) ELSE 0 END as porcentaje,
      i.inicio_en
      FROM intentos i
      LEFT JOIN cuestionarios c ON i.cuestionario_id = c.id
      LEFT JOIN materias m ON c.materia_id = m.id
      WHERE i.usuario_id = $1 AND i.completado = 1
      ORDER BY i.inicio_en ASC`, [userId]);
    res.json({ historico: historico.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ STATS ============
app.get('/api/stats', requireAdmin, async (req, res) => {
  try {
    const stats = {};
    const est = await db.query('SELECT COUNT(*) as total FROM usuarios WHERE rol=$1', ['estudiante']);
    stats.totalEstudiantes = parseInt(est.rows[0].total);
    const pre = await db.query('SELECT COUNT(*) as total FROM preguntas');
    stats.totalPreguntas = parseInt(pre.rows[0].total);
    const cues = await db.query('SELECT COUNT(*) as total FROM cuestionarios');
    stats.totalCuestionarios = parseInt(cues.rows[0].total);
    const int = await db.query('SELECT COUNT(*) as total FROM intentos WHERE completado=1');
    stats.totalIntentos = parseInt(int.rows[0].total);
    res.json(stats);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ URL PUBLICA ============
app.get('/api/url-publica', requireAdmin, (req, res) => {
  try {
    const url = fs.readFileSync(path.join(__dirname, 'url_actual.txt'), 'utf8').trim();
    res.json({ url });
  } catch (e) {
    res.json({ url: null, message: 'No hay tunnel activo' });
  }
});

// Frontend
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, 'public', req.path + '.html')));
app.get('/student/*', (req, res) => res.sendFile(path.join(__dirname, 'public', req.path + '.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Servidor: http://localhost:${PORT}`));
