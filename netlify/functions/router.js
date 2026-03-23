import { GoogleGenAI } from '@google/genai';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { userText, philosophersList } = JSON.parse(event.body);

    if (!process.env.GEMINI_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'GEMINI_API_KEY is not configured on the server.' }),
      };
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    // Format the list for the prompt
    const listForPrompt = philosophersList.map(p => `${p.name} (ID: ${p.id})`).join(', ');
    const idList = philosophersList.map(p => p.id).join(', ');

    const prompt = `Task: Identify the target addressee in the user's message.
Context: The active philosophers in this chat are: [${listForPrompt}].
User Message: "${userText}"

Instructions:
1. Read the user message and determine if they are directly addressing or asking a question to a specific philosopher from the list.
2. Pay attention to semantic intent (e.g., "Socrates said X, Plato what do you think?" -> the target is Plato).
3. You MUST output EXACTLY ONE name from the provided list (use the English ID if possible).
4. DO NOT output Chinese names.
5. DO NOT add any markdown formatting (like \`\`\`), punctuation, or extra words.
6. If no specific philosopher is being addressed, or the name is not in the list, you MUST output exactly "NONE".

Allowed Output List: [${idList}, NONE]`;

    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        temperature: 0,
      }
    });

    let text = result.text || "NONE";
    
    // Cleanup: Remove non-alphabetic characters and trim
    const cleanedText = text.replace(/[^a-zA-Z]/g, '').trim();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routedName: cleanedText }),
    };
  } catch (error) {
    console.error("Router Function Error:", error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to route message', details: error.message }),
    };
  }
};
