import React, { useState, useRef, useEffect } from 'react';
import { Philosopher } from '../data/philosophers';
import { Message, Group } from '../types';
import { Send, MessageSquarePlus, ChevronLeft, Reply, X, Users, ChevronUp, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { sanitizeMessageText } from '../services/gemini';

interface ChatAreaProps {
  philosopher: Philosopher;
  messages: Message[];
  onSendMessage: (text: string) => void;
  onClearChat: () => void;
  isTyping: boolean;
  onBack: () => void;
  isMobileChatOpen: boolean;
  replyingToMessage: Message | null;
  onReply: (msg: Message | null) => void;
  selectedGroupPhilosophers?: string[];
  onToggleGroupPhilosopher?: (id: string) => void;
  allPhilosophers?: Philosopher[];
  currentGroup?: Group;
}

export default function ChatArea({ 
  philosopher, 
  messages, 
  onSendMessage, 
  onClearChat, 
  isTyping, 
  onBack, 
  isMobileChatOpen,
  replyingToMessage,
  onReply,
  selectedGroupPhilosophers = [],
  onToggleGroupPhilosopher,
  allPhilosophers = [],
  currentGroup
}: ChatAreaProps) {
  const [inputText, setInputText] = useState('');
  const [isMentionListExpanded, setIsMentionListExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isGroupChat = philosopher.id.startsWith('group-');
  const groupMembers = isGroupChat && currentGroup 
    ? allPhilosophers.filter(p => currentGroup.memberIds.includes(p.id))
    : [];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() && !isTyping) {
      onSendMessage(inputText);
      setInputText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className={`flex-1 flex-col bg-slate-900 h-full relative ${isMobileChatOpen ? 'flex' : 'hidden md:flex'}`}>
      {/* Header */}
      <div className="h-16 border-b border-slate-700 bg-slate-800/95 backdrop-blur flex items-center justify-between px-4 shrink-0 z-10">
        <div className="flex items-center gap-2 overflow-hidden">
          <button onClick={onBack} className="md:hidden p-2 -ml-2 text-slate-400 hover:text-slate-200 rounded-full">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border border-slate-600 ${philosopher.bg} ${philosopher.color}`}>
            {isGroupChat ? <Users className="w-5 h-5" /> : <philosopher.icon className="w-5 h-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-slate-100 break-words">{philosopher.name}</h2>
            <p className="text-[10px] text-slate-400 break-words" title={isGroupChat ? groupMembers.map(p => p.name).join(', ') : philosopher.shortDescription}>
              {isGroupChat 
                ? `成員: ${groupMembers.map(p => p.name).join(', ')}` 
                : philosopher.shortDescription}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <button 
            onClick={onClearChat}
            className="flex items-center gap-2 px-2 sm:px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors border border-slate-600 hover:border-slate-500"
            title="Start a new chat"
          >
            <MessageSquarePlus className="w-4 h-4" />
            <span className="hidden sm:inline">New Chat</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scroll-smooth custom-scrollbar">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center border border-slate-600 opacity-50 grayscale ${philosopher.bg} ${philosopher.color}`}>
              {isGroupChat ? <Users className="w-12 h-12" /> : <philosopher.icon className="w-12 h-12" />}
            </div>
            <p className="text-center max-w-md px-4">
              {isGroupChat 
                ? `與 ${philosopher.name} 的成員們開始對話吧。`
                : `Start a philosophical dialogue with ${philosopher.name}. Ask a question, propose a theory, or challenge their views.`}
            </p>
          </div>
        ) : (
          messages
            .filter(msg => msg.text.trim().length > 0 || msg.isStreaming)
            .map((msg) => (
            <div 
              key={msg.id} 
              className={`flex group ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex items-center gap-2 max-w-[90%] sm:max-w-[85%] ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div 
                  className={`rounded-2xl px-4 sm:px-5 py-2.5 sm:py-3 shadow-sm ${
                    msg.sender === 'user' 
                      ? 'bg-indigo-600 text-white rounded-br-sm' 
                      : msg.isError
                        ? 'bg-red-900/50 text-red-200 rounded-bl-sm border border-red-800'
                        : 'bg-slate-800 text-slate-200 rounded-bl-sm border border-slate-700'
                  }`}
                >
                  {isGroupChat && msg.senderName && (
                    <div className={`text-[10px] font-bold mb-1 uppercase tracking-wider ${msg.sender === 'user' ? 'text-indigo-200' : 'text-indigo-400'}`}>
                      {msg.senderName}
                    </div>
                  )}
                  {msg.sender === 'philosopher' ? (
                    <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-700 break-words">
                      <ReactMarkdown>
                        {isGroupChat ? sanitizeMessageText(msg.text) : msg.text}
                      </ReactMarkdown>
                      {msg.isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-slate-400 animate-pulse" />}
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap break-words">{msg.text}</div>
                  )}
                  <div className={`text-[10px] mt-1 sm:mt-2 ${msg.sender === 'user' ? 'text-indigo-200 text-right' : 'text-slate-500'}`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                
                <button 
                  onClick={() => onReply(msg)}
                  className={`p-1.5 rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-200 shrink-0 ${
                    msg.sender === 'user' ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-800 text-slate-400'
                  }`}
                  title="Reply"
                >
                  <Reply className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-slate-800 border-t border-slate-700 shrink-0">
        {isGroupChat && (
          <div className="bg-slate-900/30 border-b border-slate-700">
            <button 
              type="button"
              onClick={() => setIsMentionListExpanded(!isMentionListExpanded)}
              className="w-full px-4 py-2 flex items-center justify-between text-slate-400 hover:bg-slate-800/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Users className="w-3 h-3" />
                <span className="text-[10px] font-bold uppercase tracking-widest shrink-0">點名回覆 ({selectedGroupPhilosophers.length})</span>
                {selectedGroupPhilosophers.length > 0 && !isMentionListExpanded && (
                  <div className="flex items-center gap-1 ml-2 overflow-x-auto no-scrollbar max-w-[150px] sm:max-w-[300px]">
                    {selectedGroupPhilosophers.map(id => {
                      const p = groupMembers.find(m => m.id === id);
                      return p ? (
                        <span key={id} className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-sm whitespace-nowrap shrink-0">
                          {p.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
              {isMentionListExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
            </button>
            
            {isMentionListExpanded && (
              <div className="px-4 py-3 border-t border-slate-700/50 animate-in slide-in-from-bottom-2 duration-200">
                <div className="flex flex-wrap gap-2">
                  {groupMembers.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onToggleGroupPhilosopher?.(p.id)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${
                        selectedGroupPhilosophers.includes(p.id)
                          ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.2)]'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${p.bg} ${p.color}`}>
                        <p.icon className="w-3 h-3" />
                      </div>
                      <span className="text-xs font-medium">{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {replyingToMessage && (
          <div className="px-4 py-2 bg-slate-900/50 border-b border-slate-700 flex items-center justify-between animate-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-1 h-8 bg-indigo-500 rounded-full shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Replying to {replyingToMessage.senderName || (replyingToMessage.sender === 'user' ? 'you' : philosopher.name)}</p>
              </div>
            </div>
            <button 
              onClick={() => onReply(null)}
              className="p-1.5 hover:bg-slate-700 rounded-full text-slate-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="p-3 sm:p-4">
          <form onSubmit={handleSubmit} className="flex items-end gap-2 max-w-4xl mx-auto">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message..."
              className="flex-1 bg-slate-900 text-slate-100 rounded-2xl border border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none py-3 px-4 max-h-32 min-h-[48px] outline-none"
              rows={1}
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isTyping}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-full h-[48px] w-[48px] flex items-center justify-center transition-colors shrink-0"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
