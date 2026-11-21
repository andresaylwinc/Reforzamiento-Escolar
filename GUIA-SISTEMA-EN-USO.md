# Sistema en uso — puesta en marcha

Guía para pasar del prototipo (datos en cada teléfono) al sistema real: una base de
datos compartida, cuentas por persona y la líder viendo lo que se registra al instante.

Tiempo estimado: **20 minutos**. No hace falta instalar nada nuevo: todo se hace desde el
navegador y desde GitHub Desktop.

---

## Qué cambia

| Antes (prototipo) | Ahora (en uso) |
|---|---|
| Cada navegador guarda sus propios datos | Una base de datos común para todo el equipo |
| Cualquiera abre el enlace y registra | Cada persona entra con su correo y contraseña |
| Todos ven todos los colegios | Cada profesor ve solo los colegios que tiene asignados |
| La líder descarga un Excel de su propio navegador | La líder ve y descarga todo lo registrado, al instante |
| Sin respaldo | Respaldo automático de la base (Supabase) |

La pantalla de registro, el panel y el Excel **son los mismos** que ya probaste.

---

## Paso 1 · Crear el proyecto en Supabase

1. Entra a [supabase.com](https://supabase.com) y crea una cuenta (gratis).
2. **New project**:
   - Nombre: `reforzamiento`
   - Contraseña de la base: elige una y guárdala en un lugar seguro.
   - Región: **South America (São Paulo)** — es la más cercana a Chile.
3. Espera un par de minutos a que el proyecto quede listo.

## Paso 2 · Crear las tablas

1. En el menú izquierdo: **SQL Editor** → **New query**.
2. Abre el archivo [`supabase/1-esquema.sql`](supabase/1-esquema.sql), copia todo su contenido, pégalo y presiona **Run**.
3. Opcional: si quieres partir con datos de prueba (Colegio 1 a 6, Estudiante 1 a 45),
   repite el paso con [`supabase/2-semilla.sql`](supabase/2-semilla.sql). Se pueden borrar después.

Deberías ver las tablas en **Table Editor**: `perfiles`, `colegios`, `cursos`,
`asignaciones`, `estudiantes`, `clases`, `registros`.

## Paso 3 · Crear las cuentas

El esquema ya deja un disparador que **crea el perfil solo** cada vez que se agrega una
cuenta: no hay que copiar UUIDs. Todas las cuentas nuevas quedan como `profesor`, y después
solo cambias tu propia cuenta a `lider`.

1. **Authentication → Users → Add user**, una por persona:
   - Correo y contraseña.
   - Marca **Auto confirm user** (si no, no podrá entrar hasta confirmar por correo).
2. **SQL Editor → New query**, y ejecuta esto cambiando el correo y tu nombre.
   **Esto no va en ningún archivo del proyecto**: es un comando para la base de datos,
   en el mismo lugar donde pegaste el esquema del paso 2.

```sql
update public.perfiles
   set rol = 'lider', nombre = 'Tu nombre'
 where id = (select id from auth.users where email = 'tu-correo@ejemplo.cl');
```

3. Comprueba cómo quedaron las cuentas:

```sql
select u.email, p.nombre, p.rol
  from public.perfiles p join auth.users u on u.id = p.id
 order by p.rol, u.email;
```

4. **Authentication → Providers → Email**: desactiva **Enable sign ups**, para que nadie
   pueda crearse una cuenta por su cuenta.

### Crear cuentas desde la app (recomendado)

Para no volver al panel cada vez que entra un profesor, se instala una función que crea las
cuentas por ti. Se hace una sola vez:

1. En Supabase: **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nombre: `crear-profesor` (exacto).
3. Pega el contenido de [`supabase/funciones/crear-profesor/index.ts`](supabase/funciones/crear-profesor/index.ts).
4. **Deploy** y espera a que diga *deployed*.

Con eso, en la app aparecerá el formulario en **Ajustes → Profesores**: escribes nombre,
correo y una contraseña temporal, y la cuenta queda creada y confirmada.

> La clave secreta del proyecto nunca pasa por el navegador: vive dentro de la función, en los
> servidores de Supabase. La app solo envía la sesión de la líder y la función comprueba que su
> perfil diga `rol = lider` antes de crear nada.
>
> Si el botón responde *"Falta desplegar la función crear-profesor"*, revisa el nombre y que el
> despliegue haya terminado. Si responde *"Falta la clave secreta"*, en **Edge Functions → Secrets**
> agrega `SUPABASE_SERVICE_ROLE_KEY` con la clave `service_role` (o `secret`) del proyecto.

> Si una cuenta dice *"no tiene perfil en el sistema"*, es porque se creó antes de ejecutar
> el esquema. Vuelve a correr el `insert ... from auth.users` que está al final del punto 7
> del archivo `supabase/1-esquema.sql`.

## Paso 4 · Conectar la aplicación

1. En Supabase: **Settings → API**. Copia dos valores:
   - **Project URL** (`https://algo.supabase.co`)
   - **anon public** (una clave larga que empieza con `eyJ`)
2. Abre el archivo **`config.js`** (está al lado de `Sistema-Asistencia.html`, en la raíz
   del repositorio) y pega los valores:

```js
window.CONFIG = {
  supabaseUrl: 'https://algo.supabase.co',
  supabaseKey: 'eyJhbGciOi...',
};
```

3. Guarda. **No hay que recompilar nada**: ese archivo se lee aparte.

> ¿Trabajas desde GitHub? Abre `config.js` en el repositorio → ícono del lápiz → pega los
> valores → **Commit changes**. Listo, igual que editar cualquier archivo de texto.

## Paso 5 · Publicar

En **GitHub Desktop**: escribe un resumen (*"Conectar base de datos"*), **Commit to main** y
**Push origin**. En un minuto, la misma dirección de siempre ahora pide entrar:

```
https://andresaylwinc.github.io/Reforzamiento-Escolar/
```

## Paso 6 · Primer uso, como líder

1. Entra con tu cuenta (la que tiene rol `lider`).
2. **Ajustes → Colegios**: agrega tus colegios y sus cursos.
3. **Ajustes → Profesores**: asigna cada profesor a sus colegios.
4. **Estudiantes**: agrega la lista de cada curso (o carga la semilla del paso 2 para probar).
5. Registra una clase de prueba y revisa el **Panel**.

Desde ese momento, lo que registre cada profesor aparece en tu panel al instante.

---

## Día a día

**El profesor**
1. Abre el enlace en el celular y entra.
2. Elige fecha, colegio, curso y confirma quién dictó la clase.
3. Marca P/A, registra la evaluación (0 = sin nota) y agrega observaciones si corresponde.
4. **Enviar registro**.

**La líder**
- **Panel**: asistencia, nivel promedio, sesiones y estudiantes en seguimiento.
- **Informes**: Excel del periodo y borrador de informe.
- **Estudiantes**: altas y bajas de la lista.

**Correcciones**: el profesor puede corregir su clase durante 30 días. Pasado ese plazo
solo la líder puede modificarla (la app lo avisa y la base lo impide).

## Quién puede ver qué

| Acción | Profesor | Líder |
|---|---|---|
| Ver colegios asignados | Sí | Todos |
| Ver estudiantes de sus colegios | Sí | Todos |
| Registrar y corregir sus clases | Sí (30 días) | Sí (siempre) |
| Agregar o quitar estudiantes | Sí, en sus colegios | Sí, en todos |
| Crear colegios y cursos | No | Sí |
| Ver todos los colegios y el panel completo | No | Sí |

Estas reglas no están solo en la pantalla: están en la base de datos, así que valen aunque
alguien use otro programa para consultar.

## Cuando no hay señal

Si el profesor envía una clase sin conexión, la app la guarda en el teléfono y la envía sola
cuando vuelve la señal. En la barra superior aparece un contador con las clases pendientes.

## Bitácora de la clase (fotos y PDF)

Cada profesor puede adjuntar la foto de la bitácora en papel que llena al terminar la clase.

**Cómo se usa:** se registra la clase, se envía, y debajo aparece la tarjeta
*Bitácora de la clase* → **Adjuntar foto o PDF**. Se pueden subir varias; quedan como
miniaturas con un botón *Ver* y otro *Quitar*.

**Cómo funciona por dentro**

- Las **imágenes se reducen en el teléfono antes de subirlas** (máximo 1600 px, JPEG 72%).
  Una foto de 4 MB queda en 200–400 KB: en el plan gratuito de Supabase caben miles.
- Se guardan en una carpeta **privada** (`bitacoras`), ordenadas por colegio, curso y fecha.
  No hay enlace público: la app genera un enlace temporal cada vez que alguien abre el archivo.
- Solo las personas del proyecto pueden subir o ver: un profesor, solo en sus colegios.
- Si el archivo se borra desde la app, se borra también del almacenamiento.

**Requisito**: ejecutar una vez `supabase/3-bitacoras.sql` en el SQL Editor (crea la tabla y la
carpeta privada). Si instalaste el esquema después de esta versión, ya viene incluido.

> Subir una foto necesita conexión. La clase se puede guardar sin señal (queda en cola) y la
> foto se adjunta después, al volver al colegio o a la casa.

## Mantener dos sistemas (principal y copia)

Cuando haya dos despliegues del mismo sistema (por ejemplo, el equipo original y un segundo
equipo que usa los mismos colegios y estudiantes), en el computador quedan dos carpetas:

| Carpeta | Qué es |
|---|---|
| `C:\Users\HP\Reforzamiento-Escolar` | **Principal**: donde se hacen los cambios al sistema |
| `C:\Users\HP\Reforzamiento-Escolar-2` | **Copia**: mismo programa, otra base de datos |

Cada una tiene **su propio `config.js`** (su propia base) y **su propio repositorio**.

### Para actualizar las dos

1. Haz los cambios en la carpeta **principal**.
2. Doble clic en **`sincronizar-copias.cmd`** (está en la carpeta principal).
   Copia el programa a la copia y **no toca** el `config.js` de ninguna.
3. En GitHub Desktop: abre cada carpeta por separado, haz commit y push en cada una.

> El sincronizador va en un solo sentido: principal → copia. Si editas algo directamente en la
> copia, la próxima sincronización lo reemplaza. Los cambios se hacen siempre en la principal.

## Cambiar la contraseña de una cuenta

Cuando alguien la olvide, la líder no necesita entrar a Supabase:

1. **Ajustes → Profesores**.
2. En la fila de la persona, botón **Clave**.
3. Aparece una contraseña temporal propuesta (puedes cambiarla o usar *Generar otra*).
4. **Guardar contraseña** y entrégasela en persona.

Funciona también para tu propia cuenta. La persona puede cambiarla después desde su perfil
(si quieres esa opción, se agrega).

## Clonar el sistema para otro equipo

Sirve cuando se quiere **el mismo listado de estudiantes con otro equipo de profesores**, con
registros independientes. Son dos sistemas separados: lo que registra uno no aparece en el otro.

1. **Proyecto nuevo en Supabase** (vacío).
2. Ejecuta `supabase/1-esquema.sql` (no la semilla).
3. Crea tu cuenta y déjala como líder (paso 3 de esta guía).
4. Despliega otra vez la función `crear-profesor` en ese proyecto.
5. **Copia el sitio**: crea un repositorio nuevo con los mismos archivos, cambia
   `config.js` por la URL y la clave del proyecto nuevo, y activa Pages. Tendrás una segunda
   dirección.
6. En el sistema **original**: **Ajustes → Datos → Exportar estructura (.json)**.
   Ese archivo trae colegios, cursos y estudiantes (sin clases ni registros).
7. En el sistema **nuevo**: **Ajustes → Datos → Importar estructura** y elige el archivo.
8. Crea los profesores del equipo nuevo y asígnalos a sus colegios.

Los dos sistemas quedan independientes desde ese momento.

> Si en cambio quieres que **compartan** los mismos registros (dos equipos trabajando sobre las
> mismas clases), no clones nada: agrega los profesores nuevos al mismo proyecto y asígnalos a
> los colegios. Todos verán los mismos estudiantes y las mismas clases, con registro de quién
> anotó cada una.

## Problemas comunes

| Mensaje | Qué hacer |
|---|---|
| "Tu cuenta no tiene perfil en el sistema" | Falta el `insert` en `perfiles` del paso 3 |
| "Correo o contraseña incorrectos" | Crear o restablecer la cuenta en Authentication → Users |
| "No tienes permiso para esa acción" | El profesor no está asignado a ese colegio (Ajustes → Profesores) |
| El enlace da 404 | Pages no está activo o el sitio se está regenerando; revisa Actions |
| Página en blanco | Falta `config.js` junto al HTML, o tiene un error de escritura |
| No aparecen colegios | La cuenta entró, pero no tiene asignaciones |

## Seguridad y datos de menores

- La clave `anon` **es pública** y está hecha para ir en el navegador. Lo que protege los
  datos son las reglas de la base (RLS), no esa clave.
- **Nunca** pongas en `config.js` la clave `service_role`: esa salta todas las reglas.
- Los datos de estudiantes son de menores: mantén el acceso mínimo, no compartas el Excel
  por mensajería y define con cada colegio para qué se usan y cuánto se conservan.
- Supabase hace respaldos automáticos; aun así, una vez al mes conviene descargar el Excel
  completo como respaldo legible.

## Costos

El plan gratuito de Supabase incluye 500 MB de base de datos y hasta 50.000 usuarios
activos al mes: sobra para 6 colegios, 45 estudiantes y varios años de registros.
No hay costo por usuario, y GitHub Pages es gratuito.
