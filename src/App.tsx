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

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isTyping) return;

    const isGroupChat = selectedPhilosopherId.startsWith('group-');
    
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

    setChatHistory(prev => ({
      ...prev,
      [selectedPhilosopherId]: [...(prev[selectedPhilosopherId] || []), userMessage]
    }));

    setIsTyping(true);
    setReplyingToMessage(null);

    if (isGroupChat && selectedGroup) {
      // 規則一：嚴格執行『強制同步列隊 (Synchronous Queue)』
      let speakerQueue = [...selectedGroupPhilosophers];
      
      if (speakerQueue.length === 0) {
        const randomId = selectedGroup.memberIds[Math.floor(Math.random() * selectedGroup.memberIds.length)];
        speakerQueue = [randomId];
      }

      // 初始化歷史紀錄副本，確保 A 的發言能被 B 看見
      let currentHistory = [...(chatHistory[selectedPhilosopherId] || []), userMessage];

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
          // 規則一：使用 await 確保序列執行，嚴禁 Promise.all
          await sendMessageToPhilosopherStream(currentPhilosopher, currentHistory, (chunkText) => {
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
          }, true);

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
