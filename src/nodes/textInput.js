(function (global) {
  const reg = global.NodeRegistry;
  if (!reg) return;

  const defaults = { text: '' };
  const schema = [
    { key: 'text', type: 'textarea', label: 'Text' }
  ];

  async function execute({ params, setExecutionMessage }) {
    const text = (params?.text || '').trim();
    if (!text) throw new Error('Text is empty. Please enter some text.');
    if (typeof setExecutionMessage === 'function') setExecutionMessage('📝 Emitting text...');
    await new Promise(r => setTimeout(r, 200));
    return { type: 'text', text, preview: text.substring(0, 80) };
  }

  reg.register('textInput', { defaults, schema, execute });
})(window);

