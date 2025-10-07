(function (global) {
  const reg = global.NodeRegistry;
  if (!reg) return;

  const defaults = { videoFile: null, videoFileName: null };
  const schema = [
    { key: 'videoFile', type: 'file', label: 'Video File' },
    { key: 'videoFileName', type: 'text', label: 'File Name' }
  ];

  async function execute({ params }) {
    const videoFile = params?.videoFile;
    if (!videoFile) {
      throw new Error('No video file uploaded. Please upload a video file first.');
    }
    // Create an object URL so downstream nodes (e.g., export) can consume it
    let url = null;
    try {
      url = URL.createObjectURL(videoFile);
    } catch (_) {}
    return {
      type: 'video',
      videoUrl: url,
      url,
      fileName: params?.videoFileName || videoFile.name || 'video',
      preview: params?.videoFileName || videoFile.name || 'Video file'
    };
  }

  reg.register('videoInput', { defaults, schema, execute });
})(window);

