// Server-side proxy for the "TURAGITGUU AI" search feature.
// The browser never sees any API key: the key lives only in the
// OPENROUTER_API_KEY environment variable set on Vercel.
//
// Strategy: fire the user's question at two different free models on
// OpenRouter in parallel, then ask one of them to synthesize both
// answers into one final, coherent reply. If one model fails, we
// fall back to the other model's answer alone.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Two different free OpenRouter models used for the two parallel drafts.
// Swap these for any other ":free" model slugs from openrouter.ai/models.
const MODEL_A = 'meta-llama/llama-3.3-70b-instruct:free';
const MODEL_B = 'deepseek/deepseek-chat-v3-0324:free';

// Model used for the synthesis step (merging the two drafts).
const SYNTHESIS_MODEL = MODEL_A;

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
    const jobs = [
      callOpenRouter(apiKey, MODEL_A, system, userText).then(text => ({ from: 'A', text })).catch(err => ({ from: 'A', error: err })),
      callOpenRouter(apiKey, MODEL_B, system, userText).then(text => ({ from: 'B', text })).catch(err => ({ from: 'B', error: err })),
    ];

    const results = await Promise.all(jobs);
    const ok = results.filter(r => r.text && r.text.trim());
    results.filter(r => r.error).forEach(r => console.error(`Model ${r.from} failed`, r.error));

    if (ok.length === 0) {
      res.status(502).json({ error: 'Both AI models failed' });
      return;
    }

    let finalText;
    if (ok.length === 1) {
      // Only one model answered — use it directly, no synthesis needed.
      finalText = ok[0].text;
    } else {
      // Both answered — merge them into one coherent answer.
      const synthesisSystem = `${system}\n\nYou will be given two draft answers to the same question from two different AI models. Merge them into a single best final answer: combine complementary details, resolve any contradictions using your best judgment, remove redundancy, and present it as one clean, well-structured answer. Do not mention that there were multiple drafts or name the source models.`;
      const synthesisUser = `User's question: ${userText}\n\n--- Draft answer A ---\n${ok[0].text}\n\n--- Draft answer B ---\n${ok[1].text}\n\nWrite the single merged final answer now.`;
      try {
        finalText = await callOpenRouter(apiKey, SYNTHESIS_MODEL, synthesisSystem, synthesisUser);
      } catch (err) {
        console.error('Synthesis step failed, falling back to the first draft', err);
        finalText = ok[0].text;
      }
    }

    // Keep the same response shape the front-end already expects
    // (an array of Anthropic-style content blocks).
    res.status(200).json({ content: [{ type: 'text', text: finalText }] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
};
