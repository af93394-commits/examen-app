const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const multer = require('multer');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

const fs = require('fs');
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: __dirname }),
  secret: process.env.SESSION_SECRET || 'icfes-cuestionarios-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000, secure: false }
}));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
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

const db = new sqlite3.Database('./examen.db', (err) => {
  if (err) console.error('Error BD:', err.message);
  else {
    console.log('Conectado a SQLite');
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS materias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT UNIQUE NOT NULL,
        descripcion TEXT,
        activo INTEGER DEFAULT 1,
        creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        nombre_completo TEXT NOT NULL,
        rol TEXT NOT NULL DEFAULT 'estudiante',
        activo INTEGER DEFAULT 1,
        creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS preguntas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        texto TEXT NOT NULL,
        imagen TEXT,
        opcion_a TEXT NOT NULL,
        opcion_b TEXT NOT NULL,
        opcion_c TEXT NOT NULL,
        opcion_d TEXT NOT NULL,
        respuesta_correcta TEXT NOT NULL,
        materia_id INTEGER,
        creado_por INTEGER,
        creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (materia_id) REFERENCES materias(id),
        FOREIGN KEY (creado_por) REFERENCES usuarios(id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS cuestionarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT NOT NULL,
        descripcion TEXT,
        materia_id INTEGER,
        tiempo_limite INTEGER DEFAULT 60,
        activo INTEGER DEFAULT 1,
        creado_por INTEGER,
        creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (materia_id) REFERENCES materias(id),
        FOREIGN KEY (creado_por) REFERENCES usuarios(id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS cuestionario_preguntas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cuestionario_id INTEGER NOT NULL,
        pregunta_id INTEGER NOT NULL,
        orden INTEGER DEFAULT 0,
        FOREIGN KEY (cuestionario_id) REFERENCES cuestionarios(id) ON DELETE CASCADE,
        FOREIGN KEY (pregunta_id) REFERENCES preguntas(id) ON DELETE CASCADE
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS intentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        cuestionario_id INTEGER NOT NULL,
        puntuacion INTEGER DEFAULT 0,
        total_preguntas INTEGER DEFAULT 0,
        completado INTEGER DEFAULT 0,
        inicio_en DATETIME DEFAULT CURRENT_TIMESTAMP,
        fin_en DATETIME,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
        FOREIGN KEY (cuestionario_id) REFERENCES cuestionarios(id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS intento_respuestas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        intento_id INTEGER NOT NULL,
        pregunta_id INTEGER NOT NULL,
        respuesta_seleccionada TEXT,
        es_correcta INTEGER DEFAULT 0,
        FOREIGN KEY (intento_id) REFERENCES intentos(id) ON DELETE CASCADE,
        FOREIGN KEY (pregunta_id) REFERENCES preguntas(id)
      )`);

      const materias = [
        ['Matematicas', 'Razonamiento cuantitativo, algebra y geometria'],
        ['Lectura Critica', 'Comprension lectora e interpretacion de textos'],
        ['Ciencias Naturales', 'Biologia, quimica y fisica'],
        ['Ciencias Sociales', 'Historia, geografia y constitution politica'],
        ['Ingles', 'Comprension y uso del idioma ingles']
      ];
      materias.forEach(m => {
        db.run('INSERT OR IGNORE INTO materias (nombre, descripcion) VALUES (?, ?)', m);
      });

      const adminPass = bcrypt.hashSync('admin123', 10);
      db.run(`INSERT OR IGNORE INTO usuarios (usuario, password, nombre_completo, rol) VALUES ('admin', ?, 'Administrador', 'admin')`, [adminPass]);
    });
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
app.post('/api/login', (req, res) => {
  const { usuario, password } = req.body;
  if (!usuario || !password) return res.status(400).json({ error: 'Usuario y password requeridos' });
  db.get('SELECT * FROM usuarios WHERE usuario = ? AND activo = 1', [usuario], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Credenciales incorrectas' });
    req.session.user = { id: user.id, usuario: user.usuario, nombre: user.nombre_completo, rol: user.rol };
    res.json({ message: 'Login exitoso', user: req.session.user });
  });
});
app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ message: 'Sesion cerrada' }); });
app.get('/api/sesion', (req, res) => {
  if (req.session.user) res.json({ user: req.session.user });
  else res.status(401).json({ error: 'No autenticado' });
});

// ============ MATERIAS ============
app.get('/api/materias', requireAuth, (req, res) => {
  db.all('SELECT * FROM materias WHERE activo = 1 ORDER BY nombre', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ materias: rows });
  });
});
app.get('/api/materias/todas', requireAdmin, (req, res) => {
  db.all('SELECT * FROM materias ORDER BY nombre', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ materias: rows });
  });
});
app.post('/api/materias', requireAdmin, (req, res) => {
  const { nombre, descripcion } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  db.run('INSERT INTO materias (nombre, descripcion) VALUES (?, ?)', [nombre, descripcion || ''], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'La materia ya existe' });
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, message: 'Materia creada' });
  });
});
app.put('/api/materias/:id', requireAdmin, (req, res) => {
  const { nombre, descripcion, activo } = req.body;
  db.run('UPDATE materias SET nombre=?, descripcion=?, activo=? WHERE id=?',
    [nombre, descripcion, activo, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'No encontrada' });
      res.json({ message: 'Materia actualizada' });
    });
});
app.delete('/api/materias/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM materias WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'No encontrada' });
    res.json({ message: 'Materia eliminada' });
  });
});

// ============ USUARIOS (Admin) ============
app.get('/api/usuarios', requireAdmin, (req, res) => {
  db.all('SELECT id, usuario, nombre_completo, rol, activo, creado_en FROM usuarios ORDER BY id', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ usuarios: rows });
  });
});
app.post('/api/usuarios', requireAdmin, (req, res) => {
  const { usuario, password, nombre_completo, rol } = req.body;
  if (!usuario || !password || !nombre_completo) return res.status(400).json({ error: 'Todos los campos son requeridos' });
  const hash = bcrypt.hashSync(password, 10);
  db.run('INSERT INTO usuarios (usuario, password, nombre_completo, rol) VALUES (?, ?, ?, ?)',
    [usuario, hash, nombre_completo, rol || 'estudiante'], function(err) {
      if (err) { if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'El usuario ya existe' }); return res.status(500).json({ error: err.message }); }
      res.json({ id: this.lastID, message: 'Usuario creado' });
    });
});
app.put('/api/usuarios/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { nombre_completo, rol, activo, password } = req.body;
  let sql = 'UPDATE usuarios SET nombre_completo = ?, rol = ?, activo = ?';
  let params = [nombre_completo, rol, activo];
  if (password && password.trim()) { sql += ', password = ?'; params.push(bcrypt.hashSync(password, 10)); }
  sql += ' WHERE id = ?'; params.push(id);
  db.run(sql, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ message: 'Usuario actualizado' });
  });
});
app.delete('/api/usuarios/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM usuarios WHERE id = ? AND rol != "admin"', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Usuario no encontrado o es admin' });
    res.json({ message: 'Usuario eliminado' });
  });
});

// ============ PREGUNTAS (Admin) ============
app.get('/api/preguntas', requireAuth, (req, res) => {
  const { materia_id } = req.query;
  let sql = 'SELECT p.*, m.nombre as materia_nombre FROM preguntas p LEFT JOIN materias m ON p.materia_id = m.id ORDER BY p.id DESC';
  let params = [];
  if (materia_id) {
    sql = 'SELECT p.*, m.nombre as materia_nombre FROM preguntas p LEFT JOIN materias m ON p.materia_id = m.id WHERE p.materia_id = ? ORDER BY p.id DESC';
    params = [materia_id];
  }
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ preguntas: rows });
  });
});
const uploadPregunta = upload.fields([
  { name: 'imagen', maxCount: 1 },
  { name: 'imagen_opcion_a', maxCount: 1 },
  { name: 'imagen_opcion_b', maxCount: 1 },
  { name: 'imagen_opcion_c', maxCount: 1 },
  { name: 'imagen_opcion_d', maxCount: 1 }
]);

app.post('/api/preguntas', requireAdmin, uploadPregunta, (req, res) => {
  const { texto, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id } = req.body;
  if (!texto || !opcion_a || !opcion_b || !opcion_c || !opcion_d || !respuesta_correcta) return res.status(400).json({ error: 'Todos los campos son requeridos' });
  const imagen = req.files && req.files['imagen'] ? '/uploads/' + req.files['imagen'][0].filename : null;
  const imgA = req.files && req.files['imagen_opcion_a'] ? '/uploads/' + req.files['imagen_opcion_a'][0].filename : null;
  const imgB = req.files && req.files['imagen_opcion_b'] ? '/uploads/' + req.files['imagen_opcion_b'][0].filename : null;
  const imgC = req.files && req.files['imagen_opcion_c'] ? '/uploads/' + req.files['imagen_opcion_c'][0].filename : null;
  const imgD = req.files && req.files['imagen_opcion_d'] ? '/uploads/' + req.files['imagen_opcion_d'][0].filename : null;
  db.run('INSERT INTO preguntas (texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta.toUpperCase(), materia_id || null, req.session.user.id, imgA, imgB, imgC, imgD],
    function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ id: this.lastID, message: 'Pregunta creada' }); });
});
app.put('/api/preguntas/:id', requireAdmin, uploadPregunta, (req, res) => {
  const { id } = req.params;
  const { texto, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, imagen_existente, materia_id,
          imagen_opcion_a_existente, imagen_opcion_b_existente, imagen_opcion_c_existente, imagen_opcion_d_existente } = req.body;
  const imagen = req.files && req.files['imagen'] ? '/uploads/' + req.files['imagen'][0].filename : (imagen_existente || null);
  const imgA = req.files && req.files['imagen_opcion_a'] ? '/uploads/' + req.files['imagen_opcion_a'][0].filename : (imagen_opcion_a_existente || null);
  const imgB = req.files && req.files['imagen_opcion_b'] ? '/uploads/' + req.files['imagen_opcion_b'][0].filename : (imagen_opcion_b_existente || null);
  const imgC = req.files && req.files['imagen_opcion_c'] ? '/uploads/' + req.files['imagen_opcion_c'][0].filename : (imagen_opcion_c_existente || null);
  const imgD = req.files && req.files['imagen_opcion_d'] ? '/uploads/' + req.files['imagen_opcion_d'][0].filename : (imagen_opcion_d_existente || null);
  db.run('UPDATE preguntas SET texto=?, imagen=?, opcion_a=?, opcion_b=?, opcion_c=?, opcion_d=?, respuesta_correcta=?, materia_id=?, imagen_opcion_a=?, imagen_opcion_b=?, imagen_opcion_c=?, imagen_opcion_d=? WHERE id=?',
    [texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta.toUpperCase(), materia_id || null, imgA, imgB, imgC, imgD, id],
    function(err) { if (err) return res.status(500).json({ error: err.message }); if (this.changes === 0) return res.status(404).json({ error: 'No encontrada' }); res.json({ message: 'Pregunta actualizada' }); });
});
app.delete('/api/preguntas/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM preguntas WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'No encontrada' });
    res.json({ message: 'Pregunta eliminada' });
  });
});

// ============ CUESTIONARIOS (Admin) ============
app.get('/api/cuestionarios', requireAuth, (req, res) => {
  const isAdmin = req.session.user.rol === 'admin';
  const { materia_id } = req.query;
  let sql = `SELECT c.*, m.nombre as materia_nombre, 
    (SELECT COUNT(*) FROM cuestionario_preguntas WHERE cuestionario_id = c.id) as total_preguntas
    FROM cuestionarios c LEFT JOIN materias m ON c.materia_id = m.id`;
  let params = [];
  const conditions = [];
  if (!isAdmin) conditions.push('c.activo = 1');
  if (materia_id) conditions.push('c.materia_id = ' + materia_id);
  if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY c.id DESC';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ cuestionarios: rows });
  });
});
app.post('/api/cuestionarios', requireAdmin, (req, res) => {
  const { titulo, descripcion, tiempo_limite, materia_id } = req.body;
  if (!titulo) return res.status(400).json({ error: 'Titulo requerido' });
  db.run('INSERT INTO cuestionarios (titulo, descripcion, tiempo_limite, materia_id, creado_por) VALUES (?, ?, ?, ?, ?)',
    [titulo, descripcion || '', tiempo_limite || 60, materia_id || null, req.session.user.id],
    function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ id: this.lastID, message: 'Cuestionario creado' }); });
});
app.put('/api/cuestionarios/:id', requireAdmin, (req, res) => {
  const { titulo, descripcion, tiempo_limite, activo, materia_id } = req.body;
  db.run('UPDATE cuestionarios SET titulo=?, descripcion=?, tiempo_limite=?, activo=?, materia_id=? WHERE id=?',
    [titulo, descripcion, tiempo_limite, activo, materia_id || null, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'No encontrado' });
      res.json({ message: 'Actualizado' });
    });
});
app.put('/api/cuestionarios/:id/publicar', requireAdmin, (req, res) => {
  const { activo } = req.body;
  db.run('UPDATE cuestionarios SET activo=? WHERE id=?',
    [activo ? 1 : 0, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'No encontrado' });
      res.json({ message: activo ? 'Publicado' : 'Despublicado' });
    });
});
app.delete('/api/cuestionarios/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM cuestionarios WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Eliminado' });
  });
});
app.post('/api/cuestionarios/:id/preguntas', requireAdmin, (req, res) => {
  const { pregunta_id, orden } = req.body;
  db.run('INSERT INTO cuestionario_preguntas (cuestionario_id, pregunta_id, orden) VALUES (?, ?, ?)',
    [req.params.id, pregunta_id, orden || 0],
    function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ id: this.lastID, message: 'Pregunta agregada' }); });
});
app.delete('/api/cuestionarios/:cid/preguntas/:pid', requireAdmin, (req, res) => {
  db.run('DELETE FROM cuestionario_preguntas WHERE cuestionario_id = ? AND pregunta_id = ?', [req.params.cid, req.params.pid], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Pregunta removida' });
  });
});
app.get('/api/cuestionarios/:id/preguntas', requireAuth, (req, res) => {
  db.all(`SELECT p.*, m.nombre as materia_nombre FROM preguntas p
    JOIN cuestionario_preguntas cp ON p.id = cp.pregunta_id
    LEFT JOIN materias m ON p.materia_id = m.id
    WHERE cp.cuestionario_id = ? ORDER BY cp.orden`, [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ preguntas: rows });
  });
});

// ============ INTENTOS (Estudiante) ============
app.post('/api/intentos', requireAuth, (req, res) => {
  const { cuestionario_id } = req.body;
  db.get('SELECT COUNT(*) as total FROM cuestionario_preguntas WHERE cuestionario_id = ?', [cuestionario_id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    db.run('INSERT INTO intentos (usuario_id, cuestionario_id, total_preguntas) VALUES (?, ?, ?)',
      [req.session.user.id, cuestionario_id, row.total],
      function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ id: this.lastID, total: row.total }); });
  });
});
app.post('/api/intentos/:id/responder', requireAuth, (req, res) => {
  const { pregunta_id, respuesta } = req.body;
  db.get('SELECT respuesta_correcta FROM preguntas WHERE id = ?', [pregunta_id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Pregunta no encontrada' });
    const esCorrecta = row.respuesta_correcta === respuesta.toUpperCase() ? 1 : 0;
    db.run('INSERT INTO intento_respuestas (intento_id, pregunta_id, respuesta_seleccionada, es_correcta) VALUES (?, ?, ?, ?)',
      [req.params.id, pregunta_id, respuesta.toUpperCase(), esCorrecta],
      function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ es_correcta: esCorrecta, correcta: row.respuesta_correcta }); });
  });
});
app.put('/api/intentos/:id/finalizar', requireAuth, (req, res) => {
  db.get('SELECT COUNT(*) as correctas FROM intento_respuestas WHERE intento_id = ? AND es_correcta = 1', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    db.run('UPDATE intentos SET puntuacion = ?, completado = 1, fin_en = CURRENT_TIMESTAMP WHERE id = ?',
      [row.correctas, req.params.id],
      function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ puntuacion: row.correctas }); });
  });
});
app.get('/api/intentos/:id/resultados', requireAuth, (req, res) => {
  db.all(`SELECT ir.*, p.texto, p.opcion_a, p.opcion_b, p.opcion_c, p.opcion_d, p.respuesta_correcta, p.imagen
    FROM intento_respuestas ir JOIN preguntas p ON ir.pregunta_id = p.id WHERE ir.intento_id = ?`, [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT * FROM intentos WHERE id = ?', [req.params.id], (err2, intento) => {
      res.json({ respuestas: rows, intento });
    });
  });
});
app.get('/api/mis-intentos', requireAuth, (req, res) => {
  db.all(`SELECT i.*, COALESCE(c.titulo, 'Cuestionario eliminado') as cuestionario_titulo FROM intentos i
    LEFT JOIN cuestionarios c ON i.cuestionario_id = c.id
    WHERE i.usuario_id = ? ORDER BY i.inicio_en DESC`, [req.session.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ intentos: rows });
  });
});

// ============ INFORMES (Admin) ============
app.get('/api/admin/estudiantes-con-intentos', requireAdmin, (req, res) => {
  db.all(`SELECT u.id, u.usuario, u.nombre_completo,
    (SELECT COUNT(*) FROM intentos WHERE usuario_id = u.id) as total_intentos,
    (SELECT COUNT(*) FROM intentos WHERE usuario_id = u.id AND completado = 1) as intentos_completados,
    (SELECT ROUND(AVG(CASE WHEN total_preguntas > 0 THEN ROUND(puntuacion * 100.0 / total_preguntas) ELSE 0 END), 1) FROM intentos WHERE usuario_id = u.id AND completado = 1) as promedio
    FROM usuarios u WHERE u.rol = 'estudiante' AND u.activo = 1 ORDER BY u.nombre_completo`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ estudiantes: rows });
  });
});
app.get('/api/admin/usuarios/:id/intentos', requireAdmin, (req, res) => {
  db.all(`SELECT i.*, c.titulo as cuestionario_titulo, c.materia_id,
    COALESCE(m.nombre, 'Cuestionario eliminado') as materia_nombre,
    (SELECT COUNT(*) FROM intento_respuestas WHERE intento_id = i.id AND es_correcta = 1) as correctas,
    (SELECT COUNT(*) FROM intento_respuestas WHERE intento_id = i.id AND es_correcta = 0) as incorrectas
    FROM intentos i
    LEFT JOIN cuestionarios c ON i.cuestionario_id = c.id
    LEFT JOIN materias m ON c.materia_id = m.id
    WHERE i.usuario_id = ? ORDER BY i.inicio_en DESC`, [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ intentos: rows });
  });
});
app.get('/api/admin/intentos/:id/detalle', requireAdmin, (req, res) => {
  db.all(`SELECT ir.*, p.texto, p.opcion_a, p.opcion_b, p.opcion_c, p.opcion_d, p.respuesta_correcta, p.imagen
    FROM intento_respuestas ir JOIN preguntas p ON ir.pregunta_id = p.id WHERE ir.intento_id = ? ORDER BY ir.id`, [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    db.get(`SELECT i.*, COALESCE(c.titulo, 'Cuestionario eliminado') as cuestionario_titulo, u.nombre_completo as estudiante_nombre, u.usuario as estudiante_usuario,
      COALESCE(m.nombre, 'Sin materia') as materia_nombre
      FROM intentos i
      LEFT JOIN cuestionarios c ON i.cuestionario_id = c.id
      JOIN usuarios u ON i.usuario_id = u.id
      LEFT JOIN materias m ON c.materia_id = m.id
      WHERE i.id = ?`, [req.params.id], (err2, intento) => {
      res.json({ respuestas: rows, intento });
    });
  });
});

// ============ STATS (Admin) ============
app.get('/api/stats', requireAdmin, (req, res) => {
  const stats = {};
  let pending = 4;
  function done() { if (--pending === 0) res.json(stats); }
  db.get('SELECT COUNT(*) as total FROM usuarios WHERE rol="estudiante"', [], (e, r) => { stats.totalEstudiantes = r ? r.total : 0; done(); });
  db.get('SELECT COUNT(*) as total FROM preguntas', [], (e, r) => { stats.totalPreguntas = r ? r.total : 0; done(); });
  db.get('SELECT COUNT(*) as total FROM cuestionarios', [], (e, r) => { stats.totalCuestionarios = r ? r.total : 0; done(); });
  db.get('SELECT COUNT(*) as total FROM intentos WHERE completado=1', [], (e, r) => { stats.totalIntentos = r ? r.total : 0; done(); });
});

// ============ URL PUBLICA ============
app.get('/api/url-publica', requireAdmin, (req, res) => {
  const fs = require('fs');
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

app.listen(PORT, '0.0.0.0', () => console.log(`Servidor: http://localhost:${PORT}\nRed: http://10.146.41.13:${PORT}`));
