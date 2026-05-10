/**
 * firebase-service.js
 * Couche d'abstraction Firebase pour ExpiryPro.
 * Gère : Auth, Firestore (items + settings), invitations, sync temps réel.
 *
 * Importé par app.html via <script type="module">.
 */

import { initializeApp }                            from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut,
         GoogleAuthProvider, signInWithPopup }       from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, collection, doc,
         onSnapshot, setDoc, addDoc, updateDoc,
         deleteDoc, getDoc, getDocs, query,
         orderBy, serverTimestamp, writeBatch,
         where }                                     from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ── Init ────────────────────────────────────────────────────────────────────
const app  = initializeApp(window.FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

let _currentUser     = null;
let _workspaceId     = null;   // workspace actif
let _unsubscribeItems = null;  // listener temps réel

// ── Auth state ──────────────────────────────────────────────────────────────
export function onAuth(callback) {
  onAuthStateChanged(auth, async user => {
    _currentUser = user;
    if (user) {
      // Déterminer le workspaceId actif (perso ou partagé)
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      _workspaceId = userDoc.exists() && userDoc.data().activeWorkspaceId
        ? userDoc.data().activeWorkspaceId
        : user.uid; // fallback = espace perso (uid = wsId)
    }
    callback(user, _workspaceId);
  });
}

export async function logout() {
  if (_unsubscribeItems) _unsubscribeItems();
  await signOut(auth);
}

export function getCurrentUser() { return _currentUser; }
export function getWorkspaceId()  { return _workspaceId; }

// ── Items — écoute temps réel ───────────────────────────────────────────────
export function subscribeItems(callback) {
  if (_unsubscribeItems) _unsubscribeItems();
  const q = query(
    collection(db, `workspaces/${_workspaceId}/items`),
    orderBy('expiry', 'asc')
  );
  _unsubscribeItems = onSnapshot(q, snap => {
    const items = snap.docs.map(d => ({ ...d.data(), _id: d.id }));
    callback(items);
  });
  return () => { if (_unsubscribeItems) _unsubscribeItems(); };
}

// ── Items — CRUD ────────────────────────────────────────────────────────────
export async function addItem(data) {
  const ref = await addDoc(
    collection(db, `workspaces/${_workspaceId}/items`),
    {
      ...data,
      createdBy: _currentUser.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      history: [{ text: 'Créé', time: new Date().toISOString(), by: _currentUser.email }],
    }
  );
  return ref.id;
}

export async function updateItem(id, data) {
  const ref  = doc(db, `workspaces/${_workspaceId}/items`, id);
  const snap = await getDoc(ref);
  const prev = snap.exists() ? snap.data() : {};
  const history = prev.history || [];
  history.push({ text: 'Modifié', time: new Date().toISOString(), by: _currentUser?.email || '' });
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp(), history });
}

export async function deleteItem(id) {
  await deleteDoc(doc(db, `workspaces/${_workspaceId}/items`, id));
}

export async function renewItem(id, newExpiry) {
  const ref  = doc(db, `workspaces/${_workspaceId}/items`, id);
  const snap = await getDoc(ref);
  const prev = snap.exists() ? snap.data() : {};
  const history = prev.history || [];
  history.push({
    text: `Renouvelé : ${prev.expiry} → ${newExpiry}`,
    time: new Date().toISOString(),
    by: _currentUser?.email || ''
  });
  await updateDoc(ref, {
    expiry: newExpiry,
    issued: new Date().toISOString().split('T')[0],
    updatedAt: serverTimestamp(),
    history,
  });
}

// ── Settings (deadlines enabled, preferences) ──────────────────────────────
export async function getSettings() {
  const ref  = doc(db, `workspaces/${_workspaceId}/settings/main`);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : {};
}

export async function saveSettings(data) {
  await setDoc(
    doc(db, `workspaces/${_workspaceId}/settings/main`),
    { ...data, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

// ── Workspace ──────────────────────────────────────────────────────────────
export async function getWorkspaceInfo() {
  const ref = doc(db, 'workspaces', _workspaceId);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getMembers() {
  const snap = await getDocs(collection(db, `workspaces/${_workspaceId}/members`));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

export async function removeMember(uid) {
  await deleteDoc(doc(db, `workspaces/${_workspaceId}/members`, uid));
}

export async function switchWorkspace(wsId) {
  _workspaceId = wsId;
  await setDoc(doc(db, 'users', _currentUser.uid), { activeWorkspaceId: wsId }, { merge: true });
}

// ── Invitations ─────────────────────────────────────────────────────────────
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg   = n => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `EXP-${seg(4)}-${seg(4)}`;
}

export async function createInvite(role = 'reader') {
  // Vérifier que l'utilisateur est owner ou writer
  const memberRef  = doc(db, `workspaces/${_workspaceId}/members/${_currentUser.uid}`);
  const memberSnap = await getDoc(memberRef);
  if (!memberSnap.exists() || !['owner','writer'].includes(memberSnap.data().role)) {
    throw new Error('Droits insuffisants pour créer une invitation.');
  }

  let code;
  let attempts = 0;
  // S'assurer que le code est unique
  do {
    code = generateCode();
    const existing = await getDoc(doc(db, 'invites', code));
    if (!existing.exists()) break;
    attempts++;
  } while (attempts < 10);

  await setDoc(doc(db, 'invites', code), {
    workspaceId: _workspaceId,
    role,
    createdBy: _currentUser.uid,
    createdByEmail: _currentUser.email,
    createdAt: serverTimestamp(),
    usedAt: null,
    usedBy: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return code;
}

export async function getActiveInvites() {
  const q = query(
    collection(db, 'invites'),
    where('workspaceId', '==', _workspaceId),
    where('usedAt', '==', null)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ code: d.id, ...d.data() }));
}

export async function revokeInvite(code) {
  await deleteDoc(doc(db, 'invites', code));
}

// ── Export/Import local ─────────────────────────────────────────────────────
// Les données sont stockées dans Firestore, mais on peut aussi exporter/importer
// un fichier JSON local pour backup ou migration.
export function exportToJSON(items) {
  const data = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), items }, null, 2);
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  a.download = `expirypro-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
}

export async function importFromJSON(jsonString) {
  const { items } = JSON.parse(jsonString);
  if (!Array.isArray(items)) throw new Error('Format invalide');
  const batch = writeBatch(db);
  items.forEach(item => {
    const { _id, id, ...data } = item; // supprimer les IDs locaux
    const ref = doc(collection(db, `workspaces/${_workspaceId}/items`));
    batch.set(ref, { ...data, importedAt: serverTimestamp(), createdBy: _currentUser.uid });
  });
  await batch.commit();
  return items.length;
}
