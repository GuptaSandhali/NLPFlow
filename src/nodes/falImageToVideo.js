(function (global) {
  const reg = global.NodeRegistry;
  if (!reg) return;
  const defaults = {
    model: 'kling-2.5',
    durationSec: 5,
    fps: 24,
    resolution: '720p',
    aspectRatio: '16:9',
    sourceImageUrl: '',
    sourceAudioUrl: '',
    simulate: false, // Changed to false for easier testing
    endpointOverride: '',
    authScheme: 'key'
  };
  const schema = [
    { key: 'model', type: 'select', label: 'Model', options: ['kling-2.5', 'omnihuman'] },
    { key: 'durationSec', type: 'select', label: 'Duration (sec)', options: [5, 10] },
    { key: 'fps', type: 'number', label: 'FPS' },
    { key: 'resolution', type: 'select', label: 'Resolution', options: ['576p', '720p', '1080p'] },
    { key: 'aspectRatio', type: 'select', label: 'Aspect Ratio', options: ['16:9', '9:16', '1:1'] },
    { key: 'simulate', type: 'checkbox', label: 'Simulate if API unavailable' },
    { key: 'endpointOverride', type: 'text', label: 'Endpoint Override (optional)' },
    { key: 'authScheme', type: 'select', label: 'Auth Scheme', options: ['auto', 'bearer', 'key'] }
  ];
  function pickInputs(inputData) {
    if (!inputData) return {};
    const arr = Array.isArray(inputData) ? inputData : [inputData];
    const image = arr.find(x => x?.type === 'image');
    const audio = arr.find(x => x?.type === 'audio');
    const prompt = arr.find(x => x?.type === 'prompt' || (x?.type === 'text' && x.text));
    return { image, audio, prompt };
  }
  async function execute({ inputData, params, apiKeys, setExecutionMessage }) {
    const { image, audio, prompt } = pickInputs(inputData);
    if (!image) throw new Error(':x: No image input! Connect an Image Input or image-generating node.');
    const model = params?.model || 'kling-2.5';
    const durationSec = (params?.durationSec === 10 || params?.durationSec === '10') ? 10 : 5;
    const fps = Math.max(8, Math.min(60, parseInt(params?.fps || 24)));
    const resolution = params?.resolution || '720p';
    const aspectRatio = params?.aspectRatio || '16:9';
    if (model === 'omnihuman' && !audio) {
      throw new Error(':x: Omnihuman requires an audio input (e.g., from TTS). Connect an audio source.');
    }
    const tryReal = async () => {
      if (!apiKeys?.falai) throw new Error('FalAI key missing');
      const imageUrlOverride = params?.sourceImageUrl && params.sourceImageUrl.trim() !== '' ? params.sourceImageUrl.trim() : null;
      const audioUrlOverride = params?.sourceAudioUrl && params.sourceAudioUrl.trim() !== '' ? params.sourceAudioUrl.trim() : null;
      const imageUrl = imageUrlOverride || image.image || image.url || image.imageData;
      if (!imageUrl) throw new Error('No usable image URL found.');
      const base = (apiKeys?.falProxy || 'https://fal.run').replace(/\/$/, '');
      const queueBase = (apiKeys?.falProxy || 'https://queue.fal.run').replace(/\/$/, '');
      const tryQueueFlow = async ({ endpoint, body, providerLabel }) => {
        const pickHeaders = (scheme) => {
          if (scheme === 'bearer') return [(k) => ({ 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' })];
          if (scheme === 'key') return [(k) => ({ 'Authorization': `Key ${k}`, 'Content-Type': 'application/json' })];
          return [
            (k) => ({ 'Authorization': `Key ${k}`, 'Content-Type': 'application/json' }),
            (k) => ({ 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' })
          ];
        };
        const headerVariants = pickHeaders((params?.authScheme || 'auto').toLowerCase());
        let lastErr = '';
        for (const hv of headerVariants) {
          try {
            // DEBUG: Log what we're sending
            console.log(':mag: DEBUG - Request details:', {
              endpoint,
              bodyPreview: {
                prompt: body.prompt,
                image_url: body.image_url?.substring(0, 100) + '...',
                duration: body.duration,
                allKeys: Object.keys(body)
              }
            });
            setExecutionMessage && setExecutionMessage(`:clapper: Sending request to ${providerLabel}...`);
            const res = await fetch(endpoint, {
              method: 'POST',
              headers: hv(apiKeys.falai),
              body: JSON.stringify({ ...body, logs: true })
            });
            let loc = res.headers.get('location') || res.headers.get('Location') || null;
            if (loc && apiKeys?.falProxy) {
              try {
                const u = new URL(loc);
                loc = `${queueBase}${u.pathname}`;
              } catch (_) {}
            }
            // Fast path 200
            if (res.status === 200) {
              const j = await res.json().catch(() => ({}));
              const v = j?.data?.video_url || j?.video?.url || j?.video_url || j?.url || null;
              if (v) return v;
              lastErr = 'No video URL in 200 response';
              continue;
            }
            // Queue path 202
            if (res.status === 202 || loc) {
              if (!loc) { lastErr = 'Queue accepted but missing Location header'; continue; }
              const statusUrl = `${loc.replace(/\/$/, '')}/status`;
              const resultUrl = `${loc.replace(/\/$/, '')}/result`;
              const maxMs = 300000;
              const begin = Date.now();
              while (Date.now() - begin < maxMs) {
                await new Promise(r => setTimeout(r, 2000));
                const st = await fetch(statusUrl, { headers: hv(apiKeys.falai) });
                if (st.ok) {
                  const sj = await st.json().catch(() => ({}));
                  const status = (sj.status || sj.state || '').toUpperCase();
                  if (Array.isArray(sj.logs)) {
                    sj.logs.map(l => l?.message).filter(Boolean).forEach(msg => {
                      try { setExecutionMessage && setExecutionMessage(`:clapper: ${providerLabel}: ${String(msg).slice(0, 80)}`); } catch (_) {}
                    });
                  }
                  if (['COMPLETE','COMPLETED','SUCCEEDED'].includes(status)) break;
                  if (['FAILED','CANCELLED','ERROR'].includes(status)) { lastErr = `Job ${status}`; break; }
                }
              }
              const rt = await fetch(resultUrl, { headers: hv(apiKeys.falai) });
              if (!rt.ok) {
                const t = await rt.text().catch(() => '');
                lastErr = `Result ${rt.status} ${t.slice(0,160)}`;
                continue;
              }
              const rj = await rt.json().catch(() => ({}));
              const v = rj?.data?.video_url || rj?.video?.url || rj?.video_url || rj?.url || null;
              if (v) return v;
              lastErr = 'No video URL in result';
              continue;
            }
            // Error path - get detailed error message
            const errorText = await res.text().catch(() => '');
            console.error(':x: API Error Response:', {
              status: res.status,
              statusText: res.statusText,
              errorBody: errorText,
              endpoint
            });
            lastErr = `${res.status} ${errorText.slice(0,200)}`;
          } catch (err) {
            console.error(':x: Request failed:', err);
            lastErr = err?.message || 'network error';
            continue;
          }
        }
        throw new Error(lastErr || 'queue flow failed');
      };
      const override = (params?.endpointOverride || '').trim();
      if (model === 'kling-2.5') {
        const path = override || '/fal-ai/kling-video/v2.5-turbo/pro/image-to-video';
        const endpoints = [
          `${queueBase}${path.startsWith('/') ? '' : '/'}${path}`,
          `${base}${path.startsWith('/') ? '' : '/'}${path}`
        ];
        // CRITICAL: Direct HTTP API expects flat structure, NOT nested in "input"
        const body = {
          prompt: (prompt?.prompt || prompt?.text || '').trim() || 'Animate this image',
          image_url: imageUrl,
          duration: String(durationSec)
          // NO aspect_ratio - not supported for image-to-video!
          // negative_prompt and cfg_scale are optional, omitting for now
        };
        console.log(':outbox_tray: Kling 2.5 Request Body:', JSON.stringify(body, null, 2));
        let lastErr = '';
        for (const ep of endpoints) {
          try {
            const videoUrl = await tryQueueFlow({ endpoint: ep, body, providerLabel: 'Kling 2.5 i2v' });
            return { type: 'video', videoUrl, url: videoUrl, model, preview: `:clapper: Kling 2.5 ${resolution} ${durationSec}s` };
          } catch (e) {
            lastErr = e?.message || String(e);
            continue;
          }
        }
        throw new Error(`FAL Kling image→video failed: ${lastErr}`);
      } else {
        // Omnihuman
        const audioUrl = audioUrlOverride || audio?.audioFile || audio?.url || audio?.audioData;
        if (!audioUrl) throw new Error('Omnihuman requires an audio URL. Connect TTS/audio or provide Source Audio URL.');
        const path = override || '/fal-ai/bytedance/omnihuman/v1.5';
        const endpoints = [
          `${queueBase}${path.startsWith('/') ? '' : '/'}${path}`,
          `${base}${path.startsWith('/') ? '' : '/'}${path}`
        ];
        const body = { image_url: imageUrl, audio_url: audioUrl };
        let lastErr = '';
        for (const ep of endpoints) {
          try {
            const videoUrl = await tryQueueFlow({ endpoint: ep, body, providerLabel: 'Omnihuman' });
            return { type: 'video', videoUrl, url: videoUrl, model, preview: `:clapper: Omnihuman ${resolution} ${durationSec}s` };
          } catch (e) {
            lastErr = e?.message || String(e);
            continue;
          }
        }
        throw new Error(`FAL Omnihuman failed: ${lastErr}`);
      }
    };
    try {
      if (!params?.simulate) {
        return await tryReal();
      }
      throw new Error('Simulate enabled');
    } catch (e) {
      setExecutionMessage && setExecutionMessage(':warning: Using simulated video output');
      return {
        type: 'video',
        videoUrl: null,
        model,
        simulated: true,
        preview: `:wrench: Simulated ${model} image→video (${resolution}, ${durationSec}s)`
      };
    }
  }
  reg.register('falImageToVideo', { defaults, schema, execute });
})(window);