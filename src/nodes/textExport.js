(function (global) {
  const reg = global.NodeRegistry;
  if (!reg) return;

  const defaults = { fileName: 'nlpflow_text', format: 'txt', pretty: true };
  const schema = [
    { key: 'fileName', type: 'text', label: 'File Name' },
    { key: 'format', type: 'select', label: 'Format', options: ['txt', 'json'] },
    { key: 'pretty', type: 'checkbox', label: 'Pretty-print JSON' }
  ];

  function downloadBlob(content, mime, fileName) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function execute({ inputData, params, setExecutionMessage }) {
    if (!inputData) throw new Error('❌ No text input connected! Connect a text source.');
    if (inputData.type !== 'text') throw new Error(`❌ Wrong input type! Expected text, got ${inputData.type}.`);
    const text = inputData.text || '';
    if (!text) throw new Error('❌ No text content to export.');

    const nameRaw = params?.fileName || 'nlpflow_text';
    const safe = nameRaw.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const fmt = (params?.format || 'txt').toLowerCase();

    setExecutionMessage && setExecutionMessage('⬇️ Preparing text for download...');
    if (fmt === 'json') {
      const payload = { text };
      const content = params?.pretty ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
      const fileName = safe.endsWith('.json') ? safe : `${safe}.json`;
      downloadBlob(content, 'application/json', fileName);
    } else {
      const fileName = safe.endsWith('.txt') ? safe : `${safe}.txt`;
      downloadBlob(text, 'text/plain', fileName);
    }

    return { type: 'text', exported: true, preview: 'File downloaded' };
  }

  reg.register('textExport', { defaults, schema, execute });
})(window);

