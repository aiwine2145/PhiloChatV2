import React, { useState, useRef, useEffect } from 'react';
import { Philosopher } from '../data/philosophers';
import { Message, Group } from '../types';
import { Send, MessageSquarePlus, ChevronLeft, Reply, X, Users, Edit2, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { sanitizeMessageText } from '../services/gemini';

interface ChatAreaProps {
  philosopher: Philosopher;
  messages: Message[];
  onSendMessage: (text: string) => void;
  onEditMessage: (id: string, text: string) => void;
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
  onEditMessage,
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
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editInputText, setEditInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

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

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputText]);

  useEffect(() => {
    if (editTextareaRef.current) {
      editTextareaRef.current.style.height = 'auto';
      editTextareaRef.current.style.height = `${editTextareaRef.current.scrollHeight}px`;
    }
  }, [editInputText]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() && !isTyping) {
      onSendMessage(inputText);
      setInputText('');
    }
  };

  const handleStartEdit = (msg: Message) => {
    setEditingMessageId(msg.id);
    setEditInputText(msg.text);
  };

  const handleSaveEdit = () => {
    if (editingMessageId && editInputText.trim()) {
      onEditMessage(editingMessageId, editInputText);
      setEditingMessageId(null);
      setEditInputText('');
    }
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditInputText('');
  };

  return (
    <div className={`flex-1 flex-col bg-slate-900 h-full relative max-w-full overflow-hidden ${isMobileChatOpen ? 'flex' : 'hidden md:flex'}`}>
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
                ? `Members: ${groupMembers.map(p => p.name).join(', ')}` 
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
                ? `Start a conversation with the members of ${philosopher.name}.`
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
                  ) : editingMessageId === msg.id ? (
                    <div className="space-y-3 min-w-[200px] sm:min-w-[300px]">
                      <textarea
                        ref={editTextareaRef}
                        value={editInputText}
                        onChange={(e) => setEditInputText(e.target.value)}
                        className="w-full bg-slate-900/50 text-white rounded-lg border border-indigo-400/50 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 p-2 outline-none resize-none text-sm"
                        rows={1}
                        autoFocus
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={handleCancelEdit}
                          className="px-3 py-1 text-xs font-medium text-indigo-200 hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          className="flex items-center gap-1.5 px-3 py-1 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold rounded-md transition-colors shadow-lg shadow-indigo-500/20"
                        >
                          <Check className="w-3 h-3" />
                          Save & Resend
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap break-words">{msg.text}</div>
                  )}
                  <div className={`text-[10px] mt-1 sm:mt-2 ${msg.sender === 'user' ? 'text-indigo-200 text-right' : 'text-slate-500'}`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                
                <div className={`flex flex-col gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-200 shrink-0 ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                  <button 
                    onClick={() => onReply(msg)}
                    className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 transition-colors"
                    title="Reply"
                  >
                    <Reply className="w-4 h-4" />
                  </button>
                  {msg.sender === 'user' && !editingMessageId && (
                    <button 
                      onClick={() => handleStartEdit(msg)}
                      className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 transition-colors"
                      title="Edit & Rewind"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-slate-800 border-t border-slate-700 shrink-0 w-full max-w-full overflow-hidden">
        {isGroupChat && (
          <div className="bg-slate-900/30 border-b border-slate-700 flex items-center w-full max-w-full overflow-hidden">
            <div className="pl-4 pr-2 py-2 flex items-center gap-2 shrink-0 border-r border-slate-700/30">
              <Users className="w-3 h-3 text-slate-500" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Mention:</span>
            </div>
            <div className="flex-1 min-w-0 overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-2 px-4 py-2 whitespace-nowrap">
                {groupMembers.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onToggleGroupPhilosopher?.(p.id)}
                    className={`flex items-center gap-2 px-3 py-1 rounded-full border transition-all whitespace-nowrap shrink-0 ${
                      selectedGroupPhilosophers.includes(p.id)
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.1)]'
                        : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] ${p.bg} ${p.color}`}>
                      <p.icon className="w-2.5 h-2.5" />
                    </div>
                    <span className="text-[11px] font-medium">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
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
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Message..."
                className="w-full bg-slate-900 text-slate-100 rounded-2xl border border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none py-3 px-4 max-h-48 min-h-[48px] outline-none scrollbar-hide"
                rows={1}
              />
              <div className="absolute right-3 bottom-2 text-[8px] text-slate-600 font-mono hidden sm:block">
                Click icon to send
              </div>
            </div>
            <button
              type="submit"
              disabled={!inputText.trim() || isTyping}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-full h-[48px] w-[48px] flex items-center justify-center transition-colors shrink-0 shadow-lg shadow-indigo-600/20"
              title="Send Message"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
