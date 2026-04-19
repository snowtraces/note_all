import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, RefreshCcw, Bot, Send, ShieldCheck, Zap } from 'lucide-react';
import { getWeixinBot, getWeixinMessages, sendWeixinReply } from '../api/weixinApi';

export default function WeixinView({ active }) {
    const [status, setStatus] = useState('loading'); // loading, confirmed, idle
    const [loginInfo, setLoginInfo] = useState(null);
    const [error, setError] = useState(null);
    
    // 会话交互相关状态
    const [messages, setMessages] = useState([]);
    const [replyText, setReplyText] = useState("");
    const [isSending, setIsSending] = useState(false);
    const chatEndRef = useRef(null);

    // 初始化：仅检查是否登录以决定显示内容
    useEffect(() => {
        if (!active) return;
        const init = async () => {
            try {
                const bot = await getWeixinBot();
                if (bot && bot.ilink_bot_id) {
                    setLoginInfo(bot);
                    setStatus('confirmed');
                } else {
                    setStatus('idle');
                }
            } catch (e) {
                setStatus('idle');
            }
        };
        init();
        // 轮询登录状态（如果还没登录）
        const timer = setInterval(init, 5000);
        return () => clearInterval(timer);
    }, [active]);

    // 轮询并同步互动消息
    useEffect(() => {
        let timer;
        if (active && status === 'confirmed') {
            const fetchMsgs = async () => {
                try {
                    const data = await getWeixinMessages();
                    setMessages(data || []);
                } catch (e) {
                    console.error("Fetch messages error:", e);
                }
            };
            fetchMsgs();
            timer = setInterval(fetchMsgs, 5000);
        }
        return () => clearInterval(timer);
    }, [status, active]);
    
    // 自动滚动到聊天底部
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendReply = async () => {
        if (!replyText.trim() || isSending) return;
        const lastUserMsg = [...messages].reverse().find(m => m.direction === 'incoming');
        if (!lastUserMsg) {
            alert("暂无活跃用户互动记录，无法回传 context_token。请让用户先给 Bot 发送消息。");
            return;
        }
        
        setIsSending(true);
        try {
            await sendWeixinReply(lastUserMsg.user_id, replyText);
            setReplyText("");
            const data = await getWeixinMessages();
            setMessages(data || []);
        } catch (e) {
            setError("发送失败: " + e.message);
        } finally {
            setIsSending(false);
        }
    };

    if (status === 'confirmed' && loginInfo) {
        return (
            <div className="w-full h-full flex flex-col bg-base p-6 lg:p-10 animate-in fade-in duration-700">
                {/* 交互会话流面板 (Full Width Chat View) */}
                <div className="max-w-5xl mx-auto w-full flex flex-col bg-white/[0.02] border border-white/5 rounded-[32px] overflow-hidden shadow-2xl backdrop-blur-xl flex-1 mb-4">
                    {/* Session Header */}
                    <div className="px-8 py-5 border-b border-white/5 bg-white/[0.01] flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                            <div className="flex flex-col">
                                <span className="text-[13px] font-medium text-white/90">微信实时交互中心</span>
                                <span className="text-[10px] text-silverText/30 font-mono">Connected to {loginInfo.ilink_user_id}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                             <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/5">
                                 <Zap size={10} className="text-primeAccent" />
                                 <span className="text-[9px] font-mono text-silverText/40 uppercase tracking-widest">{messages.length} Events</span>
                             </div>
                        </div>
                    </div>

                    {/* Message Feed */}
                    <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar bg-gradient-to-b from-transparent to-black/20">
                        {messages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center opacity-10">
                                <MessageSquare size={64} className="mb-6" />
                                <p className="text-xl font-light tracking-tight">等待第一条消息注入...</p>
                                <p className="text-xs mt-2 uppercase tracking-widest font-mono">Live Monitoring Active</p>
                            </div>
                        ) : (
                            messages.map((msg, idx) => (
                                <div key={msg.id || idx} className={`flex flex-col ${msg.direction === 'incoming' ? 'items-start' : 'items-end'}`}>
                                    <div className="flex items-center gap-2 mb-2 px-1">
                                        <span className="text-[9px] font-mono text-silverText/20">{new Date(msg.created_at).toLocaleTimeString()}</span>
                                        <span className="text-[9px] font-mono text-silverText/20">·</span>
                                        <span className={`text-[9px] font-bold uppercase tracking-widest ${msg.direction === 'incoming' ? 'text-blue-400/40' : 'text-primeAccent/40'}`}>
                                            {msg.direction === 'incoming' ? 'Wechat User' : 'Insight Assistant'}
                                        </span>
                                    </div>
                                    <div className={`max-w-[75%] px-6 py-4 rounded-[24px] text-[14px] leading-relaxed shadow-sm transition-all hover:shadow-md ${
                                        msg.direction === 'incoming' 
                                        ? 'bg-white/[0.04] border border-white/10 text-silverText/90 rounded-tl-none' 
                                        : 'bg-primeAccent/10 border border-primeAccent/20 text-white rounded-tr-none'
                                    }`}>
                                        {msg.content}
                                    </div>
                                </div>
                            ))
                        )}
                        <div ref={chatEndRef}></div>
                    </div>

                    {/* Input Area */}
                    <div className="p-8 bg-black/40 border-t border-white/5 backdrop-blur-md">
                        <div className="max-w-3xl mx-auto relative group">
                            <input 
                                type="text" 
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                placeholder={messages.length > 0 ? "输入内容并发送到微信..." : "暂无活跃联系人，需等待用户首发消息..."}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
                                className="w-full bg-white/[0.03] border border-white/10 rounded-2xl pl-6 pr-16 py-5 text-[14px] text-white placeholder-silverText/20 focus:outline-none focus:border-primeAccent/50 focus:bg-white/[0.05] transition-all shadow-inner"
                            />
                            <button 
                                onClick={handleSendReply}
                                disabled={isSending || !replyText.trim()}
                                className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-xl bg-primeAccent text-black flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-20 disabled:grayscale"
                            >
                                {isSending ? <RefreshCcw size={20} className="animate-spin" /> : <Send size={20} />}
                            </button>
                        </div>
                        <p className="mt-4 text-[10px] text-silverText/20 px-2 flex items-center gap-2 justify-center font-mono uppercase tracking-widest">
                            <ShieldCheck size={12} className="text-green-500/30" /> Secure encrypted tunnel via iLink Bot Protocol
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // 未登录/等待中 欢迎页 (Welcome / Setup Guide)
    return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-base p-10 text-center animate-in fade-in zoom-in duration-1000">
            <div className="relative mb-10">
                <div className="absolute inset-0 bg-primeAccent/20 blur-[100px] rounded-full"></div>
                <div className="relative w-32 h-32 rounded-[40px] bg-gradient-to-br from-primeAccent/20 to-transparent border border-primeAccent/30 flex items-center justify-center text-primeAccent shadow-2xl">
                    <Bot size={64} className="opacity-80" />
                </div>
            </div>
            
            <h2 className="text-3xl font-medium text-white mb-4 tracking-tight">微信机器人助手</h2>
            <p className="text-silverText/40 max-w-md mx-auto leading-relaxed mb-12 font-light text-lg">
                将移动端的灵感瞬间，无缝同步至您的私有知识矩阵。
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">
                <FeatureCard icon={<Zap size={20}/>} title="即时同步" desc="在微信中随手记录，自动入库并生成 AI 总结。" />
                <FeatureCard icon={<MessageSquare size={20}/>} title="深度互动" desc="支持 RAG 提问，在微信中检索您的个人笔记。" />
                <FeatureCard icon={<ShieldCheck size={20}/>} title="全面管理" desc="请通过左侧列表中的【微信管理】组件完成授权与状态监控。" />
            </div>
        </div>
    );
}

function FeatureCard({ icon, title, desc }) {
    return (
        <div className="p-8 rounded-[32px] bg-white/[0.02] border border-white/5 hover:border-white/10 hover:bg-white/[0.04] transition-all text-left group">
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-silverText/40 mb-6 group-hover:text-primeAccent transition-colors">
                {icon}
            </div>
            <h4 className="text-white text-sm font-medium mb-2">{title}</h4>
            <p className="text-silverText/40 text-[12px] leading-relaxed">{desc}</p>
        </div>
    );
}

function Step({ num, title, desc }) {
    return (
        <div className="flex gap-4">
            <div className="text-2xl font-mono text-primeAccent/20 leading-none">{num}</div>
            <div><h4 className="text-white text-sm font-medium mb-1">{title}</h4><p className="text-xs text-silverText/40 leading-normal">{desc}</p></div>
        </div>
    );
}
