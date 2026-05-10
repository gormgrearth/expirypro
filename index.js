const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const sgMail    = require('@sendgrid/mail');

admin.initializeApp();
const db = admin.firestore();

// ── Config ──────────────────────────────────────────────────────────────────
const SG_KEY    = functions.config().sendgrid?.key || process.env.SENDGRID_API_KEY;
const FROM_MAIL = 'noreply@expirypro.app';
if (SG_KEY) sgMail.setApiKey(SG_KEY);

// ── Helper : envoyer un email ────────────────────────────────────────────────
async function sendMail(to, subject, html) {
  if (!SG_KEY) { console.warn('SendGrid not configured, skipping email'); return; }
  await sgMail.send({ from: FROM_MAIL, to, subject, html });
}

// ── Trigger : alerte quand un item est modifié ────────────────────────────────
// Vérifie si l'expiration est proche et envoie un email
exports.onItemUpdated = functions
  .region('europe-west3')
  .firestore
  .document('workspaces/{wsId}/items/{itemId}')
  .onWrite(async (change, context) => {
    const after = change.after.exists ? change.after.data() : null;
    if (!after) return; // suppression — pas d'alerte

    const { wsId } = context.params;
    const expiry   = after.expiry; // 'YYYY-MM-DD'
    const remind   = after.remind || 30;

    if (!expiry) return;

    const today     = new Date(); today.setHours(0,0,0,0);
    const expiryDate = new Date(expiry); expiryDate.setHours(0,0,0,0);
    const daysLeft  = Math.round((expiryDate - today) / 86400000);

    // Envoyer alerte uniquement aux seuils exacts
    if (![0, 7, remind].includes(daysLeft)) return;

    // Récupérer le workspace pour obtenir les emails membres
    const membersSnap = await db
      .collection(`workspaces/${wsId}/members`)
      .where('notificationsEnabled', '==', true)
      .get();

    const emails = [];
    for (const doc of membersSnap.docs) {
      const { email } = doc.data();
      if (email) emails.push(email);
    }

    if (!emails.length) return;

    const label = daysLeft === 0 ? "expire <strong>aujourd'hui</strong>"
                : daysLeft === 1 ? "expire <strong>demain</strong>"
                : `expire dans <strong>${daysLeft} jours</strong>`;

    const html = `
      <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto">
        <div style="background:#2563EB;color:white;padding:20px 24px;border-radius:10px 10px 0 0">
          <h1 style="margin:0;font-size:18px">⏰ ExpiryPro — Alerte échéance</h1>
        </div>
        <div style="background:#fff;border:1px solid #DDE0E8;padding:24px;border-radius:0 0 10px 10px">
          <p style="font-size:15px;color:#0C1226">L'élément <strong>${after.name}</strong> ${label}.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">
            <tr><td style="padding:6px 0;color:#8892A8">Catégorie</td><td style="font-weight:500">${after.cat}</td></tr>
            <tr><td style="padding:6px 0;color:#8892A8">Date d'expiration</td><td style="font-weight:500">${expiry}</td></tr>
            ${after.value > 0 ? `<tr><td style="padding:6px 0;color:#8892A8">Valeur</td><td style="font-weight:500">${after.value} €</td></tr>` : ''}
            ${after.notes ? `<tr><td style="padding:6px 0;color:#8892A8">Notes</td><td>${after.notes}</td></tr>` : ''}
          </table>
          <a href="https://${process.env.GCLOUD_PROJECT}.web.app/app"
             style="display:inline-block;background:#2563EB;color:white;padding:10px 20px;border-radius:7px;text-decoration:none;font-weight:600;font-size:13px">
            Ouvrir ExpiryPro →
          </a>
          <p style="margin-top:20px;font-size:11px;color:#8892A8">
            Vous recevez cet email car les notifications sont activées pour votre compte ExpiryPro.
          </p>
        </div>
      </div>`;

    await Promise.all(emails.map(to =>
      sendMail(to, `⏰ ${after.name} — ${daysLeft === 0 ? 'Expire aujourd\'hui' : `${daysLeft}j restants`}`, html)
    ));

    console.log(`Alert sent for "${after.name}" (${daysLeft}d) to ${emails.join(', ')}`);
  });

// ── Scheduled : nettoyage des invitations expirées ────────────────────────────
// Tourne chaque jour à 2h
exports.cleanExpiredInvites = functions
  .region('europe-west3')
  .pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 jours
    const snap = await db.collection('invites')
      .where('createdAt', '<', cutoff)
      .where('usedAt', '==', null)
      .get();

    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    console.log(`Deleted ${snap.size} expired invites`);
  });

// ── Scheduled : récap mensuel ────────────────────────────────────────────────
exports.monthlyDigest = functions
  .region('europe-west3')
  .pubsub
  .schedule('0 8 1 * *') // 1er du mois à 8h
  .onRun(async () => {
    const today = new Date(); today.setHours(0,0,0,0);
    const in30  = new Date(today); in30.setDate(in30.getDate() + 30);
    const in30Str = in30.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];

    // Pour chaque workspace
    const wsSnap = await db.collection('workspaces').get();
    for (const wsDoc of wsSnap.docs) {
      const wsId = wsDoc.id;

      // Items expirant dans les 30 jours
      const itemsSnap = await db
        .collection(`workspaces/${wsId}/items`)
        .where('expiry', '>=', todayStr)
        .where('expiry', '<=', in30Str)
        .orderBy('expiry')
        .get();

      if (itemsSnap.empty) continue;

      const items = itemsSnap.docs.map(d => d.data());

      // Membres avec notifs activées
      const membersSnap = await db
        .collection(`workspaces/${wsId}/members`)
        .where('monthlyDigest', '==', true)
        .get();

      for (const memberDoc of membersSnap.docs) {
        const { email } = memberDoc.data();
        if (!email) continue;

        const rows = items.map(it => {
          const d = new Date(it.expiry);
          const days = Math.round((d - today) / 86400000);
          return `<tr>
            <td style="padding:6px 8px;border-bottom:1px solid #EEF">${it.name}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #EEF;color:#8892A8">${it.cat}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #EEF;font-weight:600;color:${days<=7?'#DC2626':days<=14?'#D97706':'#16A34A'}">${days}j</td>
            <td style="padding:6px 8px;border-bottom:1px solid #EEF">${it.expiry}</td>
          </tr>`;
        }).join('');

        const html = `
          <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto">
            <div style="background:#2563EB;color:white;padding:20px 24px;border-radius:10px 10px 0 0">
              <h1 style="margin:0;font-size:18px">📅 Récap mensuel ExpiryPro</h1>
              <p style="margin:6px 0 0;opacity:.8;font-size:13px">${items.length} échéance${items.length>1?'s':''} dans les 30 prochains jours</p>
            </div>
            <div style="background:#fff;border:1px solid #DDE0E8;padding:24px;border-radius:0 0 10px 10px">
              <table style="width:100%;border-collapse:collapse;font-size:13px">
                <thead><tr style="background:#F2F4F8">
                  <th style="text-align:left;padding:8px">Élément</th>
                  <th style="text-align:left;padding:8px">Catégorie</th>
                  <th style="text-align:left;padding:8px">Jours</th>
                  <th style="text-align:left;padding:8px">Date</th>
                </tr></thead>
                <tbody>${rows}</tbody>
              </table>
              <a href="https://${process.env.GCLOUD_PROJECT}.web.app/app"
                 style="display:inline-block;margin-top:20px;background:#2563EB;color:white;padding:10px 20px;border-radius:7px;text-decoration:none;font-weight:600;font-size:13px">
                Ouvrir ExpiryPro →
              </a>
            </div>
          </div>`;

        await sendMail(email, `📅 ExpiryPro — ${items.length} échéance${items.length>1?'s':''} ce mois`, html);
      }
    }
  });
