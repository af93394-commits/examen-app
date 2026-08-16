require('dotenv').config();
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
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

const fs = require('fs');
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ============ SECURITY HEADERS ============
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Rate limiting estricto para login (anti brute force)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiados intentos de login. Espera 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => 'global'
});

// Rate limiting para endpoints sensibles (admin, preguntas CRUD)
const adminLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 200,
  message: { error: 'Límite de peticiones alcanzado.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => 'global'
});

// Rate limiting para endpoints de estudiante
const studentLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  message: { error: 'Límite de peticiones alcanzado.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => 'global'
});

// Alias para compatibilidad - usar adminLimiter para todos los endpoints
const apiLimiter = adminLimiter;

if (!process.env.CLOUD_NAME || !process.env.CLOUD_API_KEY || !process.env.CLOUD_API_SECRET) {
  console.error('ADVERTENCIA: Variables CLOUD_NAME, CLOUD_API_KEY, CLOUD_API_SECRET no configuradas');
}
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET
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
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000,
  max: 10
});

const badgesEngine = require('./badges')(db);

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
    await db.query(`CREATE TABLE IF NOT EXISTS badges (
      id SERIAL PRIMARY KEY,
      clave TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      icono_svg TEXT,
      categoria TEXT DEFAULT 'general',
      rareza TEXT DEFAULT 'comun',
      puntos INTEGER DEFAULT 10,
      orden_display INTEGER DEFAULT 0,
      activo INTEGER DEFAULT 1,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS student_badges (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      badge_id INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
      intento_id INTEGER REFERENCES intentos(id) ON DELETE SET NULL,
      otorgado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(usuario_id, badge_id)
    )`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_sb_usuario ON student_badges(usuario_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_sb_usuario_badge ON student_badges(usuario_id, badge_id)`);
    await db.query(`CREATE TABLE IF NOT EXISTS notificaciones (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      badge_id INTEGER REFERENCES badges(id) ON DELETE SET NULL,
      titulo TEXT NOT NULL,
      mensaje TEXT,
      leida INTEGER DEFAULT 0,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_notif_usuario ON notificaciones(usuario_id)`);

    // ============ MODULO SIMULACRO ICFES (tablas nuevas, no tocar las existentes) ============
    await db.query(`CREATE TABLE IF NOT EXISTS simulacro_config_materias (
      id SERIAL PRIMARY KEY,
      materia_id INTEGER NOT NULL REFERENCES materias(id),
      preguntas_requeridas INTEGER NOT NULL,
      tiempo_minutos INTEGER NOT NULL,
      peso_ponderacion NUMERIC(3,1) NOT NULL DEFAULT 3.0,
      orden_presentacion INTEGER NOT NULL,
      activo INTEGER DEFAULT 1,
      max_repetidas_pct NUMERIC(4,2) NOT NULL DEFAULT 0.10,
      permitir_incompleto INTEGER DEFAULT 1,
      UNIQUE(materia_id)
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS simulacros (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      estado TEXT NOT NULL DEFAULT 'en_progreso',
      bloque_actual INTEGER DEFAULT 0,
      puntaje_global INTEGER,
      iniciado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      finalizado_en TIMESTAMP
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS simulacro_bloques (
      id SERIAL PRIMARY KEY,
      simulacro_id INTEGER NOT NULL REFERENCES simulacros(id) ON DELETE CASCADE,
      materia_id INTEGER NOT NULL REFERENCES materias(id),
      orden INTEGER NOT NULL,
      tiempo_limite_segundos INTEGER NOT NULL,
      iniciado_en TIMESTAMP,
      finalizado_en TIMESTAMP,
      correctas INTEGER DEFAULT 0,
      total_preguntas INTEGER NOT NULL,
      puntaje_area INTEGER
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS simulacro_bloque_preguntas (
      id SERIAL PRIMARY KEY,
      bloque_id INTEGER NOT NULL REFERENCES simulacro_bloques(id) ON DELETE CASCADE,
      pregunta_id INTEGER NOT NULL REFERENCES preguntas(id),
      orden INTEGER NOT NULL,
      respuesta_seleccionada TEXT,
      es_correcta INTEGER,
      respondida_en TIMESTAMP,
      UNIQUE(bloque_id, pregunta_id)
    )`);
    // Pausa de simulacro: tiempo ya consumido (excluye pausas) y marca de pausa del bloque actual
    await db.query(`ALTER TABLE simulacro_bloques ADD COLUMN IF NOT EXISTS tiempo_usado_segundos INTEGER NOT NULL DEFAULT 0`);
    await db.query(`ALTER TABLE simulacro_bloques ADD COLUMN IF NOT EXISTS pausado_en TIMESTAMP`);
    // Modulo PreICFES Varios: agrupacion de cuestionarios (entrenamiento, grupo_fenix, predicciones, milton_ochoa, ascensus, pack_estudios, varios)
    await db.query(`ALTER TABLE cuestionarios ADD COLUMN IF NOT EXISTS agrupacion TEXT`);
    await db.query(`INSERT INTO simulacro_config_materias (materia_id, preguntas_requeridas, tiempo_minutos, peso_ponderacion, orden_presentacion) VALUES
      (2, 41, 90, 3.0, 1),
      (1, 50, 100, 3.0, 2),
      (4, 50, 105, 3.0, 3),
      (3, 58, 120, 3.0, 4),
      (5, 55, 90, 1.0, 5)
      ON CONFLICT (materia_id) DO NOTHING`);
    await db.query("SELECT setval('simulacro_config_materias_id_seq', (SELECT COALESCE(MAX(id),1) FROM simulacro_config_materias))");
    await db.query("SELECT setval('simulacros_id_seq', (SELECT COALESCE(MAX(id),1) FROM simulacros))");
    await db.query("SELECT setval('simulacro_bloques_id_seq', (SELECT COALESCE(MAX(id),1) FROM simulacro_bloques))");
    await db.query("SELECT setval('simulacro_bloque_preguntas_id_seq', (SELECT COALESCE(MAX(id),1) FROM simulacro_bloque_preguntas))");

    const badgeCount = await db.query('SELECT COUNT(*) as t FROM badges');
    if (parseInt(badgeCount.rows[0].t) === 0) {
      const badges = [
        ['STREAK_7_DAYS','Primera Semana','7 días consecutivos de estudio','racha','comun',15,1],
        ['STREAK_15_DAYS','Racha de Oro','15 días consecutivos de estudio','racha','raro',30,2],
        ['STREAK_20_DAYS','Imparable','20 días consecutivos de estudio','racha','epico',50,3],
        ['FIRST_QUIZ_COMPLETED','Primera Vez','Completa tu primer cuestionario','volumen','comun',10,10],
        ['TOTAL_QUIZZES_10','Diez Cuestionarios','Completa 10 cuestionarios','volumen','comun',15,11],
        ['TOTAL_QUIZZES_30','Treinta Cuestionarios','Completa 30 cuestionarios','volumen','raro',25,12],
        ['TOTAL_QUIZZES_100','Cien Cuestionarios','Completa 100 cuestionarios','volumen','legendario',100,13],
        ['FIVE_QUIZZES_SAME_DAY','Maratón de un Día','Completa 5 cuestionarios en un solo día','volumen','raro',30,14],
        ['PERFECT_SCORE_SINGLE_ATTEMPT','Perfecto a la Primera','100% en tu primer intento','mastery','raro',25,20],
        ['CATEGORY_MASTERY_100PCT','Maestro de Categoría','100% en una materia','mastery','raro',30,21],
        ['FIVE_CATEGORIES_MASTERED','Polímata','100% en 5 materias diferentes','mastery','epico',60,22],
        ['FIVE_PERFECT_SCORES','Cinco Perfectos','100% en 5 cuestionarios','mastery','epico',50,23],
        ['50_CONSECUTIVE_CORRECT','Precisión Quirúrgica','50 respuestas correctas seguidas','mastery','legendario',80,24],
        ['ALL_SUBJECTS_COMPLETED','Explorador Total','Completa cuestionarios de todas las materias','mastery','raro',35,25],
        ['ALL_CATEGORIES_ATTEMPTED','Curioso','Intenta cuestionarios de todas las materias','mastery','comun',20,26],
        ['QUIZ_BEFORE_8AM','Madrugador','Inicia un cuestionario antes de las 8am','horario','comun',15,30],
        ['QUIZ_BEFORE_6AM','Madrugador Extremo','Inicia un cuestionario antes de las 6am','horario','raro',25,31],
        ['QUIZ_AFTER_10PM','Noctambulo','Inicia un cuestionario después de las 10pm','horario','comun',15,32],
        ['QUIZ_AFTER_MIDNIGHT','Trasnochador','Inicia un cuestionario después de medianoche','horario','raro',25,33],
        ['ACTIVE_WEEKEND','Fin de Semana Activo','Estudia sábado y domingo','horario','comun',15,34],
        ['ACTIVE_EVERY_DAY_MONTH','Constancia Mensual','Activo todos los días del mes','horario','epico',50,35],
        ['FIRST_QUIZ_OF_YEAR','Primer Quiz del Año','Primer cuestionario del año','horario','raro',20,36],
        ['COMPLETED_NO_HINTS','Sin Ayudas','Completa sin usar pistas','horario','comun',10,37],
        ['60_DAYS_SINCE_REGISTRATION_ACTIVE','Veterano','60 días desde tu registro activo','horario','raro',30,38],
        ['RETURN_AFTER_30_DAYS_INACTIVE','De Vuelta','Regresa tras 30 días inactivo','horario','raro',25,39],
        ['TIME_UNDER_50PCT_LIMIT','Velocista','Termina en menos del 50% del tiempo','velocidad','comun',15,40],
        ['PERFECT_UNDER_HALF_TIME','Velocista Perfecto','100% en menos del 50% del tiempo','velocidad','epico',50,41],
        ['FULL_TIME_USED_AND_PASSED','Límite al Máximo','Usa todo el tiempo y apruebas','velocidad','raro',20,42],
        ['IMPROVEMENT_20PCT_AFTER_FAIL','Mejora Constante','Mejora 20% tras reprobado','especial','raro',25,50],
        ['RETRY_AFTER_3_FAILS','Nunca Se Rinde','Reintenta tras 3 intentos fallidos','especial','raro',25,51],
        ['RETAKE_AND_IMPROVE','Superación','Repasa y mejora tu puntuación','especial','comun',15,52],
        ['HARD_QUIZ_PASSED_AFTER_3_ATTEMPTS','Conquistador','Aprueba tras 3+ intentos','especial','epico',40,53],
        ['BADGES_EARNED_10','Coleccionista','Obtiene 10 insignias','especial','raro',20,54],
        ['BADGES_EARNED_20','Maestro Coleccionista','Obtiene 20 insignias','especial','epico',40,55],
        ['STREAK_3_DAYS','Brote nuevo','3 dias seguidos de estudio','racha','comun',10,4],
        ['STREAK_6_DAYS','Pisada firme','6 dias seguidos de estudio','racha','comun',12,5],
        ['STREAK_12_DAYS','Cuarenta soles','12 dias seguidos de estudio','racha','raro',20,6],
        ['STREAK_22_DAYS','Cien dias rugiendo','22 dias seguidos de estudio','racha','epico',40,7],
        ['STREAK_30_NO_MISS','Racha de hierro','30 dias sin fallar un dia activo','racha','epico',45,8],
        ['STREAK_32_DAYS','Migracion anual','32 dias seguidos de estudio','racha','legendario',80,9],
        ['TOTAL_QUIZZES_2','Brote inicial','Completa 2 cuestionarios','volumen','comun',10,15],
        ['TOTAL_QUIZZES_4','Cuatro pasos','Completa 4 cuestionarios','volumen','raro',15,16],
        ['TOTAL_QUIZZES_6','Seis huellas','Completa 6 cuestionarios','volumen','raro',20,17],
        ['TOTAL_QUIZZES_8','Ocho rugidos','Completa 8 cuestionarios','volumen','epico',25,18],
        ['ALL_QUIZZES_COMPLETED','Coleccion completa','Completa todos los cuestionarios disponibles','volumen','legendario',100,19],
        ['ONE_CATEGORY_MASTERED','Cerebro de pico','Domina 1 categoria al 100%','mastery','comun',15,27],
        ['SIX_CONSECUTIVE_ABOVE_95','Sin tropiezos','6 cuestionarios seguidos por encima del 95%','mastery','raro',30,28],
        ['ALL_CATEGORIES_MASTERED','Erudito jurasico','Domina todas las categorias al 100%','mastery','legendario',80,29],
        ['RETRY_QUESTION_CORRECTED','Memoria de piedra','Responde bien una pregunta que fallo antes','mastery','raro',25,30],
        ['ACCURACY_90PCT_OVER_10','Instinto certero','90% de aciertos en 10 cuestionarios','mastery','epico',40,31],
        ['QUIZ_DAWN_5_7AM','Cazador del amanecer','Cuestionario entre 5am y 7am','horario','comun',15,40],
        ['QUIZ_NOON_12PM','Medio dia activo','Cuestionario entre 12pm y 1pm','horario','comun',15,41],
        ['QUIZ_SIESTA_1_3PM','Siesta productiva','Cuestionario entre 1pm y 3pm','horario','comun',15,42],
        ['QUIZ_DUSK_6_8PM','Guardian del atardecer','Cuestionario entre 6pm y 8pm','horario','comun',15,43],
        ['SAME_HOUR_5_DAYS','Constancia de reloj','Cuestionario a la misma hora 5 dias distintos','horario','raro',25,44],
        ['QUIZ_UNDER_30MIN','Velocista nato','Termina un cuestionario en menos de 30 minutos','velocidad','comun',15,45],
        ['TWO_QUIZZES_UNDER_60MIN','Doble velocidad','Termina dos cuestionarios en menos de 60 minutos','velocidad','raro',25,46],
        ['EXACT_SCORE_77','Numero de la suerte','Obtiene exactamente 77% en un cuestionario','especial','raro',20,56]
      ];
      for (const b of badges) {
        await db.query('INSERT INTO badges (clave, nombre, descripcion, categoria, rareza, puntos, orden_display) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING', b);
      }
      console.log('57 insignias insertadas');
    }

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

    await db.query("SELECT setval('materias_id_seq', (SELECT COALESCE(MAX(id),1) FROM materias))");
    await db.query("SELECT setval('usuarios_id_seq', (SELECT COALESCE(MAX(id),1) FROM usuarios))");
    await db.query("SELECT setval('preguntas_id_seq', (SELECT COALESCE(MAX(id),1) FROM preguntas))");
    await db.query("SELECT setval('cuestionarios_id_seq', (SELECT COALESCE(MAX(id),1) FROM cuestionarios))");
    await db.query("SELECT setval('cuestionario_preguntas_id_seq', (SELECT COALESCE(MAX(id),1) FROM cuestionario_preguntas))");
    await db.query("SELECT setval('intentos_id_seq', (SELECT COALESCE(MAX(id),1) FROM intentos))");
    await db.query("SELECT setval('intento_respuestas_id_seq', (SELECT COALESCE(MAX(id),1) FROM intento_respuestas))");
    await db.query("SELECT setval('badges_id_seq', (SELECT COALESCE(MAX(id),1) FROM badges))");
    await db.query("SELECT setval('student_badges_id_seq', (SELECT COALESCE(MAX(id),1) FROM student_badges))");
    console.log('Secuencias sincronizadas');
    console.log('PostgreSQL conectado y tablas creadas');
  } catch (e) {
    console.error('Error DB:', e.message);
  }
}
initDB();

// ============ CORS CONFIGURADO ============
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Sanitización básica de inputs
app.use((req, res, next) => {
  if (req.body) {
    for (const key in req.body) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      }
    }
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use((req, res, next) => {
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: 'El servidor tardó demasiado en responder. Intenta de nuevo.' });
    }
  }, 60000);
  res.on('finish', () => clearTimeout(timer));
  next();
});

// ============ SESSION SEGURA ============
const isProduction = process.env.NODE_ENV === 'production';
app.use(session({
  store: new PgSession({ pool: db, tableName: 'user_sessions' }),
  secret: process.env.SESSION_SECRET || 'fallback-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    secure: false,
    httpOnly: true,
    sameSite: 'lax'
  }
}));

if (!process.env.SESSION_SECRET) {
  console.error('ADVERTENCIA: SESSION_SECRET no está configurado. Usa una cadena larga y aleatoria.');
}

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
app.post('/api/login', loginLimiter, async (req, res) => {
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
app.get('/api/materias', requireAuth, apiLimiter, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM materias WHERE activo = 1 ORDER BY nombre');
    res.json({ materias: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/materias/todas', requireAdmin, apiLimiter, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM materias ORDER BY nombre');
    res.json({ materias: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/materias', requireAdmin, apiLimiter, async (req, res) => {
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
app.put('/api/materias/:id', requireAdmin, apiLimiter, async (req, res) => {
  try {
    const { nombre, descripcion, activo } = req.body;
    const r = await db.query('UPDATE materias SET nombre=$1, descripcion=$2, activo=$3 WHERE id=$4', [nombre, descripcion, activo, req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrada' });
    res.json({ message: 'Materia actualizada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/materias/:id', requireAdmin, apiLimiter, async (req, res) => {
  try {
    const r = await db.query('DELETE FROM materias WHERE id = $1', [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrada' });
    res.json({ message: 'Materia eliminada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ USUARIOS ============
app.get('/api/usuarios', requireAdmin, apiLimiter, async (req, res) => {
  try {
    const r = await db.query('SELECT id, usuario, nombre_completo, rol, activo, creado_en FROM usuarios ORDER BY id');
    res.json({ usuarios: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/usuarios', requireAdmin, apiLimiter, async (req, res) => {
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
app.put('/api/usuarios/:id', requireAdmin, apiLimiter, async (req, res) => {
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
app.delete('/api/usuarios/:id', requireAdmin, apiLimiter, async (req, res) => {
  try {
    const r = await db.query('DELETE FROM usuarios WHERE id = $1 AND rol != $2', [req.params.id, 'admin']);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Usuario no encontrado o es admin' });
    res.json({ message: 'Usuario eliminado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ PREGUNTAS ============
app.get('/api/preguntas', requireAuth, apiLimiter, async (req, res) => {
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

app.post('/api/preguntas', requireAdmin, apiLimiter, uploadPregunta, async (req, res) => {
  try {
    const { texto, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, texto_lectura, cuestionario_id } = req.body;
    if (!texto || !opcion_a || !opcion_b || !opcion_c || !opcion_d || !respuesta_correcta) return res.status(400).json({ error: 'Todos los campos son requeridos' });
    await db.query("SELECT setval('preguntas_id_seq', (SELECT COALESCE(MAX(id),1) FROM preguntas))");
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
  } catch (e) {
    if (e.message && e.message.includes('duplicate key')) {
      await db.query("SELECT setval('preguntas_id_seq', (SELECT COALESCE(MAX(id),1) FROM preguntas))");
      return res.status(500).json({ error: 'Secuencia reiniciada. Intente guardar de nuevo.' });
    }
    res.status(500).json({ error: e.message });
  }
});
app.put('/api/preguntas/:id', requireAdmin, apiLimiter, uploadPregunta, async (req, res) => {
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
app.delete('/api/preguntas/:id', requireAdmin, apiLimiter, async (req, res) => {
  try {
    const r = await db.query('DELETE FROM preguntas WHERE id = $1', [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrada' });
    res.json({ message: 'Pregunta eliminada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ TEXTOS DE LECTURA ============
const uploadTexto = upload.fields([{ name: 'imagen', maxCount: 1 }]);

app.get('/api/cuestionarios/:id/textos', requireAuth, apiLimiter, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM textos_lectura WHERE cuestionario_id = $1 ORDER BY orden, id', [req.params.id]);
    res.json({ textos: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/cuestionarios/:id/textos', requireAdmin, apiLimiter, uploadTexto, async (req, res) => {
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
app.put('/api/textos/:id', requireAdmin, apiLimiter, uploadTexto, async (req, res) => {
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
app.delete('/api/textos/:id', requireAdmin, apiLimiter, async (req, res) => {
  try {
    await db.query('UPDATE preguntas SET texto_lectura_id = NULL WHERE texto_lectura_id = $1', [req.params.id]);
    const r = await db.query('DELETE FROM textos_lectura WHERE id = $1', [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json({ message: 'Texto eliminado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/preguntas/:id/asignar-texto', requireAdmin, apiLimiter, async (req, res) => {
  try {
    const { texto_lectura_id } = req.body;
    const r = await db.query('UPDATE preguntas SET texto_lectura_id = $1 WHERE id = $2', [texto_lectura_id || null, req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Pregunta no encontrada' });
    res.json({ message: 'Texto asignado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ CUESTIONARIOS ============
app.get('/api/cuestionarios', requireAuth, apiLimiter, async (req, res) => {
  try {
    const isAdmin = req.session.user.rol === 'admin';
    const { materia_id, agrupacion } = req.query;
    let sql = `SELECT c.*, m.nombre as materia_nombre, 
      (SELECT COUNT(*) FROM cuestionario_preguntas WHERE cuestionario_id = c.id) as total_preguntas
      FROM cuestionarios c LEFT JOIN materias m ON c.materia_id = m.id`;
    let params = [];
    const conditions = [];
    if (!isAdmin) conditions.push('c.activo = 1');
    if (materia_id) { conditions.push('c.materia_id = $' + (params.length + 1)); params.push(materia_id); }
    if (agrupacion) { conditions.push('c.agrupacion = $' + (params.length + 1)); params.push(agrupacion); }
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY c.id DESC';
    const r = await db.query(sql, params);
    res.json({ cuestionarios: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/cuestionarios', requireAdmin, apiLimiter, async (req, res) => {
  try {
    const { titulo, descripcion, tiempo_limite, materia_id, agrupacion } = req.body;
    if (!titulo) return res.status(400).json({ error: 'Titulo requerido' });
    const r = await db.query('INSERT INTO cuestionarios (titulo, descripcion, tiempo_limite, materia_id, agrupacion, creado_por) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [titulo, descripcion || '', tiempo_limite || 60, materia_id || null, agrupacion || null, req.session.user.id]);
    res.json({ id: r.rows[0].id, message: 'Cuestionario creado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/cuestionarios/:id', requireAdmin, apiLimiter, async (req, res) => {
  try {
    const { titulo, descripcion, tiempo_limite, activo, materia_id } = req.body;
    const r = await db.query('UPDATE cuestionarios SET titulo=$1, descripcion=$2, tiempo_limite=$3, activo=$4, materia_id=$5 WHERE id=$6',
      [titulo, descripcion, tiempo_limite, activo, materia_id || null, req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json({ message: 'Actualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/cuestionarios/:id/publicar', requireAdmin, apiLimiter, async (req, res) => {
  try {
    const { activo } = req.body;
    const r = await db.query('UPDATE cuestionarios SET activo=$1 WHERE id=$2', [activo ? 1 : 0, req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json({ message: activo ? 'Publicado' : 'Despublicado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/cuestionarios/:id', requireAdmin, apiLimiter, async (req, res) => {
  try {
    await db.query('DELETE FROM cuestionarios WHERE id = $1', [req.params.id]);
    res.json({ message: 'Eliminado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/cuestionarios/:id/preguntas', requireAdmin, apiLimiter, async (req, res) => {
  try {
    const { pregunta_id, orden } = req.body;
    const r = await db.query('INSERT INTO cuestionario_preguntas (cuestionario_id, pregunta_id, orden) VALUES ($1,$2,$3) RETURNING id',
      [req.params.id, pregunta_id, orden || 0]);
    res.json({ id: r.rows[0].id, message: 'Pregunta agregada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/cuestionarios/:cid/preguntas/:pid', requireAdmin, apiLimiter, async (req, res) => {
  try {
    await db.query('DELETE FROM cuestionario_preguntas WHERE cuestionario_id = $1 AND pregunta_id = $2', [req.params.cid, req.params.pid]);
    res.json({ message: 'Pregunta removida' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/cuestionarios/:id/preguntas', requireAuth, apiLimiter, async (req, res) => {
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
app.post('/api/intentos', requireAuth, apiLimiter, async (req, res) => {
  try {
    const { cuestionario_id } = req.body;
    const total = await db.query('SELECT COUNT(*) as total FROM cuestionario_preguntas WHERE cuestionario_id = $1', [cuestionario_id]);
    const r = await db.query('INSERT INTO intentos (usuario_id, cuestionario_id, total_preguntas) VALUES ($1,$2,$3) RETURNING id',
      [req.session.user.id, cuestionario_id, parseInt(total.rows[0].total)]);
    res.json({ id: r.rows[0].id, total: parseInt(total.rows[0].total) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/intentos/:id/responder', requireAuth, apiLimiter, async (req, res) => {
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
app.put('/api/intentos/:id/finalizar', requireAuth, apiLimiter, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT COUNT(*) as correctas
       FROM intento_respuestas
       WHERE intento_id = $1 AND es_correcta = 1`,
      [req.params.id]
    );
    await db.query('UPDATE intentos SET puntuacion = $1, completado = 1, fin_en = CURRENT_TIMESTAMP WHERE id = $2', [parseInt(r.rows[0].correctas), req.params.id]);
    const nuevasInsignias = await badgesEngine.evaluarInsignias(req.session.user.id, parseInt(req.params.id));
    res.json({ puntuacion: parseInt(r.rows[0].correctas), nuevasInsignias });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/intentos/:id/resultados', requireAuth, apiLimiter, async (req, res) => {
  try {
    const resp = await db.query(`SELECT ir.*, p.texto, p.opcion_a, p.opcion_b, p.opcion_c, p.opcion_d, p.respuesta_correcta, p.imagen, p.imagen_opcion_a, p.imagen_opcion_b, p.imagen_opcion_c, p.imagen_opcion_d
      FROM intento_respuestas ir JOIN preguntas p ON ir.pregunta_id = p.id WHERE ir.intento_id = $1`, [req.params.id]);
    const intento = await db.query('SELECT * FROM intentos WHERE id = $1', [req.params.id]);
    res.json({ respuestas: resp.rows, intento: intento.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/mis-intentos', requireAuth, apiLimiter, async (req, res) => {
  try {
    const r = await db.query(`SELECT i.*, COALESCE(c.titulo, 'Cuestionario eliminado') as cuestionario_titulo FROM intentos i
      LEFT JOIN cuestionarios c ON i.cuestionario_id = c.id
      WHERE i.usuario_id = $1 ORDER BY i.inicio_en DESC`, [req.session.user.id]);
    res.json({ intentos: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ INFORMES ============
app.get('/api/admin/estudiantes-con-intentos', requireAdmin, apiLimiter, async (req, res) => {
  try {
    const r = await db.query(`SELECT u.id, u.usuario, u.nombre_completo,
      (SELECT COUNT(*) FROM intentos WHERE usuario_id = u.id) as total_intentos,
      (SELECT COUNT(*) FROM intentos WHERE usuario_id = u.id AND completado = 1) as intentos_completados,
      (SELECT ROUND(AVG(CASE WHEN total_preguntas > 0 THEN ROUND(puntuacion * 100.0 / total_preguntas) ELSE 0 END), 1) FROM intentos WHERE usuario_id = u.id AND completado = 1) as promedio
      FROM usuarios u WHERE u.rol = 'estudiante' AND u.activo = 1 ORDER BY u.nombre_completo`);
    res.json({ estudiantes: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/admin/usuarios/:id/intentos', requireAdmin, apiLimiter, async (req, res) => {
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
app.get('/api/admin/intentos/:id/detalle', requireAdmin, apiLimiter, async (req, res) => {
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
app.get('/api/estudiante/progreso', requireAuth, apiLimiter, async (req, res) => {
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

app.get('/api/estudiante/pendientes', requireAuth, apiLimiter, async (req, res) => {
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

app.get('/api/estudiante/historico', requireAuth, apiLimiter, async (req, res) => {
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
app.get('/api/stats', requireAdmin, apiLimiter, async (req, res) => {
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

// ============ INSIGNIAS ============
app.get('/api/insignias', requireAuth, apiLimiter, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const badgesRes = await db.query('SELECT * FROM badges WHERE activo = 1 ORDER BY categoria, orden_display');
    const earnedRes = await db.query(`
      SELECT sb.badge_id, sb.otorgado_en FROM student_badges sb
      WHERE sb.usuario_id = $1
    `, [userId]);
    const earnedMap = {};
    earnedRes.rows.forEach(r => { earnedMap[r.badge_id] = r.otorgado_en; });
    const badges = badgesRes.rows.map(b => ({
      ...b, otorgada: !!earnedMap[b.id], otorgado_en: earnedMap[b.id] || null
    }));
    res.json({ badges });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/insignias/mis', requireAuth, apiLimiter, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const r = await db.query(`
      SELECT b.*, sb.otorgado_en FROM student_badges sb
      JOIN badges b ON sb.badge_id = b.id
      WHERE sb.usuario_id = $1 ORDER BY sb.otorgado_en DESC
    `, [userId]);
    const totalBadges = await db.query('SELECT COUNT(*) as t FROM badges WHERE activo=1');
    const totalPuntos = r.rows.reduce((sum, b) => sum + (b.puntos || 0), 0);
    res.json({ insignias: r.rows, totalObtenidas: r.rows.length, totalDisponibles: parseInt(totalBadges.rows[0].t), totalPuntos });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/insignias/progreso', requireAuth, apiLimiter, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const completados = await db.query('SELECT COUNT(*) as t FROM intentos WHERE usuario_id=$1 AND completado=1', [userId]);
    const streak = await badgesEngine.calcularRacha(userId);
    const totalMaterias = await db.query('SELECT COUNT(*) as t FROM materias WHERE activo=1');
    res.json({ completados: parseInt(completados.rows[0].t), rachaActual: streak, totalMaterias: parseInt(totalMaterias.rows[0].t) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ NOTIFICACIONES ============
app.get('/api/notificaciones', requireAuth, apiLimiter, async (req, res) => {
  try {
    const r = await db.query(`SELECT n.*, b.nombre as badge_nombre, b.puntos, b.rareza
      FROM notificaciones n
      LEFT JOIN badges b ON n.badge_id = b.id
      WHERE n.usuario_id = $1
      ORDER BY n.creado_en DESC, n.id DESC LIMIT 50`, [req.session.user.id]);
    res.json({ notificaciones: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/notificaciones/no-leidas', requireAuth, apiLimiter, async (req, res) => {
  try {
    const r = await db.query('SELECT COUNT(*) as t FROM notificaciones WHERE usuario_id=$1 AND leida=0', [req.session.user.id]);
    res.json({ noLeidas: parseInt(r.rows[0].t) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/notificaciones/marcar-leidas', requireAuth, apiLimiter, async (req, res) => {
  try {
    await db.query('UPDATE notificaciones SET leida=1 WHERE usuario_id=$1', [req.session.user.id]);
    res.json({ message: 'Notificaciones marcadas como leidas' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ MODULO SIMULACRO ICFES ============
function calcularNivelDesempeno(puntajeArea) {
  if (puntajeArea <= 39) return 'Insuficiente';
  if (puntajeArea <= 59) return 'Minimo';
  if (puntajeArea <= 79) return 'Satisfactorio';
  return 'Avanzado';
}

async function seleccionarPreguntasMateria(db, usuarioId, materiaId, requeridas, maxRepetidasPct) {
  const maxRepetidas = Math.floor(requeridas * maxRepetidasPct);

  const ultimoSimulacro = await db.query(`
    SELECT id FROM simulacros
    WHERE usuario_id = $1 AND estado = 'finalizado'
    ORDER BY finalizado_en DESC LIMIT 1
  `, [usuarioId]);

  let anteriores = [];
  if (ultimoSimulacro.rows.length) {
    const r = await db.query(`
      SELECT sbp.pregunta_id
      FROM simulacro_bloque_preguntas sbp
      JOIN simulacro_bloques sb ON sb.id = sbp.bloque_id
      WHERE sb.simulacro_id = $1 AND sb.materia_id = $2
    `, [ultimoSimulacro.rows[0].id, materiaId]);
    anteriores = r.rows.map(x => x.pregunta_id);
  }

  // Pool A: preguntas que NO salieron en el simulacro anterior (nuevas)
  const excluir = anteriores.length ? anteriores : [0];
  let seleccionadas = [];
  const topeNuevas = Math.max(0, requeridas - maxRepetidas);
  if (topeNuevas > 0) {
    const poolA = await db.query(`
      SELECT id FROM preguntas
      WHERE materia_id = $1 AND id != ALL($2::int[])
      ORDER BY RANDOM()
      LIMIT $3
    `, [materiaId, excluir, topeNuevas]);
    seleccionadas = poolA.rows.map(x => x.id);
  }

  // Completar faltantes: primero con repetidas del simulacro anterior, luego con lo que quede del banco
  let faltantes = requeridas - seleccionadas.length;
  const yaTomadas = seleccionadas.length ? seleccionadas : [0];
  let poolExtra = [];
  if (faltantes > 0) {
    const poolB = await db.query(`
      SELECT id FROM preguntas
      WHERE materia_id = $1 AND id != ALL($2::int[])
      ORDER BY RANDOM()
      LIMIT $3
    `, [materiaId, yaTomadas, faltantes]);
    poolExtra = poolB.rows.map(x => x.id);
  }
  seleccionadas = seleccionadas.concat(poolExtra);

  // Banco insuficiente: completar con lo que quede del banco (el frontend lo marca como incompleto)
  faltantes = requeridas - seleccionadas.length;
  if (faltantes > 0) {
    const yaTomadas2 = seleccionadas.length ? seleccionadas : [0];
    const restantes = await db.query(`
      SELECT id FROM preguntas
      WHERE materia_id = $1 AND id != ALL($2::int[])
      ORDER BY RANDOM()
      LIMIT $3
    `, [materiaId, yaTomadas2, faltantes]);
    seleccionadas = seleccionadas.concat(restantes.rows.map(x => x.id));
  }

  // Mezclar orden final (que no queden las repetidas agrupadas)
  return seleccionadas.sort(() => Math.random() - 0.5);
}

// Tiempo efectivamente usado por el bloque (excluye periodos de pausa)
function tiempoUsadoBloque(b) {
  const acumulado = parseInt(b.tiempo_usado_segundos) || 0;
  if (b.pausado_en) return acumulado; // la ventana corrida ya fue acumulada al pausar
  if (b.iniciado_en) return acumulado + Math.max(0, Math.round((Date.now() - new Date(b.iniciado_en)) / 1000));
  return acumulado;
}

function tiempoRestanteBloque(b) {
  return Math.max(0, parseInt(b.tiempo_limite_segundos) - tiempoUsadoBloque(b));
}

// Config publica (estructura oficial + disponibilidad actual del banco)
app.get('/api/simulacros/config', requireAuth, apiLimiter, async (req, res) => {
  try {
    const cfg = await db.query(`
      SELECT c.*, m.nombre as materia_nombre,
        (SELECT COUNT(*) FROM preguntas p WHERE p.materia_id = c.materia_id) as disponibles
      FROM simulacro_config_materias c
      LEFT JOIN materias m ON c.materia_id = m.id
      WHERE c.activo = 1
      ORDER BY c.orden_presentacion
    `);
    let totalPreguntas = 0, totalMinutos = 0, totalPreguntasRequeridas = 0;
    cfg.rows.forEach(r => {
      totalPreguntas += parseInt(r.disponibles || 0);
      totalPreguntasRequeridas += parseInt(r.preguntas_requeridas);
      totalMinutos += parseInt(r.tiempo_minutos);
    });
    res.json({
      materias: cfg.rows.map(r => ({
        materia_id: r.materia_id, nombre: r.materia_nombre,
        preguntas_requeridas: r.preguntas_requeridas, tiempo_minutos: r.tiempo_minutos,
        peso_ponderacion: parseFloat(r.peso_ponderacion), orden_presentacion: r.orden_presentacion,
        disponibles: parseInt(r.disponibles || 0), completa: parseInt(r.disponibles || 0) >= parseInt(r.preguntas_requeridas)
      })),
      totalPreguntasRequeridas, totalMinutos, totalPreguntas
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Crear simulacro nuevo (snapshot de preguntas por bloque)
app.post('/api/simulacros', requireAuth, apiLimiter, async (req, res) => {
  try {
    const usuarioId = req.session.user.id;
    const { modo, materia_id } = req.body || {};

    const cfg = await db.query(`
      SELECT c.* FROM simulacro_config_materias c
      WHERE c.activo = 1 ORDER BY c.orden_presentacion
    `);

    let configMaterias = cfg.rows;
    if (modo === 'por_materia' && materia_id) {
      configMaterias = configMaterias.filter(c => c.materia_id === parseInt(materia_id));
      if (configMaterias.length === 0) return res.status(404).json({ error: 'Materia no encontrada en la configuracion' });
    }

    const incompletos = [];
    const bloques = [];

    // Verificar disponibilidad antes de crear (modo estricto si permitir_incompleto = 0)
    for (const c of configMaterias) {
      const disp = await db.query('SELECT COUNT(*) as t FROM preguntas WHERE materia_id = $1', [c.materia_id]);
      const disponibles = parseInt(disp.rows[0].t);
      if (disponibles < c.preguntas_requeridas && c.permitir_incompleto === 0) {
        return res.status(422).json({
          error: c.materia_id + ' solo tiene ' + disponibles + '/' + c.preguntas_requeridas + ' preguntas cargadas. Completa el banco para habilitar el simulacro.'
        });
      }
      if (disponibles < c.preguntas_requeridas) {
        incompletos.push({ materia_id: c.materia_id, disponibles });
      }
    }

    const sim = await db.query('INSERT INTO simulacros (usuario_id) VALUES ($1) RETURNING id', [usuarioId]);
    const simulacroId = sim.rows[0].id;

    let orden = 0;
    for (const c of configMaterias) {
      const disp = await db.query(`SELECT COUNT(*)::int AS t FROM preguntas WHERE materia_id = $1`, [c.materia_id]);
      const disponibles = parseInt(disp.rows[0].t);
      const requeridas = Math.min(c.preguntas_requeridas, disponibles);
      const tiempoSegundos = c.tiempo_minutos * 60;
      const tiempoAjustado = disponibles < c.preguntas_requeridas
        ? Math.max(60, Math.round(tiempoSegundos * (disponibles / c.preguntas_requeridas)))
        : tiempoSegundos;

      const ids = await seleccionarPreguntasMateria(db, usuarioId, c.materia_id, requeridas, c.max_repetidas_pct);
      if (ids.length === 0 && disponibles > 0) {
        // Fallback simple si la seleccion anti-repeticion devolvio nada (banco muy pequeno)
        const rest = await db.query('SELECT id FROM preguntas WHERE materia_id = $1 ORDER BY RANDOM() LIMIT $2', [c.materia_id, requeridas]);
        ids.push(...rest.rows.map(x => x.id));
      }

      const bloque = await db.query(`
        INSERT INTO simulacro_bloques (simulacro_id, materia_id, orden, tiempo_limite_segundos, total_preguntas)
        VALUES ($1, $2, $3, $4, $5) RETURNING id
      `, [simulacroId, c.materia_id, orden, tiempoAjustado, ids.length]);
      const bloqueId = bloque.rows[0].id;

      for (let i = 0; i < ids.length; i++) {
        await db.query(`
          INSERT INTO simulacro_bloque_preguntas (bloque_id, pregunta_id, orden)
          VALUES ($1, $2, $3) ON CONFLICT DO NOTHING
        `, [bloqueId, ids[i], i + 1]);
      }

      bloques.push({
        id: bloqueId, orden, materia_id: c.materia_id, materia_nombre: c.materia_nombre ? c.materia_nombre : (await db.query('SELECT nombre FROM materias WHERE id=$1', [c.materia_id])).rows[0]?.nombre,
        total_preguntas: ids.length, requeridas: c.preguntas_requeridas,
        tiempo_limite_segundos: tiempoAjustado,
        incompleto: disponibles < c.preguntas_requeridas
      });
      orden++;
    }

    res.json({ simulacro_id: simulacroId, bloques, incompletos });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Estado actual del simulacro
app.get('/api/simulacros/:id', requireAuth, apiLimiter, async (req, res) => {
  try {
    const sim = await db.query(`SELECT * FROM simulacros WHERE id = $1 AND usuario_id = $2`, [req.params.id, req.session.user.id]);
    if (sim.rows.length === 0) return res.status(404).json({ error: 'Simulacro no encontrado' });
    const bloques = await db.query(`SELECT sb.*, m.nombre AS materia_nombre FROM simulacro_bloques sb JOIN materias m ON m.id = sb.materia_id WHERE sb.simulacro_id = $1 ORDER BY sb.orden`, [req.params.id]);
    res.json({ simulacro: sim.rows[0], bloques: bloques.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Bloque actual en curso de un simulacro (solo para pausar/reanudar)
async function obtenerBloqueActual(db, simulacroId, s) {
  const r = await db.query(`SELECT * FROM simulacro_bloques WHERE simulacro_id = $1 AND orden = $2`, [simulacroId, s.bloque_actual]);
  return r.rows[0] || null;
}

// Pausar el bloque actual: congela el cronometro (el tiempo usado hasta ahora se acumula)
// Se registra en PUT y POST porque sendBeacon (auto-pausa al salir) solo puede enviar POST
async function pausarSimulacroEstudiante(req, res) {
  try {
    const sim = await db.query(`SELECT * FROM simulacros WHERE id = $1 AND usuario_id = $2`, [req.params.id, req.session.user.id]);
    if (sim.rows.length === 0) return res.status(404).json({ error: 'Simulacro no encontrado' });
    const s = sim.rows[0];
    if (s.estado !== 'en_progreso') return res.status(400).json({ error: 'El simulacro ya fue finalizado' });

    const b = await obtenerBloqueActual(db, req.params.id, s);
    if (!b) return res.status(404).json({ error: 'Bloque actual no encontrado' });
    if (b.finalizado_en) return res.status(400).json({ error: 'El bloque ya fue cerrado' });
    if (!b.iniciado_en) return res.json({ message: 'El bloque aun no inicia', pausado: false, tiempo_restante_segundos: tiempoRestanteBloque(b), bloque: b });
    if (b.pausado_en) return res.json({ message: 'Simulacro ya pausado', pausado: true, tiempo_restante_segundos: tiempoRestanteBloque(b), bloque: b });

    await db.query(`UPDATE simulacro_bloques
      SET tiempo_usado_segundos = tiempo_usado_segundos + EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - iniciado_en))::int,
          pausado_en = CURRENT_TIMESTAMP
      WHERE id = $1 AND pausado_en IS NULL AND finalizado_en IS NULL AND iniciado_en IS NOT NULL`, [b.id]);

    const bPausado = (await db.query('SELECT * FROM simulacro_bloques WHERE id = $1', [b.id])).rows[0];
    res.json({ message: 'Simulacro pausado. El tiempo queda congelado.', pausado: true, tiempo_restante_segundos: tiempoRestanteBloque(bPausado), bloque: bPausado });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
app.put('/api/simulacros/:id/pausar', requireAuth, apiLimiter, pausarSimulacroEstudiante);
app.post('/api/simulacros/:id/pausar', requireAuth, apiLimiter, pausarSimulacroEstudiante);

// Reanudar el bloque pausado: relanza el cronometro con el tiempo restante acumulado
async function reanudarSimulacroEstudiante(req, res) {
  try {
    const sim = await db.query(`SELECT * FROM simulacros WHERE id = $1 AND usuario_id = $2`, [req.params.id, req.session.user.id]);
    if (sim.rows.length === 0) return res.status(404).json({ error: 'Simulacro no encontrado' });
    const s = sim.rows[0];
    if (s.estado !== 'en_progreso') return res.status(400).json({ error: 'El simulacro ya fue finalizado' });

    const b = await obtenerBloqueActual(db, req.params.id, s);
    if (!b) return res.status(404).json({ error: 'Bloque actual no encontrado' });
    if (b.finalizado_en) return res.status(400).json({ error: 'El bloque ya fue cerrado' });
    if (!b.pausado_en) return res.json({ message: 'Simulacro no estaba pausado', pausado: false, tiempo_restante_segundos: tiempoRestanteBloque(b), bloque: b });

    await db.query(`UPDATE simulacro_bloques SET pausado_en = NULL, iniciado_en = CURRENT_TIMESTAMP WHERE id = $1 AND pausado_en IS NOT NULL`, [b.id]);

    b.pausado_en = null;
    b.iniciado_en = new Date();
    res.json({ message: 'Simulacro reanudado. El cronometro sigue desde donde quedó.', pausado: false, tiempo_restante_segundos: tiempoRestanteBloque(b), iniciado_en: b.iniciado_en.toISOString(), bloque: b });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
app.put('/api/simulacros/:id/reanudar', requireAuth, apiLimiter, reanudarSimulacroEstudiante);
app.post('/api/simulacros/:id/reanudar', requireAuth, apiLimiter, reanudarSimulacroEstudiante);

// Iniciar bloque (backend arranca el cronometro)
app.post('/api/simulacros/:id/bloques/:bloqueId/iniciar', requireAuth, apiLimiter, async (req, res) => {
  try {
    const sim = await db.query(`SELECT * FROM simulacros WHERE id = $1 AND usuario_id = $2`, [req.params.id, req.session.user.id]);
    if (sim.rows.length === 0) return res.status(404).json({ error: 'Simulacro no encontrado' });
    const s = sim.rows[0];
    if (s.estado !== 'en_progreso') return res.status(400).json({ error: 'El simulacro ya fue finalizado' });

    const bloque = await db.query(`SELECT * FROM simulacro_bloques WHERE id = $1 AND simulacro_id = $2`, [req.params.bloqueId, req.params.id]);
    if (bloque.rows.length === 0) return res.status(404).json({ error: 'Bloque no encontrado' });
    const b = bloque.rows[0];

    if (b.orden !== s.bloque_actual) return res.status(400).json({ error: 'No es el bloque actual' });
    if (b.iniciado_en) return res.json({ message: 'Bloque ya iniciado', bloque: b });

    await db.query('UPDATE simulacro_bloques SET iniciado_en = CURRENT_TIMESTAMP WHERE id = $1', [b.id]);
    b.iniciado_en = new Date();
    res.json({ message: 'Bloque iniciado', bloque: b });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Preguntas del bloque (sin respuesta_correcta)
app.get('/api/simulacros/:id/bloques/:bloqueId/preguntas', requireAuth, apiLimiter, async (req, res) => {
  try {
    const sim = await db.query(`SELECT * FROM simulacros WHERE id = $1 AND usuario_id = $2`, [req.params.id, req.session.user.id]);
    if (sim.rows.length === 0) return res.status(404).json({ error: 'Simulacro no encontrado' });
    const bloque = await db.query(`SELECT * FROM simulacro_bloques WHERE id = $1 AND simulacro_id = $2`, [req.params.bloqueId, req.params.id]);
    if (bloque.rows.length === 0) return res.status(404).json({ error: 'Bloque no encontrado' });
    const b = bloque.rows[0];
    if (b.orden !== sim.rows[0].bloque_actual) return res.status(403).json({ error: 'Este bloque no es el actual' });

    const r = await db.query(`
      SELECT p.id, p.texto, p.imagen, p.opcion_a, p.opcion_b, p.opcion_c, p.opcion_d,
             p.imagen_opcion_a, p.imagen_opcion_b, p.imagen_opcion_c, p.imagen_opcion_d,
             t.texto as texto_lectura_contenido, t.imagen as texto_lectura_imagen,
             sbp.orden as orden_pregunta, sbp.respuesta_seleccionada
      FROM simulacro_bloque_preguntas sbp
      JOIN preguntas p ON p.id = sbp.pregunta_id
      LEFT JOIN textos_lectura t ON p.texto_lectura_id = t.id
      WHERE sbp.bloque_id = $1 ORDER BY sbp.orden
    `, [req.params.bloqueId]);
    res.json({ preguntas: r.rows, tiempo_limite_segundos: b.tiempo_limite_segundos, iniciado_en: b.iniciado_en, pausado: !!b.pausado_en, tiempo_restante_segundos: tiempoRestanteBloque(b) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Responder (valida tiempo del bloque a nivel servidor)
app.post('/api/simulacros/:id/bloques/:bloqueId/responder', requireAuth, apiLimiter, async (req, res) => {
  try {
    const { pregunta_id, respuesta_seleccionada } = req.body;
    if (!pregunta_id || !respuesta_seleccionada) return res.status(400).json({ error: 'Pregunta y respuesta requeridas' });

    const sim = await db.query(`SELECT * FROM simulacros WHERE id = $1 AND usuario_id = $2`, [req.params.id, req.session.user.id]);
    if (sim.rows.length === 0) return res.status(404).json({ error: 'Simulacro no encontrado' });
    const bloque = await db.query(`SELECT * FROM simulacro_bloques WHERE id = $1 AND simulacro_id = $2`, [req.params.bloqueId, req.params.id]);
    if (bloque.rows.length === 0) return res.status(404).json({ error: 'Bloque no encontrado' });
    const b = bloque.rows[0];
    if (b.orden !== sim.rows[0].bloque_actual) return res.status(403).json({ error: 'No es el bloque actual' });
    if (!b.iniciado_en) return res.status(400).json({ error: 'El bloque no ha iniciado' });
    if (b.finalizado_en) return res.status(400).json({ error: 'El bloque ya fue cerrado' });
    if (b.pausado_en) return res.status(400).json({ error: 'El simulacro está pausado. Reanúdalo para seguir respondiendo.' });

    // Tiempo: servidor-autoritativo (excluye periodos de pausa)
    if (tiempoRestanteBloque(b) <= 0) {
      return res.status(400).json({ error: 'Tiempo del bloque agotado. Debes finalizar el bloque.' });
    }

    const pregunta = await db.query('SELECT respuesta_correcta FROM preguntas WHERE id = $1', [pregunta_id]);
    if (pregunta.rows.length === 0) return res.status(404).json({ error: 'Pregunta no encontrada' });
    const correcta = pregunta.rows[0].respuesta_correcta;
    const esCorrecta = correcta.toUpperCase() === respuesta_seleccionada.toUpperCase() ? 1 : 0;

    await db.query(`
      INSERT INTO simulacro_bloque_preguntas (bloque_id, pregunta_id, orden, respuesta_seleccionada, es_correcta, respondida_en)
      VALUES ($1, $2, (SELECT orden FROM simulacro_bloque_preguntas WHERE bloque_id = $1 AND pregunta_id = $2), $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (bloque_id, pregunta_id)
      DO UPDATE SET respuesta_seleccionada = $3, es_correcta = $4, respondida_en = CURRENT_TIMESTAMP
    `, [req.params.bloqueId, pregunta_id, respuesta_seleccionada.toUpperCase(), esCorrecta]);

    res.json({ es_correcta: esCorrecta });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Finalizar bloque: calcula puntaje_area (0-100) y devuelve el bloque actualizado
async function finalizarBloque(db, bloque) {
  if (bloque.finalizado_en) return bloque;
  let correctas = 0, puntajeArea = 0;
  if (bloque.iniciado_en) {
    const resp = await db.query(`
      SELECT COUNT(*)::int AS total_correctas FROM simulacro_bloque_preguntas
      WHERE bloque_id = $1 AND es_correcta = 1`, [bloque.id]);
    correctas = parseInt(resp.rows[0].total_correctas) || 0;
    puntajeArea = bloque.total_preguntas > 0 ? Math.round((correctas / bloque.total_preguntas) * 100) : 0;
  }
  await db.query('UPDATE simulacro_bloques SET correctas=$1, puntaje_area=$2, finalizado_en=CURRENT_TIMESTAMP WHERE id=$3',
    [correctas, puntajeArea, bloque.id]);
  bloque.correctas = correctas;
  bloque.puntaje_area = puntajeArea;
  bloque.finalizado_en = new Date();
  return bloque;
}

// Finalizar simulacro completo: promedio ponderado oficial (3-3-3-3-1) x 5 => escala 0-500
async function finalizarSimulacro(db, simulacroId) {
  const bloques = await db.query(`
    SELECT sb.*, c.peso_ponderacion
    FROM simulacro_bloques sb
    LEFT JOIN simulacro_config_materias c ON c.materia_id = sb.materia_id
    WHERE sb.simulacro_id = $1`, [simulacroId]);
  let suma = 0, sumaPesos = 0;
  for (const b of bloques.rows) {
    const peso = parseFloat(b.peso_ponderacion) || 1;
    suma += (b.puntaje_area || 0) * peso;
    sumaPesos += peso;
  }
  const global = sumaPesos > 0 ? Math.round((suma / sumaPesos) * 5) : 0;
  const fin = new Date();
  await db.query('UPDATE simulacros SET estado=$1, puntaje_global=$2, bloque_actual=$3, finalizado_en=$4 WHERE id=$5',
    ['finalizado', global, bloques.rows.length, fin, simulacroId]);
  return { puntaje_global: global, total_bloques: bloques.rows.length, finalizado_en: fin };
}

app.put('/api/simulacros/:id/bloques/:bloqueId/finalizar', requireAuth, apiLimiter, async (req, res) => {
  try {
    const sim = await db.query(`SELECT * FROM simulacros WHERE id = $1 AND usuario_id = $2`, [req.params.id, req.session.user.id]);
    if (sim.rows.length === 0) return res.status(404).json({ error: 'Simulacro no encontrado' });
    const s = sim.rows[0];
    if (s.estado !== 'en_progreso') return res.status(400).json({ error: 'El simulacro ya fue finalizado' });

    const bloque = await db.query(`SELECT * FROM simulacro_bloques WHERE id = $1 AND simulacro_id = $2`, [req.params.bloqueId, req.params.id]);
    if (bloque.rows.length === 0) return res.status(404).json({ error: 'Bloque no encontrado' });
    const b = bloque.rows[0];
    if (b.orden !== s.bloque_actual) return res.status(400).json({ error: 'No es el bloque actual' });
    if (b.pausado_en) return res.status(400).json({ error: 'El simulacro está pausado. Reanúdalo para finalizar el bloque.' });

    const bFinalizado = await finalizarBloque(db, b);

    const total = await db.query('SELECT COUNT(*)::int AS total FROM simulacro_bloques WHERE simulacro_id = $1', [req.params.id]);
    const esUltimo = bFinalizado.orden === parseInt(total.rows[0].total) - 1;

    let resultados = null;
    if (esUltimo) {
      resultados = await finalizarSimulacro(db, req.params.id);
    } else {
      await db.query('UPDATE simulacros SET bloque_actual = $1 WHERE id = $2', [bFinalizado.orden + 1, req.params.id]);
    }

    res.json({
      message: esUltimo ? 'Simulacro finalizado' : 'Bloque finalizado',
      bloque: { id: bFinalizado.id, puntaje_area: bFinalizado.puntaje_area, correctas: bFinalizado.correctas },
      total_preguntas: bFinalizado.total_preguntas,
      simulacro_finalizado: esUltimo,
      resultados
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Finalizar simulacro completo de golpe (fallback: cierra todos los bloques e inmediatamente puntaje global)
app.put('/api/simulacros/:id/finalizar', requireAuth, apiLimiter, async (req, res) => {
  try {
    const sim = await db.query(`SELECT * FROM simulacros WHERE id = $1 AND usuario_id = $2`, [req.params.id, req.session.user.id]);
    if (sim.rows.length === 0) return res.status(404).json({ error: 'Simulacro no encontrado' });
    const s = sim.rows[0];
    if (s.estado !== 'en_progreso') return res.status(400).json({ error: 'El simulacro ya fue finalizado' });

    const bloques = await db.query(`SELECT * FROM simulacro_bloques WHERE simulacro_id = $1 AND finalizado_en IS NULL`, [req.params.id]);
    for (const b of bloques.rows) {
      if (b.orden === s.bloque_actual) await finalizarBloque(db, b);
    }

    const resultados = await finalizarSimulacro(db, req.params.id);
    res.json({ message: 'Simulacro finalizado', resultados });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Resultados detallados del simulacro (con revision de respuestas y nivel de desempeno)
app.get('/api/simulacros/:id/resultados', requireAuth, apiLimiter, async (req, res) => {
  try {
    const sim = await db.query(`SELECT * FROM simulacros WHERE id = $1 AND usuario_id = $2`, [req.params.id, req.session.user.id]);
    if (sim.rows.length === 0) return res.status(404).json({ error: 'Simulacro no encontrado' });
    const s = sim.rows[0];
    if (s.estado !== 'finalizado') return res.status(400).json({ error: 'El simulacro no ha finalizado' });

    const bloques = await db.query(`
      SELECT sb.*, m.nombre AS materia_nombre
      FROM simulacro_bloques sb
      JOIN materias m ON m.id = sb.materia_id
      WHERE sb.simulacro_id = $1 ORDER BY sb.orden`, [req.params.id]);

    const detalle = [];
    for (const b of bloques.rows) {
      const preguntas = await db.query(`
        SELECT sbp.orden AS orden_pregunta, p.id, p.texto, p.imagen,
               p.opcion_a, p.opcion_b, p.opcion_c, p.opcion_d,
               p.imagen_opcion_a, p.imagen_opcion_b, p.imagen_opcion_c, p.imagen_opcion_d,
               t.texto as texto_lectura_contenido, t.imagen as texto_lectura_imagen,
               p.respuesta_correcta, sbp.respuesta_seleccionada, sbp.es_correcta
        FROM simulacro_bloque_preguntas sbp
        JOIN preguntas p ON p.id = sbp.pregunta_id
        LEFT JOIN textos_lectura t ON p.texto_lectura_id = t.id
        WHERE sbp.bloque_id = $1 ORDER BY sbp.orden`, [b.id]);

      detalle.push({
        bloque_id: b.id,
        materia_id: b.materia_id,
        materia_nombre: b.materia_nombre,
        total_preguntas: b.total_preguntas,
        correctas: b.correctas,
        puntaje_area: b.puntaje_area,
        puntaje_area_nivel: calcularNivelDesempeno(b.puntaje_area || 0),
        tiempo_limite_segundos: b.tiempo_limite_segundos,
        preguntas: preguntas.rows
      });
    }

    const notaGlobal = s.puntaje_global || 0;
    res.json({
      puntaje_global: notaGlobal,
      puntaje_global_nivel: calcularNivelDesempeno(Math.round(notaGlobal / 5)),
      finalizado_en: s.finalizado_en,
      total_bloques: bloques.rows.length,
      detalle,
      nota: 'Puntaje global en escala oficial ICFES 0-500 (PONDERADO 3-3-3-3-1). Puntajes por area en escala 0-100 simulada.'
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Mis simulacros (historial del estudiante)
app.get('/api/mis-simulacros', requireAuth, apiLimiter, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT si.*,
        (SELECT COUNT(*) FROM simulacro_bloques sb WHERE sb.simulacro_id = si.id) AS total_bloques,
        (SELECT sb2.pausado_en FROM simulacro_bloques sb2 WHERE sb2.simulacro_id = si.id AND sb2.orden = si.bloque_actual) AS bloque_pausado_en,
        (SELECT sb3.iniciado_en FROM simulacro_bloques sb3 WHERE sb3.simulacro_id = si.id AND sb3.orden = si.bloque_actual) AS bloque_iniciado_en,
        (SELECT sb4.tiempo_usado_segundos FROM simulacro_bloques sb4 WHERE sb4.simulacro_id = si.id AND sb4.orden = si.bloque_actual) AS bloque_tiempo_usado,
        (SELECT sb5.tiempo_limite_segundos FROM simulacro_bloques sb5 WHERE sb5.simulacro_id = si.id AND sb5.orden = si.bloque_actual) AS bloque_tiempo_limite
      FROM simulacros si
      WHERE si.usuario_id = $1
      ORDER BY si.iniciado_en DESC LIMIT 20`, [req.session.user.id]);
    const simulacros = r.rows.map(s => ({
      ...s,
      pausado: s.estado === 'en_progreso' ? !!s.bloque_pausado_en : false,
      tiempo_restante_segundos: s.estado === 'en_progreso' && s.bloque_tiempo_limite != null
        ? tiempoRestanteBloque({ tiempo_limite_segundos: s.bloque_tiempo_limite, tiempo_usado_segundos: s.bloque_tiempo_usado, iniciado_en: s.bloque_iniciado_en, pausado_en: s.bloque_pausado_en })
        : null,
      puntaje_global_nivel: s.puntaje_global != null ? calcularNivelDesempeno(Math.round(s.puntaje_global / 5)) : null
    }));
    res.json({ simulacros });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin: ver configuracion del simulacro
app.get('/api/admin/simulacros/config', requireAdmin, apiLimiter, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT c.*, m.nombre AS materia_nombre,
        (SELECT COUNT(*) FROM preguntas p WHERE p.materia_id = c.materia_id) AS disponibles
      FROM simulacro_config_materias c
      JOIN materias m ON m.id = c.materia_id
      ORDER BY c.orden_presentacion`);
    res.json({ materias: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin config: actualizar parametros del simulacro por materia
app.put('/api/admin/simulacros/config/:materiaId', requireAdmin, apiLimiter, async (req, res) => {
  try {
    const { preguntas_requeridas, tiempo_minutos, peso_ponderacion, orden_presentacion, activo, max_repetidas_pct, permitir_incompleto } = req.body;
    const r = await db.query(`
      UPDATE simulacro_config_materias
      SET preguntas_requeridas=$1, tiempo_minutos=$2, peso_ponderacion=$3, orden_presentacion=$4,
          activo=$5, max_repetidas_pct=$6, permitir_incompleto=$7
      WHERE materia_id=$8`,
      [preguntas_requeridas, tiempo_minutos, peso_ponderacion, orden_presentacion, activo, max_repetidas_pct, permitir_incompleto, req.params.materiaId]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Configuracion no encontrada' });
    res.json({ message: 'Configuracion actualizada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin: simulacros en curso de todos los estudiantes (para pausar/reanudar remotamente)
app.get('/api/admin/simulacros/activos', requireAdmin, apiLimiter, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT s.id, s.usuario_id, s.bloque_actual, s.iniciado_en, u.nombre_completo, u.usuario,
        sb.materia_id, m.nombre AS materia_nombre, sb.orden AS bloque_orden,
        sb.pausado_en, sb.iniciado_en AS bloque_iniciado_en,
        sb.tiempo_limite_segundos, sb.tiempo_usado_segundos,
        (SELECT COUNT(*) FROM simulacro_bloques b2 WHERE b2.simulacro_id = s.id) AS total_bloques
      FROM simulacros s
      JOIN usuarios u ON u.id = s.usuario_id
      JOIN simulacro_bloques sb ON sb.simulacro_id = s.id AND sb.orden = s.bloque_actual
      JOIN materias m ON m.id = sb.materia_id
      WHERE s.estado = 'en_progreso'
      ORDER BY s.iniciado_en DESC`);
    const activos = r.rows.map(b => ({
      simulacro_id: b.id,
      estudiante: b.nombre_completo,
      usuario: b.usuario,
      usuario_id: b.usuario_id,
      materia_nombre: b.materia_nombre,
      bloque_orden: b.bloque_orden,
      total_bloques: b.total_bloques,
      pausado: !!b.pausado_en,
      tiempo_restante_segundos: tiempoRestanteBloque({
        tiempo_limite_segundos: b.tiempo_limite_segundos,
        tiempo_usado_segundos: b.tiempo_usado_segundos,
        iniciado_en: b.bloque_iniciado_en,
        pausado_en: b.pausado_en
      })
    }));
    res.json({ activos });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin: pausar el simulacro de cualquier estudiante (congela su cronometro)
async function pausarSimulacroAdmin(req, res) {
  try {
    const sim = await db.query(`SELECT * FROM simulacros WHERE id = $1`, [req.params.id]);
    if (sim.rows.length === 0) return res.status(404).json({ error: 'Simulacro no encontrado' });
    const s = sim.rows[0];
    if (s.estado !== 'en_progreso') return res.status(400).json({ error: 'El simulacro ya fue finalizado' });

    const b = await obtenerBloqueActual(db, req.params.id, s);
    if (!b) return res.status(404).json({ error: 'Bloque actual no encontrado' });
    if (b.finalizado_en) return res.status(400).json({ error: 'El bloque ya fue cerrado' });
    if (!b.iniciado_en) return res.json({ message: 'El bloque aun no inicia', pausado: false, tiempo_restante_segundos: tiempoRestanteBloque(b), bloque: b });
    if (b.pausado_en) return res.json({ message: 'Simulacro ya pausado', pausado: true, tiempo_restante_segundos: tiempoRestanteBloque(b), bloque: b });

    await db.query(`UPDATE simulacro_bloques
      SET tiempo_usado_segundos = tiempo_usado_segundos + EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - iniciado_en))::int,
          pausado_en = CURRENT_TIMESTAMP
      WHERE id = $1 AND pausado_en IS NULL AND finalizado_en IS NULL AND iniciado_en IS NOT NULL`, [b.id]);

    const bPausado = (await db.query('SELECT * FROM simulacro_bloques WHERE id = $1', [b.id])).rows[0];
    res.json({ message: 'Simulacro pausado por el administrador', pausado: true, tiempo_restante_segundos: tiempoRestanteBloque(bPausado), bloque: bPausado });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
app.put('/api/admin/simulacros/:id/pausar', requireAdmin, apiLimiter, pausarSimulacroAdmin);
app.post('/api/admin/simulacros/:id/pausar', requireAdmin, apiLimiter, pausarSimulacroAdmin);

// Admin: reanudar el simulacro de cualquier estudiante
async function reanudarSimulacroAdmin(req, res) {
  try {
    const sim = await db.query(`SELECT * FROM simulacros WHERE id = $1`, [req.params.id]);
    if (sim.rows.length === 0) return res.status(404).json({ error: 'Simulacro no encontrado' });
    const s = sim.rows[0];
    if (s.estado !== 'en_progreso') return res.status(400).json({ error: 'El simulacro ya fue finalizado' });

    const b = await obtenerBloqueActual(db, req.params.id, s);
    if (!b) return res.status(404).json({ error: 'Bloque actual no encontrado' });
    if (!b.pausado_en) return res.json({ message: 'El simulacro no estaba pausado', pausado: false, tiempo_restante_segundos: tiempoRestanteBloque(b), bloque: b });

    await db.query(`UPDATE simulacro_bloques SET pausado_en = NULL, iniciado_en = CURRENT_TIMESTAMP WHERE id = $1 AND pausado_en IS NOT NULL`, [b.id]);

    b.pausado_en = null;
    b.iniciado_en = new Date();
    res.json({ message: 'Simulacro reanudado por el administrador', pausado: false, tiempo_restante_segundos: tiempoRestanteBloque(b), bloque: b });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
app.put('/api/admin/simulacros/:id/reanudar', requireAdmin, apiLimiter, reanudarSimulacroAdmin);
app.post('/api/admin/simulacros/:id/reanudar', requireAdmin, apiLimiter, reanudarSimulacroAdmin);

// ============ ADMIN BADGES ============
app.get('/api/admin/badges', requireAdmin, apiLimiter, async (req, res) => {
  try {
    const r = await db.query(`SELECT b.*,
      (SELECT COUNT(*) FROM student_badges sb WHERE sb.badge_id = b.id) as total_otorgadas
      FROM badges b ORDER BY b.categoria, b.orden_display`);
    res.json({ badges: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/admin/badges', requireAdmin, apiLimiter, async (req, res) => {
  try {
    const { clave, nombre, descripcion, categoria, rareza, puntos, orden_display } = req.body;
    if (!clave || !nombre || !descripcion) return res.status(400).json({ error: 'Clave, nombre y descripcion requeridos' });
    const r = await db.query('INSERT INTO badges (clave, nombre, descripcion, categoria, rareza, puntos, orden_display) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [clave.toUpperCase().replace(/\s+/g,'_'), nombre, descripcion, categoria || 'general', rareza || 'comun', puntos || 10, orden_display || 0]);
    res.json({ id: r.rows[0].id, message: 'Insignia creada' });
  } catch (e) {
    if (e.message.includes('unique')) return res.status(400).json({ error: 'Ya existe una insignia con esa clave' });
    res.status(500).json({ error: e.message });
  }
});
app.put('/api/admin/badges/:id', requireAdmin, apiLimiter, async (req, res) => {
  try {
    const { nombre, descripcion, categoria, rareza, puntos, orden_display, activo } = req.body;
    const r = await db.query('UPDATE badges SET nombre=$1, descripcion=$2, categoria=$3, rareza=$4, puntos=$5, orden_display=$6, activo=$7 WHERE id=$8',
      [nombre, descripcion, categoria, rareza, puntos, orden_display, activo, req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrada' });
    res.json({ message: 'Insignia actualizada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/admin/badges/:id', requireAdmin, apiLimiter, async (req, res) => {
  try {
    await db.query('DELETE FROM student_badges WHERE badge_id = $1', [req.params.id]);
    const r = await db.query('DELETE FROM badges WHERE id = $1', [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrada' });
    res.json({ message: 'Insignia eliminada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/admin/badges/:id/toggle', requireAdmin, apiLimiter, async (req, res) => {
  try {
    const r = await db.query('UPDATE badges SET activo = CASE WHEN activo=1 THEN 0 ELSE 1 END WHERE id=$1 RETURNING activo', [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrada' });
    res.json({ activo: r.rows[0].activo, message: r.rows[0].activo ? 'Activada' : 'Desactivada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/admin/badges/otorgar', requireAdmin, apiLimiter, async (req, res) => {
  try {
    const { usuario_id, badge_id } = req.body;
    if (!usuario_id || !badge_id) return res.status(400).json({ error: 'Estudiante y insignia requeridos' });
    const u = await db.query('SELECT id FROM usuarios WHERE id=$1 AND rol=$2', [usuario_id, 'estudiante']);
    if (u.rows.length === 0) return res.status(404).json({ error: 'Estudiante no encontrado' });
    const b = await db.query('SELECT id, nombre FROM badges WHERE id=$1', [badge_id]);
    if (b.rows.length === 0) return res.status(404).json({ error: 'Insignia no encontrada' });
    await db.query('INSERT INTO student_badges (usuario_id, badge_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [usuario_id, badge_id]);
    await db.query('INSERT INTO notificaciones (usuario_id, badge_id, titulo, mensaje) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [usuario_id, badge_id, 'Nueva insignia ganada', '¡Tu instructor te otorgó la insignia "' + b.rows[0].nombre + '"!']);
    res.json({ message: 'Insignia "' + b.rows[0].nombre + '" otorgada al estudiante' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/admin/student-badges/:id', requireAdmin, apiLimiter, async (req, res) => {
  try {
    const r = await db.query('DELETE FROM student_badges WHERE id = $1', [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrada' });
    res.json({ message: 'Otorgacion eliminada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/admin/student-badges', requireAdmin, apiLimiter, async (req, res) => {
  try {
    const { usuario_id } = req.query;
    let sql = `SELECT sb.*, b.nombre as badge_nombre, b.clave, b.categoria, b.rareza, b.puntos,
      u.usuario, u.nombre_completo
      FROM student_badges sb
      JOIN badges b ON sb.badge_id = b.id
      JOIN usuarios u ON sb.usuario_id = u.id`;
    const params = [];
    if (usuario_id) { sql += ' WHERE sb.usuario_id = $1'; params.push(usuario_id); }
    sql += ' ORDER BY sb.otorgado_en DESC';
    const r = await db.query(sql, params);
    res.json({ otorgaciones: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ URL PUBLICA ============
app.get('/api/url-publica', requireAdmin, apiLimiter, (req, res) => {
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
