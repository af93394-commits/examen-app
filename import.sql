CREATE TABLE IF NOT EXISTS materias (id SERIAL PRIMARY KEY, nombre TEXT UNIQUE NOT NULL, descripcion TEXT, activo INTEGER DEFAULT 1, creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS usuarios (id SERIAL PRIMARY KEY, usuario TEXT UNIQUE NOT NULL, password TEXT NOT NULL, nombre_completo TEXT NOT NULL, rol TEXT NOT NULL DEFAULT 'estudiante', activo INTEGER DEFAULT 1, creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS preguntas (id SERIAL PRIMARY KEY, texto TEXT NOT NULL, imagen TEXT, opcion_a TEXT NOT NULL, opcion_b TEXT NOT NULL, opcion_c TEXT NOT NULL, opcion_d TEXT NOT NULL, respuesta_correcta TEXT NOT NULL, materia_id INTEGER REFERENCES materias(id), creado_por INTEGER REFERENCES usuarios(id), creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP, imagen_opcion_a TEXT, imagen_opcion_b TEXT, imagen_opcion_c TEXT, imagen_opcion_d TEXT);
CREATE TABLE IF NOT EXISTS cuestionarios (id SERIAL PRIMARY KEY, titulo TEXT NOT NULL, descripcion TEXT, materia_id INTEGER REFERENCES materias(id), tiempo_limite INTEGER DEFAULT 60, activo INTEGER DEFAULT 1, creado_por INTEGER REFERENCES usuarios(id), creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS cuestionario_preguntas (id SERIAL PRIMARY KEY, cuestionario_id INTEGER NOT NULL REFERENCES cuestionarios(id) ON DELETE CASCADE, pregunta_id INTEGER NOT NULL REFERENCES preguntas(id) ON DELETE CASCADE, orden INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS intentos (id SERIAL PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id), cuestionario_id INTEGER NOT NULL REFERENCES cuestionarios(id), puntuacion INTEGER DEFAULT 0, total_preguntas INTEGER DEFAULT 0, completado INTEGER DEFAULT 0, inicio_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP, fin_en TIMESTAMP);
CREATE TABLE IF NOT EXISTS intento_respuestas (id SERIAL PRIMARY KEY, intento_id INTEGER NOT NULL REFERENCES intentos(id) ON DELETE CASCADE, pregunta_id INTEGER NOT NULL REFERENCES preguntas(id), respuesta_seleccionada TEXT, es_correcta INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS user_sessions (sid TEXT PRIMARY KEY, sess JSON NOT NULL, expire TIMESTAMP NOT NULL);

INSERT INTO materias (id, nombre, descripcion, activo) VALUES (1, 'Matematicas', 'Razonamiento cuantitativo, algebra y geometria', 1) ON CONFLICT (nombre) DO NOTHING;
INSERT INTO materias (id, nombre, descripcion, activo) VALUES (2, 'Lectura Critica', 'Comprension lectora e interpretacion de textos', 1) ON CONFLICT (nombre) DO NOTHING;
INSERT INTO materias (id, nombre, descripcion, activo) VALUES (3, 'Ciencias Naturales', 'Biologia, quimica y fisica', 1) ON CONFLICT (nombre) DO NOTHING;
INSERT INTO materias (id, nombre, descripcion, activo) VALUES (4, 'Ciencias Sociales', 'Historia, geografia y constitution politica', 1) ON CONFLICT (nombre) DO NOTHING;
INSERT INTO materias (id, nombre, descripcion, activo) VALUES (5, 'Ingles', 'Comprension y uso del idioma ingles', 1) ON CONFLICT (nombre) DO NOTHING;
INSERT INTO usuarios (id, usuario, password, nombre_completo, rol, activo) VALUES (1, 'admin', '$2a$10$BlBhHFH3gJlBSabYddrxpuNu1T5xvVI/QiNN535xkAjCPUPELcgjy', 'Administrador', 'admin', 1) ON CONFLICT (usuario) DO NOTHING;
INSERT INTO usuarios (id, usuario, password, nombre_completo, rol, activo) VALUES (3, 'Leni', '$2a$10$CHCkrd9OLhz.HnbUE86NpeGPNQxstaAiuSdxEIqmlSJ3uK1gSYK3e', 'Leni quilindo', 'estudiante', 1) ON CONFLICT (usuario) DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (17, 'En una fábrica, los empleados pueden trabajar cada semana en dos turnos; diurno y nocturno. Existen dos clasificaciones para los dias de trabajo: normales (de lunes a sábado) y domingos. En el turno diurno del domingo se paga un 20% más que en el turno diurno de dias normales. En el turno nocturno de un día cualquiera, la hora de trabajo se paga un 50% más que en el turno diurno de ese mismo día.
Se conoce el valor de la hora diurna en un día normal y el dinero total recibido por un trabajador en su labor nocturna de una semana en dias normales.
Con esta información puede hallarse', NULL, 'la cantidad de horas nocturnas que trabajó en días normales esa semana.', 'el número de horas diurnas que trabajó cada dia normal de esa semana.', 'el número de horas nocturnas que trabajó cada dia normal de esa semana.', 'la cantidad de horas diurnas que trabajó en días normales esa semana.', 'A', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (18, 'Paula es una artista que pinta murales. Para su trabajo dispone de 8 tarros de pintura, cada uno de diferente color. Ella sabe que cada vez que mezcla pintura de dos colores diferentes, obtiene pintura de un nuevo color. A ella le interesa saber cuántos colores nuevos de pintura puede obtener mezclando de a dos colores de pintura. Al respecto, en un libro encontró la siguiente información:

Combinatoria: Cuando no importa el orden en el que se agrupan los n elementos totales en grupos de r elementos cada uno.
C(n,r) = n! / ((n-r)! r!)

Permutación: Cuando si importa el orden en el que se agrupan los n elementos totales en grupos de r elementos cada uno.
P(n,r) = n! / (n-r)!

Con esa información Paula calculó correctamente que la cantidad de posibles colores nuevos de pintura que puede obtener son:
C(8,2) = 8! / ((8-2)! 2!)

Ahora, ella tiene un proyecto en el que necesita crear diferentes banderas, de 3 franjas horizontales, sin repetir color en la misma bandera, y para hacerlo dispone de 10 colores diferentes. En ese orden de ideas, ¿cuántas banderas diferentes puede crear?', '/uploads/1782654599714-198048033.png', '3! / ((10-3)! 3!)', '3! / (10-3)!', '10! / ((10-3)! 3!)', '10! / (10-3)!', 'D', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (19, 'Se realizó una investigación sobre la cantidad de libros que leen las personas en distintos paises. Frente a ello, la tabla muestra el promedio anual de libros leídos por habitante en algunos paises.

Pais | Promedio anual de libros leídos por habitante
Argentina | 1,6
Brasil | 2,5
Chile | 5,3
Colombia | 1,9
Perú | 3,3
Venezuela | 2,0

Al leer la tabla, una persona afirma que, a partir de la información, se puede concluir que en la mayoría de los países todas las personas leen al menos 2 libros al año. ¿Es verdadera la afirmación de la persona?', '/uploads/1782654648978-715864600.png', 'No, porque en dos países de la tabla el promedio anual es menor que 2 libros por habitante.', 'Si, porque en cuatro países de la tabla el promedio anual es igual o superior a 2 libros por habitante.', 'No, porque es posible que algunas personas lean menos libros que el promedio de su país.', 'Sí, porque en un país de la tabla el promedio anual es igual a 2 libros por habitante.', 'B', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (20, 'Si se conoce el volumen de una caja de cartón en forma de paralelepipedo rectangular, ¿cuáles datos adicionales deben conocerse para calcular el área de todas las caras de la caja?', '/uploads/1782654717558-832977274.png', 'El área de la base y la altura de la caja.', 'El área de la base y el ancho de la caja.', 'El área de las cuatro caras laterales de la caja.', 'El área de las dos tapas, superior e inferior, de la caja.', 'A', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (21, 'Una familia fue a hacer mercado y compraron dos productos que tenían descuento, una arroba de arroz con el 20% de descuento y una caja de panela con el 10% de descuento. Para saber la cantidad de dinero que se les descontó de la compra se puede usar la expresión algebraica:
z = 0,2x + 0,1y
En donde x representa el precio de la arroba de arroz, y representa el precio de la caja de panela y z representa la cantidad total de dinero que se descontó.
¿Es posible calcular el valor de z con la información que se conoce?', NULL, 'Sí, porque la expresión considera los dos porcentajes de descuento.', 'No, porque se desconoce el valor de x y el valor de y.', 'No, porque 0,2 es diferente al 20% y 0,1 es diferente al 10%.', 'Sí, porque solo se debe sumar el 0,2 y el 0,1.', 'B', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (22, 'El dueño de una finca quiere construir un cobertizo conformado por dos trapecios y dos rectángulos, como muestra el siguiente plano:
3 m
3 m
4 m
6 m
Para determinar el posible costo de la construcción, primero ha calculado el área total mediante el siguiente procedimiento.
Paso 1. Calcular el área de uno de los trapecios y multiplicar por 2.
Paso 2. Calcular el área de cada rectángulo y sumar los resultados.
Paso 3. Sumar los resultados de los pasos 1 y 2.
¿Cuál es el área total del cobertizo?', '/uploads/1782654687760-873650330.png', '51 m2', '57 m2', '63 m2', '75 m2', 'B', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (23, 'Tina está participando en un juego en el que se ubican barcos en un plano cartesiano y se busca eliminar los barcos de otro jugador, adivinando su ubicación. En un momento del juego, a Tina le queda un barco ubicado como muestra la figura.

¿Cuáles son las coordenadas (x, y) de los vértices que encierran el barco que le queda a Tina?', '/uploads/1782655250897-912404528.png', '(5,4); (6,4); (5,9) y (6,9)', '(6,5); (6,6); (7,5) y (7,6)', '(4,5); (4,6); (9,5) y (9,6)', '(4,4); (5,5); (6,6) y (9,9)', 'C', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (24, 'Rosendo está construyendo un jardín y quiere instalar una fuente con forma circular. Él olvidó su metro, por lo que tomó la medida utilizando la palma de su mano.

La imagen corresponde a una representación de la fuente, donde el segmento que va desde P hasta R es un diámetro de la circunferencia y mide 8 cuartas. Si se considera que una cuarta de Rosendo mide 21,5 centímetros, ¿cuál es la medida, en centímetros, del diámetro de la fuente?', '/uploads/1782655306180-56524513.png', '21,5 cm', '172 cm', '168,5 cm', '8 cm', 'B', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (25, 'En el parque de un pueblo se encuentra el siguiente mapa que ilustra los sitios importantes para que los turistas se ubiquen.

Hospital = (-500, 500)
Colegio = (500, 1.000)
Alcaldía = (1.000, 0)

Si se sabe que la biblioteca está en la mitad de la distancia entre el hospital y la alcaldía, ¿cuál es la distancia entre el colegio y la biblioteca?', '/uploads/1782655358822-447088547.png', '√((250)² + (750)²)', '√((250)² + (250)²)', '√((750)² + (1.250)²)', '√((750)² + (750)²)', 'A', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (26, 'Para una celebración, los habitantes de un barrio desean pintar en una calle figuras con cuatro hojas como la que muestra la figura.

Para estimar la cantidad de pintura que utilizarán, calculan el área de una de las hojas, realizando el siguiente procedimiento:
Paso 1. Calcular el área del cuadrado que se dibuja con las líneas punteadas.
Paso 2. Calcular el área de tres cuartas partes de una circunferencia de radio r.
Paso 3. Sumar las dos áreas encontradas en paso 1 y 2.

De acuerdo con lo anterior, ¿cuál es el área de una de las hojas?', '/uploads/1782655406754-33959316.png', '3/2 πr + r²', '3/2 πr + 2r', '3/4 πr² + r²', '3/4 πr² + 4r', 'C', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (27, 'Una persona registró durante una hora la temperatura dentro de un horno mientras hacía una torta y obtuvo la siguiente gráfica:

Temperatura (°C): 200, 180, 160, 140, 120, 100, 80, 60, 40, 20, 0
Tiempo (minutos): 10, 20, 30, 40, 50, 60

De acuerdo con la gráfica, ¿en qué periodo de tiempo la temperatura tuvo un crecimiento lineal?', '/uploads/1782655462172-17232352.png', 'Entre 20 y 180 minutos', 'Entre 10 y 40 minutos', 'Entre 0 y 10 minutos', 'Entre 0 y 40 minutos', 'C', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (28, 'Cuenta la historia que hace muchos siglos un rey, que se encontraba muy triste por la muerte de su hijo en batalla, solicitó a sus súbditos que inventaran un juego para su diversión. Después de que le presentaran varios juegos al rey, y de que ninguno de ellos le gustara, un joven le presentó el ajedrez, cuyo tablero está conformado por casillas. El súbdito le pidió 1 grano de trigo por la primera casilla del tablero de ajedrez, dos granos de trigo por la segunda casilla, y así sucesivamente como se muestra en la tabla, siempre duplicando la cantidad de trigo con respecto a la casilla anterior.

Número de casilla (n) | 1 | 2 | 3 | 4 | 5 | 6 | 7
Granos de trigo (G) | 1 | 2 | 4 | 8 | 16 | 32 | 64

De acuerdo con la información suministrada, ¿cuál de las siguientes expresiones permite determinar la cantidad de granos de trigo G que correspondería al número de casilla n del tablero de ajedrez?', '/uploads/1782655507868-131387217.png', 'G = 2^n', 'G = 2n', 'G = 2n - 1', 'G = 2^(n-1)', 'D', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (29, 'El máximo común divisor M.C.D de dos números corresponde al mayor de los divisores comunes de ambos números.

Por ejemplo, para hallar el M.C.D de 8 y 12 se deben identificar los divisores comunes de 8 y 12 que son (1, 2, 4) y entre éstos escoger el mayor, que sería 4.

¿A cuál de las siguientes parejas de números se les puede hallar el M.C.D?', NULL, '0 y 6', '8/12 y 12/8', '0,08 y 0,12', '6 y 15', 'D', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (30, 'El rating o nivel de audiencia de un episodio de un programa de televisión se puede calcular usando la ecuación:
y = -0,05x² + 2x + 1

En esta ecuación, y es el rating y x el número del episodio del programa que se está transmitiendo. Un analista realizó el siguiente procedimiento:
Paso 1. Elevó 20 al cuadrado y multiplicó ese resultado por -0,05.
Paso 2. Multiplicó 2 por 20.
Paso 3. Sumó los resultados de los pasos 1 y 2 y, luego, sumó 1.

¿Qué información obtuvo el analista después de realizar correctamente el procedimiento?', NULL, 'El rating de 20 episodios.', 'La cantidad de episodios con un rating de 20.', 'El rating del episodio 20.', 'La cantidad de episodios con un rating superior a 20.', 'C', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (31, 'Con el fin de proteger una especie de cocodrilo amenazada, una zoóloga analizó la cantidad de crías viables de varias hembras y construyó la siguiente gráfica:

Promedio de crías viables por hembra: 20
Desviación estándar: 6

Para un mejor análisis, se eliminarán los datos atípicos, que son aquellos que están a una distancia de dos o más desviaciones estándar del promedio. Por consiguiente, ¿cuál de las siguientes opciones muestra los datos atípicos?', '/uploads/1782657001072-757944063.png', '', '', '', '', 'C', 1, 1, '/uploads/1782657001173-362968284.PNG', '/uploads/1782657001285-990428255.PNG', '/uploads/1782657001286-505187527.PNG', '/uploads/1782657001388-991193359.PNG') ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (32, 'En un parque quieren instalar canecas cilindricas como la de la figura.

Diámetro = 40 cm
Altura = 50 cm

Para calcular la cantidad de canecas que deben ser instaladas se necesita calcular la capacidad de una caneca. ¿Cuál es la capacidad de una caneca?', '/uploads/1782657078168-202374738.png', '2.000π cm³', '4.000π cm³', '20.000π cm³', '80.000π cm³', 'C', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (33, 'Alberto quiere comprar unos árboles para su finca y ha considerado tres clases distintas de árboles. En la siguiente gráfica, se ven las funciones de crecimiento aproximado de cada tipo de árbol en un tiempo de 32 años.

Alberto desea comprar únicamente una clase de árbol y quiere que sea la que más altura tenga en el intervalo de 12 a 20 años. De acuerdo con esto, ¿comprar árboles clase U cumple con los requisitos establecidos por Alberto?', '/uploads/1782657108094-211585173.png', 'Sí, puesto que a los 18 años el árbol de clase U y el árbol de clase W tienen la misma altura.', 'No, ya que, en el intervalo indicado, el árbol de clase W es el que alcanza la mayor altura.', 'Sí, porque, en el intervalo de 12 a 20 años, la gráfica del árbol clase U está por encima de las otras dos gráficas.', 'No, dado que la altura del árbol clase U es igual a la altura del árbol clase V a los 8 años y a la del árbol clase W a los 22 años.', 'C', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (34, 'El nivel de colesterol en la sangre se mide en miligramos por decilitro, mg/dL. En tal sentido, la tabla muestra las medidas de colesterol en cuatro pacientes que acudieron a un control médico periódicamente.

Control | Paciente 1 | Paciente 2 | Paciente 3 | Paciente 4
1 | 210 | 180 | 230 | 210
2 | 205 | 220 | 220 | 190
3 | 230 | 220 | 215 | 220

Durante los tres controles, ¿cuál de los pacientes registró un menor rango en el nivel de colesterol?', '/uploads/1782657133414-208279351.png', 'Paciente 1.', 'Paciente 2.', 'Paciente 3.', 'Paciente 4.', 'C', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (35, 'Para una competencia en un país que utiliza los decímetros (dm) como unidad común de medida, se va a utilizar una cancha deportiva con las siguientes dimensiones:

640 dm x 1.000 dm

Para preparar la cancha para la competencia se ha decidido pintarla y se requiere saber la medida del borde en metros. ¿Cuáles son las medidas de la cancha en metros?', '/uploads/1782657490142-943242365.png', '64 metros de ancho y 100 metros de largo.', '6.400 metros de ancho y 10.000 metros de largo.', '64 metros de ancho y 1 metro de largo.', '640 metros de ancho y 1.000 metros de largo.', 'B', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (36, 'Las acciones de una empresa se venden en la bolsa de valores. El gerente de la empresa registró en una tabla el precio que tuvo cada acción durante cinco días consecutivos y encontró que de un día para otro cada acción subió o bajó 1.000, y que en el tercer día el precio de cada acción fue de 45.000.

¿Cuál de las siguientes opciones muestra dos posibles precios correspondientes al precio mínimo y al precio máximo que tuvo cada acción durante los cinco días?', NULL, '44.000 y 46.000', '43.000 y 47.000', '41.000 y 49.000', '40.000 y 50.000', 'B', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (37, 'Un escultor vendió unas obras a la feria de un museo de ciencias naturales, y para ello las dejó al gerente del museo para después volver por el pago.

Obras (material) | Precio unitario (en pesos)
Roble | 50.000
Pino | 20.000
Cedro | 10.000

Al finalizar la feria, el gerente del museo le dijo al escultor que ninguna obra de cedro se vendió, pero que por las obras vendidas de roble y de pino se recogieron .000 en total.

Si el escultor quiere saber cuántas obras de roble se vendieron, ¿cuál cantidad necesita conocer?', '/uploads/1782657658044-271337624.png', 'La cantidad total de obras de cedro y pino que entregó al museo.', 'La cantidad total de obras que se vendieron en la feria del museo.', 'La cantidad de obras de roble que no fueron vendidas en la feria del museo.', 'La cantidad total de obras que entregó el escultor al gerente del museo.', 'B', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (38, 'Eliana y Lucy vendieron un apartamento por 200.000.000 y acordaron recibir un 3% de este valor como comisión por venta. Para distribuir el dinero que van a recibir, quien compró les propone el siguiente procedimiento:

Paso 1. Calcular el valor de la comisión multiplicando el valor del apartamento por 0,03, así: 200.000.000 x 0,03.
Paso 2. Calcular el dinero que le corresponde a Lucy así, multiplicar el resultado del paso 1 por 0,7.
Paso 3. Calcular el dinero que le corresponde a Eliana así, multiplicar el resultado del paso 2 por 0,3.

Eliana afirma que con el plan propuesto ella recibiría una cantidad menor que la de Lucy. ¿Es verdadera la afirmación de Eliana?', '/uploads/1782657697520-675832300.png', 'Sí, porque a Lucy le correspondería el 70% de la comisión y a Eliana el 30% de lo que le correspondería a Lucy.', 'Sí, porque a Lucy le correspondería el 70% de la comisión y a Eliana el 30% de la comisión.', 'No, porque a Eliana le correspondería el triple del dinero que le correspondería a Lucy.', 'No, porque a Lucy le correspondería la séptima parte del dinero de la comisión.', 'B', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (39, 'La imagen muestra el diseño de una tapa circular para una alcantarilla y su diámetro de 100 cm.

¿Cuál es la longitud del radio de esta tapa?', '/uploads/1782657724665-834806138.png', '618 cm', '10 cm', '200 cm', '50 cm', 'D', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (40, 'La imagen muestra el perímetro de tres polígonos regulares, cada uno con perímetro de 480 cm.

Una persona necesita mostrar la medida de la longitud de los lados de cada polígono. ¿Cuál de las siguientes opciones muestra correctamente esta información?', '/uploads/1782657832162-807295968.png', '', '', '', '', 'C', 1, 1, '/uploads/1782657832260-764319388.PNG', '/uploads/1782657832339-515740448.PNG', '/uploads/1782657832339-113454779.PNG', '/uploads/1782657832369-757718759.PNG') ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (41, 'La altura con respecto al suelo de un patinador que recorre una rampa en forma de U se muestra en la gráfica.

Altura (m): 4, 3, 2, 1, 0
Tiempo (s): 0,5, 1, 1,5, 2, 2,5, 3, 3,5, 4

Una persona observa la gráfica y afirma que la altura del patinador es una función periódica con un periodo de 2 segundos. ¿Es correcta la afirmación de la persona?', '/uploads/1782658050801-754731880.png', 'No, porque la gráfica no pasa por el origen.', 'Sí, porque la gráfica se repite 2 veces.', 'No, porque la altura mínima se alcanza en 1 segundo.', 'Sí, porque la altura mínima se alcanza cada 2 segundos.', 'D', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (42, 'La tabla muestra la cantidad de proteínas, grasas y azúcares en 100 ml de leche de diferentes animales, mientras que la gráfica muestra la misma información para la leche de una gata.

Animal | Proteína (g) | Grasas (g) | Azúcares (g)
Vaca | 4 | 4 | 7
Cerda | 6 | 9 | 5
Coneja | 12 | 15 | 3

Composición leche de una gata:
Proteína: 8g, Grasas: 7g, Azúcares: 3g

¿Cuál de las siguientes gráficas muestra la composición de la leche de la gata y de los otros animales?', '/uploads/1782658170223-507654251.png', '', '', '', '', 'C', 1, 1, '/uploads/1782658170325-645681277.PNG', '/uploads/1782658170341-934238544.PNG', '/uploads/1782658170347-241932413.PNG', '/uploads/1782658170454-527170334.PNG') ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (43, 'En un estudio hecho a 500 personas sobre la cantidad de veces que han comido sushi se encontró que 320 de ellos habían comido sushi dos o más veces. De la cantidad restante, solo la tercera parte indicó que nunca ha comido sushi y el resto menciona solo haberlo comido una vez.

Considere la siguiente operación:
(500 - 320) x 1/3

¿Qué cantidad se puede hallar con esa operación?', '/uploads/1782658247491-164466035.png', 'La cantidad de personas que han comido sushi una única vez.', 'La cantidad de personas que nunca han comido sushi.', 'El porcentaje de personas que nunca ha comido sushi.', 'El promedio de personas que ha comido sushi una única vez.', 'C', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (44, 'En clase de Geometría, la profesora comentó que dos rectas en el plano serán paralelas siempre y cuando sus pendientes sean iguales y ofreció el siguiente ejemplo en el tablero:

Teniendo los puntos F = (x1, y1) y G = (x2, y2) que pertenecen a la recta L1, la pendiente m equivale a:
m = (y2 - y1) / (x2 - x1)

Las rectas L1 y L2 son paralelas, y la pendiente de la recta L1 equivale a -2; dos puntos que pertenecen a L2 son H(1, -2) y K = ?

La profesora borró la información del punto K. ¿Cuál de las siguientes pudo haber sido la pareja ordenada del punto K que hace paralelas a las rectas L1 y L2?', '/uploads/1782658276710-304164295.png', '(-4, 0)', '(-1, -1)', '(0, 0)', '(6, 5)', 'C', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (45, 'Lina planea comprar una camiseta y un reloj como regalos para cada uno de sus dos sobrinos: Juan y María. Para Juan debe elegir entre dos opciones de color para la camiseta y tres opciones de reloj. Para María debe elegir entre cuatro opciones de color para la camiseta y tres opciones de reloj.

¿Cuántas opciones de regalo tiene Lina para elegir?', '/uploads/1782658291656-862760502.png', '18', '17', '12', '11', 'A', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (46, 'En una obra de teatro, hay 4 personas que interpretan pescadores. Al finalizar la obra, los 4 pescadores deben ubicarse en fila en el escenario y hacer una venia ante el público.

¿De cuántas formas pueden ubicarse los cuatro pescadores durante la venia final?', '/uploads/1782658304983-824022146.png', '64', '24', '16', '4', 'A', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (47, 'Para el último periodo del colegio, el profesor de Matemáticas de grado 11 decide que no hará exámenes; en vez de eso, va a realizar la calificación del periodo solo en tareas. Va a asignar 6 tareas durante este periodo y, cuando termine el periodo, cada estudiante va a poder elegir entre las siguientes tres opciones para calcular su nota final:

1. Promedio de las 6 tareas.
2. Promedio entre la mejor y peor nota de las 6 tareas.
3. Promedio entre las tareas que entregó.

Al final del periodo, Raúl solo entregó 2 de las 6 tareas, por lo que sus calificaciones fueron:

Tarea 1: 4,0 | Tarea 2: 2,0 | Tarea 3: 0,0 | Tarea 4: 0,0 | Tarea 5: 0,0 | Tarea 6: 0,0

¿Cuál de sus siguientes amigos le está dando un consejo correcto?', '/uploads/1782658598049-236410837.png', 'Ana: Elige cualquiera entre la opción 1 o la opción 2, con ambas obtendrás la misma nota y será mayor a la que obtendrías con la opción 3.', 'Juan: Elige cualquiera entre la opción 2 o la opción 3, con ambas obtendrás la misma nota y será mayor a la que obtendrías con la opción 1.', 'Natalia: Si eliges la opción 3 obtendrás más nota que si eliges la opción 2, que a su vez será más alta que si eliges la opción 1.', 'Pedro: Si eliges la opción 1 obtendrás más nota que si eliges cualquiera de las opciones 2 o 3 con las que obtendrás la misma nota.', 'C', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (48, 'Una forma de determinar la suma de las medidas de los siete ángulos que se forman en un heptágono es dividirlo entre 7 triángulos, como muestra la imagen, y utilizar el hecho de que la suma de los ángulos internos de todo triángulo es 180°.

¿Cuál es el resultado de sumar las medidas de los siete ángulos que se forman en el heptágono?', '/uploads/1782658624389-741859996.png', '900°', '840°', '1.620°', '1.260°', 'A', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (49, 'En la tabla se muestra la cantidad de horas que Sebastián dedicó diariamente a ver televisión durante su primera semana de vacaciones y, también, el total de horas que invirtió en esta actividad durante este tiempo.

Día: Lunes, Martes, Miércoles, Jueves, Viernes, Sábado, Domingo
Tiempo (horas): 6, 7, 5, 8, 6, 10, 9
Total: 51

Sebastián sabe que 51 horas es mucho tiempo semanal y afirma que si cada día de la segunda semana de vacaciones mira televisión un número de horas correspondiente a la mediana de los datos de la primera semana, entonces el total de horas de la segunda semana será menor que el de la primera semana. ¿Es correcta la afirmación de Sebastián?', '/uploads/1782658654989-506573915.png', 'No, porque el menor tiempo dedicado a ver televisión es el del día miércoles.', 'Sí, porque el tiempo dedicado a ver televisión el miércoles multiplicado por el número de días, es menor que 51.', 'No, porque el tiempo promedio dedicado a ver televisión es el del día martes.', 'Sí, porque el tiempo dedicado a ver televisión el martes multiplicado por el número de días, es menor que 51.', 'D', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (50, 'Ramón compró un lote que tiene forma rectangular: el largo mide x metros y el ancho mide y metros. Dentro del lote él construyó un jardín con forma rectangular, atendiendo a dos especificaciones:

1. El largo del jardín ocupó entre el 70% y 80% del largo del lote.
2. El ancho del jardín ocupó el 80% del ancho del lote.

Una persona afirmó que entre un 20% y un 30% del área del lote quedó sin jardín. ¿Es correcta la afirmación?', '/uploads/1782658691284-109258603.png', 'Sí, porque al restar 80% del 100% da 20% y al restar 70% del 100% da 30%.', 'Sí, porque el área del lote sin jardín es un quinto del ancho y como máximo un tercio del largo.', 'No, porque entre dos quintas partes y la mitad del área del lote quedó sin jardín.', 'No, porque entre un 36% y un 44% del área del lote quedó sin jardín.', 'D', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (51, 'Por un error de diseño, se construyó una pared entre dos máquinas, así que deben estar unidas por un tubo cilíndrico. Para arreglar el problema, una ingeniera propone abrir un hueco en la pared y pasar el tubo a través del hueco.

¿Qué información se necesita, como mínimo, para la elección del tubo que se debe usar en la unión?', '/uploads/1782658765093-151040813.png', 'Únicamente el largo del tubo.', 'El radio y el largo del tubo.', 'El largo del tubo y el grosor de la pared que se modifica.', 'El radio del tubo y el grosor de la pared que se modifica.', 'D', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO preguntas (id, texto, imagen, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, materia_id, creado_por, imagen_opcion_a, imagen_opcion_b, imagen_opcion_c, imagen_opcion_d) VALUES (52, 'La tabla presenta el consumo de agua mensual de tres apartamentos de un edificio.

Apartamento | Consumo de agua mensual en (m³)
1 | 22
2 | 32
3 | 26

Según la información de la tabla, ¿cuál es el promedio de consumo de agua mensualmente en el edificio?', '/uploads/1782658789519-851279236.png', '32 metros cúbicos.', '13,3 metros cúbicos.', '80 metros cúbicos.', '26,6 metros cúbicos.', 'D', 1, 1, NULL, NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO cuestionarios (id, titulo, descripcion, materia_id, tiempo_limite, activo, creado_por) VALUES (9, 'MATEMATICAS 3-Z1-2', 'Cuestionario de Matemáticas 3-Z1-2', 1, 60, 1, 1) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (22, 9, 17, 1) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (23, 9, 18, 2) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (24, 9, 21, 6) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (25, 9, 22, 4) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (26, 9, 20, 5) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (27, 9, 19, 3) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (40, 9, 23, 7) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (41, 9, 24, 8) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (42, 9, 25, 9) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (43, 9, 26, 10) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (44, 9, 27, 11) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (45, 9, 28, 12) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (46, 9, 29, 13) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (47, 9, 30, 14) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (48, 9, 31, 15) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (49, 9, 32, 16) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (50, 9, 33, 17) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (51, 9, 34, 18) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (52, 9, 35, 19) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (53, 9, 36, 20) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (54, 9, 37, 21) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (55, 9, 38, 22) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (56, 9, 39, 23) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (57, 9, 40, 24) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (58, 9, 41, 25) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (59, 9, 42, 26) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (60, 9, 43, 27) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (61, 9, 44, 28) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (62, 9, 45, 29) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (63, 9, 46, 30) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (64, 9, 47, 31) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (65, 9, 48, 32) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (66, 9, 49, 33) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (67, 9, 50, 34) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (68, 9, 51, 35) ON CONFLICT DO NOTHING;
INSERT INTO cuestionario_preguntas (id, cuestionario_id, pregunta_id, orden) VALUES (69, 9, 52, 36) ON CONFLICT DO NOTHING;

SELECT setval('materias_id_seq', (SELECT COALESCE(MAX(id),1) FROM materias));
SELECT setval('usuarios_id_seq', (SELECT COALESCE(MAX(id),1) FROM usuarios));
SELECT setval('preguntas_id_seq', (SELECT COALESCE(MAX(id),1) FROM preguntas));
SELECT setval('cuestionarios_id_seq', (SELECT COALESCE(MAX(id),1) FROM cuestionarios));
SELECT setval('cuestionario_preguntas_id_seq', (SELECT COALESCE(MAX(id),1) FROM cuestionario_preguntas));
