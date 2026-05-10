#!/usr/bin/env node
/**
 * scripts/generate-config.js
 * Génère public/firebase-config.js à partir de .env.local
 * Usage : node scripts/generate-config.js
 */

const fs   = require('fs');
const path = require('path');

// Charger .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('❌  .env.local introuvable. Copier .env.example → .env.local et remplir les valeurs.');
  process.exit(1);
}

const env = {};
fs.readFileSync(envPath, 'utf8')
  .split('\n')
  .filter(l => l.trim() && !l.startsWith('#'))
  .forEach(l => {
    const [k, ...v] = l.split('=');
    env[k.trim()] = v.join('=').trim();
  });

const required = [
  'FIREBASE_API_KEY', 'FIREBASE_AUTH_DOMAIN', 'FIREBASE_PROJECT_ID',
  'FIREBASE_STORAGE_BUCKET', 'FIREBASE_MESSAGING_SENDER_ID', 'FIREBASE_APP_ID'
];

const missing = required.filter(k => !env[k] || env[k].startsWith('REMPLACER'));
if (missing.length) {
  console.error('❌  Variables manquantes dans .env.local :');
  missing.forEach(k => console.error('   -', k));
  process.exit(1);
}

const config = `/**
 * firebase-config.js  ← GÉNÉRÉ AUTOMATIQUEMENT
 * Ne pas commiter. Généré par : node scripts/generate-config.js
 */
window.FIREBASE_CONFIG = {
  apiKey:            "${env.FIREBASE_API_KEY}",
  authDomain:        "${env.FIREBASE_AUTH_DOMAIN}",
  projectId:         "${env.FIREBASE_PROJECT_ID}",
  storageBucket:     "${env.FIREBASE_STORAGE_BUCKET}",
  messagingSenderId: "${env.FIREBASE_MESSAGING_SENDER_ID}",
  appId:             "${env.FIREBASE_APP_ID}"
};
`;

const out = path.join(__dirname, '..', 'public', 'firebase-config.js');
fs.writeFileSync(out, config);
console.log('✅  public/firebase-config.js généré avec succès.');
