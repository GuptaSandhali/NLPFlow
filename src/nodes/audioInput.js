// src/nodes/audioInput.js
(function (global) {
  const reg = global.NodeRegistry;
  if (!reg) return;

  const defaults = { 
    audioFile: null, 
    audioFileName: null 
  };
  
  const schema = [
    { key: 'audioFile', type: 'file', label: 'Audio File' },
    { key: 'audioFileName', type: 'text', label: 'File Name' }
  ];

  async function execute({ params }) {
    const audioFile = params?.audioFile;
    if (!audioFile) {
      throw new Error('No audio file uploaded. Please upload an audio file first.');
    }
    
    // Handle both File objects and data URLs
    if (audioFile instanceof File || audioFile instanceof Blob) {
      // File object - create blob URL for playback
      const url = URL.createObjectURL(audioFile);
      return {
        type: 'audio',
        audioFile: audioFile,
        audioUrl: url,
        url,
        fileName: params?.audioFileName || audioFile.name || 'audio',
        preview: `🎵 ${params?.audioFileName || audioFile.name || 'Audio file'}`
      };
    } else if (typeof audioFile === 'string') {
      // Data URL or external URL - use directly
      return {
        type: 'audio',
        audioFile: audioFile,  // Data URL string
        audioUrl: audioFile,   // Same for playback
        url: audioFile,
        fileName: params?.audioFileName || 'audio-file',
        preview: `🎵 ${params?.audioFileName || 'Audio file'}`
      };
    }
    
    throw new Error('Invalid audio file format');
  }

  reg.register('audioInput', { defaults, schema, execute });
})(window);