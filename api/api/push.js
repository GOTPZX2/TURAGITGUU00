const { sql } = require('../lib/db');

// Stores/removes Web Push subscriptions per account, so api/send-reminders.js
// (run on a schedule — see vercel.json) knows which devices to notify.
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      const { username, subscription, tz } = body || {};
      if (!username || !subscription || !subscription.endpoint) {
        res.status(400).json({ error: 'username and subscription are required' });
        return;
      }
      const timezone = typeof tz === 'string' && tz.length < 64 ? tz : 'Asia/Bangkok';
      await sql`
        INSERT INTO push_subscriptions (username, endpoint, subscription, tz, updated_at)
        VALUES (${username}, ${subscription.endpoint}, ${JSON.stringify(subscription)}, ${timezone}, now())
        ON CONFLICT (username, endpoint)
        DO UPDATE SET subscription = ${JSON.stringify(subscription)}, tz = ${timezone}, updated_at = now()
      `;
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'DELETE') {
      const { username, endpoint } = req.query;
      if (!username || !endpoint) {
        res.status(400).json({ error: 'username and endpoint are required' });
        return;
      }
      await sql`DELETE FROM push_subscriptions WHERE username = ${username} AND endpoint = ${endpoint}`;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
};
