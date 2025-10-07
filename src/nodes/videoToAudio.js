(function (global) {
  const reg = global.NodeRegistry;
  if (!reg) return;

  const defaults = { mode: 'ffmpeg', format: 'm4a', ffmpegScriptUrl: 'assets/ffmpeg/ffmpeg.min.js', ffmpegCorePath: 'assets/ffmpeg/ffmpeg-core.js', ffmpegLog: false };
  const schema = [
    { key: 'mode', type: 'select', label: 'Mode', options: ['ffmpeg','realtime'] },
    { key: 'format', type: 'select', label: 'Output Format', options: ['m4a','webm','ogg'] },
    { key: 'ffmpegScriptUrl', type: 'text', label: 'ffmpeg.wasm Script URL (optional)' },
    { key: 'ffmpegCorePath', type: 'text', label: 'ffmpeg-core.js Path (optional)' },
    { key: 'ffmpegLog', type: 'checkbox', label: 'ffmpeg Log' }
  ];

  async function extractAudioBlobFromUrl(srcUrl, setExecutionMessage) {
    // Try to convert remote URLs into blob URLs to avoid cross-origin capture issues
    let playUrl = srcUrl;
    try {
      if (typeof srcUrl === 'string' && /^https?:/i.test(srcUrl)) {
        const res = await fetch(srcUrl, { method: 'GET', mode: 'cors' });
        if (res.ok) {
          const blob = await res.blob();
          playUrl = URL.createObjectURL(blob);
        }
      }
    } catch (_) {
      // If fetch fails due to CORS, proceed with original URL (may still work if CORS allows)
    }

    const video = document.createElement('video');
    video.style.display = 'none';
    video.crossOrigin = 'anonymous';
    video.src = playUrl;
    video.preload = 'auto';
    video.controls = false;
    video.muted = true; // prevent audible playback while capturing

    document.body.appendChild(video);
    try {
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('Failed to load video for audio extraction'));
      });

      // Some browsers require an explicit play call to initialize capture
      await video.play().catch(() => {});

      const cap = video.captureStream ? video.captureStream() : (video.mozCaptureStream ? video.mozCaptureStream() : null);
      if (!cap) throw new Error('captureStream() not supported in this browser');
      const audioTracks = cap.getAudioTracks().filter(t => t.enabled);
      if (!audioTracks || audioTracks.length === 0) throw new Error('No audio track found in video');
      const audioStream = new MediaStream(audioTracks);

      const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg'
      ];
      const mimeType = candidates.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
      if (!window.MediaRecorder) throw new Error('MediaRecorder not supported in this browser');

      const chunks = [];
      const recorder = new MediaRecorder(audioStream, mimeType ? { mimeType } : {});
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

      await new Promise((resolve) => {
        const onEnded = () => { try { recorder.stop(); } catch (_) {} };
        recorder.onstop = () => resolve();
        recorder.start(100);
        // Ensure playback starts from beginning
        try { video.currentTime = 0; } catch (_) {}
        video.onended = onEnded;
        // In case metadata duration is Infinity (streaming), impose a max duration
        const maxMs = isFinite(video.duration) ? (video.duration * 1000 + 250) : 15000;
        setTimeout(onEnded, maxMs);
        try { video.play(); } catch (_) {}
      });

      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      return blob;
    } finally {
      try { video.pause(); } catch (_) {}
      if (video.src && video.src.startsWith('blob:')) {
        try { URL.revokeObjectURL(video.src); } catch (_) {}
      }
      document.body.removeChild(video);
    }
  }

  async function ensureFFmpegLoaded(scriptUrl) {
    if (global.createFFmpeg || (global.FFmpeg && global.FFmpeg.createFFmpeg)) return;
    const candidates = [];
    const custom = (scriptUrl || '').trim();
    if (custom) candidates.push(custom);
    candidates.push(
      'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/ffmpeg.min.js',
      'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/ffmpeg.min.js'
    );
    let lastErr = null;
    for (const src of candidates) {
      try {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.async = true;
          s.src = src;
          s.onload = () => resolve();
          s.onerror = () => reject(new Error(`Failed to load ${src}`));
          document.head.appendChild(s);
        });
        if (global.createFFmpeg || (global.FFmpeg && global.FFmpeg.createFFmpeg)) return;
        lastErr = new Error('ffmpeg factory missing after script load');
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('Failed to load ffmpeg.wasm');
  }

  function guessNames(url, fileName, desiredFormat) {
    const clean = (s) => (s || '').toString();
    const lower = clean(fileName || url).toLowerCase();
    let inExt = 'mp4';
    if (/\.webm(\b|$)/.test(lower)) inExt = 'webm';
    else if (/\.(mov|m4v)(\b|$)/.test(lower)) inExt = 'mp4';
    else if (/\.mkv(\b|$)/.test(lower)) inExt = 'mkv';
    const outExt = (desiredFormat || '').toLowerCase() || (inExt === 'webm' ? 'webm' : 'm4a');
    const inputName = `input.${inExt}`;
    const outputName = `audio.${outExt}`;
    return { inputName, outputName, inExt, outExt };
  }

  async function extractWithFfmpeg({ url, fileName, params, setExecutionMessage }) {
    setExecutionMessage && setExecutionMessage('⬇️ Downloading video for audio extraction...');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());

    setExecutionMessage && setExecutionMessage('⚙️ Loading ffmpeg.wasm...');
    await ensureFFmpegLoaded(params?.ffmpegScriptUrl);
    const factory = global.createFFmpeg || (global.FFmpeg && global.FFmpeg.createFFmpeg);
    if (!factory) throw new Error('ffmpeg factory missing');
    const ffmpeg = factory({ corePath: (params?.ffmpegCorePath || '').trim() || 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/ffmpeg-core.js', log: !!params?.ffmpegLog });
    await ffmpeg.load();

    const { inputName, outputName, inExt, outExt } = guessNames(url, fileName, params?.format);
    ffmpeg.FS('writeFile', inputName, buf);

    const tryCopy = async () => {
      const args = ['-i', inputName, '-vn', '-acodec', 'copy', outputName];
      await ffmpeg.run(...args);
    };
    const tryEncodeFallback = async () => {
      // Prefer Opus/WebM for broad wasm support
      const out = outExt === 'm4a' ? 'audio.webm' : outputName;
      const args = ['-i', inputName, '-vn', '-c:a', 'libopus', '-b:a', '128k', out];
      await ffmpeg.run(...args);
      return out;
    };

    let finalOut = outputName;
    try {
      setExecutionMessage && setExecutionMessage('🔌 Copying audio stream (no re-encode)...');
      await tryCopy();
    } catch (e) {
      setExecutionMessage && setExecutionMessage('🎛️ Re-encoding audio (copy failed)...');
      finalOut = await tryEncodeFallback();
    }

    const data = ffmpeg.FS('readFile', finalOut);
    const mime = /\.webm$/i.test(finalOut) ? 'audio/webm' : /\.m4a$/i.test(finalOut) ? 'audio/mp4' : 'audio/ogg';
    const blob = new Blob([data.buffer], { type: mime });
    return { blob, fileName: finalOut };
  }

  async function execute({ inputData, params, setExecutionMessage }) {
    if (!inputData) throw new Error('❌ No video input connected! Connect a Video Input or generation node.');
    if (inputData.type !== 'video') throw new Error(`❌ Wrong input type! Expected video, got ${inputData.type}.`);

    const url = inputData.videoUrl || inputData.url || (inputData.video && inputData.video.url) || (inputData.data && inputData.data.video_url);
    if (!url) throw new Error('❌ No video URL available to extract audio from.');

    const mode = (params?.mode || 'ffmpeg').toLowerCase();
    setExecutionMessage && setExecutionMessage('🎧 Extracting audio from video...');
    try {
      if (mode === 'ffmpeg') {
        const { blob, fileName: outName } = await extractWithFfmpeg({ url, fileName: inputData.fileName || inputData.preview, params, setExecutionMessage });
        const base = (inputData.fileName || inputData.preview || 'extracted_audio').toString().replace(/\.[a-z0-9]+$/i, '');
        const ext = (/\.([a-z0-9]+)$/i.exec(outName || '') || [,'m4a'])[1];
        const finalName = `${base}.${ext}`;
        const audioFile = new File([blob], finalName, { type: blob.type || 'audio/*' });
        setExecutionMessage && setExecutionMessage('✅ Audio extracted');
        return { type: 'audio', audioFile, fileName: finalName, preview: `🎧 ${finalName}` };
      }
      // Realtime fallback
      const audioBlob = await extractAudioBlobFromUrl(url, setExecutionMessage);
      const nameBase = (inputData.fileName || inputData.preview || 'extracted_audio').toString().replace(/\.[a-z0-9]+$/i, '');
      const fileName = `${nameBase}.webm`;
      const audioFile = new File([audioBlob], fileName, { type: audioBlob.type || 'audio/webm' });
      setExecutionMessage && setExecutionMessage('✅ Audio extracted');
      return { type: 'audio', audioFile, fileName, preview: `🎧 ${fileName}` };
    } catch (e) {
      const msg = e?.message || 'unknown error';
      // If ffmpeg mode failed, try realtime automatically before giving up
      if ((params?.mode || 'ffmpeg').toLowerCase() === 'ffmpeg') {
        try {
          setExecutionMessage && setExecutionMessage('⚠️ ffmpeg.wasm failed. Trying realtime capture...');
          const audioBlob = await extractAudioBlobFromUrl(url, setExecutionMessage);
          const nameBase = (inputData.fileName || inputData.preview || 'extracted_audio').toString().replace(/\.[a-z0-9]+$/i, '');
          const fileName = `${nameBase}.webm`;
          const audioFile = new File([audioBlob], fileName, { type: audioBlob.type || 'audio/webm' });
          setExecutionMessage && setExecutionMessage('✅ Audio extracted (realtime fallback)');
          return { type: 'audio', audioFile, fileName, preview: `🎧 ${fileName}` };
        } catch (_) {}
      }
      throw new Error(`❌ Audio extraction failed: ${msg}`);
    }
  }

  reg.register('videoToAudio', { defaults, schema, execute });
})(window);
