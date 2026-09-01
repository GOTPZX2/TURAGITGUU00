const { neon } = require('@neondatabase/serverless');

// DATABASE_URL is set as an Environment Variable in the Vercel project settings.
// Never hardcode the connection string in source files.
const sql = neon(process.env.DATABASE_URL);

module.exports = { sql };
