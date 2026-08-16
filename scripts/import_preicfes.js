/*
 * Importa el JSON de scripts/extraer_pdf.py al modulo PreICFES Varios con dedupe.
 *
 * Uso:
 *   node scripts/import_preicfes.js --extraido=salida.json [opciones]
 *
 * Opciones:
 *   --aplicar            aplica los cambios (sin esto = solo INFORME dry-run)
 *   --cuestionario=N     adjunta a un cuestionario existente del modulo
 *   --titulo=...         titulo si se crea el cuestionario (default: nombre del PDF)
 *   --agrupacion=...     entrenamiento | grupo_fenix | predicciones | milton_ochoa |
 *                        ascensus | pack_estudios | varios  (si se crea, es requerida)
 *   --materia=N          materia_id por defecto para preguntas sin materia
 *   --clave="1:B,2:C"    claves manuales para preguntas sin clave detectada
 *
 * Dedupe: el texto de cada pregunta se normaliza (minúsculas, sin tildes,
 * espacios colapsados) y se compara contra toda la BD. Si ya existe SOLO se
 * vincula al cuestionario (cuestionario_preguntas). Si no existe se inserta
 * con el texto 100% identico al original del PDF (regla AGENTS.md).
 * Las preguntas sin clave NO se insertan: quedan en el informe para que el
 * usuario las dicte.
 */
const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const AGRUPACIONES = ['entrenamiento', 'grupo_fenix', 'predicciones', 'milton_ochoa', 'ascensus', 'pack_estudios', 'varios'];

function normTexto(t) {
  return (t || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq === -1) args[a.slice(2)] = true;
      else args[a.slice(2, eq)] = a.slice(eq + 1);
    }
  }
  return args;
}

async function main() {
  const a = parseArgs();
  if (!a.extraido) {
    console.error('Uso: node scripts/import_preicfes.js --extraido=salida.json [--aplicar] [--cuestionario=N] [--titulo=...] [--agrupacion=...] [--materia=N] [--clave="1:B,2:C"]');
    process.exit(1);
  }
  const extraido = JSON.parse(fs.readFileSync(a.extraido, 'utf-8'));

  if (!extraido.tiene_texto) {
    console.error('ABORTADO: el PDF es escaneado (sin capa de texto). Aplicarle OCR primero.');
    process.exit(1);
  }
  if (!Array.isArray(extraido.preguntas) || extraido.preguntas.length === 0) {
    console.error('ABORTADO: no se detectaron preguntas en el PDF. Revisar formato.');
    process.exit(1);
  }

  const claveManual = {};
  if (a.clave) {
    a.clave.split(',').forEach(function(p) {
      const m = p.trim().match(/^(\d+)\s*[:\.\-]?\s*([A-D])$/i);
      if (m) claveManual[parseInt(m[1])] = m[2].toUpperCase();
    });
  }

  const [{ rows: otas }] = await db.query('SELECT id, texto FROM preguntas');
  const mapa = new Map();
  otas.forEach(function(p) { mapa.set(normTexto(p.texto), p.id); });

  const reporte = { nuevas: 0, vinculadas: 0, sin_clave: 0, errores: [] };
  const pendientes = [];
  let idx = 0;

  extraido.preguntas.forEach(function(p) {
    idx++;
    const texto = (p.texto || '').trim();
    if (!texto) { reporte.errores.push({ n: p.n, causa: 'texto vacio' }); return; }
    if (!p.opciones || Object.keys(p.opciones).length < 4) {
      reporte.errores.push({ n: p.n, causa: 'opciones incompletas (' + (p.opciones ? Object.keys(p.opciones).length : 0) + ')' });
      return;
    }
    let rta = (p.respuesta || '').toUpperCase();
    if (p.n && claveManual[p.n]) rta = claveManual[p.n];
    if (!rta || !'ABCD'.includes(rta)) {
      reporte.sin_clave++;
      pendientes.push(idx);
      return;
    }
    const norm = normTexto(texto);
    if (mapa.has(norm)) {
      reporte.vinculadas++;
      if (a.aplicar) {
        mapaDatos.push({ tipo: 'vincular', pregunta_id: mapa.get(norm), orden: idx, texto: texto });
      }
    } else {
      reporte.nuevas++;
      if (a.aplicar) {
        mapaDatos.push({ tipo: 'insertar', norm: norm, n: p.n, texto: texto, opciones: p.opciones, rta: rta, materia_id: a.materia || null, texto_lectura: p.texto_lectura || null, orden: idx });
      }
    }
  });

  if (!a.aplicar) {
    console.log(JSON.stringify({
      archivo: extraido.archivo,
      agrupacion: a.agrupacion || null,
      cuestionario: a.cuestionario ? parseInt(a.cuestionario) : null,
      preguntas_detectadas: extraido.preguntas.length,
      nuevas: reporte.nuevas,
      vinculadas: reporte.vinculadas,
      sin_clave: reporte.sin_clave,
      errores: reporte.errores,
      sin_clave_idx: pendientes,
      modo: 'DRY-RUN (sin cambios)'
    }, null, 1));
    await db.end();
    return;
  }

  let cuestionarioId = a.cuestionario ? parseInt(a.cuestionario) : null;
  if (!cuestionarioId) {
    if (!a.agrupacion || !AGRUPACIONES.includes(a.agrupacion)) {
      console.error('ABORTADO: --agrupacion requerida para crear el cuestionario (' + AGRUPACIONES.join(' | ') + ')');
      await db.end();
      process.exit(1);
    }
    const titulo = a.titulo || extraido.archivo.split(/[\\/]/).pop().replace(/\.pdf$/i, '');
    const r = await db.query(
      'INSERT INTO cuestionarios (titulo, descripcion, tiempo_limite, materia_id, agrupacion, activo, creado_por) VALUES ($1,$2,90,NULL,$3,0,NULL) RETURNING id',
      [titulo, 'Cuestionario mixto PreICFES Varios (agrupacion: ' + a.agrupacion + '). Pendiente de verificacion del admin.', a.agrupacion]);
    cuestionarioId = r.rows[0].id;
  }

  const enCuestionario = new Set();
  const rCuest = await db.query('SELECT pregunta_id FROM cuestionario_preguntas WHERE cuestionario_id = $1', [cuestionarioId]);
  rCuest.rows.forEach(function(x) { enCuestionario.add(x.pregunta_id); });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    let insertadas = 0, vinculadas = 0;
    for (const item of mapaDatos) {
      if (item.tipo === 'vincular') {
        if (!enCuestionario.has(item.pregunta_id)) {
          await client.query('INSERT INTO cuestionario_preguntas (cuestionario_id, pregunta_id, orden) VALUES ($1,$2,$3)', [cuestionarioId, item.pregunta_id, item.orden]);
          enCuestionario.add(item.pregunta_id);
        }
        vinculadas++;
      } else {
        if (!item.norm || !mapa.has(item.norm)) {
          const ir = await client.query(
            'INSERT INTO preguntas (texto, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, texto_lectura, creado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL) RETURNING id',
            [item.texto, item.opciones.A, item.opciones.B, item.opciones.C, item.opciones.D, item.rta, item.materia_id, item.texto_lectura]);
          await client.query('INSERT INTO cuestionario_preguntas (cuestionario_id, pregunta_id, orden) VALUES ($1,$2,$3)', [cuestionarioId, ir.rows[0].id, item.orden]);
          mapa.set(item.norm, ir.rows[0].id);
          insertadas++;
        }
      }
    }
    await client.query('COMMIT');
    const log = { fecha: new Date().toISOString(), archivo: extraido.archivo, cuestionario_id: cuestionarioId, agrupacion: a.agrupacion || null, nuevas_insertadas: insertadas, vinculadas: vinculadas, sin_clave: reporte.sin_clave, errores: reporte.errores.length };
    fs.appendFileSync(require('path').join(__dirname, 'import_log.json'), JSON.stringify(log) + '\n');
    console.log(JSON.stringify(log, null, 1));
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ERROR aplicando import:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
  }
  await db.end();
}

let mapaDatos = [];
main().catch(function(e) { console.error(e); process.exit(1); });