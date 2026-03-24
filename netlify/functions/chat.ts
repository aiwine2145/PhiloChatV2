import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import type { Config, Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { philosopher, contents, isGroupChat } = await req.json();

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
