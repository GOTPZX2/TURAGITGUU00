// Server-side proxy for the "TURAGITGUU AI" search feature.
// The browser never sees any API key: the key lives only in the
// OPENROUTER_API_KEY environment variable set on Vercel.
//
// Strategy: single call to one free OpenRouter model (OpenAI's
// open-weight gpt-oss model — the free GPT option on OpenRouter),
// with one free-model fallback in case the primary gets rate
// limited or delisted. Still just one serverless function.
// No parallel calls, no synthesis step — kept as lean as possible.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Try this model first; if it fails, fall back to the next one.
const MODELS = [
  'openai/gpt-oss-20b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
];

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
    let finalText = '';
    let lastErr;
    for (const model of MODELS) {
      try {
        finalText = await callOpenRouter(apiKey, model, system, userText);
        if (finalText && finalText.trim()) break;
      } catch (err) {
        lastErr = err;
        console.error(`Model ${model} failed, trying next fallback`, err);
      }
    }
    if (!finalText || !finalText.trim()) {
      throw lastErr || new Error('All models failed');
    }

    // Keep the same response shape the front-end already expects
    // (an array of Anthropic-style content blocks).
    res.status(200).json({ content: [{ type: 'text', text: finalText }] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
};
