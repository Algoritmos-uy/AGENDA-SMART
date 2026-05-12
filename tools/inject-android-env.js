const fs = require('fs');
const path = require('path');

function parseDotEnv(content = '') {
  const out = {};
  String(content)
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) return;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();

      // quita comillas si existen
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    });
  return out;
}

function jsEscape(str = '') {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

(function run() {
  const root = process.cwd();
  const envPath = path.join(root, '.env');
  const wwwDir = path.join(root, 'www');
  const outFile = path.join(wwwDir, 'env.js');

  const envRaw = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const env = parseDotEnv(envRaw);

  const deepseek = env.DEEPSEEK_API_KEY || '';
  const content = `;(function () {
  window.__AGENDAIA_ENV__ = window.__AGENDAIA_ENV__ || {};
  window.__AGENDAIA_ENV__.DEEPSEEK_API_KEY = '${jsEscape(deepseek)}';
})();\n`;

  if (!fs.existsSync(wwwDir)) {
    fs.mkdirSync(wwwDir, { recursive: true });
  }

  fs.writeFileSync(outFile, content, 'utf8');
  console.log('[inject-android-env] OK -> www/env.js');
})();