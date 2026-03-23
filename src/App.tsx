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
        shortDescription: `${selectedGroup.memberIds.length} philosophers in this chat`, 
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

  const handleDeleteGroup = (groupId: string) => {
    if (window.confirm('確定要刪除此群組與所有對話紀錄嗎？')) {
      setGroups(prev => prev.filter(g => g.id !== groupId));
      setChatHistory(prev => {
        const newHistory = { ...prev };
        delete newHistory[groupId];
        return newHistory;
      });
      
      // 當前視窗防護：若刪除的是目前選中的群組，重置為預設哲學家
      if (selectedPhilosopherId === groupId) {
        setSelectedPhilosopherId(philosophers[0].id);
        setIsMobileChatOpen(false);
      }
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isTyping) return;

    let finalMessageText = text;
    if (replyingToMessage) {
      finalMessageText = `[Quoted Message]: "${replyingToMessage.text}"\n\n[My Reply]: ${text}`;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      senderName: 'User',
      text: finalMessageText,
      timestamp: new Date(),
    };

    const updatedHistory = [...(chatHistory[selectedPhilosopherId] || []), userMessage];
    
    setChatHistory(prev => ({
      ...prev,
      [selectedPhilosopherId]: updatedHistory
    }));

    setReplyingToMessage(null);
    await processAIResponse(updatedHistory);
  };

  const handleEditMessage = async (messageId: string, newText: string) => {
    if (isTyping) return;

    const history = chatHistory[selectedPhilosopherId] || [];
    const index = history.findIndex(m => m.id === messageId);
    if (index === -1) return;

    // 1. Update the message text
    // 2. Truncate history after this message
    const updatedUserMessage = { ...history[index], text: newText, timestamp: new Date() };
    const truncatedHistory = [...history.slice(0, index), updatedUserMessage];

    setChatHistory(prev => ({
      ...prev,
      [selectedPhilosopherId]: truncatedHistory
    }));

    await processAIResponse(truncatedHistory);
  };

  const processAIResponse = async (history: Message[]) => {
    setIsTyping(true);
    const isGroupChat = selectedPhilosopherId.startsWith('group-');

    if (isGroupChat && selectedGroup) {
      // 規則一：嚴格執行『強制同步列隊 (Synchronous Queue)』
      let speakerQueue = [...selectedGroupPhilosophers];
      
      if (speakerQueue.length === 0) {
        const randomId = selectedGroup.memberIds[Math.floor(Math.random() * selectedGroup.memberIds.length)];
        speakerQueue = [randomId];
      }

      // 初始化歷史紀錄副本，確保 A 的發言能被 B 看見
      let currentHistory = [...history];

      for (const philoId of speakerQueue) {
        const currentPhilosopher = philosophers.find(p => p.id === philoId);
        if (!currentPhilosopher) continue;

        const philosopherMessageId = `${Date.now()}-${philoId}`;
        
        // 先插入一個空的串流佔位訊息
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
          const memberNames = selectedGroup.memberIds.map(id => philosophers.find(p => p.id === id)?.name || '');
          
          // 獲取佇列中的下一位與上一位哲學家名稱，用於停止詞與 Parrot 防護
          const currentIndex = speakerQueue.indexOf(philoId);
          const nextPhiloId = speakerQueue[currentIndex + 1];
          const nextPhilosopherName = nextPhiloId ? philosophers.find(p => p.id === nextPhiloId)?.name : undefined;
          
          const prevPhiloId = currentIndex > 0 ? speakerQueue[currentIndex - 1] : undefined;
          const previousPhilosopherName = prevPhiloId ? philosophers.find(p => p.id === prevPhiloId)?.name : undefined;

          // 規則一：使用 await 確保序列執行，嚴禁 Promise.all
          await sendMessageToPhilosopherStream(
            currentPhilosopher, 
            currentHistory, 
            (chunkText) => {
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
            }, 
            true, 
            memberNames,
            nextPhilosopherName,
            previousPhilosopherName
          );

          // 哲學家發言結束，更新本地歷史紀錄副本供下一位使用
          const finalPhiloMsg: Message = {
            ...initialPhilosopherMessage,
            text: accumulatedText,
            isStreaming: false
          };
          currentHistory = [...currentHistory, finalPhiloMsg];

        } catch (error: any) {
          console.error(`Failed to send message to ${currentPhilosopher.name}:`, error);
          accumulatedText = accumulatedText || '*[System Hint: This message cannot be displayed due to API error or connection interruption]*';
        } finally {
          // 確保狀態更新為非串流模式
          setChatHistory(prev => {
            const messages = prev[selectedPhilosopherId] || [];
            return {
              ...prev,
              [selectedPhilosopherId]: messages.map(msg => 
                msg.id === philosopherMessageId ? { ...msg, isStreaming: false, text: accumulatedText } : msg
              )
            };
          });
        }

        // 第一項：加入 API 請求的延遲節流閥 (1.5s - 2s)
        // 避免連續呼叫觸發 Gemini API 的 Rate Limit
        await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 500));
      }
      
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
        await sendMessageToPhilosopherStream(selectedPhilosopher, history, (chunkText) => {
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
          accumulatedText = '*[System Hint: This message cannot be displayed due to API error or connection interruption]*';
        }
      } finally {
        setChatHistory(prev => {
          const messages = prev[selectedPhilosopherId] || [];
          return {
            ...prev,
            [selectedPhilosopherId]: messages.map(msg => 
              msg.id === philosopherMessageId ? { ...msg, isStreaming: false, text: accumulatedText || msg.text || '*[System Hint: This message cannot be displayed due to unexpected reasons]*' } : msg
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
        onDeleteGroup={handleDeleteGroup}
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
        onEditMessage={handleEditMessage}
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
