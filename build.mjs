/* Empaqueta todo en un único archivo HTML que se abre con doble clic.
   Ojo: String.replace interpreta $ en el reemplazo, por eso se usan funciones. */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const src = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const FILES = ['xlsx-lite.js', 'demo.js', 'logic.js', 'report.js', 'nube.js', 'app.js'];

let html = src('index.html');
const css = src('styles.css');
const js = FILES.map(src).join('\n\n');

html = html.replace('<link rel="stylesheet" href="styles.css">', () => '<style>\n' + css + '\n</style>');
for (const f of FILES) {
  html = html.replace('<script src="' + f + '"></script>', () => '');
}
html = html.replace('</body>', () => '<script>\n' + js + '\n</script>\n</body>');

const out = path.join(root, 'Sistema-Asistencia.html');
fs.writeFileSync(out, html, 'utf8');
console.log('listo:', out, (Buffer.byteLength(html) / 1024).toFixed(1) + ' KB');

// config.js queda como archivo aparte, al lado del HTML: se puede editar
// directamente en GitHub y no hay que volver a empaquetar.
// Si ya existe, NO se toca: así no se borran los datos de conexión.
const cfgDestino = path.join(root, 'config.js');
if (!fs.existsSync(cfgDestino)) {
  fs.copyFileSync(path.join(root, 'src', 'config.js'), cfgDestino);
  console.log('config: creado desde src/config.js (vacío)');
} else {
  console.log('config: se conserva el existente');
}
