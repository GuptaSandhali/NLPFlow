(function (global) {
  const reg = global.NodeRegistry;
  if (!reg) return;

  const defaults = {};
  const schema = [];

  async function execute({ inputData, setExecutionMessage }) {
    if (!inputData) throw new Error('❌ No layers connected! Connect 2 or more image sources for layer fusion.');
    setExecutionMessage && setExecutionMessage('🎨 Advanced layer fusion with transparency support...');
    let layers;
    if (Array.isArray(inputData)) {
      layers = inputData.filter(item => item && item.image);
    } else if (inputData.image) {
      layers = [inputData];
    } else {
      throw new Error('❌ Invalid input data - no valid images found.');
    }
    if (layers.length === 0) throw new Error('❌ No valid image layers to fuse.');

    const fusionCanvas = document.createElement('canvas');
    fusionCanvas.width = 1920; fusionCanvas.height = 1080;
    const fusionCtx = fusionCanvas.getContext('2d');

    let layerIndex = 0;
    for (const layer of layers) {
      try {
        await new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            // If overlay/transparent, draw as-is; else fit preserving aspect ratio
            if (layer.transparent || layer.overlay) {
              fusionCtx.drawImage(img, 0, 0);
            } else {
              const aspectRatio = img.width / img.height;
              let drawX = 0, drawY = 0, drawWidth = fusionCanvas.width, drawHeight = fusionCanvas.height;
              if (img.width / img.height > fusionCanvas.width / fusionCanvas.height) {
                drawWidth = fusionCanvas.width;
                drawHeight = fusionCanvas.width / aspectRatio;
                drawX = 0; drawY = (fusionCanvas.height - drawHeight) / 2;
              } else {
                drawHeight = fusionCanvas.height;
                drawWidth = fusionCanvas.height * aspectRatio;
                drawX = (fusionCanvas.width - drawWidth) / 2; drawY = 0;
              }
              fusionCtx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
            }
            resolve();
          };
          img.onerror = () => reject(new Error('Failed to load layer'));
          img.src = layer.image;
        });
        layerIndex++;
      } catch (e) {
        console.error(`Failed to load layer ${layerIndex + 1}:`, e);
        layerIndex++;
      }
    }

    await new Promise(r => setTimeout(r, 300));
    setExecutionMessage && setExecutionMessage(`✅ Successfully fused ${layers.length} layers!`);
    return {
      image: fusionCanvas.toDataURL('image/png'),
      fused: true,
      type: 'image',
      layers: layers.length,
      transparentLayers: layers.filter(l => l.transparent || l.overlay).length,
      preview: `🎨 ${layers.length} layers fused (${layers.filter(l => l.transparent || l.overlay).length} transparent)`
    };
  }

  reg.register('layerFusion', { defaults, schema, execute });
})(window);

