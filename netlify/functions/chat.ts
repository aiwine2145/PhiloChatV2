import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import type { Config, Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    let { philosopher, contents, isGroupChat } = await req.json();

    // 強制語系、節奏與人格鐵律 (Telegram-Style & Hardcore Persona)
    const personaRules = `
CRITICAL CONVERSATIONAL PACING, LANGUAGE & PERSONA RULES:
1. Strict Language Match: Auto-detect the exact language of the user's latest message and reply ONLY in that exact language. NEVER mix languages.
2. Telegram-Style Messaging: Act as if you are chatting on a modern messaging app. Match the user's message length and energy.
3. Intent Recognition & Hardcore Persona (Crucial):
   - Casual Chit-chat / Short Inputs: If the user sends a greeting, a simple emotion ("I'm hungry", "I'm angry"), or a casual statement without a deep question, DO NOT overthink or write a lecture. Respond IMMEDIATELY and VERY BRIEFLY (1-3 short sentences max). 
   - NEVER break character to be generically "polite" or "empathetic" if it contradicts your persona. If your persona is arrogant, cynical, or intense (e.g., Nietzsche), react to their mundane statement with your unique, unfiltered philosophical attitude. End with a sharp, persona-accurate question or provocation to challenge them.
   - Deep Inquiries: ONLY when the user explicitly asks a philosophical question should you provide a longer, profound response.
`;

    const groupChatRules = `
GROUP CHAT DYNAMICS: 
You are in a group chat room with other philosophers and the user. 
- If the user sends a simple casual greeting to the group (e.g., "Hi everyone", "Hello"), DO NOT give a long opening statement. Each philosopher responding must give ONLY ONE sharp, in-character sentence. (e.g., Machiavelli might just say: "Greetings. Let's see who holds the power in this room.")
- Do not act like you are giving a speech at a conference. Keep the banter fast, reactive, and brief, just like a real group chat on Telegram.
`;

    let finalRules = personaRules;
    if (isGroupChat) {
      finalRules += '\n\n' + groupChatRules;
    }

    // Append the rule to the contents to ensure it's at the end of the prompt
    if (typeof contents === 'string') {
      contents = contents + '\n\n' + finalRules;
    } else if (Array.isArray(contents)) {
      contents.push({ text: finalRules });
    } else if (contents && typeof contents === 'object' && contents.parts) {
      contents.parts.push({ text: finalRules });
    }

    // Support both GEMINI_API_KEY and API_KEY
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API Key is not configured on the server.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Use generateContentStream for streaming
    const result = await ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents,
      config: {
        temperature: 0.8,
        topK: 64,
        topP: 0.95,
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

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of result) {
            const text = chunk.text;
            if (text) {
              // Send as SSE data
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
          }
          controller.close();
        } catch (error: any) {
          console.error("Streaming Error:", error);
          // Send error as SSE data before closing
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error("API Error (Full Details):", error);
    return new Response(JSON.stringify({ error: 'Failed to generate content', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config: Config = {
  path: "/.netlify/functions/chat"
};
