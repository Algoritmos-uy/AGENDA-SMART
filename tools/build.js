/* Construcción mínima web: copia index y src a www */
const fs = require('fs');
const path = require('path');

const root = __dirname.replace(/\\tools$/, '');
const from = (p) => path.join(root, p);
const to = (p) => path.join(root, 'www', p);

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(s, d);
    }
  }
}

fs.rmSync(to('.'), { recursive: true, force: true });
fs.mkdirSync(to('.'), { recursive: true });
fs.copyFileSync(from('index.html'), to('index.html'));
copyDir(from('assets'), to('assets'));
copyDir(from('src'), to('src'));
console.log('Build web listo en /www');
