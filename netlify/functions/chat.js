import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';

export const handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { philosopher, contents, isGroupChat, systemInstruction } = JSON.parse(event.body);

    if (!process.env.GEMINI_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'GEMINI_API_KEY is not configured on the server.' }),
      };
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents,
      config: {
        systemInstruction,
        temperature: 0.8,
        topK: 64,
        topP: 0.95,
        stopSequences: ["\n[", "\nUser:", "(Waiting", "Waiting for"],
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
          {
            category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
        ],
      }
    });

    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason;

    if (finishReason === 'SAFETY') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          reply: '*[System Hint: This message cannot be displayed due to safety review or content filtering]*',
          isSafetyError: true 
        }),
      };
    }

    const reply = response.text || '*[System Hint: This message cannot be displayed due to unexpected reasons]*';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply }),
    };
  } catch (error) {
    console.error('Netlify Function Error:', error);
    
    // Check for Rate Limit (429)
    if (error.message?.includes('429') || error.message?.toLowerCase().includes('rate limit')) {
      return {
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Rate Limit Exceeded', 
          reply: '[System Hint: API requests are too frequent, the philosopher is deep in thought...]' 
        }),
      };
    }

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to generate content', details: error.message }),
    };
  }
};
