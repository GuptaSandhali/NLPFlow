(function (global) {
  const reg = global.NodeRegistry;
  if (!reg) return;

  const defaults = { maxSegments: 20 };
  const schema = [
    { key: 'maxSegments', type: 'number', label: 'Max Segments' }
  ];

  function parseSrtTimestamp(ts) {
    // HH:MM:SS,mmm
    const m = String(ts).trim().match(/^(\d\d):(\d\d):(\d\d),(\d{1,3})$/);
    if (!m) return 0;
    const [_, hh, mm, ss, ms] = m;
    return Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms) / 1000;
  }

  function parseSentencesFromText(text) {
    // Expect lines like: "1. [00:00:01,000 → 00:00:03,500] Hello world"
    const lines = String(text || '').split(/\n+/).map(l => l.trim()).filter(Boolean);
    const out = [];
    for (const line of lines) {
      const m = line.match(/^\s*\d+\.?\s*\[(\d\d:\d\d:\d\d,\d{1,3})\s*[^\d]*(\d\d:\d\d:\d\d,\d{1,3})\]\s*(.*)$/);
      if (m) {
        const start = parseSrtTimestamp(m[1]);
        const end = parseSrtTimestamp(m[2]);
        const textPart = (m[3] || '').trim();
        if (end >= start) out.push({ start, end, text: textPart });
      }
    }
    return out;
  }

  function parseIndices(spec) {
    // Accept forms: "2,5,7" or "1-3, 6" or lines with numbers
    const s = String(spec || '').toLowerCase();
    const parts = s.split(/[\n,]+/).map(p => p.trim()).filter(Boolean);
    const idx = new Set();
    for (const p of parts) {
      const range = p.match(/^(\d+)\s*[-–]\s*(\d+)$/);
      if (range) {
        const a = Number(range[1]);
        const b = Number(range[2]);
        const lo = Math.min(a, b), hi = Math.max(a, b);
        for (let i = lo; i <= hi; i++) idx.add(i);
        continue;
      }
      const m = p.match(/^(\d+)$/);
      if (m) idx.add(Number(m[1]));
    }
    // As a fallback, collect all bare numbers in the text
    if (idx.size === 0) {
      for (const m of s.matchAll(/\b(\d+)\b/g)) idx.add(Number(m[1]));
    }
    return Array.from(idx).filter(n => Number.isFinite(n) && n > 0).sort((a,b)=>a-b);
  }

  async function execute({ inputData, params, setExecutionMessage }) {
    if (!Array.isArray(inputData)) {
      throw new Error('❌ Segments Select requires two inputs: indices text and transcript text.');
    }
    const maxSegments = Math.max(1, Math.min(500, parseInt(params?.maxSegments || 20)));

    const texts = inputData.filter(i => i && i.type === 'text');
    if (texts.length < 2) {
      throw new Error('❌ Connect transcript and selection text.');
    }

    // Try to locate transcript with sentences[]
    let transcript = texts.find(t => Array.isArray(t.sentences) && t.sentences.length > 0);
    const otherText = texts.find(t => t !== transcript);
    // If not found, parse from either text input
    let sentences = transcript?.sentences;
    if (!sentences || sentences.length === 0) {
      const a = parseSentencesFromText(texts[0]?.text || '');
      const b = parseSentencesFromText(texts[1]?.text || '');
      sentences = a.length ? a : b;
      transcript = a.length ? texts[0] : texts[1];
    }
    if (!sentences || sentences.length === 0) {
      throw new Error('❌ Could not find sentence timestamps. Provide Deepgram Sentences output or lines with [start→end].');
    }

    const selectorText = otherText?.text || texts.find(t => t !== transcript)?.text || '';
    const indices = parseIndices(selectorText);
    if (indices.length === 0) {
      throw new Error('❌ No valid indices found in selection text. Use comma-separated numbers, e.g., 2,5,7');
    }

    const picked = [];
    for (const n of indices) {
      const s = sentences[n - 1];
      if (s && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end >= s.start) {
        picked.push({ start: s.start, end: s.end, text: s.text, idx: n });
      }
      if (picked.length >= maxSegments) break;
    }
    if (picked.length === 0) {
      throw new Error('❌ Indices did not match any sentences. Check numbering.');
    }

    setExecutionMessage && setExecutionMessage(`✂️ Selected ${picked.length} segment(s)`);
    const json = JSON.stringify(picked);
    return {
      type: 'text',
      text: json,
      segments: picked,
      preview: `✂️ ${picked.length} segment(s)`
    };
  }

  reg.register('segmentsSelect', { defaults, schema, execute });
})(window);

