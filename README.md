# Reforzamiento escolar · registro de asistencia y evaluación

Prototipo funcional y propuesta de diseño para el registro de clases de reforzamiento
en varios colegios de una comuna.

## Abrir el sistema

Doble clic en **`Sistema-Asistencia.html`**.

- No requiere instalación, servidor ni internet.
- Funciona igual en computador y en celular.
- Viene con datos de ejemplo con nombres genéricos: Colegio 1 a 6, Curso 1 y 2, Profesor 1 a 7
  y Estudiante 1 a 45, con 10 semanas de clases por curso. No hay personas ni establecimientos reales.
- Los datos se guardan en el navegador que se use. En *Ajustes* hay respaldo (`.json`) y
  restauración de los datos de ejemplo.

### Recorrido de prueba (3 minutos)

1. **Registrar**: elegir colegio, curso, fecha y profesor. Dejar los presentes marcados, cambiar
   algún ausente, completar evaluaciones y presionar *Enviar registro*.
2. Volver a la misma clase: avisa que ya estaba registrada y permite corregir sin duplicar.
3. Cambiar el curso en el selector: la lista y la clase son independientes (Colegio Los Aromos
   tiene 5° A y 5° B).
4. **Panel**: indicadores, gráficos, comparación por curso y estudiantes en seguimiento.
5. **Informes**: *Excel del periodo* descarga el archivo real; *Copiar borrador* entrega el
   informe narrativo listo para Word.
6. **Ajustes**: agregar cursos, editar la leyenda 0-3, cambiar el plazo de corrección.

## Reglas del sistema

| Regla | Cómo funciona |
|---|---|
| Unidad de registro | La clase de un **curso** en una fecha. Un colegio puede tener varios cursos. |
| Duplicados | No se puede repetir la clase de un curso en la misma fecha: reenviar actualiza. |
| Asistencia | Obligatoria para todos: P (presente) o A (ausente). |
| Evaluación | Obligatoria siempre, escala 0-3. El **0 = sin nota** (no hubo evaluación); 1, 2 y 3 son los niveles de logro. El promedio se calcula solo con 1-3. |
| Observación | Opcional, texto libre, con etiquetas opcionales para agrupar. |
| Clase no realizada | Se registra con motivo; no cuenta como ausencia de nadie. |
| Corrección | 30 días desde la clase (configurable). Después, solo la líder. |
| Estudiantes | La lista del curso es la vigente: se agrega quien se integra y se quita quien sale. Agregar y editar lo puede hacer cualquier profesor de ese colegio; **eliminar es solo de la líder**. |
| Bajas | Eliminar un colegio, un estudiante o una cuenta es solo de la líder. La cuenta de una persona se **desactiva**, no se borra: conserva sus clases y se puede restaurar. |

## Dos modos

| Modo | Cuándo | Qué usa |
|---|---|---|
| **Local** (por defecto) | Para probar el diseño | Datos de ejemplo guardados en el navegador. No pide cuenta. |
| **En uso** | Para el trabajo real | Base de datos compartida en Supabase, cuentas por persona y permisos por rol. |

Para pasar a modo en uso sigue **[GUIA-SISTEMA-EN-USO.md](GUIA-SISTEMA-EN-USO.md)**:
crear el proyecto, ejecutar el esquema y pegar dos valores en `config.js`.

Los archivos `.sql` de `supabase/` **no se abren ni se ejecutan desde el proyecto**: se copian
y se pegan en el *SQL Editor* del panel de Supabase (supabase.com → tu proyecto → SQL Editor).

## Documentos

| Archivo | Qué es |
|---|---|
| `Propuesta-Sistema-Reforzamiento.pdf` | Propuesta: diagnóstico, 10 cambios, arquitectura, etapas, costos, datos de menores y decisiones acordadas. |
| `Propuesta-Sistema.html` | Misma propuesta en HTML (para editar y volver a imprimir). |
| `Ejemplos/Informe-Ejemplo.xlsx` | Informe Excel de ejemplo: 11 hojas, con un bloque por curso en la hoja de cada colegio. |
| `Ejemplos/capturas/` | Capturas de todas las pantallas. |

## Desarrollo

```
src/index.html      estructura
src/styles.css      diseño
src/xlsx-lite.js    generador de .xlsx sin dependencias
src/demo.js         datos de ejemplo reproducibles
src/logic.js        reglas, indicadores, validaciones, borrador de informe
src/report.js       armado del informe Excel
src/app.js          interfaz
build.mjs           empaqueta todo en Sistema-Asistencia.html
```

Reconstruir después de editar:

```
node build.mjs
```

### Pruebas

```
node test/verify.mjs    # 38 pruebas de datos, reglas por curso, indicadores e informe
node test/flujo.mjs     # 32 pruebas del flujo real en el navegador (requiere Edge)
node test/descarga.mjs  # descarga el Excel desde el navegador y valida el archivo
```

Las tres deben terminar sin fallas antes de entregar cambios.

## Alcance

El sistema tiene dos modos. En **modo en uso** ya incluye cuentas con rol, base de datos
compartida con permisos por colegio, guardado sin conexión con reenvío automático y el
registro por curso.

Falta para completar: historial de cambios registro por registro (hoy se guarda quién y
cuándo fue la última modificación), carga masiva de estudiantes desde una planilla,
informe en Word y notificaciones por correo.

Todos los nombres son genéricos (Colegio 1, Profesor 1, Estudiante 1): no corresponden a personas ni establecimientos reales.
