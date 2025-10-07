(function (global) {
  const reg = global.NodeRegistry;
  if (!reg) return;

  const defaults = { text: 'TEXT', fontSize: 72, color: '#FFFFFF', strokeColor: 'transparent', backgroundColor: 'transparent', positionX: 50, positionY: 50, alignment: 'center' };
  const schema = [];

  async function execute({ params, inputData, setExecutionMessage }) {
    setExecutionMessage && setExecutionMessage('📝 Creating advanced text overlay with positioning...');
    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.width = 1920; overlayCanvas.height = 1080;
    const overlayCtx = overlayCanvas.getContext('2d');

    if (inputData?.image) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = inputData.image;
      await new Promise(resolve => img.onload = resolve);
      overlayCtx.drawImage(img, 0, 0, overlayCanvas.width, overlayCanvas.height);
    } else if (params.backgroundColor && params.backgroundColor !== 'transparent') {
      overlayCtx.fillStyle = params.backgroundColor;
      overlayCtx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    }

    const positionX = (params.positionX ?? 50) / 100;
    const positionY = (params.positionY ?? 50) / 100;
    const textX = overlayCanvas.width * positionX;
    const textY = overlayCanvas.height * positionY;
    overlayCtx.textAlign = params.alignment || 'center';
    overlayCtx.textBaseline = 'middle';
    const fontSize = params.fontSize || 72;
    const textContent = params.text || 'TEXT';
    overlayCtx.font = `bold ${fontSize}px Arial`;
    if (params.strokeColor && params.strokeColor !== 'transparent') {
      overlayCtx.strokeStyle = params.strokeColor;
      overlayCtx.lineWidth = Math.max(fontSize / 15, 2);
      overlayCtx.strokeText(textContent, textX, textY);
    }
    overlayCtx.fillStyle = params.color || '#FFFFFF';
    overlayCtx.fillText(textContent, textX, textY);
    if (inputData?.image) {
      overlayCtx.fillStyle = 'rgba(255, 0, 0, 0.5)';
      overlayCtx.beginPath(); overlayCtx.arc(textX, textY, 4, 0, Math.PI * 2); overlayCtx.fill();
    }
    await new Promise(r => setTimeout(r, 300));
    return {
      image: overlayCanvas.toDataURL('image/png'),
      overlay: true,
      transparent: !inputData?.image && params.backgroundColor === 'transparent',
      type: 'image',
      positionX: Math.round(positionX * 100),
      positionY: Math.round(positionY * 100),
      preview: `"${textContent}" at ${Math.round(positionX * 100)}%, ${Math.round(positionY * 100)}%`
    };
  }

  reg.register('textOverlay', { defaults, schema, execute });
})(window);

