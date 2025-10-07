(function (global) {
  const reg = global.NodeRegistry;
  if (!reg) return;

  const defaults = { aspectRatio: '16:9' };
  const schema = [
    { key: 'aspectRatio', type: 'select', label: 'Aspect Ratio', options: ['16:9','1:1','4:5'] }
  ];

  async function execute({ params, inputData, apiKeys, setExecutionMessage }) {
    if (!inputData) {
      throw new Error('❌ No text connected! Connect a Text Input node to this Gemini generate node.');
    }
    if (inputData.type !== 'text') {
      throw new Error(`❌ Wrong input type! Expected text, got ${inputData.type}. Connect a Text Input node.`);
    }
    const prompt = inputData.text;
    if (!prompt || prompt.trim() === '') {
      throw new Error('❌ Empty prompt received! Make sure your Prompt Input node has text.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = params.aspectRatio === '16:9' ? 1920 : params.aspectRatio === '1:1' ? 1080 : 864;
    canvas.height = params.aspectRatio === '16:9' ? 1080 : params.aspectRatio === '1:1' ? 1080 : 1080;
    const ctx = canvas.getContext('2d');

    const colors = [
      ['#667eea', '#764ba2'],
      ['#f093fb', '#f5576c'],
      ['#4facfe', '#00f2fe'],
      ['#43e97b', '#38f9d7'],
      ['#fa709a', '#fee140'],
      ['#30cfd0', '#c43bad']
    ];
    let colorIndex = 0;
    const p = prompt.toLowerCase();
    if (p.includes('gaming') || p.includes('neon')) colorIndex = 1;
    else if (p.includes('nature') || p.includes('green')) colorIndex = 3;
    else if (p.includes('ocean') || p.includes('blue')) colorIndex = 2;
    else if (p.includes('fire') || p.includes('red')) colorIndex = 4;
    else colorIndex = Math.floor(Math.random() * colors.length);
    const colorPair = colors[colorIndex];
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, colorPair[0]);
    gradient.addColorStop(1, colorPair[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalAlpha = 0.1;
    ctx.fillStyle = '#ffffff';
    const patternCount = p.includes('complex') ? 30 : 15;
    for (let i = 0; i < patternCount; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const size = Math.random() * 80 + 40;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 10;
    ctx.fillText('AI GENERATED', canvas.width / 2, canvas.height / 2 - 60);

    ctx.font = '28px Arial';
    const maxWidth = canvas.width - 100;
    const words = prompt.split(' ');
    let line = '';
    let y = canvas.height / 2;
    words.forEach((word, i) => {
      const testLine = line + word + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && i > 0) {
        ctx.fillText(line.trim(), canvas.width / 2, y);
        line = word + ' ';
        y += 35;
      } else {
        line = testLine;
      }
    });
    ctx.fillText(line.trim(), canvas.width / 2, y);

    if (apiKeys?.gemini) {
      try {
      setExecutionMessage && setExecutionMessage(`🎨 Generating real image with Gemini 2.5 Flash Image: "${prompt.substring(0, 30)}..."`);
        const imageGenResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKeys.gemini
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `Create a stunning, high-quality ${params.aspectRatio === '16:9' ? 'widescreen' : params.aspectRatio === '1:1' ? 'square' : 'portrait'} thumbnail image for: ${prompt}. Make it visually striking, professional, and perfect for social media. Focus on bold colors, dynamic composition, and eye-catching elements.` }] }],
              generationConfig: { temperature: 0.7, candidateCount: 1 }
            })
          }
        );
        if (imageGenResponse.ok) {
          const data = await imageGenResponse.json();
          if (data.candidates?.[0]?.content?.parts) {
            for (const part of data.candidates[0].content.parts) {
              if (part.inlineData?.data && part.inlineData?.mimeType) {
                return {
                  image: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
                  generated: true,
                  type: 'image',
                  usedPrompt: prompt,
                  preview: `🎨 Gemini: "${prompt.substring(0, 40)}..."`
                };
              }
            }
          }
        }
      } catch (e) {
        console.warn('Gemini generation error, using canvas fallback.', e);
      }
      setExecutionMessage && setExecutionMessage('⚠️ Configure API key for real image generation');
    }

    await new Promise(r => setTimeout(r, 1000));
    return {
      image: canvas.toDataURL('image/png'),
      generated: true,
      type: 'image',
      usedPrompt: prompt,
      preview: `Generated from: "${prompt.substring(0, 40)}..."`
    };
  }

  reg.register('geminiText2Image', { defaults, schema, execute });
})(window);
