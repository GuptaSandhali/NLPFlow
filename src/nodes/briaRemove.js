(function (global) {
  const reg = global.NodeRegistry;
  if (!reg) return;

  const defaults = {};
  const schema = [];

  async function execute({ inputData, apiKeys, setExecutionMessage }) {
    if (!inputData) throw new Error('❌ No image connected! Connect an image source.');
    if (inputData.type !== 'image') throw new Error(`❌ Wrong input type! Expected image, got ${inputData.type}.`);
    if (!inputData.image) throw new Error('❌ Invalid image data received.');
    if (!apiKeys?.falai) throw new Error('❌ FalAI API key not configured! Please add your FalAI key in API settings.');

    setExecutionMessage && setExecutionMessage('🎨 Removing background with BRIA RMBG 2.0...');
    try {
      const base = (apiKeys?.falProxy || 'https://fal.run').replace(/\/$/, '');
      const endpoint = `${base}/fal-ai/bria/background/remove`;

      // Prefer passing a URL if available; else we will upload via multipart
      const imageUrl = typeof inputData.image === 'string' ? inputData.image : null;

      // Strategy 1: JSON with image_url (works when the source is a URL or data URL and backend accepts it)
      try {
        const jsonBody = { input: { image_url: imageUrl } };
        const res1 = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKeys.falai}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(jsonBody)
        });
        if (res1.ok) {
          const j = await res1.json().catch(() => ({}));
          const outUrl = j?.image || j?.data?.image_url || j?.output?.image_url || j?.image_url || null;
          if (outUrl) {
            return { image: outUrl, transparent: true, type: 'image', preview: '✅ Background removed' };
          }
        }
      } catch (_) {
        // continue to strategy 2
      }

      // Strategy 2: multipart upload of the image blob
      let blob; let mime = 'image/png';
      if (imageUrl && imageUrl.startsWith('data:')) {
        const res = await fetch(imageUrl);
        blob = await res.blob();
        mime = blob.type || mime;
      } else if (imageUrl) {
        const res = await fetch(imageUrl);
        blob = await res.blob();
        mime = blob.type || mime;
      } else {
        throw new Error('No usable image data to upload');
      }

      const form = new FormData();
      form.append('image', blob, `upload.${mime.includes('png') ? 'png' : 'jpg'}`);

      const res2 = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKeys.falai}` },
        body: form
      });
      if (res2.ok) {
        const j = await res2.json().catch(() => ({}));
        const outUrl = j?.image || j?.data?.image_url || j?.output?.image_url || j?.image_url || null;
        if (outUrl) {
          return { image: outUrl, transparent: true, type: 'image', preview: '✅ Background removed' };
        }
      } else {
        const t = await res2.text().catch(() => '');
        console.error('FalAI BRIA HTTP error:', res2.status, t);
        // fall through to local fallback
      }

      // Local fallback (simple heuristic) when remote call fails or returns no URL
      const canvas = document.createElement('canvas');
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          canvas.width = img.width; canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const grayish = (Math.abs(r - g) < 30 && Math.abs(g - b) < 30 && Math.abs(r - b) < 30);
            const bright = (r + g + b > 600);
            const dark = (r + g + b < 150);
            const isBackground = grayish && (bright || dark);
            if (isBackground) data[i + 3] = 0;
          }
          ctx.putImageData(imageData, 0, 0);
          resolve();
        };
        img.onerror = () => reject(new Error('Failed to load image for processing'));
        img.src = imageUrl;
      });

      setExecutionMessage && setExecutionMessage('⚠️ Using local background removal fallback (configure CORS proxy if needed)');
      return { image: canvas.toDataURL('image/png'), transparent: true, type: 'image', preview: '⚠️ Fallback: Background removal' };
    } catch (e) {
      console.error('BRIA background removal error:', e);
      // As a last resort, also attempt local fallback if not already tried
      try {
        const canvas = document.createElement('canvas');
        await new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            canvas.width = img.width; canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
              const r = data[i], g = data[i + 1], b = data[i + 2];
              const grayish = (Math.abs(r - g) < 30 && Math.abs(g - b) < 30 && Math.abs(r - b) < 30);
              const bright = (r + g + b > 600);
              const dark = (r + g + b < 150);
              const isBackground = grayish && (bright || dark);
              if (isBackground) data[i + 3] = 0;
            }
            ctx.putImageData(imageData, 0, 0);
            resolve();
          };
          img.onerror = () => reject(new Error('Failed to load image for processing'));
          img.src = inputData.image;
        });
        setExecutionMessage && setExecutionMessage('⚠️ Local fallback applied (Fal API failed)');
        return { image: canvas.toDataURL('image/png'), transparent: true, type: 'image', preview: '⚠️ Fallback: Background removal' };
      } catch (_) {
        throw e;
      }
    }
  }

  reg.register('briaRemove', { defaults, schema, execute });
})(window);
