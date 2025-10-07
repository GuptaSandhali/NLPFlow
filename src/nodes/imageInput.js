(function (global) {
  const reg = global.NodeRegistry;
  if (!reg) return;

  const defaults = { imageData: null, fileName: null };
  const schema = [
    { key: 'imageData', type: 'image', label: 'Image' },
    { key: 'fileName', type: 'text', label: 'File Name' }
  ];

  async function execute({ params }) {
    const imageData = params?.imageData;
    if (!imageData) {
      throw new Error('No image uploaded. Please upload an image first.');
    }
    return {
      image: imageData,
      fileName: params.fileName,
      type: 'image',
      preview: params.fileName
    };
  }

  reg.register('imageInput', { defaults, schema, execute });
})(window);

