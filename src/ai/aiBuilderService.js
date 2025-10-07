(function (global) {
  const DEFAULT_MODEL = 'sonar-small';
  const FALLBACK_MODELS = ['sonar-small', 'sonar-medium', 'sonar'];
  const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini';
  const OPENAI_FALLBACK_MODELS = ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4o'];

  function buildPrompt({ intent, manifestSummary, currentGraph }) {
    const manifestPart = JSON.stringify(manifestSummary);
    const currentPart = currentGraph ? JSON.stringify(currentGraph).slice(0, 8000) : '';

    const system = `You are an expert workflow planner for a node-based app. You must only use node types that appear in the provided manifest summary.
If a needed capability is missing, propose it in 'proposedNodes' and mark any such nodes as placeholders in the graph.
Strictly enforce:
- Type compatibility: each edge's source outputType must be allowed by the target's io.inputTypes[].kind.
- Input arity: satisfy io.inputMode and any required counts (use io.minInputs and non-optional inputTypes). For single, provide exactly one input; for multi, provide all required inputs; for variadic, provide at least minInputs.
- Reachability: include at least one complete path from a source to a sink (Output node or a node with outputs === 0).
Edges may optionally include a 'slot' integer when the target has ordered inputs (e.g., multi input with roles). Use slot starting at 0 to indicate the target input position.
Prefer nodes whose aiHints.whenToUse and preconditions fit the intent. Always output JSON only, matching the contract exactly.`;

    const user = [
      `User intent: ${intent}`,
      `Manifest summary (compact): ${manifestPart}`,
      currentGraph ? `Current graph (optional): ${currentPart}` : null,
      `Output JSON contract strictly:
{
  "nodes": [ {"id": string, "type": string, "label"?: string, "params"?: object } ],
  "edges": [ {"from": string, "to": string, "slot"?: number} ],
  "proposedNodes"?: [ { "type": string, "name": string, "category": string, "description": string, "inputs": number, "outputs": number, "params"?: object, "defaults"?: object } ],
  "alternatives"?: [ { "forType": string, "description": string, "nodes": [...], "edges": [...] } ],
  "notes"?: string
}
Rules:
- Use only manifest types in nodes. If a required type is missing, include it in proposedNodes and also include a node using that type but tag it as a placeholder by adding params: { placeholder: true }.
- Prefer minimal viable graphs that reach an Output node when possible.
- Node ids should be unique, human-readable (e.g., 'prompt1', 'overlay1').
- Edges use only node ids; optionally include numeric input slot when the target has ordered inputs (start at 0).
- Honor io.inputTypes/outputType for compatibility (e.g., text→image); satisfy aiHints.preconditions where possible and choose nodes per aiHints.whenToUse.
- Ensure io.inputMode and minInputs/non-optional inputs are satisfied per node.
`
    ].filter(Boolean).join('\n\n');

    return { system, user };
  }

  async function callPerplexity({ apiKey, proxyBase, model, messages }) {
    const url = `${(proxyBase || 'https://api.perplexity.ai').replace(/\/$/, '')}/chat/completions`;
    const body = {
      model: model || DEFAULT_MODEL,
      messages: [
        { role: 'system', content: messages.system },
        { role: 'user', content: messages.user }
      ],
      temperature: 0.2,
      max_tokens: 1200,
      stream: false
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const snippet = (text || '').slice(0, 200);
      throw new Error(`Perplexity HTTP ${res.status}${snippet ? ` - ${snippet}` : ''}`);
    }
    const json = await res.json();
    const content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    return content || '';
  }

  async function callOpenAI({ apiKey, proxyBase, model, messages }) {
    const url = `${(proxyBase || 'https://api.openai.com').replace(/\/$/, '')}/v1/chat/completions`;
    const body = {
      model: model || OPENAI_DEFAULT_MODEL,
      messages: [
        { role: 'system', content: messages.system },
        { role: 'user', content: messages.user }
      ],
      temperature: 0.2,
      max_tokens: 1200,
      response_format: { type: 'json_object' }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const snippet = (text || '').slice(0, 200);
      throw new Error(`OpenAI HTTP ${res.status}${snippet ? ` - ${snippet}` : ''}`);
    }
    const json = await res.json();
    const content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    return content || '';
  }

  function extractJson(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch (_) {}
    // Fallback: extract first {...} block
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const slice = text.slice(start, end + 1);
      try { return JSON.parse(slice); } catch (_) {}
    }
    return null;
  }

  async function generateGraph({ intent, manifestSummary, currentGraph, apiKeys, provider }) {
    const messages = buildPrompt({ intent, manifestSummary, currentGraph });

    const wantOpenAI = provider === 'openai';
    const wantPerplexity = provider === 'perplexity' || !provider;

    // Helper to run a model family with fallbacks
    const tryFamily = async (family) => {
      let lastErr = null;
      for (const m of family.models) {
        try {
          const raw = await family.call({ model: m });
          const parsed = extractJson(raw);
          if (!parsed) throw new Error('Invalid JSON from model');
          // Sanitize/alias legacy types
          let aliasCount = 0;
          if (Array.isArray(parsed.nodes)) {
            parsed.nodes.forEach(n => {
              if (n && typeof n.type === 'string' && n.type === 'promptInput') {
                n.type = 'textInput';
                aliasCount++;
              }
            });
          }
          const notesExtra = aliasCount ? `Aliased ${aliasCount} promptInput -> textInput.` : '';
          return {
            graph: { nodes: parsed.nodes || [], edges: parsed.edges || [] },
            raw,
            model: m,
            proposedNodes: parsed.proposedNodes || [],
            alternatives: parsed.alternatives || [],
            notes: [parsed.notes || '', notesExtra].filter(Boolean).join(' ').trim()
          };
        } catch (e) {
          lastErr = e;
          continue;
        }
      }
      throw lastErr || new Error('All model attempts failed');
    };

    // Build families
    const families = [];
    if (wantOpenAI && apiKeys && apiKeys.openai) {
      families.push({
        name: 'openai',
        models: [apiKeys.model || OPENAI_DEFAULT_MODEL, ...OPENAI_FALLBACK_MODELS],
        call: async ({ model, messages: m }) => callOpenAI({ apiKey: apiKeys.openai, proxyBase: apiKeys.openaiProxy, model, messages: m || messages })
      });
    }
    if (wantPerplexity && apiKeys && apiKeys.perplexity) {
      families.push({
        name: 'perplexity',
        models: [apiKeys.model || DEFAULT_MODEL, ...FALLBACK_MODELS],
        call: async ({ model, messages: m }) => callPerplexity({ apiKey: apiKeys.perplexity, proxyBase: apiKeys.perplexityProxy, model, messages: m || messages })
      });
    }

    if (families.length === 0) {
      const heuristic = heuristicGraph(intent, manifestSummary);
      const why = wantOpenAI ? 'No OpenAI key' : 'No Perplexity key';
      return { graph: heuristic, raw: null, model: 'heuristic', proposedNodes: [], alternatives: [], notes: `${why}; returned heuristic plan.` };
    }

    for (const fam of families) {
      try {
        // First attempt
        let out = await tryFamily(fam);

        // Validate and optionally repair once using validator feedback
        try {
          const manifestTypes = (global.NodeManifest && global.NodeManifest.types) || {};
          const v = global.GraphValidator && global.GraphValidator.validateGraph(out.graph, manifestTypes);
          if (v && (!v.ok || (v.errors && v.errors.length))) {
            const errorSummary = (v.errors || []).map(e => `${e.code}: ${e.message}`).slice(0, 10).join('\n');
            const repairUser = [
              'Please correct the previous graph to satisfy all constraints. Return only corrected JSON matching the same contract.',
              `Validation errors:\n${errorSummary}`,
              `Previous graph:\n${JSON.stringify(out.graph).slice(0, 4000)}`
            ].join('\n\n');

            const repairMessages = { system: messages.system, user: [messages.user, repairUser].join('\n\n') };
            const repairedRaw = await fam.call({ model: fam.models[0], messages: repairMessages }).catch(() => null);
            const repairedParsed = extractJson(repairedRaw || '');
            if (repairedParsed && repairedParsed.nodes && repairedParsed.edges) {
              out = {
                ...out,
                graph: { nodes: repairedParsed.nodes, edges: repairedParsed.edges },
                raw: repairedRaw || out.raw,
                notes: [out.notes || '', 'Applied one-shot repair from validator feedback.'].filter(Boolean).join(' ').trim()
              };
            }
          }
        } catch (_) {}

        return out;
      } catch (e) {
        // try next family
        continue;
      }
    }

    const heuristic = heuristicGraph(intent, manifestSummary);
    return { graph: heuristic, raw: null, model: 'heuristic', proposedNodes: [], alternatives: [], notes: `Model call failed; returned heuristic plan.` };
  }

  // Extremely small heuristic for offline/dev preview
  function heuristicGraph(intent, manifestSummary) {
    const types = manifestSummary.map(x => x.type);
    const has = (t) => types.includes(t);
    const g = { nodes: [], edges: [] };

    if (/(image|banner|thumbnail)/i.test(intent) && has('textInput') && has('geminiText2Image') && has('export')) {
      g.nodes.push({ id: 'text1', type: 'textInput', params: { text: intent } });
      g.nodes.push({ id: 'gen1', type: 'geminiText2Image', params: {} });
      g.nodes.push({ id: 'export1', type: 'export', params: {} });
      g.edges.push({ from: 'text1', to: 'gen1' }, { from: 'gen1', to: 'export1' });
      return g;
    }
    if (/(transcribe|audio)/i.test(intent) && has('audioInput') && has('deepgramTranscribe') && has('textDisplay')) {
      g.nodes.push({ id: 'audio1', type: 'audioInput', params: {} });
      g.nodes.push({ id: 'dg1', type: 'deepgramTranscribe', params: {} });
      g.nodes.push({ id: 'view1', type: 'textDisplay', params: {} });
      g.edges.push({ from: 'audio1', to: 'dg1' }, { from: 'dg1', to: 'view1' });
      return g;
    }
    // Default minimal: text to display
    if (has('textInput') && has('textDisplay')) {
      g.nodes.push({ id: 'text1', type: 'textInput', params: { text: intent } });
      g.nodes.push({ id: 'view1', type: 'textDisplay', params: {} });
      g.edges.push({ from: 'text1', to: 'view1' });
      return g;
    }
    return g;
  }

  global.AIBuilderService = { generateGraph };
})(window);
