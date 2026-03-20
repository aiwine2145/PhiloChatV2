import React, { useState } from 'react';
import { Philosopher } from '../data/philosophers';
import { X, Check, Users } from 'lucide-react';

interface CreateGroupModalProps {
  philosophers: Philosopher[];
  onClose: () => void;
  onCreate: (name: string, members: string[]) => void;
}

export default function CreateGroupModal({ philosophers, onClose, onCreate }: CreateGroupModalProps) {
  const [name, setName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  const toggleMember = (id: string) => {
    setSelectedMembers(prev => 
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && selectedMembers.length >= 2 && selectedMembers.length <= 5) {
      onCreate(name.trim(), selectedMembers);
    }
  };

  const isValid = name.trim() && selectedMembers.length >= 2 && selectedMembers.length <= 5;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between bg-slate-800/50">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" />
            建立新群組
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">群組名稱</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：雅典學院、理性批判小組..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-end">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">選擇成員 (2-5 位)</label>
              <span className={`text-[10px] font-bold ${selectedMembers.length > 5 ? 'text-red-400' : 'text-indigo-400'}`}>
                已選擇: {selectedMembers.length} / 5
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              {philosophers.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleMember(p.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                    selectedMembers.includes(p.id)
                      ? 'bg-indigo-600/10 border-indigo-500/50 text-white'
                      : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${p.bg} ${p.color}`}>
                    <p.icon className="w-4 h-4" />
                  </div>
                  <span className="flex-1 font-medium truncate">{p.name}</span>
                  {selectedMembers.includes(p.id) && (
                    <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2">
            <button
              disabled={!isValid}
              type="submit"
              className={`w-full py-4 rounded-xl font-bold text-sm tracking-widest uppercase transition-all shadow-lg ${
                isValid
                  ? 'bg-indigo-600 text-white hover:bg-indigo-500 active:scale-[0.98]'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              建立群組
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
