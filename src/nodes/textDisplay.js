(function (global) {
  const reg = global.NodeRegistry;
  if (!reg) return;

  const defaults = {};
  const schema = [];

  async function execute({ node, inputData, setExecutionMessage, updateNodeParameters }) {
    if (!inputData) throw new Error('❌ No text input connected! Connect a text source.');
    if (inputData.type !== 'text') throw new Error(`❌ Wrong input type! Expected text, got ${inputData.type}.`);
    if (!inputData.text) throw new Error('❌ No text content to display!');
    setExecutionMessage && setExecutionMessage('👁 Displaying text content...');
    if (typeof updateNodeParameters === 'function') {
      updateNodeParameters(node.id, {
        displayedText: inputData.text,
        lastUpdated: new Date().toLocaleString()
      });
    }
    return { type: 'text', text: inputData.text, displayed: true, preview: `👁 Displaying: "${inputData.text.substring(0, 60)}${inputData.text.length > 60 ? '...' : ''}"` };
  }

  reg.register('textDisplay', { defaults, schema, execute });
})(window);

