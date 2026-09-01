// Server-side proxy for the "TURAGITGUU AI" search feature.
// The browser never sees any API key: the key lives only in the
// OPENROUTER_API_KEY environment variable set on Vercel.
//
// Strategy: single call to one free OpenRouter model (DeepSeek).
// No parallel calls, no synthesis step — kept as lean as possible.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Single free OpenRouter model used for everything.
const MODEL = 'deepseek/deepseek-chat-v3-0324:free';

async function callOpenRouter(apiKey, model, system, userText) {
  const resp = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      // Optional but recommended by OpenRouter for attribution/analytics.
      'HTTP-Referer': process.env.SITE_URL || 'https://example.com',
      'X-Title': 'TURAGITGUU AI',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userText },
      ],
      max_tokens: 1400,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error('OpenRouter error: ' + JSON.stringify(data));
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY is not set');
    res.status(500).json({ error: 'AI is not configured on the server' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { system, messages } = body || {};

  if (!system || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'system and messages are required' });
    return;
  }
  const userText = messages[messages.length - 1].content || '';

  try {
    const finalText = await callOpenRouter(apiKey, MODEL, system, userText);

    // Keep the same response shape the front-end already expects
    // (an array of Anthropic-style content blocks).
    res.status(200).json({ content: [{ type: 'text', text: finalText }] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
};
