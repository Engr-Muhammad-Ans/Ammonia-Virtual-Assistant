/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Send, 
  LogOut, 
  Plus, 
  MessageSquare, 
  Settings, 
  User, 
  Bot, 
  ShieldCheck,
  Menu,
  X,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';

const SYSTEM_INSTRUCTION = `You are an expert Ammonia Process Control Engineer at FFC (Fauji Fertilizer Company). 
Your goal is to assist plant operators and engineers with technical queries related to Ammonia Plant operations.
Behave like a seasoned professional: logical, technical, yet concise.
Avoid long paragraphs. Use bullet points or short sentences for clarity.
Focus on safety, efficiency, and troubleshooting.
If a question is not related to ammonia plants or FFC operations, politely redirect the user back to plant-related topics.

Formatting Rules:
1. Use **Bold Headings** for different sections of your answer.
2. Use bullet points for lists of parameters, steps, or items.
3. Use *italics* to highlight specific technical terms or emphasis.
4. Use standard Markdown bolding (**text**) for emphasis. 
5. DO NOT use triple asterisks (***) for bolding or any other purpose.`;

interface Message {
  id?: number;
  role: 'user' | 'model';
  content: string;
}

interface Chat {
  id: number;
  title: string;
  created_at: string;
}

export default function App() {
  const [email, setEmail] = useState<string | null>(localStorage.getItem('ffc_email'));
  const [userName, setUserName] = useState<string | null>(localStorage.getItem('ffc_name'));
  const [userRole, setUserRole] = useState<string | null>(localStorage.getItem('ffc_role'));
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [loginEmailInput, setLoginEmailInput] = useState('');
  const [loginNameInput, setLoginNameInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  useEffect(() => {
    if (email) {
      fetchChats();
    }
  }, [email]);

  useEffect(() => {
    if (currentChatId) {
      fetchMessages(currentChatId);
    } else {
      setMessages([]);
    }
  }, [currentChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchChats = async () => {
    const res = await fetch(`/api/chats?email=${email}`);
    const data = await res.json();
    setChats(data);
  };

  const fetchMessages = async (id: number) => {
    const res = await fetch(`/api/chats/${id}/messages`);
    const data = await res.json();
    setMessages(data);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (!loginNameInput.trim()) {
      setLoginError('Please enter your name.');
      return;
    }
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmailInput, name: loginNameInput }),
      });
      const data = await res.json();
      if (data.success) {
        setEmail(data.email);
        setUserName(data.name);
        setUserRole(data.role || 'Process Engineer');
        localStorage.setItem('ffc_email', data.email);
        localStorage.setItem('ffc_name', data.name);
        localStorage.setItem('ffc_role', data.role || 'Process Engineer');
      } else {
        setLoginError(data.message);
      }
    } catch (err) {
      setLoginError('Connection error. Please try again.');
    }
  };

  const handleLogout = () => {
    setEmail(null);
    setUserName(null);
    setUserRole(null);
    localStorage.removeItem('ffc_email');
    localStorage.removeItem('ffc_name');
    localStorage.removeItem('ffc_role');
    setCurrentChatId(null);
    setMessages([]);
  };

  const updateProfile = async (newName: string, newRole: string) => {
    try {
      const res = await fetch('/api/user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: newName, role: newRole }),
      });
      if (res.ok) {
        setUserName(newName);
        setUserRole(newRole);
        localStorage.setItem('ffc_name', newName);
        localStorage.setItem('ffc_role', newRole);
        setIsProfileOpen(false);
      }
    } catch (err) {
      console.error('Failed to update profile', err);
    }
  };

  const startNewChat = async () => {
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, title: 'New Discussion' }),
    });
    const data = await res.json();
    setCurrentChatId(data.id);
    fetchChats();
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    let chatId = currentChatId;
    if (!chatId) {
      const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, title: input.substring(0, 30) + '...' }),
      });
      const data = await res.json();
      chatId = data.id;
      setCurrentChatId(chatId);
      fetchChats();
    }

    const userMsg: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Save user message to DB
      await fetch(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userMsg),
      });

      // Get AI response
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { role: 'user', parts: [{ text: input }] }
        ],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        }
      });

      const aiContent = response.text || "I'm sorry, I couldn't process that request.";
      const aiMsg: Message = { role: 'model', content: aiContent };
      
      setMessages(prev => [...prev, aiMsg]);

      // Save AI message to DB
      await fetch(`/api/chats/${chatId!}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aiMsg),
      });
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'model', content: "Error: Failed to connect to the process control system." }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!email) {
    return (
      <div className="min-h-screen bg-[#E4E3E0] flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-black/5"
        >
          <div className="bg-[#141414] p-8 text-white text-center">
            <div className="flex justify-center mb-4">
              <ShieldCheck size={48} className="text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">FFC Ammonia Plant</h1>
            <p className="text-white/60 text-sm mt-1">Authorized Access Only</p>
          </div>
          
          <form onSubmit={handleLogin} className="p-8 space-y-6">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-black/40 mb-2">
                Your Full Name
              </label>
              <input 
                type="text" 
                required
                value={loginNameInput}
                onChange={(e) => setLoginNameInput(e.target.value)}
                placeholder="Muhammad Ans"
                className="w-full px-4 py-3 bg-[#f5f5f5] border border-black/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 transition-all mb-4"
              />
              <label className="block text-xs font-semibold uppercase tracking-wider text-black/40 mb-2">
                Corporate Email Address
              </label>
              <input 
                type="email" 
                required
                value={loginEmailInput}
                onChange={(e) => setLoginEmailInput(e.target.value)}
                placeholder="m.ans@ffc.com.pk"
                className="w-full px-4 py-3 bg-[#f5f5f5] border border-black/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
              />
              {loginError && (
                <p className="text-red-500 text-xs mt-2 font-medium">{loginError}</p>
              )}
            </div>
            
            <button 
              type="submit"
              className="w-full bg-[#141414] text-white py-3 rounded-xl font-semibold hover:bg-black transition-colors flex items-center justify-center gap-2"
            >
              Verify Identity
            </button>
            
            <p className="text-[10px] text-center text-black/40 leading-relaxed">
              By logging in, you agree to the FFC Information Security Policy. 
              All interactions are logged for audit purposes.
            </p>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#f5f5f5] text-[#141414] font-sans overflow-hidden">
      {/* Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.aside 
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className="w-72 bg-[#141414] text-white flex flex-col h-full z-20"
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                  <Bot size={20} className="text-white" />
                </div>
                <span className="font-bold tracking-tight">FFC AI</span>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden">
                <X size={20} />
              </button>
            </div>

            <div className="p-4">
              <button 
                onClick={startNewChat}
                className="w-full flex items-center gap-2 px-4 py-3 border border-white/10 rounded-xl hover:bg-white/5 transition-colors text-sm font-medium"
              >
                <Plus size={18} />
                New Discussion
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 space-y-1">
              <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white/40">
                Recent History
              </div>
              {chats.map(chat => (
                <button
                  key={chat.id}
                  onClick={() => setCurrentChatId(chat.id)}
                  className={`w-full text-left px-3 py-3 rounded-xl text-sm flex items-center gap-3 transition-all ${
                    currentChatId === chat.id ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5'
                  }`}
                >
                  <MessageSquare size={16} />
                  <span className="truncate">{chat.title}</span>
                </button>
              ))}
            </div>

            <div className="p-4 border-t border-white/10 space-y-2">
              <button 
                onClick={() => setIsProfileOpen(true)}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 rounded-xl transition-all text-left"
              >
                <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center">
                  <User size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{userName || email}</p>
                  <p className="text-[10px] text-white/40">{userRole || 'Process Engineer'}</p>
                </div>
              </button>
              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors text-xs font-medium"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0">
        {/* Header */}
        <header className="h-16 border-b border-black/5 bg-white/80 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            {!isSidebarOpen && (
              <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-black/5 rounded-lg">
                <Menu size={20} />
              </button>
            )}
            <div>
              <h2 className="font-bold text-sm tracking-tight">
                {currentChatId ? chats.find(c => c.id === currentChatId)?.title : 'Ammonia Plant Assistant'}
              </h2>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[10px] text-black/40 font-medium uppercase tracking-wider">System Online</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsProfileOpen(true)}
              className="p-2 hover:bg-black/5 rounded-lg text-black/40"
            >
              <Settings size={20} />
            </button>
          </div>
        </header>

        {/* Profile Modal */}
        <AnimatePresence>
          {isProfileOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-black/5"
              >
                <div className="bg-[#141414] p-6 text-white flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <User size={24} className="text-emerald-400" />
                    <h3 className="text-lg font-bold tracking-tight">User Profile</h3>
                  </div>
                  <button onClick={() => setIsProfileOpen(false)} className="p-1 hover:bg-white/10 rounded-lg">
                    <X size={20} />
                  </button>
                </div>
                <div className="p-6 space-y-6">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-black/40 mb-2">
                      Full Name
                    </label>
                    <input 
                      type="text" 
                      defaultValue={userName || ''}
                      id="profile-name"
                      className="w-full px-4 py-3 bg-[#f5f5f5] border border-black/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-black/40 mb-2">
                      Role / Designation
                    </label>
                    <input 
                      type="text" 
                      defaultValue={userRole || 'Process Engineer'}
                      id="profile-role"
                      className="w-full px-4 py-3 bg-[#f5f5f5] border border-black/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-black/40 mb-2">
                      Email Address
                    </label>
                    <input 
                      type="text" 
                      value={email || ''}
                      disabled
                      className="w-full px-4 py-3 bg-[#f5f5f5] border border-black/10 rounded-xl opacity-50 cursor-not-allowed"
                    />
                  </div>
                  <div className="pt-4 flex gap-3">
                    <button 
                      onClick={() => setIsProfileOpen(false)}
                      className="flex-1 px-4 py-3 border border-black/10 rounded-xl font-semibold hover:bg-black/5 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={() => {
                        const name = (document.getElementById('profile-name') as HTMLInputElement).value;
                        const role = (document.getElementById('profile-role') as HTMLInputElement).value;
                        updateProfile(name, role);
                      }}
                      className="flex-1 bg-[#141414] text-white px-4 py-3 rounded-xl font-semibold hover:bg-black transition-colors"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mb-6 shadow-lg">
                <Bot size={32} className="text-white" />
              </div>
              <h3 className="text-xl font-bold tracking-tight mb-2">Welcome, {userName || 'Engineer'}</h3>
              <p className="text-sm text-black/50 leading-relaxed">
                I am your specialized AI assistant for the FFC Ammonia Plant. 
                Ask me about process parameters, troubleshooting, or safety protocols.
              </p>
              <div className="grid grid-cols-2 gap-3 mt-8 w-full">
                {['Reformer Temp Control', 'Synloop Purge Rate', 'Compressor Surge', 'H2/N2 Ratio'].map(topic => (
                  <button 
                    key={topic}
                    onClick={() => setInput(`Tell me about ${topic} in the ammonia plant.`)}
                    className="p-3 text-xs font-medium bg-white border border-black/5 rounded-xl hover:border-black/20 transition-all text-left"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div 
              key={idx} 
              className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'model' && (
                <div className="w-8 h-8 bg-black rounded-lg flex-shrink-0 flex items-center justify-center mt-1">
                  <Bot size={16} className="text-white" />
                </div>
              )}
              <div className={`max-w-[80%] space-y-1 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                <div className={`
                  px-4 py-3 rounded-2xl text-sm leading-relaxed
                  ${msg.role === 'user' 
                    ? 'bg-black text-white rounded-tr-none' 
                    : 'bg-white border border-black/5 shadow-sm rounded-tl-none'}
                `}>
                  <div className="markdown-body">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                </div>
                <span className="text-[10px] text-black/30 font-medium px-1 uppercase tracking-widest">
                  {msg.role === 'user' ? (userName || 'Engineer') : 'AI Assistant'}
                </span>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-4 justify-start">
              <div className="w-8 h-8 bg-black rounded-lg flex-shrink-0 flex items-center justify-center mt-1">
                <Bot size={16} className="text-white" />
              </div>
              <div className="bg-white border border-black/5 shadow-sm px-4 py-3 rounded-2xl rounded-tl-none">
                <Loader2 size={16} className="animate-spin text-black/40" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-6 bg-gradient-to-t from-[#f5f5f5] via-[#f5f5f5] to-transparent">
          <form 
            onSubmit={sendMessage}
            className="max-w-4xl mx-auto relative"
          >
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about plant operations..."
              className="w-full bg-white border border-black/10 rounded-2xl px-6 py-4 pr-16 shadow-lg focus:outline-none focus:ring-2 focus:ring-black/5 transition-all text-sm"
            />
            <button 
              type="submit"
              disabled={!input.trim() || isLoading}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black text-white rounded-xl flex items-center justify-center hover:bg-black/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Send size={18} />
            </button>
          </form>
          <p className="text-center text-[10px] text-black/30 mt-4 uppercase tracking-widest font-bold">
            FFC Proprietary Information • Confidential
          </p>
        </div>
      </main>
    </div>
  );
}
