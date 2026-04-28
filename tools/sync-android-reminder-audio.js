/* Copia audios de recordatorio al directorio Android res/raw para notificaciones locales. */
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const srcDir = path.join(projectRoot, 'assets', 'audio');
const destDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'raw');

const files = [
  { from: 'evento-15.mp3',    to: 'evento_15.mp3'    },
  { from: 'evento-30.mp3',    to: 'evento_30.mp3'    },
  { from: 'evento-15-en.mp3', to: 'evento_15_en.mp3' },
  { from: 'evento-30-en.mp3', to: 'evento_30_en.mp3' },
  { from: 'evento-15-pt.mp3', to: 'evento_15_pt.mp3' },
  { from: 'evento-30-pt.mp3', to: 'evento_30_pt.mp3' },
  { from: 'f-evento-es.mp3', to: 'f_evento_es.mp3' },
  { from: 'f-evento-en.mp3', to: 'f_evento_en.mp3' },
  { from: 'f-evento-pt.mp3', to: 'f_evento_pt.mp3' },
  { from: 'm-evento-es.mp3', to: 'm_evento_es.mp3' },
  { from: 'm-evento-en.mp3', to: 'm_evento_en.mp3' },
  { from: 'm-evento-pt.mp3', to: 'm_evento_pt.mp3' },
  { from: 'm-evento-15-es.mp3', to: 'm_evento_15_es.mp3' },
  { from: 'm-evento-15-en.mp3', to: 'm_evento_15_en.mp3' },
  { from: 'm-evento-15-pt.mp3', to: 'm_evento_15_pt.mp3' },
  { from: 'm-evento-30-es.mp3', to: 'm_evento_30_es.mp3' },
  { from: 'm-evento-30-en.mp3', to: 'm_evento_30_en.mp3' },
  { from: 'm-evento-30-pt.mp3', to: 'm_evento_30_pt.mp3' },
];

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`[android-audio] No encontrado: ${src}`);
    return false;
  }
  fs.copyFileSync(src, dest);
  console.log(`[android-audio] Copiado: ${path.basename(src)} -> ${dest}`);
  return true;
}

function main() {
  ensureDir(destDir);
  let copied = 0;

  for (const item of files) {
    const fromPath = path.join(srcDir, item.from);
    const toPath = path.join(destDir, item.to);
    if (copyIfExists(fromPath, toPath)) copied += 1;
  }

  if (!copied) {
    console.warn('[android-audio] No se copiaron audios de recordatorio.');
    process.exitCode = 1;
    return;
  }

  console.log(`[android-audio] Copia finalizada. Archivos copiados: ${copied}.`);
}

main();
