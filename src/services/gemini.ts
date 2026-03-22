import { Philosopher, philosophers } from '../data/philosophers';
import { Message } from '../types';

const MAX_HISTORY_LENGTH = 10;

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

  // 判斷最後一句話是否為 User 發問
  const isLastMessageUser = recentMessages.length > 0 && recentMessages[recentMessages.length - 1].sender.toLowerCase() === 'user';

  // 核心突破：讓 JS 程式碼來擲骰子，決定這個哲學家這次的發言策略
  // 設定 40% 機率獨立闡述，60% 機率觀點交鋒
  const forceIndependent = Math.random() < 0.4; 
  let strategyInstruction = "";

  if (forceIndependent) {
    strategyInstruction = "【強制行動：獨立闡述】你這次的發言「必須」完全無視歷史紀錄中的其他哲學家。直接面對 [User] 的議題發表你純粹的個人理念。";
  } else {
    strategyInstruction = "【強制行動：觀點交鋒】你這次的發言「必須」挑選歷史紀錄中「其中一位」哲學家，點名他並針對他的話進行反駁或延伸，藉此帶出你的核心觀點。最多只針對一個人。";
  }

  // 第一步：定義基礎人格與字數指令 (套用於單人與群組)
  const basePrompt = `
你現在是歷史上偉大的哲學家：${philosopher.name}。
你的核心思想與性格為：${philosopher.systemPrompt}。

【核心對話守則】
1. 性格與無痕方法論：高度還原你的性格。你的專屬哲學方法必須化為無形，自然地融入對話邏輯中，切勿刻意說教、生硬套用理論名詞或像教科書般背誦。
2. 彈性精簡原則：預設情況下，請保持發言精簡且一針見血（約 3 到 5 句話）。但若面對複雜的哲學辯證，允許你打破字數限制以確保邏輯完整，但仍必須避免無意義的長篇演講。
3. 拒絕表面回答：看透問題背後的「預設前提」並進行拆解。
4. 概念釐清與分析：著重字詞及概念的分析與區分。但請斟酌情境，「按需要」才向對方提出定義上的反問，避免為了問而問，打斷交流節奏。
`;

  // 第二步：定義群組專屬的有機互動指令 (只套用於群組)
  const groupPrompt = isGroupChat ? `
【公開沙龍互動法則】
歷史對話紀錄：
${flatContext}

1. ${strategyInstruction}
2. 【User 絕對優先】：無論你採取上述哪種行動，若 [User] 在最新訊息中提出了明確的問題，你的發言內容「必須」給出對該問題的實質回答！嚴禁只顧著與其他哲學家吵架而偏題。
` : `
【當前對話歷史】
${flatContext}

【你的任務】
請根據上述對話紀錄，發表你的哲學觀點。請直接輸出你的回覆，絕對不要在開頭加上括號或你的名字。
`;

  // 第三步：組合最終 Payload (只傳送一個 user role)
  const safePrompt = basePrompt + (isGroupChat ? '\n\n' + groupPrompt : '');

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
