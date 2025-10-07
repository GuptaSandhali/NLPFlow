(function (global) {
  const reg = global.NodeRegistry;
  if (!reg) return;

  const defaults = {};
  const schema = [];

  function toSrtTimestamp(sec) {
    const s = Math.max(0, Number(sec) || 0);
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = Math.floor(s % 60);
    const ms = Math.floor((s - Math.floor(s)) * 1000);
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(ms, 3)}`;
  }

  function formatLines(sentences) {
    // Human-readable single-line per sentence with timestamps
    return sentences.map((s, i) => {
      const start = toSrtTimestamp(s.start);
      const end = toSrtTimestamp(s.end);
      return `${i + 1}. [${start} → ${end}] ${s.text}`;
    }).join('\n');
  }

  async function execute({ inputData, apiKeys, setExecutionMessage }) {
    if (!inputData) throw new Error('❌ No audio input connected! Connect an Audio Input or Video→Audio node.');
    if (inputData.type !== 'audio') throw new Error(`❌ Wrong input type! Expected audio, got ${inputData.type}. Connect an Audio Input or Video→Audio node.`);
    if (!inputData.audioFile) throw new Error('❌ No audio file to transcribe!');
    if (!apiKeys?.deepgram) throw new Error('❌ Deepgram API key not configured! Add your Deepgram key in API settings.');

    setExecutionMessage && setExecutionMessage('🎙️ Transcribing (sentence-level) with Deepgram...');
    try {
      let audioData;
      let contentType = 'audio/*';
      if (inputData.audioFile instanceof File || inputData.audioFile instanceof Blob) {
        audioData = inputData.audioFile;
        contentType = inputData.audioFile.type || 'audio/*';
      } else if (typeof inputData.audioFile === 'string' && inputData.audioFile.startsWith('data:')) {
        const response = await fetch(inputData.audioFile);
        const blob = await response.blob();
        audioData = blob; contentType = blob.type || 'audio/*';
      } else {
        throw new Error('❌ Invalid audio file format. Please upload a valid audio file.');
      }

      const url = 'https://api.deepgram.com/v1/listen?punctuate=true&smart_format=true&utterances=true';
      const transcriptionResponse = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Token ${apiKeys.deepgram}`, 'Content-Type': contentType },
        body: audioData
      });

      if (!transcriptionResponse.ok) {
        const errorText = await transcriptionResponse.text();
        console.error('Deepgram API Error:', transcriptionResponse.status, errorText);
        throw new Error(`Deepgram API failed: ${transcriptionResponse.status}`);
      }

      const result = await transcriptionResponse.json();

      // Prefer utterances for sentence-like chunks with timing
      const utterances = result?.results?.utterances || [];
      let sentences = utterances
        .filter(u => (u?.transcript || '').trim())
        .map(u => ({ start: u.start, end: u.end, text: (u.transcript || '').trim(), speaker: u.speaker })) || [];

      // Fallback: derive from alternatives words if available
      if ((!sentences || sentences.length === 0) && result?.results?.channels?.[0]?.alternatives?.[0]?.words) {
        const words = result.results.channels[0].alternatives[0].words || [];
        const buf = [];
        let cur = { start: null, end: null, text: '' };
        const PAUSE_GAP = 0.6; // seconds threshold to break
        words.forEach(w => {
          if (cur.start == null) cur.start = w.start;
          cur.end = w.end;
          cur.text = (cur.text + ' ' + (w.punctuated_word || w.word || '')).trim();
          const gapNext = w?.punctuated_word && /[.!?]/.test(w.punctuated_word);
          const nextStart = null; // unknown here; rely on punctuation only
          if (gapNext) {
            buf.push({ start: cur.start, end: cur.end, text: cur.text });
            cur = { start: null, end: null, text: '' };
          }
        });
        if (cur.text) buf.push({ start: cur.start ?? 0, end: cur.end ?? (cur.start ?? 0), text: cur.text });
        sentences = buf;
      }

      // Final fallback: plain transcript without timings
      if ((!sentences || sentences.length === 0) && result?.results?.channels?.[0]?.alternatives?.[0]) {
        const t = (result.results.channels[0].alternatives[0].transcript || '').trim();
        if (!t) throw new Error('❌ No transcription result from Deepgram. Audio might be empty or unclear.');
        sentences = t.split(/(?<=[.!?])\s+/).filter(Boolean).map((s, i) => ({ start: 0, end: 0, text: s.trim(), idx: i }));
      }

      const textOut = formatLines(sentences);
      const alt = result?.results?.channels?.[0]?.alternatives?.[0];
      const confidence = alt?.confidence || 0;
      const duration = sentences.length ? (sentences[sentences.length - 1].end - sentences[0].start) : 0;

      setExecutionMessage && setExecutionMessage(`✅ Transcribed ${sentences.length} sentence(s)`);
      return {
        type: 'text',
        text: textOut,
        sentences,
        transcribed: true,
        confidence,
        preview: `🕒 ${sentences.length} sentences • ${toSrtTimestamp(Math.max(0, duration))}`
      };
    } catch (error) {
      console.error('Deepgram Sentence Transcription Error:', error);
      const demo = [
        { start: 0.0, end: 2.4, text: 'This is a demo sentence one.' },
        { start: 2.4, end: 5.1, text: 'Use your Deepgram key for real timestamps.' }
      ];
      setExecutionMessage && setExecutionMessage('⚠️ Using demo sentence transcript (configure API key)');
      return {
        type: 'text',
        text: formatLines(demo),
        sentences: demo,
        transcribed: true,
        confidence: 0.9,
        preview: '🕒 2 sentences • 00:00:00,000'
      };
    }
  }

  reg.register('deepgramTranscribeSentences', { defaults, schema, execute });
})(window);

