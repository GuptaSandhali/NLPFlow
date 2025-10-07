(function (global) {
  const reg = global.NodeRegistry;
  if (!reg) return;

  const defaults = { fileName: 'nlpflow_video', format: 'mp4' };
  const schema = [
    { key: 'fileName', type: 'text', label: 'File Name' },
    { key: 'format', type: 'select', label: 'Format', options: ['mp4', 'webm'] }
  ];

  async function execute({ inputData, params, setExecutionMessage }) {
    if (!inputData) throw new Error('❌ No video input connected! Connect a video source.');
    if (inputData.type !== 'video') throw new Error(`❌ Wrong input type! Expected video, got ${inputData.type}.`);

    const url = inputData.videoUrl || inputData.url || (inputData.video && inputData.video.url) || (inputData.data && inputData.data.video_url);
    if (!url) {
      const sim = inputData.simulated ? ' (node is in Simulate mode)' : '';
      throw new Error(`❌ No video URL to export${sim}. Run the video node with a real API key and disable Simulate.`);
    }

    const fileName = (params?.fileName || 'nlpflow_video').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const ext = (params?.format || 'mp4').toLowerCase();
    const finalName = fileName.endsWith(`.${ext}`) ? fileName : `${fileName}.${ext}`;

    // Prefer a blob download so filename and download attribute are honored across origins.
    // If CORS blocks the fetch, fall back to opening in a new tab.
    try {
      setExecutionMessage && setExecutionMessage('⬇️ Downloading video (preparing file)...');
      const res = await fetch(url, { method: 'GET', mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      let chosen = finalName;
      // If user left default and server strongly indicates type, align extension.
      if (ct.includes('video/webm') && !/\.webm$/i.test(chosen)) chosen = chosen.replace(/\.[a-z0-9]+$/i, '') + '.webm';
      if (ct.includes('video/mp4') && !/\.mp4$/i.test(chosen)) chosen = chosen.replace(/\.[a-z0-9]+$/i, '') + '.mp4';

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = chosen;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke after a tick to ensure the click has consumed it
      setTimeout(() => URL.revokeObjectURL(blobUrl), 250);
      return { type: 'video', exported: true, preview: 'File downloaded' };
    } catch (e) {
      console.warn('Blob download failed or CORS blocked, opening in new tab instead', e);
      try {
        setExecutionMessage && setExecutionMessage('⚠️ Download blocked by CORS. Opening in new tab...');
      } catch (_) {}
      window.open(url, '_blank');
      return { type: 'video', exported: true, preview: 'Opened in new tab' };
    }
  }

  reg.register('videoExport', { defaults, schema, execute });
})(window);
