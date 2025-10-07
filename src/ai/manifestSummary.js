(function (global) {
  function summarizeManifest(manifestTypes) {
    const types = manifestTypes || (global.NodeManifest && global.NodeManifest.types) || {};
    const out = [];
    Object.keys(types).forEach(type => {
      const t = types[type] || {};
      const defaults = t.defaults || {};
      out.push({
        type,
        name: t.name || type,
        category: t.category || 'Unknown',
        description: (t.description || '').slice(0, 200),
        inputs: typeof t.inputs === 'number' ? t.inputs : 0,
        outputs: typeof t.outputs === 'number' ? t.outputs : 0,
        requiresInput: !!t.requiresInput,
        headerColor: t.headerColor || '#666',
        defaultKeys: Object.keys(defaults),
        defaultTypes: Object.fromEntries(Object.keys(defaults).map(k => [k, typeof defaults[k]])),
        io: t.io || null,
        aiHints: t.aiHints || null
      });
    });
    return out;
  }

  global.ManifestSummary = { summarizeManifest };
})(window);
