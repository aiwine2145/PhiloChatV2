import { GoogleGenAI } from '@google/genai';
import type { Config, Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { userText, philosophersList } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API Key is not configured on the server.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    
    // Format the list for the prompt
    const listForPrompt = philosophersList.map((p: any) => `${p.name} (ID: ${p.id})`).join(', ');
    const idList = philosophersList.map((p: any) => p.id).join(', ');

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

    return new Response(JSON.stringify({ routedName: cleanedText }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error("Router Function Error:", error);
    return new Response(JSON.stringify({ error: 'Failed to route message', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config: Config = {
  path: "/.netlify/functions/router"
};
