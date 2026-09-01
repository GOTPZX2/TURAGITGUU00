const webpush = require('web-push');
const { sql } = require('../lib/db');

// One-time VAPID setup. VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY must match the
// public key hardcoded in index.html's VAPID_PUBLIC_KEY constant — see README.
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

function partsInTz(date, timeZone) {
  // Returns { dateStr: 'YYYY-MM-DD', hh, mm } for `date` rendered in `timeZone`.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = {};
  fmt.formatToParts(date).forEach(p => { parts[p.type] = p.value; });
  return {
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    hh: Number(parts.hour === '24' ? '0' : parts.hour),
    mm: Number(parts.minute),
  };
}

function minutesUntil(dateStr, timeStr, nowParts) {
  if (dateStr !== nowParts.dateStr) return dateStr > nowParts.dateStr ? 99999 : -99999;
  if (!timeStr) return 0; // all-day item counts as "now"
  const [h, m] = timeStr.split(':').map(Number);
  return (h * 60 + m) - (nowParts.hh * 60 + nowParts.mm);
}

async function getUserData(username) {
  const rows = await sql`
    SELECT key, value FROM kv_store
    WHERE username = ${username} AND key = ANY(${['nova:settings', 'nova:events', 'nova:subjects', 'nova:notes', 'push:notified']})
  `;
  const byKey = {};
  rows.forEach(r => { byKey[r.key] = r.value; });
  return {
    settings: byKey['nova:settings'] || {},
    events: byKey['nova:events'] || [],
    subjects: byKey['nova:subjects'] || [],
    notes: byKey['nova:notes'] || [],
    notified: byKey['push:notified'] || { date: '', keys: [] },
  };
}

async function saveNotified(username, notified) {
  await sql`
    INSERT INTO kv_store (username, key, value, updated_at)
    VALUES (${username}, 'push:notified', ${JSON.stringify(notified)}, now())
    ON CONFLICT (username, key) DO UPDATE SET value = ${JSON.stringify(notified)}, updated_at = now()
  `;
}

module.exports = async (req, res) => {
  // Protect the endpoint: Vercel Cron calls this automatically, but it's a
  // public URL, so require a shared secret (?secret=... or Bearer header) to
  // stop strangers from triggering it. Set CRON_SECRET in your Vercel env vars.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers['authorization'];
    const provided = (auth && auth.replace(/^Bearer\s+/i, '')) || req.query.secret;
    if (provided !== secret) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
  }
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    res.status(500).json({ error: 'VAPID keys are not configured on the server' });
    return;
  }

  try {
    const subRows = await sql`SELECT username, endpoint, subscription, tz FROM push_subscriptions`;
    if (subRows.length === 0) {
      res.status(200).json({ ok: true, sent: 0, note: 'no subscriptions yet' });
      return;
    }

    const byUser = {};
    subRows.forEach(r => {
      (byUser[r.username] = byUser[r.username] || []).push(r);
    });

    let sent = 0;
    const now = new Date();

    for (const username of Object.keys(byUser)) {
      const subs = byUser[username];
      const data = await getUserData(username);
      const cfg = data.settings.notifications || {};
      if (!cfg.enabled) continue;
      const lead = cfg.leadMinutes || 10;
      const tz = subs[0].tz || 'Asia/Bangkok';
      const nowParts = partsInTz(now, tz);

      if (data.notified.date !== nowParts.dateStr) data.notified = { date: nowParts.dateStr, keys: [] };
      const notifiedSet = new Set(data.notified.keys);
      const due = []; // { key, title, body }

      (data.events || []).filter(e => !e.done && e.date === nowParts.dateStr).forEach(e => {
        const mins = minutesUntil(e.date, e.time, nowParts);
        const key = 'ev:' + e.id;
        if (mins <= lead && mins >= 0 && !notifiedSet.has(key)) {
          due.push({ key, title: 'TURAGITGUU', body: `${e.kind === 'task' ? '✅' : '📅'} ${e.title} · ${e.time || ''}` });
        }
      });

      const dow = (new Date(now.toLocaleString('en-US', { timeZone: tz })).getDay() + 6) % 7;
      (data.subjects || []).filter(s => s.day === dow).forEach(s => {
        const mins = minutesUntil(nowParts.dateStr, s.start, nowParts);
        const key = 'sj:' + s.id;
        if (mins <= lead && mins >= 0 && !notifiedSet.has(key)) {
          due.push({ key, title: 'TURAGITGUU', body: `📚 ${s.name} · ${s.start || ''}` });
        }
      });

      (data.notes || []).filter(n => n.date === nowParts.dateStr && (n.text || '').trim()).forEach(n => {
        const key = 'nt:' + n.id + ':' + nowParts.dateStr;
        if (!notifiedSet.has(key)) {
          due.push({ key, title: 'TURAGITGUU', body: `📝 ${(n.text || '').trim().slice(0, 60)}` });
        }
      });

      if (due.length === 0) continue;

      for (const item of due) {
        for (const row of subs) {
          try {
            await webpush.sendNotification(row.subscription, JSON.stringify({ title: item.title, body: item.body }));
            sent++;
          } catch (err) {
            if (err.statusCode === 404 || err.statusCode === 410) {
              await sql`DELETE FROM push_subscriptions WHERE username = ${username} AND endpoint = ${row.endpoint}`;
            } else {
              console.error('push send failed for', username, err.statusCode || err.message);
            }
          }
        }
        data.notified.keys.push(item.key);
      }
      await saveNotified(username, data.notified);
    }

    res.status(200).json({ ok: true, sent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
};
