(function (global) {
  const reg = global.NodeRegistry;
  if (!reg) return;

  const defaults = { fileName: 'nlpflow_audio', format: 'wav' };
  const schema = [
    { key: 'fileName', type: 'text', label: 'File Name' },
    { key: 'format', type: 'select', label: 'Format', options: ['wav', 'mp3'] }
  ];

  async function execute({ inputData, params, setExecutionMessage }) {
    if (!inputData) throw new Error('❌ No audio input connected! Connect an audio source.');
    if (inputData.type !== 'audio') throw new Error(`❌ Wrong input type! Expected audio, got ${inputData.type}.`);

    const src = inputData.audioFile || inputData.url;
    if (!src) throw new Error('❌ No audio URL to export. Upstream node may be simulated.');

    const nameRaw = params?.fileName || 'nlpflow_audio';
    const safe = nameRaw.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const ext = (params?.format || 'wav').toLowerCase();
    const finalName = safe.endsWith(`.${ext}`) ? safe : `${safe}.${ext}`;

    try {
      setExecutionMessage && setExecutionMessage('⬇️ Downloading audio...');
      const a = document.createElement('a');
      a.href = src;
      a.download = finalName;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return { type: 'audio', exported: true, preview: 'File downloaded' };
    } catch (e) {
      console.warn('Audio download failed, opening in new tab instead', e);
      window.open(src, '_blank');
      return { type: 'audio', exported: true, preview: 'Opened in new tab' };
    }
  }

  reg.register('audioExport', { defaults, schema, execute });
})(window);

