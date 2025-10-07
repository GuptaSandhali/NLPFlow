(function (global) {
  const reg = global.NodeRegistry;
  if (!reg) return;

  const defaults = { width: 1920, height: 1080, format: 'png', quality: 95 };
  const schema = [];

  async function execute({ params, inputData, setExecutionMessage }) {
    if (!inputData) throw new Error('❌ No image connected! Connect an image source to export.');
    if (inputData.type !== 'image') throw new Error(`❌ Wrong input type! Expected image, got ${inputData.type}.`);
    if (!inputData.image) throw new Error('❌ Invalid image data for export.');

    setExecutionMessage && setExecutionMessage('💾 Exporting thumbnail...');
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = params.width || 1920;
    exportCanvas.height = params.height || 1080;
    const exportCtx = exportCanvas.getContext('2d');
    const img = new Image();
    img.src = inputData.image;
    await new Promise(resolve => img.onload = resolve);
    exportCtx.drawImage(img, 0, 0, exportCanvas.width, exportCanvas.height);

    exportCanvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `thumbnail-${Date.now()}.${params.format || 'png'}`;
      a.click();
      URL.revokeObjectURL(url);
    }, `image/${params.format || 'png'}`, (params.quality || 95) / 100);

    await new Promise(r => setTimeout(r, 200));
    return { exported: true, downloadComplete: true, type: 'export', preview: 'File downloaded' };
  }

  reg.register('export', { defaults, schema, execute });
})(window);

