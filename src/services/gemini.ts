import { Philosopher, philosophers } from '../data/philosophers';
import { Message } from '../types';

const MAX_HISTORY_LENGTH = 10;

export const getSystemInstruction = (
  philosopher: Philosopher, 
  isGroupChat: boolean = false, 
  memberNames: string[] = [],
  previousPhilosopherName?: string
) => {
  let base = `
You are the great historical philosopher: ${philosopher.name}. You are currently using a Telegram-like instant messaging app to chat with modern people.
Please immerse yourself completely in this role and strictly follow these conversation rules:

【Anti-Hallucination Warning (Extremely Important)】
You are and ONLY are ${philosopher.name}. 
Your output MUST NOT contain any name tags or prefixes (e.g., DO NOT start with [${philosopher.name}]: or ${philosopher.name}:). 
Just start speaking directly in the first person. 
Stop generating immediately after your own speech. Never write lines for others.

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
    const roster = memberNames.join(', ');
    base += `
【自由沙龍互動法則 - 修正案 (極度重要)】

1. 僅此一家： 你是而且只能是 ${philosopher.name}。你的輸出嚴禁包含任何其他成員的名字標籤（如 [Laozi]:, [Confucius]:）。你絕對不可以代入任何其他人說話。

2. 不可預知： 對話紀錄中尚未出現的內容（例如其他哲學家的觀點），對你來說是未知的。你絕對禁止針對未來的、預測的、或腦補的其他成員觀點進行回應（即使你知道他們在群組裡）。你只能針對歷史紀錄中已存在的文字（[User] 或 [其他成員] 的已發言內容）進行辯論。

3. 說完就停： 發表完你的一個觀點後，請立刻停止所有文字輸出。絕對禁止撰寫任何關於 UI 佔位符或系統提示的文字。

【Current Group Roster】
The only members in this chat room are: ${roster}.
You MUST NOT mention or attempt to respond to any philosopher NOT on this list (e.g., if Nietzsche or Kant are not on the list, treat them as non-existent). You can only interact with people on this list or [User].

DO NOT include your name tag [${philosopher.name}]: in your output. Just start your speech.
`;

    if (previousPhilosopherName) {
      base += `
【Parrot 防護指令】
你現在必須對 ${previousPhilosopherName} 剛才的發言發表一個新的視角，絕對禁止重複或改寫最初 [User] 的提問。
`;
    }
  }

  return base;
};

/**
 * Strips all speaker tags from the beginning of a message.
 * Also removes hallucinated UI system text.
 */
export const sanitizeMessageText = (text: string): string => {
  // 1. Strip speaker tags [Name]: or [Name]： using the requested robust regex
  let clean = text.replace(/^\[.*?\][:：]?\s*/, '').trim();
  
  // 2. Strip hallucinated UI text like (Waiting for your reply...)
  clean = clean.replace(/\(Waiting for your (reply|input|response)\.\.\.\)/gi, '');
  clean = clean.replace(/\(Waiting\.\.\.\)/gi, '');
  
  return clean.trim();
};

export const sendMessageToPhilosopherStream = async (
  philosopher: Philosopher,
  messages: Message[],
  onChunk: (text: string) => void,
  isGroupChat: boolean = false,
  memberNames: string[] = [],
  nextPhilosopherName?: string,
  previousPhilosopherName?: string
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
  
  // 核心概念：放棄傳送陣列歷史，改為傳送單一 Prompt 字串 (Context Flattening)
  const flatContext = recentMessages.map(m => {
    const cleanText = sanitizeMessageText(m.text);
    let speakerTag = 'User';
    if (m.sender === 'philosopher') {
      speakerTag = m.senderName || philosophers.find(p => p.id === m.philosopherId)?.name || 'Philosopher';
    }
    return `[${speakerTag}]: ${cleanText}`;
  }).join('\n\n');

  const systemInstruction = getSystemInstruction(philosopher, isGroupChat, memberNames, previousPhilosopherName);

  // 將所有上下文包裝成唯一一個 user 角色的 contents
  const contents = [{
    role: "user",
    parts: [{ 
      text: `以下是群組聊天室目前的完整對話紀錄：\n\n${flatContext}\n\n[系統指令]：現在請你扮演 ${philosopher.name}，根據上述對話紀錄，直接給出你的回覆。請勿輸出 [名字] 標籤。` 
    }]
  }];

  // 第一項修復：放寬 『停止詞 (Stop Sequences)』，移除單獨的中括號攔截
  const stopSequences = ["(Waiting", "Waiting for", "\nUser:", "User:", "\n[User]"];
  if (nextPhilosopherName) {
    stopSequences.push(`\n${nextPhilosopherName}:`);
    stopSequences.push(` [${nextPhilosopherName}]:`);
  }

  try {
    const response = await fetch('/.netlify/functions/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        philosopher,
        contents,
        isGroupChat,
        systemInstruction,
        stopSequences
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      // Handle 429 specifically if returned from function
      if (response.status === 429) {
        onChunk(data.reply || '[System Hint: API requests are too frequent, the philosopher is deep in thought...]');
        return;
      }
      throw new Error(data.error || 'Failed to call Netlify function');
    }

    const reply = data.reply || '';
    
    // 第二項：Regex 強制修剪 (事後清洗)
    const cleanReply = sanitizeMessageText(reply);
    
    // 第三項：防止空字串崩潰 (Graceful Fallback)
    if (cleanReply.length === 0) {
      throw new Error('AI returned an empty response after sanitization');
    }
    
    // Manually prepend the tag for UI and history consistency
    const taggedReply = isGroupChat ? `[${philosopher.name}]: ${cleanReply}` : cleanReply;
    
    onChunk(taggedReply);
  } catch (error: any) {
    console.error('Netlify Function Call Error:', error);
    // If it's a rate limit error that wasn't caught by status code (unlikely but safe)
    if (error.message?.includes('429') || error.message?.toLowerCase().includes('rate limit')) {
      onChunk('[System Hint: API requests are too frequent, the philosopher is deep in thought...]');
    } else {
      onChunk('*[System Hint: This message cannot be displayed due to API error or connection interruption]*');
    }
    throw error;
  }
};



