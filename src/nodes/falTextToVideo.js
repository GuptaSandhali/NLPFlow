(function (global) {
  const reg = global.NodeRegistry;
  if (!reg) return;

  const defaults = { model: 'kling-2.5', durationSec: 5, fps: 24, resolution: '720p', aspectRatio: '16:9', negativePrompt: 'blur, distort, low quality', cfgScale: 0.5, simulate: false, endpointOverride: '', authScheme: 'key' };
  const schema = [
    { key: 'model', type: 'select', label: 'Model', options: ['veo-3', 'kling-2.5'] },
    { key: 'durationSec', type: 'number', label: 'Duration (sec)' },
    { key: 'fps', type: 'number', label: 'FPS' },
    { key: 'resolution', type: 'select', label: 'Resolution', options: ['576p', '720p', '1080p'] },
    { key: 'aspectRatio', type: 'select', label: 'Aspect Ratio', options: ['16:9', '9:16', '1:1'] },
    { key: 'negativePrompt', type: 'text', label: 'Negative Prompt' },
    { key: 'cfgScale', type: 'number', label: 'CFG Scale' },
    { key: 'simulate', type: 'checkbox', label: 'Simulate if API unavailable' },
    { key: 'endpointOverride', type: 'text', label: 'Endpoint Override (optional)' },
    { key: 'authScheme', type: 'select', label: 'Auth Scheme', options: ['auto', 'bearer', 'key'] }
  ];

  async function execute({ inputData, params, apiKeys, setExecutionMessage }) {
    console.log('=== FAL TEXT TO VIDEO DEBUG ===');
    console.log('Raw inputData:', inputData);
    
    // Resolve prompt
    let prompt = '';
    if (Array.isArray(inputData)) {
      const p = inputData.find(x => x?.type === 'prompt' || (x?.type === 'text' && x.text));
      prompt = p?.prompt || p?.text || '';
    } else if (inputData && typeof inputData === 'object') {
      prompt = inputData.prompt || inputData.text || '';
    }
    
    console.log('Extracted prompt:', prompt);
    
    if (!prompt || prompt.trim() === '') {
      throw new Error('❌ No prompt received!\n\nMake sure to:\n1. Connect a Text Input node\n2. Enter text in the Text Input\n3. Execute Text Input node FIRST\n4. Then execute this node');
    }

    const model = params?.model || 'kling-2.5';
    const durationSec = Math.max(1, Math.min(30, parseInt(params?.durationSec || 5)));
    const fps = Math.max(8, Math.min(60, parseInt(params?.fps || 24)));
    const resolution = params?.resolution || '720p';
    const aspectRatio = params?.aspectRatio || '16:9';

    const tryReal = async () => {
      if (!apiKeys?.falai) throw new Error('FalAI key missing');
      setExecutionMessage && setExecutionMessage(`🎬 Generating video with ${model}...`);

      const base = (apiKeys?.falProxy || 'https://fal.run').replace(/\/$/, '');
      const queueBase = (apiKeys?.falProxy || 'https://queue.fal.run').replace(/\/$/, '');

      const tryQueueFlow = async ({ endpoint, body, isQueue, providerLabel }) => {
        console.log('Sending to endpoint:', endpoint);
        console.log('Is queue endpoint:', isQueue);
        console.log('Request body:', JSON.stringify(body, null, 2));
        
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
            const res = await fetch(endpoint, { 
              method: 'POST', 
              headers: hv(apiKeys.falai), 
              body: JSON.stringify(body)
            });
            
            console.log('Response status:', res.status);
            const loc = res.headers.get('location') || res.headers.get('Location') || null;
            
            // Fast path 200
            if (res.status === 200) {
              const j = await res.json().catch(() => ({}));
              console.log('200 response:', j);
              const v = j?.data?.video_url || j?.video?.url || j?.video_url || j?.url || null;
              if (v) return v;
              lastErr = 'No video URL in 200 response';
              continue;
            }
            
            // Queue path 202
            if (res.status === 202 || (isQueue && loc)) {
              if (!loc) {
                lastErr = 'Queue accepted but missing Location header';
                continue;
              }
              
              console.log('Queue location:', loc);
              const statusUrl = `${loc}/status`;
              const resultUrl = `${loc}/result`;
              
              const maxMs = 300000; // 5 min
              const begin = Date.now();
              while (Date.now() - begin < maxMs) {
                await new Promise(r => setTimeout(r, 2000));
                const st = await fetch(statusUrl, { headers: hv(apiKeys.falai) });
                if (st.ok) {
                  const sj = await st.json().catch(() => ({}));
                  const status = (sj.status || sj.state || '').toUpperCase();
                  console.log('Queue status:', status);
                  
                  if (Array.isArray(sj.logs)) {
                    sj.logs.map(l => l?.message).filter(Boolean).forEach(msg => {
                      try { setExecutionMessage && setExecutionMessage(`🎬 ${providerLabel}: ${String(msg).slice(0, 80)}`); } catch (_) {}
                    });
                  }
                  if (['COMPLETE','COMPLETED','SUCCEEDED'].includes(status)) break;
                  if (['FAILED','CANCELLED','ERROR'].includes(status)) { 
                    lastErr = `Job ${status}`; 
                    console.error('Job failed with status:', status, sj);
                    break; 
                  }
                }
              }
              
              const rt = await fetch(resultUrl, { headers: hv(apiKeys.falai) });
              if (!rt.ok) { 
                const t = await rt.text().catch(() => ''); 
                lastErr = `Result ${rt.status} ${t.slice(0,160)}`; 
                console.error('Result fetch failed:', lastErr);
                continue; 
              }
              const rj = await rt.json().catch(() => ({}));
              console.log('Result:', rj);
              const v = rj?.data?.video_url || rj?.video?.url || rj?.video_url || rj?.url || null;
              if (v) return v;
              lastErr = 'No video URL in result';
              continue;
            }
            
            // Other statuses
            const et = await res.text().catch(() => '');
            console.error(`HTTP ${res.status}:`, et);
            lastErr = `${res.status} ${et.slice(0,160)}`;
          } catch (err) {
            console.error('Request error:', err);
            lastErr = err?.message || 'network error';
            continue;
          }
        }
        throw new Error(lastErr || 'queue flow failed');
      };

      const override = (params?.endpointOverride || '').trim();
      
      if (model === 'veo-3') {
        const path = override || '/fal-ai/veo3';
        
        // Queue endpoint - wrap in 'input'
        const queueUrl = `${queueBase}${path.startsWith('/') ? '' : '/'}${path}`;
        const queueBody = { 
          input: {
            prompt, 
            aspect_ratio: aspectRatio, 
            audio_enabled: false 
          },
          logs: true
        };
        
        // Direct endpoint - no 'input' wrapper
        const directUrl = `${base}${path.startsWith('/') ? '' : '/'}${path}`;
        const directBody = {
          prompt, 
          aspect_ratio: aspectRatio, 
          audio_enabled: false
        };
        
        const attempts = [
          { endpoint: queueUrl, body: queueBody, isQueue: true, providerLabel: 'Veo3' },
          { endpoint: directUrl, body: directBody, isQueue: false, providerLabel: 'Veo3' }
        ];
        
        let lastErr = '';
        for (const attempt of attempts) {
          try {
            const videoUrl = await tryQueueFlow(attempt);
            return { type: 'video', videoUrl, url: videoUrl, model, preview: `🎬 Veo3 ${resolution} ${durationSec}s` };
          } catch (e) {
            lastErr = e?.message || String(e);
            continue;
          }
        }
        throw new Error(`FAL Veo3 failed: ${lastErr}`);
        
      } else {
        const path = override || '/fal-ai/kling-video/v2.5-turbo/pro/text-to-video';
        
        // Queue endpoint - wrap in 'input'
        const queueUrl = `${queueBase}${path.startsWith('/') ? '' : '/'}${path}`;
        const queueBody = {
          input: {
            prompt,
            duration: String(durationSec),
            aspect_ratio: aspectRatio,
            negative_prompt: params?.negativePrompt || 'blur, distort, low quality',
            cfg_scale: Number(params?.cfgScale || 0.5)
          },
          logs: true
        };
        
        // Direct endpoint - no 'input' wrapper
        const directUrl = `${base}${path.startsWith('/') ? '' : '/'}${path}`;
        const directBody = {
          prompt,
          duration: String(durationSec),
          aspect_ratio: aspectRatio,
          negative_prompt: params?.negativePrompt || 'blur, distort, low quality',
          cfg_scale: Number(params?.cfgScale || 0.5)
        };
        
        const attempts = [
          { endpoint: queueUrl, body: queueBody, isQueue: true, providerLabel: 'Kling 2.5' },
          { endpoint: directUrl, body: directBody, isQueue: false, providerLabel: 'Kling 2.5' }
        ];
        
        let lastErr = '';
        for (const attempt of attempts) {
          try {
            const videoUrl = await tryQueueFlow(attempt);
            return { type: 'video', videoUrl, url: videoUrl, model, preview: `🎬 Kling 2.5 ${resolution} ${durationSec}s` };
          } catch (e) {
            lastErr = e?.message || String(e);
            continue;
          }
        }
        throw new Error(`FAL Kling failed: ${lastErr}`);
      }
    };

    try {
      if (!params?.simulate) {
        return await tryReal();
      }
      throw new Error('Simulate enabled');
    } catch (e) {
      console.error('Execution error:', e);
      setExecutionMessage && setExecutionMessage('⚠️ Using simulated video output');
      return {
        type: 'video',
        videoUrl: null,
        model,
        simulated: true,
        usedPrompt: prompt,
        preview: `🔧 Simulated ${model} video (${resolution}, ${durationSec}s)`
      };
    }
  }

  reg.register('falTextToVideo', { defaults, schema, execute });
})(window);