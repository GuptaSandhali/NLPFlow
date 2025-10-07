(function (global) {
  const reg = global.NodeRegistry;
  if (!reg) return;

  const defaults = {};
  const schema = [];

  async function execute({ inputData, apiKeys, setExecutionMessage }) {
    if (!inputData || !Array.isArray(inputData)) {
      throw new Error('❌ LLM_Text_Call requires inputs: connect content text and instructions text.');
    }
    const texts = inputData.filter(i => i && i.type === 'text');
    if (texts.length < 2) {
      throw new Error('❌ Connect two Text Input nodes: one with the content to process, and one with instructions for the LLM.');
    }
    const content = texts[0]?.text || '';
    const instructions = texts[1]?.text || '';
    if (!content.trim()) throw new Error('❌ Empty content text!');
    if (!instructions.trim()) throw new Error('❌ Empty instructions text!');
    if (!apiKeys?.openai) throw new Error('❌ OpenAI API key not configured! Please add your OpenAI key in API settings.');

    setExecutionMessage && setExecutionMessage('🤖 Processing text with OpenAI...');
    const llmResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKeys.openai}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: instructions },
          { role: 'user', content: content }
        ],
        max_tokens: 1000,
        temperature: 0.7
      })
    });
    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error('OpenAI API Error:', llmResponse.status, errorText);
      throw new Error(`OpenAI API failed: ${llmResponse.status}`);
    }
    const llmResult = await llmResponse.json();
    let generatedText = '';
    if (llmResult.choices?.[0]?.message?.content) {
      generatedText = llmResult.choices[0].message.content.trim();
    }
    if (!generatedText) throw new Error('❌ No response from OpenAI. Please try again.');
    setExecutionMessage && setExecutionMessage('✅ Text processed successfully!');
    return { type: 'text', text: generatedText, processed: true, usedPrompt: instructions, originalText: content, preview: generatedText.substring(0, 80) };
  }

  reg.register('llmTextCall', { defaults, schema, execute });
})(window);
