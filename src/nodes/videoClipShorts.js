(function (global) {
  const reg = global.NodeRegistry;
  if (!reg) return;

  const defaults = {
    simulate: false,
    muteAudio: false,
    paddingMs: 0,
    maxTotalDurationSec: 60,
    limitSegments: 12,
    targetFormat: 'mp4',
    ffmpegScriptUrl: 'assets/ffmpeg/ffmpeg.min.js',
    ffmpegCorePath: 'assets/ffmpeg/ffmpeg-core.js',
    ffmpegLog: false
  };
  const schema = [
    { key: 'simulate', type: 'checkbox', label: 'Simulate (no real trimming)' },
    { key: 'muteAudio', type: 'checkbox', label: 'Mute Audio' },
    { key: 'paddingMs', type: 'number', label: 'Padding per side (ms)' },
    { key: 'maxTotalDurationSec', type: 'number', label: 'Max Total Duration (sec)' },
    { key: 'limitSegments', type: 'number', label: 'Max Segments' },
    { key: 'targetFormat', type: 'select', label: 'Target Format', options: ['mp4','webm'] },
    { key: 'ffmpegScriptUrl', type: 'text', label: 'ffmpeg.wasm Script URL (optional)' },
    { key: 'ffmpegCorePath', type: 'text', label: 'ffmpeg-core.js Path (optional)' },
    { key: 'ffmpegLog', type: 'checkbox', label: 'ffmpeg Log' }
  ];

  function pickVideoInput(arr) {
    return arr.find(i => i && i.type === 'video');
  }
  function pickSegmentsInput(arr) {
    const t = arr.find(i => i && i.type === 'text' && (Array.isArray(i.segments) || (typeof i.text === 'string' && i.text.trim().startsWith('['))));
    return t;
  }

  function parseSegments(textOrArray) {
    if (Array.isArray(textOrArray)) return textOrArray;
    try { const j = JSON.parse(textOrArray || ''); if (Array.isArray(j)) return j; } catch (_) {}
    return [];
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
        // Verify factory actually exists; if placeholder or broken file loaded, continue to next
        if (global.createFFmpeg || (global.FFmpeg && global.FFmpeg.createFFmpeg)) return;
        lastErr = new Error('ffmpeg factory missing after script load');
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('Failed to load ffmpeg.wasm');
  }

  function normalizeSegments(segments, { paddingMs, maxTotalDurationSec, limitSegments }) {
    const pad = Math.max(0, Number(paddingMs) || 0) / 1000;
    const lim = Math.max(1, parseInt(limitSegments || 12));
    const maxT = Math.max(0.1, Number(maxTotalDurationSec) || 60);
    const out = [];
    let total = 0;
    for (const s of segments) {
      let start = Math.max(0, Number(s.start) || 0) - pad;
      let end = Math.max(0, Number(s.end) || 0) + pad;
      if (end <= start) continue;
      const dur = end - start;
      if (total + dur > maxT) {
        if (total >= maxT) break;
        end = start + (maxT - total);
      }
      out.push({ start, end, text: s.text, idx: s.idx });
      total += (end - start);
      if (out.length >= lim || total >= maxT) break;
    }
    return out;
  }

  function toSrtTimestamp(sec) {
    const s = Math.max(0, Number(sec) || 0);
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = Math.floor(s % 60);
    const ms = Math.floor((s - Math.floor(s)) * 1000);
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(ms, 3)}`;
  }

  async function execute({ inputData, params, setExecutionMessage }) {
    if (!Array.isArray(inputData)) throw new Error('❌ videoClipShorts requires two inputs: video + segments JSON text.');
    const vid = pickVideoInput(inputData);
    const seg = pickSegmentsInput(inputData);
    if (!vid || vid.type !== 'video') throw new Error('❌ Connect a Video input to videoClipShorts.');
    if (!seg || seg.type !== 'text') throw new Error('❌ Connect Segments (JSON text) from Segments Select.');

    const videoUrl = vid.videoUrl || vid.url;
    if (!videoUrl) throw new Error('❌ No video URL found from upstream.');

    const segmentsRaw = Array.isArray(seg.segments) ? seg.segments : parseSegments(seg.text);
    if (!segmentsRaw || segmentsRaw.length === 0) throw new Error('❌ No segments provided.');

    const normalized = normalizeSegments(segmentsRaw, params || {});
    if (normalized.length === 0) throw new Error('❌ All segments filtered out by constraints. Increase max duration or limits.');

    const simulate = !!params?.simulate;
    if (simulate) {
      setExecutionMessage && setExecutionMessage(`🔧 Simulating clip: ${normalized.length} segment(s)`);
      const preview = normalized.slice(0, 3).map((s,i)=>`${i+1}. [${toSrtTimestamp(s.start)}→${toSrtTimestamp(s.end)}]`).join(' ');
      return { type: 'video', videoUrl, url: videoUrl, simulated: true, appliedSegments: normalized, preview: `🎞️ Simulated concat • ${normalized.length} seg • ${preview}` };
    }

    // Attempt real trimming with ffmpeg.wasm
    try {
      setExecutionMessage && setExecutionMessage('⬇️ Fetching source video...');
      const res = await fetch(videoUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());

      setExecutionMessage && setExecutionMessage('⚙️ Loading ffmpeg.wasm...');
      await ensureFFmpegLoaded(params?.ffmpegScriptUrl);
      const factory = global.createFFmpeg || (global.FFmpeg && global.FFmpeg.createFFmpeg);
      if (!factory) throw new Error('ffmpeg factory missing');
      const ffmpeg = factory({ corePath: (params?.ffmpegCorePath || '').trim() || 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/ffmpeg-core.js', log: !!params?.ffmpegLog });
      await ffmpeg.load();

      const inputName = 'input.mp4';
      ffmpeg.FS('writeFile', inputName, buf);

      // Produce individual clips
      const mute = !!params?.muteAudio;
      const targetFormat = (params?.targetFormat || 'mp4').toLowerCase();
      const outParts = [];
      let idx = 0;
      for (const s of normalized) {
        const outName = `seg_${idx}.${targetFormat}`;
        const args = ['-ss', String(Math.max(0, s.start)), '-to', String(Math.max(0, s.end)), '-i', inputName];
        if (mute) args.push('-an');
        // Let ffmpeg pick defaults to avoid codec mismatch; re-encode for safety
        if (targetFormat === 'webm') {
          args.push('-c:v', 'libvpx-vp9', '-b:v', '1M', '-c:a', 'libopus');
        } else {
          // mp4 path: wasm builds may not include x264; attempt mpeg4/aac fallbacks
          args.push('-c:v', 'mpeg4', '-b:v', '1M', '-c:a', 'aac', '-b:a', '128k');
        }
        args.push(outName);
        setExecutionMessage && setExecutionMessage(`✂️ Trimming segment ${idx + 1}/${normalized.length}...`);
        await ffmpeg.run(...args);
        outParts.push(outName);
        idx++;
      }

      // Concat parts
      const listName = 'segments.txt';
      const listContent = outParts.map(p => `file '${p}'`).join('\n');
      ffmpeg.FS('writeFile', listName, new TextEncoder().encode(listContent));
      const outName = `output.${targetFormat}`;
      setExecutionMessage && setExecutionMessage('🔗 Concatenating segments...');
      // Re-encode to avoid stream-copy container issues
      const concatArgs = ['-f', 'concat', '-safe', '0', '-i', listName];
      if (targetFormat === 'webm') {
        concatArgs.push('-c:v', 'libvpx-vp9', '-b:v', '1M', '-c:a', 'libopus');
      } else {
        concatArgs.push('-c:v', 'mpeg4', '-b:v', '1M', '-c:a', 'aac', '-b:a', '128k');
      }
      concatArgs.push(outName);
      await ffmpeg.run(...concatArgs);

      const data = ffmpeg.FS('readFile', outName);
      const blob = new Blob([data.buffer], { type: targetFormat === 'webm' ? 'video/webm' : 'video/mp4' });
      const url = URL.createObjectURL(blob);
      setExecutionMessage && setExecutionMessage('✅ Clip built');
      return { type: 'video', videoUrl: url, url, segments: normalized, preview: `🎞️ ${normalized.length} seg • built` };
    } catch (err) {
      console.error('videoClipShorts error (falling back to simulate):', err);
      setExecutionMessage && setExecutionMessage('⚠️ ffmpeg.wasm failed. Returning simulated output.');
      const preview = normalized.slice(0, 3).map((s,i)=>`${i+1}. [${toSrtTimestamp(s.start)}→${toSrtTimestamp(s.end)}]`).join(' ');
      return { type: 'video', videoUrl, url: videoUrl, simulated: true, appliedSegments: normalized, preview: `🎞️ Simulated (ffmpeg failed) • ${normalized.length} seg • ${preview}` };
    }
  }

  reg.register('videoClipShorts', { defaults, schema, execute });
})(window);
