import React, { useState, useEffect } from 'react';
import { Philosopher } from '../data/philosophers';
import { ChatHistory, Group } from '../types';
import { Search, MessageSquare, GripVertical, Users, User, PlusCircle, AlertCircle, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'motion/react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import PhilosopherAvatar from './PhilosopherAvatar';

interface GroupItemProps {
  group: Group;
  selectedId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  lastMessage: any;
}

function GroupItem({ group, selectedId, onSelect, onDelete, lastMessage }: GroupItemProps) {
  const x = useMotionValue(0);
  const deleteOpacity = useTransform(x, [-100, -50, 0], [1, 0.5, 0]);
  const deleteScale = useTransform(x, [-100, -50, 0], [1, 0.8, 0.5]);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(group.id);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl group">
      {/* Mobile Swipe Delete Background */}
      <motion.button
        style={{ opacity: deleteOpacity, scale: deleteScale }}
        onClick={handleDelete}
        className="absolute right-0 top-0 bottom-0 w-20 bg-red-600 flex flex-col items-center justify-center text-white z-0"
      >
        <Trash2 className="w-5 h-5 mb-1" />
        <span className="text-[10px] font-bold uppercase">刪除</span>
      </motion.button>

      {/* Main Item Content */}
      <motion.div
        drag="x"
        dragConstraints={{ left: -80, right: 0 }}
        dragElastic={0.1}
        style={{ x }}
        className="relative z-10"
      >
        <button
          onClick={() => onSelect(group.id)}
          className={`w-full p-4 flex items-center gap-3 text-left bg-slate-800 transition-colors ${
            selectedId === group.id ? 'bg-slate-700 shadow-lg ring-1 ring-slate-600' : 'hover:bg-slate-700/50'
          }`}
        >
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shrink-0 border border-slate-600 shadow-lg">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-baseline mb-1">
              <h3 className="font-bold text-slate-100 truncate">{group.name}</h3>
              {lastMessage && (
                <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                  {lastMessage.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 truncate">
              {lastMessage 
                ? lastMessage.text 
                : `${group.memberIds.length} philosophers in this chat`}
            </p>
          </div>

          {/* Desktop Hover Delete Icon */}
          <div 
            onClick={handleDelete}
            className="hidden md:flex p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-full opacity-0 group-hover:opacity-100 transition-all shrink-0"
            title="刪除群組"
          >
            <X className="w-4 h-4" />
          </div>
        </button>
      </motion.div>
    </div>
  );
}

interface SortableItemProps {
  philosopher: Philosopher;
  selectedId: string;
  onSelect: (id: string) => void;
  lastMessage: any;
}

function SortableItem({ philosopher, selectedId, onSelect, lastMessage }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: philosopher.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : 0,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative w-full text-left flex items-center gap-1 hover:bg-slate-700/50 transition-colors border-b border-slate-700/50 ${
        selectedId === philosopher.id ? 'bg-slate-700' : ''
      } ${isDragging ? 'opacity-50' : ''}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="p-3 pr-1 cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300"
        style={{ touchAction: 'none' }}
      >
        <GripVertical className="w-5 h-5" />
      </button>
      
      <button
        onClick={() => onSelect(philosopher.id)}
        className="flex-1 p-3 pl-1 flex items-center gap-3 text-left"
      >
        <PhilosopherAvatar philosopher={philosopher} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-baseline mb-1">
            <h3 className="font-medium text-slate-200 truncate">{philosopher.name}</h3>
            {lastMessage && (
              <span className="text-xs text-slate-400 shrink-0 ml-2">
                {lastMessage.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400 truncate">
            {lastMessage ? lastMessage.text : philosopher.shortDescription}
          </p>
        </div>
      </button>
    </div>
  );
}

interface SidebarProps {
  philosophers: Philosopher[];
  groups: Group[];
  selectedId: string;
  onSelect: (id: string) => void;
  onDeleteGroup: (id: string) => void;
  chatHistory: ChatHistory;
  isMobileChatOpen: boolean;
  onCreateGroupClick: () => void;
}

const STORAGE_KEY_ORDER = 'philoOrder';

export default function Sidebar({ philosophers, groups, selectedId, onSelect, onDeleteGroup, chatHistory, isMobileChatOpen, onCreateGroupClick }: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'single' | 'group'>(selectedId.startsWith('group-') ? 'group' : 'single');
  const [orderedIds, setOrderedIds] = useState<string[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_ORDER);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const currentIds = philosophers.map(p => p.id);
        const validParsed = parsed.filter((id: string) => currentIds.includes(id));
        const missingIds = currentIds.filter(id => !validParsed.includes(id));
        return [...validParsed, ...missingIds];
      } catch (e) {
        console.error("Failed to parse order from local storage", e);
      }
    }
    return philosophers.map(p => p.id);
  });

  useEffect(() => {
    const currentIds = philosophers.map(p => p.id);
    setOrderedIds(prev => {
      const validPrev = prev.filter(id => currentIds.includes(id));
      const missingIds = currentIds.filter(id => !validPrev.includes(id));
      if (missingIds.length > 0 || validPrev.length !== prev.length) {
        return [...validPrev, ...missingIds];
      }
      return prev;
    });
  }, [philosophers]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ORDER, JSON.stringify(orderedIds));
  }, [orderedIds]);

  useEffect(() => {
    if (selectedId.startsWith('group-')) {
      setActiveTab('group');
    } else {
      setActiveTab('single');
    }
  }, [selectedId]);

  const orderedPhilosophers = orderedIds
    .map(id => philosophers.find(p => p.id === id))
    .filter((p): p is Philosopher => p !== undefined);

  const filteredPhilosophers = orderedPhilosophers.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setOrderedIds((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  return (
    <div className={`bg-slate-800 border-r border-slate-700 flex-col h-full shrink-0 w-full md:w-80 ${isMobileChatOpen ? 'hidden md:flex' : 'flex'}`}>
      <div className="p-4 border-b border-slate-700 flex items-center justify-between bg-slate-800/95 backdrop-blur z-10">
        <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-indigo-400" />
          PhiloChat
        </h1>
      </div>
      
      <div className="p-3">
        <div className="flex bg-slate-900 rounded-lg p-1 mb-3">
          <button
            onClick={() => setActiveTab('single')}
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all ${
              activeTab === 'single' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            Direct Messages
          </button>
          <button
            onClick={() => setActiveTab('group')}
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all ${
              activeTab === 'group' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Group Chats
          </button>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder={activeTab === 'single' ? "Search philosophers..." : "Search groups..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 text-sm text-slate-200 rounded-full pl-9 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 border border-slate-700"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {activeTab === 'group' ? (
          <div className="p-3 space-y-3">
            <button
              onClick={onCreateGroupClick}
              className="w-full p-4 flex items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-700 text-slate-400 hover:border-indigo-500 hover:text-indigo-400 hover:bg-indigo-500/5 transition-all group"
            >
              <PlusCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <span className="font-bold text-sm tracking-widest uppercase">Create New Group</span>
            </button>

            <div className="space-y-1 pt-2">
              <AnimatePresence mode="popLayout">
                {groups
                  .filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(group => {
                    const messages = chatHistory[group.id] || [];
                    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

                    return (
                      <motion.div
                        key={group.id}
                        layout
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                      >
                        <GroupItem
                          group={group}
                          selectedId={selectedId}
                          onSelect={onSelect}
                          onDelete={onDeleteGroup}
                          lastMessage={lastMessage}
                        />
                      </motion.div>
                    );
                  })}
              </AnimatePresence>
              
              {groups.length === 0 && searchQuery === '' && (
                <div className="text-center py-12 px-6">
                  <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-700">
                    <Users className="w-8 h-8" />
                  </div>
                  <p className="text-slate-500 text-sm">No groups created yet</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <DndContext 
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext 
              items={filteredPhilosophers.map(p => p.id)}
              strategy={verticalListSortingStrategy}
            >
              {filteredPhilosophers.map(philosopher => {
                const messages = chatHistory[philosopher.id] || [];
                const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
                
                return (
                  <SortableItem
                    key={philosopher.id}
                    philosopher={philosopher}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    lastMessage={lastMessage}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
