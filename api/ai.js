// Server-side proxy for the "TURAGITGUU AI" search feature.
// The browser never sees any API key: keys live only in the
// GROQ_API_KEY and MISTRAL_API_KEY environment variables set on Vercel.
//
// Strategy: fire the user's question at Groq and Mistral's free-tier
// chat APIs in parallel, then ask Groq (fast) to synthesize both
// answers into one final, coherent reply. If one provider fails, we
// fall back to the other provider's answer alone.

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const MISTRAL_MODEL = 'mistral-large-latest';

async function callGroq(apiKey, system, userText) {
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userText },
      ],
      max_tokens: 1400,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error('Groq error: ' + JSON.stringify(data));
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
}

async function callMistral(apiKey, system, userText) {
  const resp = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MISTRAL_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userText },
      ],
      max_tokens: 1400,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error('Mistral error: ' + JSON.stringify(data));
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const groqKey = process.env.GROQ_API_KEY;
  const mistralKey = process.env.MISTRAL_API_KEY;
  if (!groqKey && !mistralKey) {
    console.error('Neither GROQ_API_KEY nor MISTRAL_API_KEY is set');
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
    const jobs = [];
    if (groqKey) jobs.push(callGroq(groqKey, system, userText).then(text => ({ from: 'Groq', text })).catch(err => ({ from: 'Groq', error: err })));
    if (mistralKey) jobs.push(callMistral(mistralKey, system, userText).then(text => ({ from: 'Mistral', text })).catch(err => ({ from: 'Mistral', error: err })));

    const results = await Promise.all(jobs);
    const ok = results.filter(r => r.text && r.text.trim());
    results.filter(r => r.error).forEach(r => console.error(`${r.from} failed`, r.error));

    if (ok.length === 0) {
      res.status(502).json({ error: 'Both AI providers failed' });
      return;
    }

    let finalText;
    if (ok.length === 1) {
      // Only one provider answered — use it directly, no synthesis needed.
      finalText = ok[0].text;
    } else {
      // Both answered — ask Groq to merge them into one coherent answer.
      const synthesisSystem = `${system}\n\nYou will be given two draft answers to the same question from two different AI models. Merge them into a single best final answer: combine complementary details, resolve any contradictions using your best judgment, remove redundancy, and present it as one clean, well-structured answer. Do not mention that there were multiple drafts or name the source models.`;
      const synthesisUser = `User's question: ${userText}\n\n--- Draft answer A (${ok[0].from}) ---\n${ok[0].text}\n\n--- Draft answer B (${ok[1].from}) ---\n${ok[1].text}\n\nWrite the single merged final answer now.`;
      try {
        finalText = groqKey
          ? await callGroq(groqKey, synthesisSystem, synthesisUser)
          : await callMistral(mistralKey, synthesisSystem, synthesisUser);
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
