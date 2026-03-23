import { GoogleGenAI } from '@google/genai';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { userText, philosopherNames } = JSON.parse(event.body);

    if (!process.env.GEMINI_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'GEMINI_API_KEY is not configured on the server.' }),
      };
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const model = ai.models.getGenerativeModel({ 
      model: "gemini-3-flash-preview",
      generationConfig: {
        temperature: 0,
      }
    });

    const prompt = `Task: Identify the target addressee in the user's message.
Context: The active philosophers in this chat are: [${philosopherNames}].
User Message: "${userText}"

Instructions:
1. Read the user message and determine if they are directly addressing or asking a question to a specific philosopher from the list.
2. Pay attention to semantic intent (e.g., "Socrates said X, Plato what do you think?" -> the target is Plato).
3. You MUST output ONLY the exact name of the target philosopher.
4. If no specific philosopher is being addressed, or the name is not in the list, you MUST output exactly "NONE".
Do not add any conversational text, markdown, or punctuation.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routedName: text }),
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
