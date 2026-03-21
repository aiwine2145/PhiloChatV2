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
  
  // 核心概念：極簡化 Payload (Naked Payload)
  const flatContext = recentMessages.map(m => {
    const cleanText = sanitizeMessageText(m.text);
    let speakerTag = 'User';
    if (m.sender === 'philosopher') {
      speakerTag = m.senderName || philosophers.find(p => p.id === m.philosopherId)?.name || 'Philosopher';
    }
    return `[${speakerTag}]: ${cleanText}`;
  }).join('\n\n');

  // 第一步：定義基礎人格與字數指令 (套用於單人與群組)
  const basePrompt = `
你現在是歷史上偉大的哲學家：${philosopher.name}。
你的核心思想與性格為：${philosopher.systemPrompt}。

【核心對話守則】
1. 性格與無痕方法論：高度還原你的性格。你的專屬哲學方法必須化為無形，自然地融入對話邏輯中，切勿刻意說教、生硬套用理論名詞或像教科書般背誦。
2. 彈性精簡原則：預設情況下，請保持發言精簡且一針見血（約 3 到 5 句話）。但若面對極度複雜的哲學辯證，允許你打破字數限制以確保邏輯完整，但仍必須避免無意義的長篇演講。
3. 拒絕表面回答：看透問題背後的「預設前提」並進行拆解。
`;

  // 第二步：定義群組專屬的有機互動指令 (只套用於群組)
  const groupPrompt = isGroupChat ? `
【自由沙龍互動法則 (極度重要)】
請根據以下群組歷史對話進行發言：
${flatContext}

互動最高指導原則：
1. 拒絕點名式疊加回應：你**絕對不需要**回應前面發言的「每一個人」。嚴禁在發言中逐一盤點其他人的觀點。
2. 有機且自由的互動：你擁有絕對的自由。你可以選擇：
   - (A) 完全無視其他哲學家，直接、純粹地回答 [User] 最初的問題。
   - (B) 如果歷史紀錄中某「一位」哲學家的觀點讓你極度不認同（或極度贊同），你可以專注於只針對「那一個人」進行深刻的反駁或延伸。
3. 真實氛圍：讓對話像真實的咖啡館沙龍，有時自顧自地發表看法，有時激烈交鋒，請依據你的哲學家性格自行判斷最自然的反應。
` : `
【當前對話歷史】
${flatContext}

【你的任務】
請根據上述對話紀錄，發表你的哲學觀點。請直接輸出你的回覆，絕對不要在開頭加上括號或你的名字。
`;

  // 第三步：組合 Payload
  const safePrompt = basePrompt + groupPrompt;

  // 將所有上下文包裝成唯一一個 user 角色的 contents
  const contents = [{
    role: "user",
    parts: [{ text: safePrompt }]
  }];

  try {
    const response = await fetch('/.netlify/functions/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        philosopher,
        contents,
        isGroupChat
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



