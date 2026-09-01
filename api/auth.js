const { sql } = require('../lib/db');
const { hashPassword, verifyPassword } = require('../lib/password');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { action, username, password } = body || {};

  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'username and password are required' });
    return;
  }

  try {
    if (action === 'register') {
      if (username.length < 3) {
        res.status(400).json({ error: 'username too short' });
        return;
      }
      if (password.length < 4) {
        res.status(400).json({ error: 'password too short' });
        return;
      }
      const existing = await sql`SELECT username FROM accounts WHERE username = ${username}`;
      if (existing.length > 0) {
        res.status(409).json({ error: 'username already exists' });
        return;
      }
      const passwordHash = hashPassword(password);
      await sql`INSERT INTO accounts (username, password_hash) VALUES (${username}, ${passwordHash})`;
      res.status(200).json({ ok: true, username });
      return;
    }

    if (action === 'login') {
      const rows = await sql`SELECT password_hash FROM accounts WHERE username = ${username}`;
      if (rows.length === 0 || !verifyPassword(password, rows[0].password_hash)) {
        res.status(401).json({ error: 'invalid username or password' });
        return;
      }
      res.status(200).json({ ok: true, username });
      return;
    }

    res.status(400).json({ error: 'unknown action' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
};
