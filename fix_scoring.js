const { Pool } = require('pg');
const db = new Pool({ 
  connectionString: 'postgresql://examen:ycNc1fBC7h4DJ60BWogEC2uV5MZUyL7Q@dpg-d90kfjb7uimc739f4p0g-a.virginia-postgres.render.com/examen_3syr_1zx6', 
  ssl: { rejectUnauthorized: false } 
});

(async()=>{
  // Delete intento 33 (quiz 18 with wrong scoring)
  await db.query('DELETE FROM intento_respuestas WHERE intento_id = 33');
  await db.query('DELETE FROM intentos WHERE id = 33');
  console.log('Intento 33 eliminado');

  // Also check if there are other suspicious attempts
  const r1 = await db.query(`
    SELECT i.id, i.usuario_id, i.cuestionario_id, i.total_preguntas, i.puntuacion, i.completado,
      (SELECT COUNT(*) FROM intento_respuestas WHERE intento_id = i.id) as total_respuestas,
      (SELECT COUNT(*) FROM intento_respuestas WHERE intento_id = i.id AND es_correcta = 1) as correctas,
      (SELECT COUNT(*) FROM intento_respuestas WHERE intento_id = i.id AND es_correcta = 0) as incorrectas
    FROM intentos i
    WHERE i.completado = 1
    ORDER BY i.id
  `);
  console.log('\nIntentos completados:');
  r1.rows.forEach(row => {
    const allCorrect = row.total_respuestas > 0 && row.correctas == row.total_respuestas;
    console.log('ID', row.id, '| Quiz', row.cuestionario_id, '| Resp:', row.total_respuestas + '/' + row.total_preguntas, '| Correctas:', row.correctas, '| Incorrectas:', row.incorrectas, allCorrect ? '<-- TODAS CORRECTAS' : '');
  });

  await db.end();
})();
