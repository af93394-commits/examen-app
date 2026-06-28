const { Pool } = require('pg');
const db = new Pool({
  connectionString: 'postgresql://examen:ycNc1fBC7h4DJ60BWogEC2uV5MZUyL7Q@dpg-d90kfjb7uimc739f4p0g-a.virginia-postgres.render.com/examen_3syr_1zx6',
  ssl: { rejectUnauthorized: false }
});

async function check() {
  // Check if texto_lectura column exists
  const cols = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'preguntas'");
  console.log('Columns:', cols.rows.map(r => r.column_name).join(', '));
  
  // Check if the field is returned by the API query
  const sample = await db.query('SELECT p.texto_lectura FROM preguntas p JOIN cuestionario_preguntas cp ON p.id = cp.pregunta_id WHERE cp.cuestionario_id = 13 ORDER BY cp.orden LIMIT 6');
  console.log('\ntexto_lectura values for cuestionario 13:');
  sample.rows.forEach((r, i) => {
    console.log('  Row ' + i + ':', r.texto_lectura ? r.texto_lectura.substring(0, 80) + '...' : 'NULL');
  });
  
  // Check if all questions have the same texto_lectura
  const allTexts = await db.query('SELECT p.id, LEFT(p.texto_lectura, 50) as txt FROM preguntas p JOIN cuestionario_preguntas cp ON p.id = cp.pregunta_id WHERE cp.cuestionario_id = 13 ORDER BY cp.orden');
  console.log('\nAll questions in cuestionario 13:');
  allTexts.rows.forEach(r => console.log('  ID ' + r.id + ': ' + r.txt));
  
  await db.end();
}

check().catch(e => { console.error(e); process.exit(1); });
