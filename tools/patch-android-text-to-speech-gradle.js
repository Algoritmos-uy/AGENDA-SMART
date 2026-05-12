#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

const targetFiles = [
  path.join(
    rootDir,
    'node_modules',
    '@capacitor-community',
    'text-to-speech',
    'android',
    'build.gradle'
  ),
  path.join(
    rootDir,
    'android',
    'capacitor-cordova-android-plugins',
    'build.gradle'
  ),
];

const legacyToken = "getDefaultProguardFile('proguard-android.txt')";
const fixedToken = "getDefaultProguardFile('proguard-android-optimize.txt')";

function patchGradleFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`[patch:t2s-gradle] Omitido (no existe): ${filePath}`);
    return { patched: false, skipped: true };
  }

  const original = fs.readFileSync(filePath, 'utf8');

  if (original.includes(fixedToken)) {
    console.log(`[patch:t2s-gradle] Ya estaba corregido: ${filePath}`);
    return { patched: false, skipped: true };
  }

  if (!original.includes(legacyToken)) {
    console.log(`[patch:t2s-gradle] Sin coincidencia legacy: ${filePath}`);
    return { patched: false, skipped: true };
  }

  const updated = original.split(legacyToken).join(fixedToken);
  fs.writeFileSync(filePath, updated, 'utf8');
  console.log(`[patch:t2s-gradle] Corregido: ${filePath}`);
  return { patched: true, skipped: false };
}

let patchedCount = 0;
for (const file of targetFiles) {
  const result = patchGradleFile(file);
  if (result.patched) patchedCount += 1;
}

if (patchedCount === 0) {
  console.log('[patch:t2s-gradle] No hubo cambios nuevos.');
} else {
  console.log(`[patch:t2s-gradle] Archivos parchados: ${patchedCount}`);
}
