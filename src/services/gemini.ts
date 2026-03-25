import { Philosopher, philosophers } from '../data/philosophers';
import { Message } from '../types';

const MAX_HISTORY_LENGTH = 20;

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

/**
 * Router Agent (意圖判定) - 改為呼叫 Netlify Function
 * Identifies the target addressee in the user's message.
 */
export const routeGroupMessage = async (
  userText: string,
  activePhilosophers: Philosopher[]
): Promise<string> => {
  const philosophersList = activePhilosophers.map(p => ({ name: p.name, id: p.id }));
  
  try {
    const response = await fetch('/.netlify/functions/router', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userText, philosophersList }),
    });

    if (!response.ok) {
      throw new Error('Router function failed');
    }

    const data = await response.json();
    return data.routedName || "NONE";
  } catch (error) {
    console.error("Router Agent Error (via Proxy):", error);
    return "NONE";
  }
};

/**
 * 發送訊息到哲學家 - 改為呼叫 Netlify Function (不支援串流，但確保金鑰安全)
 */
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

  // 動態機率與「動態字數分配」 (40% 獨立，60% 交鋒)
  const forceIndependent = Math.random() < 0.4; 
  let strategyInstruction = "";

  if (forceIndependent) {
    strategyInstruction = "【強制行動：獨立闡述】完全無視其他哲學家。直接對 [User] 的議題發表你純粹的個人理念。（字數嚴格限制：請保持在 3 到 5 句話內，精簡有力）";
  } else {
    strategyInstruction = "【強制行動：先回 User，再戰同儕】你「必須」先正面且自然地回答 [User] 的問題。在闡述完你的核心觀點後，再挑選歷史紀錄中「其中一位已發言」的哲學家的觀點進行反駁或延伸，藉由打擊對手來強化你的論述。最多只針對一個人。**嚴禁對著空氣喊話或召喚不在歷史紀錄中的人物（例如你的歷史宿敵）。若歷史紀錄中除了 User 外，尚無其他哲學家發言，請自動轉為【獨立闡述】。**（字數彈性限制：為了兼顧兩者，允許擴展至 4 到 7 句精要論述）";
  }

  const basePrompt = `
你現在是歷史上偉大的哲學家：${philosopher.name}。
你的核心思想與性格為：${philosopher.systemPrompt}。

【核心對話守則】
1. 性格與無痕方法論：高度還原你的性格。你的專屬哲學方法必須化為無形，自然地融入對話邏輯中，切勿刻意說教、生硬套用理論名詞或像教科書般背誦。
2. 彈性精簡原則：依據結尾的「強制行動」字數指示發言。面對複雜的哲學辯證時允許打破限制以確保邏輯完整，但絕對要避免無意義的長篇演講。
3. 拒絕表面回答：看透問題背後的「預設前提」並進行拆解。
4. 概念釐清與區分（主動思辨）：著重對字詞及概念的精準分析。請主動辨析語境中容易混淆的概念（例如：區分「有意義」與「有價值」的本質差異），並指出其中的邏輯矛盾或深層關聯，展現哲學深度。
5. 克制定義型反問（被動約束）：嚴禁為了展現哲學感而刻意反問對方「請定義你的OO」。只有在字詞存在「明顯且會影響推論的歧義」或「極度需要界定討論範圍」的必要時刻，才允許向對方提問。若無歧義，請直接針對內容給出論述。
`;

  const promptWithContext = isGroupChat ? `
【公開沙龍歷史紀錄】
${flatContext}

【你現在的最高執行指令】
1. ${strategyInstruction}
2. 【嚴禁 AI 機器人開場白】：無論你採取哪種行動，**絕對禁止**使用「回答你的問題：」、「關於你的提問：」、「首先：」這種生硬的客服式轉折語。請像真實的哲學大師一樣，開門見山、行雲流水地將你的答案與反駁融入你的自然語氣中。
` : `
【當前對話歷史】
${flatContext}

【你的任務】
請根據上述對話紀錄，發表你的哲學觀點。請直接輸出你的回覆，絕對不要在開頭加上括號或你的名字。
`;

  const languageMirroringRule = `
CRITICAL INSTRUCTION REGARDING LANGUAGE: 
You MUST explicitly detect the language of the user's latest input message and reply in the EXACT SAME LANGUAGE. 
- If the user asks in English, your entire response MUST be in English. 
- If the user asks in Traditional Chinese, your entire response MUST be in Traditional Chinese.
Do NOT mix languages. This rule overrides any other language preferences.
`;

  const safePrompt = basePrompt + '\n\n' + promptWithContext + '\n\n' + languageMirroringRule;

  try {
    const response = await fetch('/.netlify/functions/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        philosopher: philosopher.name,
        contents: safePrompt,
        isGroupChat 
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Chat function failed');
    }

    // Handle streaming response (Server-Sent Events)
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No reader available');

    const decoder = new TextDecoder();
    let fullText = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) {
              fullText += data.text;
              const cleanReply = sanitizeMessageText(fullText);
              const taggedReply = isGroupChat ? `[${philosopher.name}]: ${cleanReply}` : cleanReply;
              onChunk(taggedReply);
            } else if (data.error) {
              throw new Error(data.error);
            }
          } catch (e) {
            // Ignore parse errors for incomplete lines
          }
        }
      }
    }

  } catch (error: any) {
    console.error('Gemini API Error (via Proxy):', error);
    if (error.message?.includes('429') || error.message?.toLowerCase().includes('rate limit')) {
      onChunk('[System Hint: API requests are too frequent, the philosopher is deep in thought...]');
    } else {
      onChunk('*[System Hint: This message cannot be displayed due to API error or connection interruption]*');
    }
    throw error;
  }
};
