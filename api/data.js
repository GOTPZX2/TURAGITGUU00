const { sql } = require('../lib/db');

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const { username, key } = req.query;
      if (!username || !key) {
        res.status(400).json({ error: 'username and key are required' });
        return;
      }
      const rows = await sql`SELECT value FROM kv_store WHERE username = ${username} AND key = ${key}`;
      if (rows.length === 0) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      res.status(200).json({ key, value: rows[0].value });
      return;
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      const { username, key, value } = body || {};
      if (!username || !key) {
        res.status(400).json({ error: 'username and key are required' });
        return;
      }
      await sql`
        INSERT INTO kv_store (username, key, value, updated_at)
        VALUES (${username}, ${key}, ${JSON.stringify(value)}, now())
        ON CONFLICT (username, key)
        DO UPDATE SET value = ${JSON.stringify(value)}, updated_at = now()
      `;
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'DELETE') {
      const { username, key } = req.query;
      if (!username || !key) {
        res.status(400).json({ error: 'username and key are required' });
        return;
      }
      await sql`DELETE FROM kv_store WHERE username = ${username} AND key = ${key}`;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
};
