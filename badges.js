module.exports = function(db) {

  async function evaluarInsignias(usuarioId, intentoId) {
    try {
      const intentoRes = await db.query(`
        SELECT i.*, c.materia_id, c.tiempo_limite, c.titulo as cuestionario_titulo
        FROM intentos i JOIN cuestionarios c ON i.cuestionario_id = c.id
        WHERE i.id = $1
      `, [intentoId]);
      if (intentoRes.rows.length === 0) return [];
      const intento = intentoRes.rows[0];

      const earnedRes = await db.query(
        'SELECT badge_id FROM student_badges WHERE usuario_id = $1', [usuarioId]
      );
      const earnedIds = new Set(earnedRes.rows.map(r => r.badge_id));

      const badgesRes = await db.query('SELECT * FROM badges WHERE activo = 1');
      const newlyEarned = [];

      for (const badge of badgesRes.rows) {
        if (earnedIds.has(badge.id)) continue;
        const shouldAward = await checkRule(badge.clave, usuarioId, intento, intentoId);
        if (shouldAward) {
          await db.query(
            'INSERT INTO student_badges (usuario_id, badge_id, intento_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [usuarioId, badge.id, intentoId]
          );
          newlyEarned.push({ clave: badge.clave, nombre: badge.nombre, descripcion: badge.descripcion });
        }
      }
      return newlyEarned;
    } catch (e) {
      console.error('Error evaluating badges:', e.message);
      return [];
    }
  }

  async function checkRule(clave, usuarioId, intento, intentoId) {
    switch (clave) {

      case 'FIRST_QUIZ_COMPLETED':
        return true;

      case 'TOTAL_QUIZZES_10': {
        const r = await db.query('SELECT COUNT(*) as t FROM intentos WHERE usuario_id=$1 AND completado=1', [usuarioId]);
        return parseInt(r.rows[0].t) >= 10;
      }

      case 'TOTAL_QUIZZES_30': {
        const r = await db.query('SELECT COUNT(*) as t FROM intentos WHERE usuario_id=$1 AND completado=1', [usuarioId]);
        return parseInt(r.rows[0].t) >= 30;
      }

      case 'TOTAL_QUIZZES_100': {
        const r = await db.query('SELECT COUNT(*) as t FROM intentos WHERE usuario_id=$1 AND completado=1', [usuarioId]);
        return parseInt(r.rows[0].t) >= 100;
      }

      case 'FIVE_QUIZZES_SAME_DAY': {
        const r = await db.query(`
          SELECT DATE(inicio_en) as dia, COUNT(*) as t FROM intentos
          WHERE usuario_id=$1 AND completado=1 GROUP BY DATE(inicio_en) HAVING COUNT(*) >= 5
        `, [usuarioId]);
        return r.rows.length > 0;
      }

      case 'STREAK_7_DAYS': {
        const streak = await calcularRacha(usuarioId);
        return streak >= 7;
      }

      case 'STREAK_15_DAYS': {
        const streak = await calcularRacha(usuarioId);
        return streak >= 15;
      }

      case 'STREAK_20_DAYS': {
        const streak = await calcularRacha(usuarioId);
        return streak >= 20;
      }

      case 'PERFECT_SCORE_SINGLE_ATTEMPT': {
        if (intento.puntuacion !== intento.total_preguntas) return false;
        const r = await db.query(
          'SELECT COUNT(*) as t FROM intentos WHERE usuario_id=$1 AND cuestionario_id=$2 AND completado=1',
          [usuarioId, intento.cuestionario_id]
        );
        return parseInt(r.rows[0].t) === 1;
      }

      case 'CATEGORY_MASTERY_100PCT': {
        return intento.puntuacion === intento.total_preguntas && intento.total_preguntas > 0;
      }

      case 'FIVE_CATEGORIES_MASTERED': {
        const r = await db.query(`
          SELECT COUNT(DISTINCT c.materia_id) as t FROM intentos i
          JOIN cuestionarios c ON i.cuestionario_id = c.id
          WHERE i.usuario_id=$1 AND i.completado=1 AND i.puntuacion = i.total_preguntas AND i.total_preguntas > 0
        `, [usuarioId]);
        return parseInt(r.rows[0].t) >= 5;
      }

      case 'FIVE_PERFECT_SCORES': {
        const r = await db.query(`
          SELECT COUNT(*) as t FROM intentos
          WHERE usuario_id=$1 AND completado=1 AND puntuacion = total_preguntas AND total_preguntas > 0
        `, [usuarioId]);
        return parseInt(r.rows[0].t) >= 5;
      }

      case '50_CONSECUTIVE_CORRECT': {
        const r = await db.query(`
          SELECT ir.es_correcta FROM intento_respuestas ir
          JOIN intentos i ON ir.intento_id = i.id
          WHERE i.usuario_id=$1 AND i.completado=1 ORDER BY ir.id DESC LIMIT 50
        `, [usuarioId]);
        if (r.rows.length < 50) return false;
        return r.rows.every(row => row.es_correcta === 1);
      }

      case 'ALL_SUBJECTS_COMPLETED': {
        const total = await db.query('SELECT COUNT(*) as t FROM materias WHERE activo=1');
        const completadas = await db.query(`
          SELECT COUNT(DISTINCT c.materia_id) as t FROM intentos i
          JOIN cuestionarios c ON i.cuestionario_id=c.id
          WHERE i.usuario_id=$1 AND i.completado=1
        `, [usuarioId]);
        return parseInt(completadas.rows[0].t) >= parseInt(total.rows[0].t);
      }

      case 'ALL_CATEGORIES_ATTEMPTED': {
        const total = await db.query('SELECT COUNT(*) as t FROM materias WHERE activo=1');
        const intentadas = await db.query(`
          SELECT COUNT(DISTINCT c.materia_id) as t FROM intentos i
          JOIN cuestionarios c ON i.cuestionario_id=c.id WHERE i.usuario_id=$1
        `, [usuarioId]);
        return parseInt(intentadas.rows[0].t) >= parseInt(total.rows[0].t);
      }

      case 'QUIZ_BEFORE_8AM': {
        const hour = new Date(intento.inicio_en).getUTCHours();
        const localHour = (hour - 5 + 24) % 24;
        return localHour < 8;
      }

      case 'QUIZ_BEFORE_6AM': {
        const hour = new Date(intento.inicio_en).getUTCHours();
        const localHour = (hour - 5 + 24) % 24;
        return localHour < 6;
      }

      case 'QUIZ_AFTER_10PM': {
        const hour = new Date(intento.inicio_en).getUTCHours();
        const localHour = (hour - 5 + 24) % 24;
        return localHour >= 22;
      }

      case 'QUIZ_AFTER_MIDNIGHT': {
        const hour = new Date(intento.inicio_en).getUTCHours();
        const localHour = (hour - 5 + 24) % 24;
        return localHour >= 0 && localHour < 4;
      }

      case 'ACTIVE_WEEKEND': {
        const r = await db.query(`
          SELECT EXTRACT(DOW FROM inicio_en) as dia_sem FROM intentos
          WHERE usuario_id=$1 AND completado=1
        `, [usuarioId]);
        const days = new Set(r.rows.map(r => parseInt(r.dia_sem)));
        return days.has(0) && days.has(6);
      }

      case 'ACTIVE_EVERY_DAY_MONTH': {
        const r = await db.query(`
          SELECT DISTINCT DATE(inicio_en) as dia FROM intentos
          WHERE usuario_id=$1 AND completado=1
            AND EXTRACT(MONTH FROM inicio_en) = EXTRACT(MONTH FROM CURRENT_TIMESTAMP)
            AND EXTRACT(YEAR FROM inicio_en) = EXTRACT(YEAR FROM CURRENT_TIMESTAMP)
        `, [usuarioId]);
        const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
        return r.rows.length >= daysInMonth;
      }

      case 'FIRST_QUIZ_OF_YEAR': {
        const year = new Date().getFullYear();
        const r = await db.query(`
          SELECT COUNT(*) as t FROM intentos
          WHERE usuario_id=$1 AND completado=1 AND EXTRACT(YEAR FROM inicio_en) = $2
        `, [usuarioId, year]);
        return parseInt(r.rows[0].t) === 1;
      }

      case 'COMPLETED_NO_HINTS':
        return true;

      case '60_DAYS_SINCE_REGISTRATION_ACTIVE': {
        const r = await db.query('SELECT creado_en FROM usuarios WHERE id=$1', [usuarioId]);
        if (r.rows.length === 0) return false;
        const creado = new Date(r.rows[0].creado_en);
        const diffDays = (new Date() - creado) / (1000 * 60 * 60 * 24);
        return diffDays >= 60;
      }

      case 'RETURN_AFTER_30_DAYS_INACTIVE': {
        const r = await db.query(`
          SELECT MAX(inicio_en) as ultima_actividad FROM intentos
          WHERE usuario_id=$1 AND id < $2
        `, [usuarioId, intentoId]);
        if (!r.rows[0].ultima_actividad) return false;
        const ultima = new Date(r.rows[0].ultima_actividad);
        const actual = new Date(intento.inicio_en);
        const diffDays = (actual - ultima) / (1000 * 60 * 60 * 24);
        return diffDays >= 30;
      }

      case 'TIME_UNDER_50PCT_LIMIT': {
        if (!intento.fin_en) return false;
        const duracionMs = new Date(intento.fin_en) - new Date(intento.inicio_en);
        const limiteMs = (intento.tiempo_limite || 60) * 60 * 1000;
        return duracionMs < limiteMs * 0.5;
      }

      case 'PERFECT_UNDER_HALF_TIME': {
        if (intento.puntuacion !== intento.total_preguntas) return false;
        if (!intento.fin_en) return false;
        const duracionMs = new Date(intento.fin_en) - new Date(intento.inicio_en);
        const limiteMs = (intento.tiempo_limite || 60) * 60 * 1000;
        return duracionMs < limiteMs * 0.5;
      }

      case 'FULL_TIME_USED_AND_PASSED': {
        if (!intento.fin_en) return false;
        const duracionMs = new Date(intento.fin_en) - new Date(intento.inicio_en);
        const limiteMs = (intento.tiempo_limite || 60) * 60 * 1000;
        const usedFullTime = duracionMs >= limiteMs * 0.9;
        const passed = intento.total_preguntas > 0 && (intento.puntuacion / intento.total_preguntas) >= 0.6;
        return usedFullTime && passed;
      }

      case 'IMPROVEMENT_20PCT_AFTER_FAIL': {
        const r = await db.query(`
          SELECT puntuacion, total_preguntas FROM intentos
          WHERE usuario_id=$1 AND cuestionario_id=$2 AND completado=1 AND id < $3
          ORDER BY id DESC LIMIT 1
        `, [usuarioId, intento.cuestionario_id, intentoId]);
        if (r.rows.length === 0) return false;
        const ant = r.rows[0];
        if (ant.total_preguntas === 0) return false;
        const prevPct = ant.puntuacion / ant.total_preguntas;
        const currPct = intento.total_preguntas > 0 ? intento.puntuacion / intento.total_preguntas : 0;
        return prevPct < 0.6 && (currPct - prevPct) >= 0.2;
      }

      case 'RETRY_AFTER_3_FAILS': {
        const r = await db.query(`
          SELECT COUNT(*) as t FROM intentos
          WHERE usuario_id=$1 AND cuestionario_id=$2 AND completado=1
            AND puntuacion < (total_preguntas * 0.6) AND id < $3
        `, [usuarioId, intento.cuestionario_id, intentoId]);
        return parseInt(r.rows[0].t) >= 3;
      }

      case 'RETAKE_AND_IMPROVE': {
        const r = await db.query(`
          SELECT puntuacion FROM intentos
          WHERE usuario_id=$1 AND cuestionario_id=$2 AND completado=1 AND id < $3
          ORDER BY id DESC LIMIT 1
        `, [usuarioId, intento.cuestionario_id, intentoId]);
        if (r.rows.length === 0) return false;
        return intento.puntuacion > r.rows[0].puntuacion;
      }

      case 'HARD_QUIZ_PASSED_AFTER_3_ATTEMPTS': {
        if (intento.total_preguntas === 0) return false;
        const passed = (intento.puntuacion / intento.total_preguntas) >= 0.6;
        const r = await db.query(`
          SELECT COUNT(*) as t FROM intentos
          WHERE usuario_id=$1 AND cuestionario_id=$2 AND completado=1 AND id < $3
        `, [usuarioId, intento.cuestionario_id, intentoId]);
        return passed && parseInt(r.rows[0].t) >= 3;
      }

      case 'BADGES_EARNED_10': {
        const r = await db.query('SELECT COUNT(*) as t FROM student_badges WHERE usuario_id=$1', [usuarioId]);
        return parseInt(r.rows[0].t) >= 10;
      }

      case 'BADGES_EARNED_20': {
        const r = await db.query('SELECT COUNT(*) as t FROM student_badges WHERE usuario_id=$1', [usuarioId]);
        return parseInt(r.rows[0].t) >= 20;
      }

      default:
        return false;
    }
  }

  async function calcularRacha(usuarioId) {
    const r = await db.query(`
      SELECT DISTINCT DATE(inicio_en) as dia FROM intentos
      WHERE usuario_id=$1 AND completado=1 ORDER BY dia DESC
    `, [usuarioId]);
    if (r.rows.length === 0) return 0;
    let streak = 1;
    const today = new Date();
    today.setHours(0,0,0,0);
    const firstDay = new Date(r.rows[0].dia);
    firstDay.setHours(0,0,0,0);
    const diffFromToday = (today - firstDay) / (1000*60*60*24);
    if (diffFromToday > 1) return 0;
    for (let i = 1; i < r.rows.length; i++) {
      const current = new Date(r.rows[i-1].dia);
      const prev = new Date(r.rows[i].dia);
      const diff = (current - prev) / (1000*60*60*24);
      if (diff === 1) streak++;
      else break;
    }
    return streak;
  }

  return { evaluarInsignias, calcularRacha };
};
