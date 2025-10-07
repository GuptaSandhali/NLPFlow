(function (global) {
  global.NodeManifest = {
    types: {
      textInput: {
        name: 'Text Input', icon: 'FileText', category: 'Input',
        description: 'Emit plain text entered in params. No inputs → Output: text. Use for prompts, instructions, or lists.', inputs: 0, outputs: 1,
        headerColor: '#3b82f6', requiresInput: false,
        defaults: { text: '' },
        io: { inputTypes: [], outputType: 'text', inputMode: 'single' },
        aiHints: {
          purpose: 'Emit user-provided text for downstream processing',
          whenToUse: 'You have instructions, a prompt, or any raw text to feed other nodes',
          notFor: 'Images, audio, or binary content',
          preconditions: 'No upstream input required',
          postconditions: 'Emits a text object',
          tags: ['source','prompt','text']
        }
      },
      imageInput: {
        name: 'Image Input', icon: 'Image', category: 'Input',
        description: 'Provide an image (file or data URL). No inputs → Output: image. Use as source for editing, overlay, or export.', inputs: 0, outputs: 1,
        headerColor: '#3b82f6', requiresInput: false,
        defaults: { imageData: null, fileName: null },
        io: { inputTypes: [], outputType: 'image', inputMode: 'single' },
        aiHints: {
          purpose: 'Introduce an image into the graph',
          whenToUse: 'You need to edit, overlay, or export an existing image',
          notFor: 'Generating new images from prompts',
          preconditions: 'No upstream input required',
          postconditions: 'Emits an image object',
          tags: ['source','image']
        }
      },
      videoInput: {
        name: 'Video Input', icon: 'Video', category: 'Input',
        description: 'Upload a local video file. No inputs → Output: video. Provides an object URL usable by downstream nodes (e.g., Video Export).', inputs: 0, outputs: 1,
        headerColor: '#3b82f6', requiresInput: false,
        defaults: { videoFile: null, videoFileName: null },
        io: { inputTypes: [], outputType: 'video', inputMode: 'single' },
        aiHints: {
          purpose: 'Introduce a video into the graph',
          whenToUse: 'You want to work with an existing local video',
          notFor: 'Generating a video from text or image',
          preconditions: 'No upstream input required',
          postconditions: 'Emits a video object with object URL',
          tags: ['source','video']
        }
      },
      geminiText2Image: {
        name: 'Gemini Text2Image', icon: 'Sparkles', category: 'AI',
        description: 'Generate an image from a text prompt. Input: text → Output: image. Gemini key enables real generation; otherwise returns a local canvas preview.',
        inputs: 1, outputs: 1, headerColor: '#a855f7', requiresInput: true,
        defaults: { aspectRatio: '16:9' },
        io: { inputTypes: [{ kind: 'text' }], outputType: 'image', inputMode: 'single' },
        aiHints: {
          purpose: 'Image generation from text',
          whenToUse: 'You have a prompt and need a background or hero image',
          notFor: 'Editing an existing image',
          preconditions: 'Requires text prompt; optional apiKeys.gemini for real output',
          postconditions: 'Emits an image respecting aspectRatio',
          requiresKeys: ['gemini'],
          tags: ['image','generation','thumbnail']
        }
      },
      geminiEditImage: {
        name: 'Gemini EditImage', icon: '🎨', category: 'AI',
        description: 'Edit an image using a text instruction. Inputs: image + text → Output: image. Requires Gemini key; otherwise enhancement fallback.',
        inputs: 2, outputs: 1, headerColor: '#a855f7', requiresInput: true,
        defaults: {},
        io: { inputTypes: [{ kind: 'image', role: 'image' }, { kind: 'text', role: 'instruction' }], outputType: 'image', inputMode: 'multi' },
        aiHints: {
          purpose: 'Image editing guided by a text instruction',
          whenToUse: 'You need to enhance or modify an existing image with a prompt',
          notFor: 'Creating an image from scratch',
          preconditions: 'Requires image and text; apiKeys.gemini required for real edits',
          postconditions: 'Emits an edited image',
          requiresKeys: ['gemini'],
          tags: ['image','edit','enhance']
        }
      },
      briaRemove: {
        name: 'BRIA Background', icon: 'Scissors', category: 'AI',
        description: 'Remove background from an image. Input: image → Output: image (transparent). Uses FalAI BRIA; fallback heuristic if unavailable.',
        inputs: 1, outputs: 1, headerColor: '#a855f7', requiresInput: true,
        defaults: {},
        io: { inputTypes: [{ kind: 'image' }], outputType: 'image', inputMode: 'single' },
        aiHints: {
          purpose: 'Background removal/matting',
          whenToUse: 'You need a transparent cutout of a subject',
          notFor: 'Complex compositing or text overlays',
          preconditions: 'Requires image; FalAI key recommended',
          postconditions: 'Emits transparent-background image when successful',
          requiresKeys: ['falai'],
          proxyHint: 'fal.run may need a CORS-enabled proxy',
          tags: ['image','matte','cutout','background']
        }
      },
      textOverlay: {
        name: 'Text Overlay', icon: 'FileText', category: 'Design',
        description: 'Render text over an optional background image. Optional input: image → Output: image. Supports position, color, and stroke.',
        inputs: 0, outputs: 1, headerColor: '#06b6d4', requiresInput: false,
        defaults: { text: 'TEXT', fontSize: 72, color: '#FFFFFF', strokeColor: 'transparent', backgroundColor: 'transparent', positionX: 50, positionY: 50, alignment: 'center' },
        io: { inputTypes: [{ kind: 'image', optional: true }], outputType: 'image', inputMode: 'single' },
        aiHints: {
          purpose: 'Add a title or label over an image/background',
          whenToUse: 'You need to place text onto a banner or thumbnail',
          notFor: 'Cutouts or fusing multiple layers',
          preconditions: 'Optional image input; otherwise renders on solid/transparent background',
          postconditions: 'Emits an image with text overlay',
          tags: ['design','overlay','title']
        }
      },
      layerFusion: {
        name: 'Layer Fusion', icon: 'Layers', category: 'Design',
        description: 'Composite multiple images into one. Inputs: 2+ images → Output: image. Preserves transparent overlays.',
        inputs: 3, outputs: 1, headerColor: '#06b6d4', requiresInput: true,
        defaults: {},
        io: { inputTypes: [{ kind: 'image' }], outputType: 'image', inputMode: 'variadic', minInputs: 2 },
        aiHints: {
          purpose: 'Blend or stack multiple images',
          whenToUse: 'You have background + overlays and need a single composite',
          notFor: 'Exporting or adding text (use textOverlay prior)',
          preconditions: 'Requires at least 2 image inputs',
          postconditions: 'Emits a fused image',
          tags: ['compose','layers','blend']
        }
      },
      export: {
        name: 'Export', icon: 'Download', category: 'Output',
        description: 'Export final image to a file. Input: image → Output: none (download).',
        inputs: 1, outputs: 0, headerColor: '#f97316', requiresInput: true,
        defaults: { width: 1920, height: 1080, format: 'png', quality: 95 },
        io: { inputTypes: [{ kind: 'image' }], outputType: 'none', inputMode: 'single' },
        aiHints: {
          purpose: 'Save the final image to disk',
          whenToUse: 'You have reached the final image output',
          notFor: 'Intermediate visualization',
          preconditions: 'Requires a valid image input',
          postconditions: 'Triggers a browser download',
          tags: ['output','download','image']
        }
      },
      audioInput: {
        name: 'Audio Input', icon: 'Music', category: 'Input',
        description: 'Provide an audio file. No inputs → Output: audio. Use for transcription or TTS-driven video.', inputs: 0, outputs: 1,
        headerColor: '#3b82f6', requiresInput: false,
        defaults: { audioFile: null, audioFileName: null },
        io: { inputTypes: [], outputType: 'audio', inputMode: 'single' },
        aiHints: {
          purpose: 'Introduce audio into the graph',
          whenToUse: 'You need to transcribe or drive an avatar/video with audio',
          notFor: 'Generating speech from text (use TTS)',
          preconditions: 'No upstream input required',
          postconditions: 'Emits an audio object',
          tags: ['source','audio']
        }
      },
      deepgramTranscribe: {
        name: 'Deepgram Transcribe', icon: 'FileText', category: 'AI',
        description: 'Transcribe audio to text via Deepgram. Input: audio → Output: text. Requires Deepgram key; demo fallback on error.',
        inputs: 1, outputs: 1, headerColor: '#a855f7', requiresInput: true,
        defaults: {},
        io: { inputTypes: [{ kind: 'audio' }], outputType: 'text', inputMode: 'single' },
        aiHints: {
          purpose: 'Speech-to-text conversion',
          whenToUse: 'You need text from recorded speech/audio',
          notFor: 'Text processing without audio',
          preconditions: 'Requires audio input; apiKeys.deepgram recommended',
          postconditions: 'Emits transcribed text',
          requiresKeys: ['deepgram'],
          tags: ['speech','transcription','text']
        }
      },
      deepgramTranscribeSentences: {
        name: 'Deepgram Sentences', icon: 'FileText', category: 'AI',
        description: 'Sentence-level transcript with timestamps via Deepgram. Input: audio → Output: text (lines incl. [start→end]), plus sentences[] metadata.',
        inputs: 1, outputs: 1, headerColor: '#a855f7', requiresInput: true,
        defaults: {},
        io: { inputTypes: [{ kind: 'audio' }], outputType: 'text', inputMode: 'single' },
        aiHints: {
          purpose: 'Timestamped sentences for editing/clipping',
          whenToUse: 'You plan to cut highlights or burn subtitles',
          notFor: 'Plain full-paragraph transcription without timing',
          preconditions: 'Requires audio input; apiKeys.deepgram required for real timestamps',
          postconditions: 'Emits text lines and sentences[] with start/end seconds',
          requiresKeys: ['deepgram'],
          tags: ['speech','transcription','timestamps','editing']
        }
      },
      segmentsSelect: {
        name: 'Segments Select', icon: 'Filter', category: 'Design',
        description: 'Select timestamped sentences by indices (e.g., 2,5,7) into a JSON segments list. Inputs: text (selection) + text (Deepgram Sentences).',
        inputs: 2, outputs: 1, headerColor: '#10b981', requiresInput: true,
        defaults: { maxSegments: 20 },
        io: { inputTypes: [{ kind: 'text', role: 'selection' }, { kind: 'text', role: 'transcript' }], outputType: 'text', inputMode: 'multi' },
        aiHints: {
          purpose: 'Turn LLM-picked indices into structured segments',
          whenToUse: 'You have a numbered transcript and selected indices',
          notFor: 'Raw audio or video manipulation',
          preconditions: 'Requires Deepgram Sentences output and selection indices',
          postconditions: 'Emits JSON array in text with segments[] also attached',
          tags: ['utility','timestamps','selection']
        }
      },
      videoClipShorts: {
        name: 'Video Clip Shorts', icon: 'Scissors', category: 'Design',
        description: 'Clip and merge a short video from selected segments. Inputs: video + text (segments JSON). Simulate by default; tries ffmpeg.wasm if enabled.',
        inputs: 2, outputs: 1, headerColor: '#10b981', requiresInput: true,
        defaults: { simulate: false, muteAudio: false, paddingMs: 0, maxTotalDurationSec: 60, limitSegments: 12, targetFormat: 'mp4', ffmpegScriptUrl: 'assets/ffmpeg/ffmpeg.min.js', ffmpegCorePath: 'assets/ffmpeg/ffmpeg-core.js' },
        io: { inputTypes: [{ kind: 'video' }, { kind: 'text' }], outputType: 'video', inputMode: 'multi' },
        aiHints: {
          purpose: 'Assemble shorts by trimming and concatenating selected sentence spans',
          whenToUse: 'You have segments JSON from Segments Select and a source video',
          notFor: 'Audio-only outputs',
          preconditions: 'Requires video and segments; ffmpeg.wasm for real trimming',
          postconditions: 'Emits a video URL (simulated or real) ready for export',
          tags: ['video','editing','concat']
        }
      },
      llmTextCall: {
        name: 'LLM_Text_Call', icon: 'MessageSquare', category: 'AI',
        description: 'Process content with instructions via OpenAI. Inputs: text (content) + text (instructions) → Output: text.',
        inputs: 2, outputs: 1, headerColor: '#a855f7', requiresInput: true,
        defaults: {},
        io: { inputTypes: [{ kind: 'text', role: 'content' }, { kind: 'text', role: 'instructions' }], outputType: 'text', inputMode: 'multi' },
        aiHints: {
          purpose: 'Transform or analyze text with an LLM',
          whenToUse: 'You have source text and specific instructions',
          notFor: 'Image/audio processing',
          preconditions: 'Requires two text inputs; apiKeys.openai required',
          postconditions: 'Emits processed text',
          requiresKeys: ['openai'],
          tags: ['LLM','transform','summarize','rewrite']
        }
      },
      textDisplay: {
        name: 'Text Display', icon: 'Eye', category: 'Output',
        description: 'Display text for inspection. Input: text → Output: text (pass-through with display metadata).',
        inputs: 1, outputs: 1, headerColor: '#f97316', requiresInput: true,
        defaults: {},
        io: { inputTypes: [{ kind: 'text' }], outputType: 'text', inputMode: 'single' },
        aiHints: {
          purpose: 'Inspect or visualize text in the UI',
          whenToUse: 'You want to quickly verify text outputs',
          notFor: 'Final file export',
          preconditions: 'Requires text input',
          postconditions: 'Emits same text downstream',
          tags: ['debug','inspect']
        }
      },
      perplexitySearch: {
        name: 'Perplexity Search', icon: 'FileText', category: 'AI',
        description: 'Search Perplexity for Wikipedia pages for entities. Input: text (entities) → Output: text (Title - URL list). Requires key; proxy for CORS.',
        inputs: 1, outputs: 1, headerColor: '#10b981', requiresInput: true,
        defaults: { model: 'sonar-small', perEntity: 2, wikipediaOnly: true },
        io: { inputTypes: [{ kind: 'text' }], outputType: 'text', inputMode: 'single' },
        aiHints: {
          purpose: 'Entity → authoritative links lookup',
          whenToUse: 'You have entities and need their Wikipedia URLs',
          notFor: 'General-purpose LLM text transformation',
          preconditions: 'Requires apiKeys.perplexity; set perEntity; proxy recommended for CORS',
          postconditions: 'Emits newline-separated list: Title - URL',
          requiresKeys: ['perplexity'],
          proxyHint: 'Use a CORS-enabled proxy (perplexityProxy) if blocked',
          tags: ['research','retrieval','wiki']
        }
      },
      falTextToVideo: {
        name: 'FAL Text→Video', icon: 'Sparkles', category: 'AI',
        description: 'Generate a short video from a text prompt (Veo 3/Kling). Input: text → Output: video. FalAI key required; simulate available.',
        inputs: 1, outputs: 1, headerColor: '#a855f7', requiresInput: true,
        defaults: { model: 'kling-2.5', durationSec: 5, fps: 24, resolution: '720p', aspectRatio: '16:9', negativePrompt: 'blur, distort, low quality', cfgScale: 0.5, simulate: false },
        io: { inputTypes: [{ kind: 'text' }], outputType: 'video', inputMode: 'single' },
        aiHints: {
          purpose: 'Video generation from a text prompt',
          whenToUse: 'You need a short illustrative clip from text',
          notFor: 'Animating an existing image (use image→video)',
          preconditions: 'Requires text input; apiKeys.falai required for real output',
          postconditions: 'Emits a video URL or simulated output',
          requiresKeys: ['falai'],
          tags: ['video','generation']
        }
      },
      falImageToVideo: {
        name: 'FAL Image→Video', icon: 'Sparkles', category: 'AI',
        description: 'Animate an image into a short video (Kling) or avatar lip-sync (Omnihuman). Inputs: image (+ audio for Omnihuman) → Output: video. Simulate available.',
        inputs: 2, outputs: 1, headerColor: '#a855f7', requiresInput: true,
        defaults: { model: 'kling-2.5', durationSec: 4, fps: 24, resolution: '720p', aspectRatio: '16:9', sourceImageUrl: '', sourceAudioUrl: '', simulate: true, endpointOverride: '', authScheme: 'key' },
        io: { inputTypes: [{ kind: 'image' }, { kind: 'audio', optional: true }], outputType: 'video', inputMode: 'multi' },
        aiHints: {
          purpose: 'Animate a single image into motion or an avatar',
          whenToUse: 'You have an image to animate; Omnihuman needs audio',
          notFor: 'Free-form video from text (use text→video)',
          preconditions: 'Requires image; audio required for Omnihuman; apiKeys.falai required. Set apiKeys.falProxy to a CORS-enabled proxy to avoid browser blocks.',
          postconditions: 'Emits a video URL or simulated output',
          requiresKeys: ['falai'],
          proxyHint: 'Use a CORS-enabled proxy (falProxy) if requests to fal.run are blocked; node auto-polls queue with logs.',
          tags: ['video','animate','avatar']
        }
      },
      videoToAudio: {
        name: 'Video → Audio', icon: 'Music', category: 'Design',
        description: 'Extract the audio track from a video. Input: video → Output: audio (copy via ffmpeg.wasm when possible; realtime fallback).',
        inputs: 1, outputs: 1, headerColor: '#06b6d4', requiresInput: true,
        defaults: { mode: 'ffmpeg', format: 'm4a', ffmpegScriptUrl: 'assets/ffmpeg/ffmpeg.min.js', ffmpegCorePath: 'assets/ffmpeg/ffmpeg-core.js' },
        io: { inputTypes: [{ kind: 'video' }], outputType: 'audio', inputMode: 'single' },
        aiHints: {
          purpose: 'Derive audio from a video for further processing',
          whenToUse: 'You need to transcribe or process the audio from a video',
          notFor: 'Direct audio uploads (use Audio Input)',
          preconditions: 'Requires a video URL/file; ffmpeg.wasm preferred; realtime capture as fallback',
          postconditions: 'Emits an audio object compatible with Deepgram Transcribe',
          tags: ['video','audio','extract','transcription']
        }
      },
      chatterboxTTS: {
        name: 'Chatterbox TTS', icon: 'Music', category: 'AI',
        description: 'Convert text to speech (Chatterbox via Fal). Input: text → Output: audio. Simulated beep if unavailable.',
        inputs: 1, outputs: 1, headerColor: '#a855f7', requiresInput: true,
        defaults: { voice: 'en_us_001', speed: 1.0 },
        io: { inputTypes: [{ kind: 'text' }], outputType: 'audio', inputMode: 'single' },
        aiHints: {
          purpose: 'Generate speech audio from text',
          whenToUse: 'You need audio narration or voiceover from text',
          notFor: 'Transcribing audio to text',
          preconditions: 'Requires text input; apiKeys.falai recommended',
          postconditions: 'Emits an audio object or simulated beep',
          requiresKeys: ['falai'],
          tags: ['audio','tts','voice']
        }
      },
      videoExport: {
        name: 'Video Export', icon: 'Download', category: 'Output',
        description: 'Download final video file. Input: video → Output: none (download). Warns if upstream is simulated.',
        inputs: 1, outputs: 0, headerColor: '#f97316', requiresInput: true,
        defaults: { fileName: 'nlpflow_video', format: 'mp4' },
        io: { inputTypes: [{ kind: 'video' }], outputType: 'none', inputMode: 'single' },
        aiHints: {
          purpose: 'Save the final video to disk',
          whenToUse: 'You have reached the final video output',
          notFor: 'Intermediate preview or processing',
          preconditions: 'Requires a video URL from upstream',
          postconditions: 'Triggers a browser download',
          tags: ['output','download','video']
        }
      },
      audioExport: {
        name: 'Audio Export', icon: 'Download', category: 'Output',
        description: 'Download final audio file. Input: audio → Output: none (download).',
        inputs: 1, outputs: 0, headerColor: '#f97316', requiresInput: true,
        defaults: { fileName: 'nlpflow_audio', format: 'wav' },
        io: { inputTypes: [{ kind: 'audio' }], outputType: 'none', inputMode: 'single' },
        aiHints: {
          purpose: 'Save the final audio to disk',
          whenToUse: 'You have produced final audio',
          notFor: 'Interim audio inspection',
          preconditions: 'Requires audio source/URL',
          postconditions: 'Triggers a browser download',
          tags: ['output','download','audio']
        }
      },
      textExport: {
        name: 'Text Export', icon: 'Download', category: 'Output',
        description: 'Save text to a file (txt/json). Input: text → Output: none (download).',
        inputs: 1, outputs: 0, headerColor: '#f97316', requiresInput: true,
        defaults: { fileName: 'nlpflow_text', format: 'txt', pretty: true },
        io: { inputTypes: [{ kind: 'text' }], outputType: 'none', inputMode: 'single' },
        aiHints: {
          purpose: 'Export text results to disk',
          whenToUse: 'You need to persist text output',
          notFor: 'Visual display only',
          preconditions: 'Requires text input',
          postconditions: 'Triggers a browser download',
          tags: ['output','download','text']
        }
      }
    }
  };
})(window);
