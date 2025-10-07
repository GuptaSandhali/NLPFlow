(function (global) {
  const reg = global.NodeRegistry;
  if (!reg) return;

  const defaults = { voice: 'en_us_001', speed: 1.0 };
  const schema = [
    { key: 'voice', type: 'select', label: 'Voice', options: ['en_us_001', 'en_us_002', 'en_gb_001', 'en_au_001'] },
    { key: 'speed', type: 'number', label: 'Speed' }
  ];

  function makeBeepWavDataUrl(seconds = 1, freq = 440) {
    const sampleRate = 24000;
    const samples = Math.floor(seconds * sampleRate);
    const headerSize = 44;
    const buffer = new ArrayBuffer(headerSize + samples * 2);
    const view = new DataView(buffer);
    const writeString = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
    const volume = 0.2;
    // RIFF header
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits/sample
    writeString(36, 'data');
    view.setUint32(40, samples * 2, true);
    // Sine samples
    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const s = Math.sin(2 * Math.PI * freq * t) * volume;
      view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true);
    }
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return 'data:audio/wav;base64,' + btoa(binary);
  }

  async function execute({ inputData, params, apiKeys, setExecutionMessage }) {
    let text = '';
    if (Array.isArray(inputData)) {
      const p = inputData.find(x => x?.type === 'prompt' || (x?.type === 'text' && x.text));
      text = p?.prompt || p?.text || '';
    } else if (inputData) {
      text = inputData.prompt || inputData.text || '';
    }
    if (!text) throw new Error('❌ No text input! Connect a Text or Prompt node.');

    const tryReal = async () => {
      if (!apiKeys?.falai) throw new Error('FalAI key missing');
      setExecutionMessage && setExecutionMessage('🔊 Generating speech with Chatterbox...');
      const base = (apiKeys?.falProxy || 'https://fal.run').replace(/\/$/, '');
      const queueBase = (apiKeys?.falProxy || 'https://queue.fal.run').replace(/\/$/, '');

      const endpoints = [
        `${queueBase}/fal-ai/chatterbox/text-to-speech`,
        `${base}/fal-ai/chatterbox/text-to-speech`
      ];

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Key ${apiKeys.falai}`
      };

      const body = {
        input: {
          text,
          voice: params?.voice || 'en_us_001',
          speed: Number(params?.speed || 1.0)
        },
        logs: true
      };

      let lastErr = '';
      for (const ep of endpoints) {
        try {
          const res = await fetch(ep, { method: 'POST', headers, body: JSON.stringify(body) });

          if (res.status === 200) {
            const json = await res.json().catch(() => ({}));
            const url = json?.data?.audio_url || json?.audio_url || json?.url || (json?.audio && json.audio.url);
            if (!url) { lastErr = 'No audio URL in response'; continue; }
            return { type: 'audio', audioFile: url, voice: body.input.voice, speed: body.input.speed, preview: `🔊 TTS: "${text.substring(0, 32)}${text.length > 32 ? '...' : ''}"` };
          }

          if (res.status === 202) {
            const loc = res.headers.get('location') || res.headers.get('Location');
            if (!loc) { lastErr = 'Queue accepted but no location header'; continue; }
            const statusUrl = `${loc.replace(/\/$/, '')}/status`;
            const resultUrl = `${loc.replace(/\/$/, '')}/result`;

            const maxMs = 60000; const begin = Date.now();
            while (Date.now() - begin < maxMs) {
              await new Promise(r => setTimeout(r, 1500));
              const st = await fetch(statusUrl, { headers });
              if (st.ok) {
                const sj = await st.json().catch(() => ({}));
                const status = (sj.status || sj.state || '').toUpperCase();
                if (Array.isArray(sj.logs)) {
                  sj.logs.forEach(log => log?.message && setExecutionMessage && setExecutionMessage(`🔊 TTS: ${String(log.message).slice(0, 80)}`));
                }
                if (['COMPLETE', 'COMPLETED', 'SUCCEEDED'].includes(status)) break;
                if (['FAILED', 'CANCELLED', 'ERROR'].includes(status)) { lastErr = `Job ${status}`; break; }
              }
            }

            const rt = await fetch(resultUrl, { headers });
            if (!rt.ok) { const t = await rt.text().catch(() => ''); lastErr = `Result fetch failed ${rt.status} ${t.slice(0,120)}`; continue; }
            const rj = await rt.json().catch(() => ({}));
            const url = rj?.data?.audio_url || rj?.audio_url || rj?.url || (rj?.audio && rj.audio.url);
            if (!url) { lastErr = 'No audio URL in queued result'; continue; }
            return { type: 'audio', audioFile: url, voice: body.input.voice, speed: body.input.speed, preview: `🔊 TTS: "${text.substring(0, 32)}${text.length > 32 ? '...' : ''}"` };
          }

          const errTxt = await res.text().catch(() => '');
          lastErr = `${res.status} ${errTxt.slice(0, 160)}`;
        } catch (err) {
          lastErr = err?.message || 'network error';
          continue;
        }
      }
      throw new Error(`Chatterbox TTS failed: ${lastErr || 'no response'}`);
    };

    const tryOpenAITTS = async () => {
      if (!apiKeys?.openai) throw new Error('OpenAI key missing');
      setExecutionMessage && setExecutionMessage('🔊 Generating speech with OpenAI TTS...');
      const model = 'gpt-4o-mini-tts';
      const voice = (params?.voice && typeof params.voice === 'string') ? params.voice : 'alloy';
      const res = await fetch((apiKeys?.openaiProxy || 'https://api.openai.com').replace(/\/$/, '') + '/v1/audio/speech', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKeys.openai}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, voice, input: text })
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`OpenAI TTS HTTP ${res.status}${t ? ` - ${t.slice(0,120)}` : ''}`);
      }
      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      return { type: 'audio', audioFile: url, voice, speed: Number(params?.speed || 1.0), preview: `🔊 TTS: "${text.substring(0, 32)}${text.length > 32 ? '...' : ''}"` };
    };

    try {
      return await tryReal();
    } catch (e1) {
      // If Chatterbox is unauthorized (401), attempt OpenAI TTS fallback when available
      const msg = (e1 && e1.message) ? e1.message : '';
      const unauthorized = /\b401\b|unauthor/i.test(msg);
      if (unauthorized && apiKeys?.openai) {
        try {
          return await tryOpenAITTS();
        } catch (e2) {
          // fall through to simulate
          setExecutionMessage && setExecutionMessage(`⚠️ TTS fallback failed (${String(e2.message || e2).slice(0,80)}). Using simulated audio.`);
        }
      } else {
        setExecutionMessage && setExecutionMessage(`⚠️ Chatterbox not available${msg ? ` (${msg.slice(0,80)})` : ''}. Using simulated audio.`);
      }
      const seconds = Math.min(3, Math.max(1, Math.round((text.length / 20)))) || 1.2;
      const url = makeBeepWavDataUrl(seconds, 523.25);
      return { type: 'audio', audioFile: url, voice: params?.voice || 'en_us_001', speed: Number(params?.speed || 1.0), preview: `🔧 Simulated TTS: "${text.substring(0, 32)}${text.length > 32 ? '...' : ''}"` };
    }
  }

  reg.register('chatterboxTTS', { defaults, schema, execute });
})(window);
