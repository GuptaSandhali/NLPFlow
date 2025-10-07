(function (global) {
  const reg = global.NodeRegistry;
  if (!reg) return;

  const defaults = {};
  const schema = [];

  async function execute({ inputData, apiKeys, setExecutionMessage }) {
    if (!inputData || !Array.isArray(inputData) || inputData.length < 2) {
      throw new Error('❌ Gemini EditImage requires 2 inputs: Connect both an image source AND a text input.');
    }
    const imageInput = inputData.find(i => i.type === 'image');
    const promptInput = inputData.find(i => i.type === 'text');
    if (!imageInput) throw new Error('❌ No image input found! Connect an Image Input or generated image.');
    if (!promptInput) throw new Error('❌ No text input found! Connect a Text Input node with editing instructions.');
    if (!imageInput.image) throw new Error('❌ Invalid image data received.');
    const editText = (typeof promptInput.text === 'string' && promptInput.text) || '';
    if (!editText.trim()) throw new Error('❌ Empty editing text! Add text to your Text Input node.');
    if (!apiKeys?.gemini) throw new Error('❌ Gemini API key not configured! Please add your Gemini 2.5 key in API settings.');

    setExecutionMessage && setExecutionMessage(`🎨 Editing image with Gemini 2.5: "${editText.substring(0, 30)}..."`);
    try {
      let imageDataUrl = imageInput.image;
      if (imageInput.image.startsWith('http')) {
        const response = await fetch(imageInput.image);
        const blob = await response.blob();
        imageDataUrl = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      }

      const editResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKeys.gemini },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: `Edit this image: ${editText}. Make professional, high-quality edits that enhance the visual appeal while following the instructions precisely.` },
                {
                  inlineData: {
                    mimeType: imageDataUrl.includes('data:image/png') ? 'image/png' : 'image/jpeg',
                    data: imageDataUrl.split(',')[1]
                  }
                }
              ]
            }],
            generationConfig: { temperature: 0.7, candidateCount: 1 }
          })
        }
      );

      if (editResponse.ok) {
        const data = await editResponse.json();
        if (data.candidates?.[0]?.content?.parts) {
          for (const part of data.candidates[0].content.parts) {
            if (part.inlineData?.data && part.inlineData?.mimeType) {
              setExecutionMessage && setExecutionMessage('🎉 Image edited successfully!');
              return {
                image: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
                edited: true,
                type: 'image',
                usedPrompt: editText,
                originalImage: imageInput.preview || 'Original image',
                preview: `🎨 Edited: "${editText.substring(0, 40)}..."`
              };
            }
          }
        }
        // Fallback enhancement
        setExecutionMessage && setExecutionMessage('⚠️ Image editing not available, applying enhancement...');
        const canvas = document.createElement('canvas');
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = imageDataUrl;
        await new Promise(resolve => img.onload = resolve);
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const prompt = editText.toLowerCase();
        if (prompt.includes('vibrant') || prompt.includes('colorful')) {
          ctx.filter = 'saturate(1.3) contrast(1.1)';
          ctx.drawImage(canvas, 0, 0);
        } else if (prompt.includes('darker') || prompt.includes('shadow')) {
          ctx.filter = 'brightness(0.8) contrast(1.2)';
          ctx.drawImage(canvas, 0, 0);
        } else if (prompt.includes('brighter') || prompt.includes('light')) {
          ctx.filter = 'brightness(1.2) contrast(1.1)';
          ctx.drawImage(canvas, 0, 0);
        } else {
          ctx.filter = 'contrast(1.1) saturate(1.1) brightness(1.05)';
          ctx.drawImage(canvas, 0, 0);
        }
        return {
          image: canvas.toDataURL('image/png'),
          edited: true,
          type: 'image',
          usedPrompt: editText,
          preview: `⚡ Enhanced: "${editText.substring(0, 40)}..."`
        };
      } else {
        const errorData = await editResponse.text();
        console.error('Gemini EditImage API failed:', editResponse.status, errorData);
        throw new Error(`Gemini EditImage API failed: ${editResponse.status}`);
      }
    } catch (error) {
      console.error('Gemini EditImage Error:', error);
      throw error;
    }
  }

  reg.register('geminiEditImage', { defaults, schema, execute });
})(window);
