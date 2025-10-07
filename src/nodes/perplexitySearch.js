(function (global) {
  const reg = global.NodeRegistry;
  if (!reg) return;

  const defaults = { perEntity: 2, wikipediaOnly: true };
  const schema = [];

  function parseEntities(inputText) {
    if (!inputText) return [];
    try {
      const asJson = JSON.parse(inputText);
      if (Array.isArray(asJson)) return asJson.map(String).filter(Boolean);
    } catch (_) {}
    // Fallback to split by newlines or commas
    if (inputText.includes('\n')) {
      return inputText.split(/\n+/).map(s => s.trim()).filter(Boolean);
    }
    return inputText.split(/,\s*/).map(s => s.trim()).filter(Boolean);
  }

  function buildUserPrompt(entities, perEntity, wikipediaOnly) {
    const list = entities.map(e => `- ${e}`).join('\n');
    const constraint = wikipediaOnly ? 'Only return Wikipedia pages.' : 'Prefer Wikipedia pages; if not found, return the best authoritative pages.';
    return `Find Wikipedia pages for the following named entities. ${constraint}\n\nEntities:\n${list}\n\nRespond as a newline-separated list where each line is: Title - URL. Do not include extra commentary.`;
  }

  async function execute({ inputData, params, apiKeys, setExecutionMessage }) {
    if (!inputData || inputData.type !== 'text' || !inputData.text) {
      throw new Error('❌ PerplexitySearch expects text input containing entities.');
    }
    const key = apiKeys && apiKeys.perplexity;
    if (!key) throw new Error('❌ Perplexity API key not configured! Add it in API settings.');

    const entities = parseEntities(inputData.text);
    if (entities.length === 0) throw new Error('❌ No entities parsed from input.');

    const perEntity = params?.perEntity ?? defaults.perEntity;
    const wikipediaOnly = params?.wikipediaOnly ?? defaults.wikipediaOnly;

    setExecutionMessage && setExecutionMessage('🔎 Searching Perplexity for Wikipedia pages...');

    const base = (apiKeys && apiKeys.perplexityProxy) || 'https://api.perplexity.ai';
    const url = `${base.replace(/\/$/, '')}/chat/completions`;

    const system = `You are a knowledgeable assistant. Return concise, accurate results. For each entity, return up to ${perEntity} matches.`;
    const user = buildUserPrompt(entities, perEntity, wikipediaOnly);

    // Attempt with multiple model candidates to avoid model errors
    const candidates = Array.from(new Set([
      params?.model,
      'sonar-small',
      'sonar-small-online',
      'sonar',
      'pplx-7b-online',
      'pplx-70b-online'
    ].filter(Boolean)));

    let data = null;
    let lastErr = '';
    for (const model of candidates) {
      const body = {
        model,
        temperature: 0.2,
        max_tokens: 600,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      };

      let res;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });
      } catch (err) {
        throw new Error('Network/CORS error calling Perplexity. Set API Settings → Perplexity Proxy URL to a CORS-enabled proxy.');
      }

      if (res.ok) {
        data = await res.json();
        break;
      } else {
        let t = '';
        try { t = await res.text(); } catch (_) {}
        lastErr = `${res.status} ${t.slice(0, 200)}`;
        const msg = (t || '').toLowerCase();
        // Continue trying other models if this looks like a model selection issue
        if (res.status === 400 || res.status === 404 || res.status === 422) {
          if (msg.includes('model') || msg.includes('not found') || msg.includes('invalid')) {
            continue;
          }
        }
        // Other errors: stop early
        throw new Error(`Perplexity API failed: ${lastErr}`);
      }
    }
    if (!data) {
      throw new Error(`Perplexity API failed (model negotiation): ${lastErr || 'no response'}`);
    }
    let text = '';
    try {
      text = data.choices?.[0]?.message?.content?.trim() || '';
    } catch (_) {}
    if (!text) throw new Error('Empty response from Perplexity.');

    // Normalize: ensure newline-separated list; strip any leading formatting
    const lines = text
      .split(/\r?\n/)
      .map(s => s.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean);
    const out = lines.join('\n');

    setExecutionMessage && setExecutionMessage('✅ Perplexity results ready');
    return { type: 'text', text: out, preview: lines.slice(0, 2).join(' | ') };
  }

  reg.register('perplexitySearch', { defaults, schema, execute });
})(window);
