/**
 * firebase-config.js
 * ⚠️ CE FICHIER EST GÉNÉRÉ AUTOMATIQUEMENT PAR LE CI/CD GITHUB ACTIONS.
 *
 * Ne pas commiter ce fichier (il est dans .gitignore).
 * Les valeurs sont injectées depuis les secrets GitHub.
 *
 * Pour le développement local :
 * 1. Copier .env.example → .env.local
 * 2. Remplir avec vos clés Firebase
 * 3. Lancer : node scripts/generate-config.js
 */

// En développement local, remplacer les valeurs ci-dessous
// avec vos vraies clés Firebase (ne pas commiter !)
window.FIREBASE_CONFIG = {
  apiKey:            "REMPLACER_API_KEY",
  authDomain:        "REMPLACER.firebaseapp.com",
  projectId:         "REMPLACER",
  storageBucket:     "REMPLACER.appspot.com",
  messagingSenderId: "REMPLACER",
  appId:             "REMPLACER"
};
