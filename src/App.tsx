/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { philosophers } from './data/philosophers';
import { Message, ChatHistory, Group } from './types';
import { sendMessageToPhilosopherStream } from './services/gemini';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import CreateGroupModal from './components/CreateGroupModal';

const STORAGE_KEY = 'philoChatHistory';
const GROUPS_STORAGE_KEY = 'philoGroups';

export default function App() {
  const [groups, setGroups] = useState<Group[]>(() => {
    const saved = localStorage.getItem(GROUPS_STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse groups from local storage", e);
      }
    }
    return [];
  });

  const [selectedPhilosopherId, setSelectedPhilosopherId] = useState<string>(philosophers[0].id);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistory>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const restoredHistory: ChatHistory = {};
        for (const [philosopherId, messages] of Object.entries(parsed)) {
          restoredHistory[philosopherId] = (messages as any[]).map(msg => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }));
        }
        return restoredHistory;
      } catch (e) {
        console.error("Failed to parse chat history from local storage", e);
      }
    }
    return {};
  });
  const [isTyping, setIsTyping] = useState(false);
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
  const [selectedGroupPhilosophers, setSelectedGroupPhilosophers] = useState<string[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chatHistory));
  }, [chatHistory]);

  useEffect(() => {
    localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(groups));
  }, [groups]);

  const selectedGroup = groups.find(g => g.id === selectedPhilosopherId);
  const selectedPhilosopher = selectedGroup
    ? { 
        id: selectedGroup.id, 
        name: selectedGroup.name, 
        shortDescription: `${selectedGroup.memberIds.length} 位哲學家在此對話`, 
        icon: philosophers[0].icon, 
        bg: 'bg-indigo-900', 
        color: 'text-white', 
        systemPrompt: '' 
      } as any
    : philosophers.find(p => p.id === selectedPhilosopherId)!;
  
  const currentMessages = chatHistory[selectedPhilosopherId] || [];

  const handleSelectPhilosopher = (id: string) => {
    setSelectedPhilosopherId(id);
    setIsMobileChatOpen(true);
    // Reset group selections when switching groups
    if (id.startsWith('group-')) {
      setSelectedGroupPhilosophers([]);
    }
  };

  const handleBackToList = () => {
    setIsMobileChatOpen(false);
  };

  const handleClearChat = () => {
    setChatHistory(prev => {
      const newHistory = { ...prev };
      delete newHistory[selectedPhilosopherId];
      return newHistory;
    });
  };

  const handleCreateGroup = (name: string, memberIds: string[]) => {
    const newGroup: Group = {
      id: `group-${Date.now()}`,
      name,
      memberIds,
    };
    setGroups(prev => [...prev, newGroup]);
    setSelectedPhilosopherId(newGroup.id);
    setIsCreateModalOpen(false);
    setIsMobileChatOpen(true);
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isTyping) return;

    const isGroupChat = selectedPhilosopherId.startsWith('group-');
    
    let finalMessageText = text;
    if (replyingToMessage) {
      finalMessageText = `[引用過往訊息]：「${replyingToMessage.text}」\n\n[我的新回覆]：${text}`;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      senderName: 'User',
      text: finalMessageText,
      timestamp: new Date(),
    };

    setChatHistory(prev => ({
      ...prev,
      [selectedPhilosopherId]: [...(prev[selectedPhilosopherId] || []), userMessage]
    }));

    setIsTyping(true);
    setReplyingToMessage(null);

    if (isGroupChat && selectedGroup) {
      // 第一步：決定『初始發言名單 (Speaker Queue)』
      let speakerQueue = [...selectedGroupPhilosophers];
      
      if (speakerQueue.length === 0) {
        // 如果沒有任何點名：從當前群組的 members 名單中，隨機挑選 1位
        const randomId = selectedGroup.memberIds[Math.floor(Math.random() * selectedGroup.memberIds.length)];
        speakerQueue = [randomId];
      }

      // 第二步：嚴格的『接力賽』串流處理 (Strict Sequential Processing)
      // 使用 for...of 迴圈搭配 await，確保 B 能看到 A 的發言
      let currentHistory = [...(chatHistory[selectedPhilosopherId] || []), userMessage];

      for (const philoId of speakerQueue) {
        // 每次迴圈開始前，currentHistory 已經包含了上一位哲學家的完整發言
        const currentPhilosopher = philosophers.find(p => p.id === philoId);
        if (!currentPhilosopher) continue;

        const philosopherMessageId = `${Date.now()}-${philoId}`;
        
        const initialPhilosopherMessage: Message = {
          id: philosopherMessageId,
          sender: 'philosopher',
          philosopherId: philoId,
          senderName: currentPhilosopher.name,
          text: '',
          timestamp: new Date(),
          isStreaming: true,
        };

        setChatHistory(prev => ({
          ...prev,
          [selectedPhilosopherId]: [...(prev[selectedPhilosopherId] || []), initialPhilosopherMessage]
        }));

        let accumulatedText = '';
        try {
          await sendMessageToPhilosopherStream(currentPhilosopher, currentHistory, (chunkText) => {
            accumulatedText = chunkText;
            setChatHistory(prev => {
              const messages = prev[selectedPhilosopherId] || [];
              const updatedMessages = messages.map(msg => 
                msg.id === philosopherMessageId ? { ...msg, text: chunkText } : msg
              );
              return {
                ...prev,
                [selectedPhilosopherId]: updatedMessages
              };
            });
          }, true);

          // 當哲學家 A 串流發言完畢後，將 A 的完整發言正式存入 local 歷史副本，供下一位哲學家 B 使用
          const finalPhiloMsg: Message = {
            ...initialPhilosopherMessage,
            text: accumulatedText,
            isStreaming: false
          };
          currentHistory = [...currentHistory, finalPhiloMsg];

        } catch (error: any) {
          console.error(`Failed to send message to ${currentPhilosopher.name}:`, error);
          // Ensure we have some text even on error if gemini.ts didn't provide it
          if (!accumulatedText) {
            accumulatedText = '*[系統提示：此發言因 API 錯誤或連線中斷無法顯示]*';
          }
        } finally {
          setChatHistory(prev => {
            const messages = prev[selectedPhilosopherId] || [];
            return {
              ...prev,
              [selectedPhilosopherId]: messages.map(msg => 
                msg.id === philosopherMessageId ? { ...msg, isStreaming: false, text: accumulatedText || msg.text || '*[系統提示：此發言因非預期原因無法顯示]*' } : msg
              )
            };
          });
        }
      }

      // 第四步：保留自動反駁機制的次數限制 (Auto-Rebuttal Turn Limit)
      // 目前僅處理 speakerQueue。若未來增加「自動跳出反駁」邏輯，則在該邏輯中套用「連續發言不得超過 2 次」限制。
      
      setIsTyping(false);
    } else {
      // 1-on-1 Logic (Original)
      const philosopherMessageId = (Date.now() + 1).toString();
      const initialPhilosopherMessage: Message = {
        id: philosopherMessageId,
        sender: 'philosopher',
        philosopherId: selectedPhilosopherId,
        senderName: selectedPhilosopher.name,
        text: '',
        timestamp: new Date(),
        isStreaming: true,
      };

      setChatHistory(prev => ({
        ...prev,
        [selectedPhilosopherId]: [...(prev[selectedPhilosopherId] || []), initialPhilosopherMessage]
      }));

      let accumulatedText = '';
      try {
        const historyToSend = [...currentMessages, userMessage];
        await sendMessageToPhilosopherStream(selectedPhilosopher, historyToSend, (chunkText) => {
          accumulatedText = chunkText;
          setChatHistory(prev => {
            const messages = prev[selectedPhilosopherId] || [];
            return {
              ...prev,
              [selectedPhilosopherId]: messages.map(msg => 
                msg.id === philosopherMessageId ? { ...msg, text: chunkText } : msg
              )
            };
          });
        });
      } catch (error: any) {
        console.error("Failed to send message:", error);
        if (!accumulatedText) {
          accumulatedText = '*[系統提示：此發言因 API 錯誤或連線中斷無法顯示]*';
        }
      } finally {
        setChatHistory(prev => {
          const messages = prev[selectedPhilosopherId] || [];
          return {
            ...prev,
            [selectedPhilosopherId]: messages.map(msg => 
              msg.id === philosopherMessageId ? { ...msg, isStreaming: false, text: accumulatedText || msg.text || '*[系統提示：此發言因非預期原因無法顯示]*' } : msg
            )
          };
        });
        setIsTyping(false);
      }
    }
  };

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden font-sans">
      <Sidebar 
        philosophers={philosophers} 
        groups={groups}
        selectedId={selectedPhilosopherId} 
        onSelect={handleSelectPhilosopher}
        chatHistory={chatHistory}
        isMobileChatOpen={isMobileChatOpen}
        onCreateGroupClick={() => setIsCreateModalOpen(true)}
      />
      <ChatArea 
        philosopher={selectedPhilosopher} 
        messages={currentMessages} 
        onSendMessage={handleSendMessage}
        onClearChat={handleClearChat}
        isTyping={isTyping}
        onBack={handleBackToList}
        isMobileChatOpen={isMobileChatOpen}
        replyingToMessage={replyingToMessage}
        onReply={setReplyingToMessage}
        selectedGroupPhilosophers={selectedGroupPhilosophers}
        onToggleGroupPhilosopher={(id) => {
          setSelectedGroupPhilosophers(prev => 
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
          );
        }}
        allPhilosophers={philosophers}
        currentGroup={selectedGroup}
      />

      {isCreateModalOpen && (
        <CreateGroupModal
          philosophers={philosophers}
          onClose={() => setIsCreateModalOpen(false)}
          onCreate={handleCreateGroup}
        />
      )}
    </div>
  );
}
