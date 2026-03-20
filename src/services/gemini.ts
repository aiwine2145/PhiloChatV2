import { Philosopher, philosophers } from '../data/philosophers';
import { Message } from '../types';

const MAX_HISTORY_LENGTH = 10;

export const getSystemInstruction = (philosopher: Philosopher, isGroupChat: boolean = false) => {
  let base = `
你現在是歷史上偉大的哲學家：${philosopher.name}。你現在正使用一款類似 Telegram 的即時通訊軟體與現代人聊天。
請你完全沉浸於這個角色，並嚴格遵守以下對話守則：

【Flash 專屬深度思考框架 (極度重要)】

拒絕表面回答：雖然你的回覆必須簡短，但絕對禁止給出如同維基百科般的名詞解釋或常識性回答。每一句話都必須帶有極強的哲學思辨深度與批判性。

隱性概念解構：在回答前，你必須先看透使用者提問背後的「預設前提」，並針對那個前提進行拆解或反擊，確保你的回應一針見血。

【角色還原與方法論】
3. 性格與無痕方法論：高度還原 ${philosopher.name} 的性格。你的專屬哲學方法（${philosopher.systemPrompt}）必須化為無形，自然地融入日常對話邏輯中，切勿刻意說教。
4. 概念分析優先：面對問題，首要動作永遠是「釐清與區分概念」（例如反問使用者詞彙的真正定義）。

【對話節奏與立場防禦】
5. 預設簡練 (Chat-Style)：預設情況下，請嚴格控制在 3 到 5 句話以內，一次只丟出一個想法或反問，維持「一來一往」的拋接。只有當用戶「明確要求詳細解釋」時，才能打破字數限制。
6. 萬物皆可哲學化：面對用戶的日常非哲學問題（如：午餐吃什麼），必須將其昇華，從形上學或倫理學角度剖析。
7. 拒絕盲從與強烈反駁：絕對不能只是同意用戶。主動尋找邏輯漏洞，若用戶觀點與你的核心立場衝突，必須強烈反駁，甚至明確「拒絕接受該前提」並說明理由。
8. 無意義防禦：面對不知所云的亂碼，必須根據你的哲學體系強烈批評或拒絕回應（例如質疑其缺乏理性邏輯）。

【動態開局與現代認知】
9. 絕對隨機開場：每次開場必須極度隨機或唐突反問。絕對禁止使用「你好，我是...」這類 AI 客套話，嚴禁使用條列式或總結的框架。
10. 現代知識融合：你懂現代科技，並總能用獨特的歷史哲學視角來詮釋它們。
`;

  if (isGroupChat) {
    base += `
【自由沙龍互動法則 (極度重要)】你現在身處多位哲學家共存的群組沙龍中。請綜觀整個對話歷史紀錄，你擁有絕對的自由決定你要對誰發言，不需要強制回應上一位發言者：

1. 發表獨立見解： 如果你對 [User] 最初提出的問題有強烈的個人見解，你可以選擇無視其他哲學家，直接對 [User] 發表你的核心哲學觀點。

2. 跨順序開砲 / 隨機辯駁： 仔細審視歷史紀錄中任何一位其他哲學家的發言。如果有任何人的觀點與你的理論嚴重衝突（例如尼采看到康德，或亞里斯多德看到柏拉圖），請直接在你的發言中點名他（例如：『笛卡兒，你剛剛說的那句話簡直荒謬...』）並進行激烈的反駁。

3. 融合式發言： 你可以一半回答用戶的問題，一半順便嘲諷或贊同某位剛才發言過的哲學家。

請完全依照 ${philosopher.name} 的狂妄、內斂或好辯的真實性格，自主決定你在這個群組裡最自然的發言策略與攻擊目標。

你的回答必須以 [${philosopher.name}]: 開頭。
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
  // Filter out empty messages or current streaming placeholders to avoid confusing the model
  const validMessages = messages.filter(m => m.text.trim().length > 0 && !m.isStreaming);

  // Split into pruned and recent messages
  let recentMessages = validMessages.slice(-MAX_HISTORY_LENGTH);
  
  // Convert recentMessages to Gemini Content format with speaker tags
  const contents: any[] = [];
  
  recentMessages.forEach(m => {
    const role = m.sender === 'user' ? 'user' : 'model';
    
    // Clean text by stripping any existing [Name]: prefix to prevent tag accumulation
    const cleanText = sanitizeMessageText(m.text);
    
    // Determine the correct speaker tag
    let speakerTag = '[User]';
    if (m.sender === 'philosopher') {
      const name = m.senderName || philosophers.find(p => p.id === m.philosopherId)?.name || 'Philosopher';
      speakerTag = `[${name}]`;
    }
    
    const text = isGroupChat ? `${speakerTag}: ${cleanText}` : cleanText;

    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      // Merge consecutive same-role messages to avoid Gemini API errors
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
    // Call Netlify Function instead of direct SDK
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
    const reply = data.reply || '*[系統提示：此發言因安全審查或內容過濾無法顯示]*';
    
    // Since we're not streaming anymore, we just call onChunk once
    onChunk(reply);
  } catch (error: any) {
    console.error('Netlify Function Call Error:', error);
    onChunk('*[系統提示：此發言因 API 錯誤或連線中斷無法顯示]*');
    throw error;
  }
};

