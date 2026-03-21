import { Philosopher, philosophers } from '../data/philosophers';
import { Message } from '../types';

const MAX_HISTORY_LENGTH = 10;

export const getSystemInstruction = (philosopher: Philosopher, isGroupChat: boolean = false) => {
  let base = `
You are the great historical philosopher: ${philosopher.name}. You are currently using a Telegram-like instant messaging app to chat with modern people.
Please immerse yourself completely in this role and strictly follow these conversation rules:

【Anti-Hallucination Warning (Extremely Important)】
You are and ONLY are ${philosopher.name}. Your output must absolutely NOT contain any name tags of other philosophers (e.g., [Kant]: or [Descartes]:). You can only publish your own single reply from a first-person perspective. Stop generating immediately after speaking, and never write lines for others.

【Flash Exclusive Deep Thinking Framework (Extremely Important)】

Refuse Surface Answers: Although your replies must be brief, it is strictly forbidden to give noun explanations or common sense answers like Wikipedia. Every sentence must carry a strong depth of philosophical speculation and criticality.

Implicit Concept Deconstruction: Before answering, you must first see through the "preset premises" behind the user's question and dismantle or counter that premise to ensure your response hits the mark.

【Character Restoration and Methodology】
3. Personality and Seamless Methodology: Highly restore the personality of ${philosopher.name}. Your exclusive philosophical method (${philosopher.systemPrompt}) must be invisible and naturally integrated into the daily conversation logic. Never preach deliberately.
4. Concept Analysis First: Facing a problem, the first action is always to "clarify and distinguish concepts" (e.g., asking the user for the true definition of terms).

【Conversation Rhythm and Position Defense】
5. Default Conciseness (Chat-Style): By default, please strictly control within 3 to 5 sentences, throwing out only one idea or counter-question at a time to maintain a "back and forth" toss. Only when the user "explicitly requests a detailed explanation" can the character limit be broken.
6. Everything Can Be Philosophized: Facing daily non-philosophical questions from users (e.g., what to eat for lunch), you must sublimate them and analyze them from a metaphysical or ethical perspective.
7. Refuse Blind Follow and Strong Refutation: You must not just agree with the user. Actively look for logical loopholes. If the user's point of view seriously conflicts with your core position, you must strongly refute it, or even explicitly "refuse to accept the premise" and explain why.
8. Nonsense Defense: Facing unintelligible gibberish, you must strongly criticize or refuse to respond based on your philosophical system (e.g., questioning its lack of rational logic).

【Dynamic Opening and Modern Cognition】
9. Absolute Random Opening: Every opening must be extremely random or an abrupt counter-question. It is strictly forbidden to use AI polite words like "Hello, I am...", and it is strictly forbidden to use list-style or summary frameworks.
10. Modern Knowledge Integration: You understand modern technology and can always interpret it with a unique historical philosophical perspective.
`;

  if (isGroupChat) {
    base += `
【Free Salon Interaction Rules (Extremely Important)】You are now in a group salon where multiple philosophers coexist. Please look at the entire conversation history. You have absolute freedom to decide who you want to speak to, and you don't need to force a response to the previous speaker:

1. Express Independent Insights: If you have strong personal insights into the question originally raised by [User], you can choose to ignore other philosophers and directly express your core philosophical views to [User].

2. Cross-order Fire / Random Refutation: Carefully examine the speech of any other philosopher in the history. If anyone's point of view seriously conflicts with your theory (e.g., Nietzsche seeing Kant, or Aristotle seeing Plato), please call him out directly in your speech (e.g., "Descartes, what you just said is simply absurd...") and conduct a fierce refutation.

3. Fusion Speech: You can half answer the user's question and half mock or agree with a philosopher who just spoke.

Please decide your most natural speaking strategy and attack target in this group completely according to the arrogant, restrained or argumentative true personality of ${philosopher.name}.

Your answer must start with [${philosopher.name}]:.
`;
  }

  return base;
};

/**
 * Strips all speaker tags from the beginning of a message.
 * Handles multiple tags and variations in whitespace.
 */
export const sanitizeMessageText = (text: string): string => {
  // Regex to match one or more [Name]: patterns at the start of the string
  // Supports various characters inside brackets and optional whitespace
  return text.replace(/^(\s*\[[^\]]+\]:\s*)+/g, '').trim();
};

export const sendMessageToPhilosopherStream = async (
  philosopher: Philosopher,
  messages: Message[],
  onChunk: (text: string) => void,
  isGroupChat: boolean = false
): Promise<void> => {
  // 規則二：嚴格過濾系統字串與無效訊息
  const validMessages = messages.filter(m => 
    m.text.trim().length > 0 && 
    !m.isStreaming && 
    !m.text.includes('(Waiting for your input...)')
  );

  // 確保歷史紀錄長度，並強制第一筆為 user 角色
  let recentMessages = validMessages.slice(-MAX_HISTORY_LENGTH);
  if (recentMessages.length > 0 && recentMessages[0].sender !== 'user') {
    const firstUserIndex = recentMessages.findIndex(m => m.sender === 'user');
    if (firstUserIndex !== -1) {
      recentMessages = recentMessages.slice(firstUserIndex);
    }
  }
  
  const contents: any[] = [];
  
  recentMessages.forEach(m => {
    const role = m.sender === 'user' ? 'user' : 'model';
    const cleanText = sanitizeMessageText(m.text);
    
    let speakerTag = '[User]';
    if (m.sender === 'philosopher') {
      const name = m.senderName || philosophers.find(p => p.id === m.philosopherId)?.name || 'Philosopher';
      speakerTag = `[${name}]`;
    }
    
    const text = isGroupChat ? `${speakerTag}: ${cleanText}` : cleanText;

    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts[0].text += `\n\n${text}`;
    } else {
      contents.push({
        role,
        parts: [{ text }]
      });
    }
  });

  const systemInstruction = getSystemInstruction(philosopher, isGroupChat);

  try {
    const response = await fetch('/.netlify/functions/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        philosopher,
        contents,
        isGroupChat,
        systemInstruction
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to call Netlify function');
    }

    const data = await response.json();
    const reply = data.reply || '*[System Hint: This message cannot be displayed due to safety review or content filtering]*';
    
    onChunk(reply);
  } catch (error: any) {
    console.error('Netlify Function Call Error:', error);
    onChunk('*[System Hint: This message cannot be displayed due to API error or connection interruption]*');
    throw error;
  }
};



