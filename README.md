# ExpiryPro 🗓️

Gestionnaire d'échéances personnelles et professionnelles — cartes cadeaux, documents, impôts, assurances.

**Stack :** HTML/CSS/JS vanilla · Firebase Auth + Firestore · GitHub Actions CI/CD

---

## 🚀 Mise en route rapide

### 1. Cloner le repo

```bash
git clone https://github.com/VOTRE-USER/expirypro.git
cd expirypro
```

### 2. Créer le projet Firebase

1. Aller sur [console.firebase.google.com](https://console.firebase.google.com)
2. **Créer un projet** → nommer `expirypro`
3. Activer **Authentication** → Sign-in method → Email/Password ✓ + Google ✓
4. Activer **Firestore Database** → mode Production → région `europe-west3`
5. Activer **Hosting**

### 3. Configurer les variables d'environnement

Copier `.env.example` → `.env.local` et remplir avec vos clés Firebase :

```bash
cp .env.example .env.local
```

Les clés se trouvent dans : Console Firebase → Paramètres du projet → Vos applications → SDK Firebase.

### 4. Déployer les règles Firestore

```bash
npm install -g firebase-tools
firebase login
firebase use --add   # sélectionner votre projet
firebase deploy --only firestore:rules
firebase deploy --only storage
```

### 5. Déployer l'app

```bash
firebase deploy --only hosting
```

---

## 🔐 Sécurité

### Règles Firestore
Chaque utilisateur ne peut lire/écrire que ses propres données. Les espaces partagés sont contrôlés par les membres enregistrés.

### Codes d'invitation
- Format : `EXP-XXXX-XXXX` (8 caractères aléatoires)
- Usage unique, expiration 7 jours
- Le créateur choisit le rôle : **Lecture** ou **Écriture**
- Stockés dans `/invites/{code}` avec `usedAt`, `usedBy`

---

## 📁 Structure du projet

```
expirypro/
├── public/               ← Frontend (déployé sur Firebase Hosting)
│   ├── index.html        ← App principale (auth gate)
│   ├── app.html          ← App complète (accès post-auth)
│   ├── firebase-config.js← Config Firebase (variables injectées par CI)
│   └── assets/
│       ├── icon.png      ← Votre icône (à ajouter)
│       └── bg.jpg        ← Votre fond (à ajouter)
├── functions/            ← Firebase Cloud Functions
│   ├── index.js          ← Alertes email (SendGrid) + nettoyage invitations
│   └── package.json
├── firestore.rules       ← Règles de sécurité Firestore
├── firestore.indexes.json
├── firebase.json         ← Config déploiement Firebase
├── .env.example          ← Template variables d'environnement
├── .github/
│   └── workflows/
│       └── deploy.yml    ← CI/CD : test → build → deploy sur push main
└── README.md
```

---

## 🔄 CI/CD GitHub Actions

Chaque push sur `main` déclenche automatiquement :
1. Lint + vérification syntaxe JS
2. Injection des secrets Firebase dans `firebase-config.js`
3. Déploiement sur Firebase Hosting

### Secrets GitHub à configurer

Dans **Settings → Secrets → Actions** de votre repo :

| Secret | Valeur |
|--------|--------|
| `FIREBASE_API_KEY` | Clé API Firebase |
| `FIREBASE_AUTH_DOMAIN` | `votre-projet.firebaseapp.com` |
| `FIREBASE_PROJECT_ID` | ID du projet Firebase |
| `FIREBASE_STORAGE_BUCKET` | `votre-projet.appspot.com` |
| `FIREBASE_MESSAGING_SENDER_ID` | Sender ID |
| `FIREBASE_APP_ID` | App ID Firebase |
| `FIREBASE_TOKEN` | Token CI (`firebase login:ci`) |
| `SENDGRID_API_KEY` | Clé API SendGrid (alertes email) |
| `NOTIFICATION_EMAIL` | Email destinataire des alertes |

---

## 📧 Alertes email (optionnel)

Utilise **SendGrid** via Firebase Cloud Functions.
Déclenché automatiquement quand un élément expire ou approche du seuil.

Pour activer :
```bash
firebase functions:config:set sendgrid.key="SG.VOTRE_CLE"
firebase deploy --only functions
```

---

## 🖼️ Ajouter votre icône et fond

Placer vos fichiers dans `public/assets/` :
- `public/assets/icon.png` → icône de l'app (recommandé : 512×512)
- `public/assets/bg.jpg` → image de fond de la page de connexion

Le fichier `public/index.html` (page de connexion) les utilise automatiquement.

