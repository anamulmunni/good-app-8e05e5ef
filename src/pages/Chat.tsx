import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  getUserConversations, getMessages, sendMessage, getOrCreateConversation,
  searchUsers, uploadChatMedia, markMessagesRead,
  type Conversation, type Message
} from "@/lib/chat-api";
import { getUser } from "@/lib/api";
import { getOnlineUsers, isUserOnline } from "@/hooks/use-online";
import { ArrowLeft, Send, Search, Image, Mic, MicOff, X, MessageCircle, Loader2, Phone, Video } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

type PendingMedia = {
  id: string;
  previewUrl: string;
  type: "image" | "voice";
  status: "uploading" | "sending" | "failed";
};

export default function Chat() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [otherUser, setOtherUser] = useState<any>(null);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoading && !user) navigate("/");
  }, [user, isLoading, navigate]);

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations", user?.id],
    queryFn: () => getUserConversations(user!.id),
    enabled: !!user,
    refetchInterval: 10000,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", activeConversation?.id],
    queryFn: () => getMessages(activeConversation!.id),
    enabled: !!activeConversation,
    refetchInterval: 5000,
  });

  const { data: searchResults = [] } = useQuery({
    queryKey: ["user-search", searchQuery],
    queryFn: () => searchUsers(searchQuery),
    enabled: searchQuery.length >= 2,
  });

  const { data: onlineUsers = [] } = useQuery({
    queryKey: ["online-users-chat"],
    queryFn: () => getOnlineUsers(user!.id),
    enabled: !!user,
    refetchInterval: 30000,
  });

  // Realtime
  useEffect(() => {
    if (!activeConversation) return;
    const channel = supabase
      .channel(`chat-${activeConversation.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeConversation.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["messages", activeConversation.id] });
        queryClient.invalidateQueries({ queryKey: ["conversations", user?.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeConversation?.id, queryClient, user?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingMedia]);

  useEffect(() => {
    if (activeConversation && user) markMessagesRead(activeConversation.id, user.id);
  }, [activeConversation, messages, user]);

  const [userCache, setUserCache] = useState<Record<number, any>>({});
  useEffect(() => {
    const loadUsers = async () => {
      const ids = new Set<number>();
      conversations.forEach(c => { ids.add(c.participant_1); ids.add(c.participant_2); });
      ids.delete(user?.id || 0);
      for (const id of ids) {
        if (!userCache[id]) {
          const u = await getUser(id);
          if (u) setUserCache(prev => ({ ...prev, [id]: u }));
        }
      }
    };
    if (conversations.length > 0 && user) loadUsers();
  }, [conversations, user]);

  const getOtherUserId = (convo: Conversation) =>
    convo.participant_1 === user?.id ? convo.participant_2 : convo.participant_1;

  const openConversation = async (convo: Conversation) => {
    setActiveConversation(convo);
    const otherId = getOtherUserId(convo);
    const u = userCache[otherId] || await getUser(otherId);
    if (u) { setUserCache(prev => ({ ...prev, [u.id]: u })); setOtherUser(u); }
    setShowSearch(false);
  };

  const startConversationWith = async (targetUser: any) => {
    if (!user) return;
    if (targetUser.id === user.id) { toast({ title: "নিজেকে message পাঠানো যাবে না", variant: "destructive" }); return; }
    try {
      const convo = await getOrCreateConversation(user.id, targetUser.id);
      setActiveConversation(convo);
      setOtherUser(targetUser);
      setShowSearch(false);
      setSearchQuery("");
      queryClient.invalidateQueries({ queryKey: ["conversations", user.id] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const sendMutation = useMutation({
    mutationFn: async ({ type, content, mediaUrl }: { type: string; content: string; mediaUrl?: string }) => {
      if (!activeConversation || !user) throw new Error("No conversation");
      return sendMessage(activeConversation.id, user.id, content, type, mediaUrl);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", activeConversation?.id] });
      queryClient.invalidateQueries({ queryKey: ["conversations", user?.id] });
    },
  });

  const handleSendText = () => {
    if (!messageText.trim()) return;
    sendMutation.mutate({ type: "text", content: messageText.trim() });
    setMessageText("");
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const pendingId = `pending-${Date.now()}`;
    const previewUrl = URL.createObjectURL(file);
    
    setPendingMedia(prev => [...prev, { id: pendingId, previewUrl, type: "image", status: "uploading" }]);
    
    try {
      const url = await uploadChatMedia(file, file.name);
      setPendingMedia(prev => prev.map(p => p.id === pendingId ? { ...p, status: "sending" as const } : p));
      await sendMutation.mutateAsync({ type: "image", content: "", mediaUrl: url });
      setPendingMedia(prev => prev.filter(p => p.id !== pendingId));
      URL.revokeObjectURL(previewUrl);
    } catch (err: any) {
      setPendingMedia(prev => prev.map(p => p.id === pendingId ? { ...p, status: "failed" as const } : p));
      toast({ title: "ছবি পাঠানো যায়নি", variant: "destructive" });
    }
    
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const pendingId = `pending-voice-${Date.now()}`;
        setPendingMedia(prev => [...prev, { id: pendingId, previewUrl: "", type: "voice", status: "uploading" }]);
        try {
          const url = await uploadChatMedia(blob, "voice.webm");
          setPendingMedia(prev => prev.map(p => p.id === pendingId ? { ...p, status: "sending" as const } : p));
          await sendMutation.mutateAsync({ type: "voice", content: "", mediaUrl: url });
          setPendingMedia(prev => prev.filter(p => p.id !== pendingId));
        } catch {
          setPendingMedia(prev => prev.map(p => p.id === pendingId ? { ...p, status: "failed" as const } : p));
          toast({ title: "ভয়েস পাঠানো যায়নি", variant: "destructive" });
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch {
      toast({ title: "মাইক্রোফোন access দিন", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    clearInterval(recordingTimerRef.current);
  };

  const removePending = (id: string) => {
    setPendingMedia(prev => {
      const item = prev.find(p => p.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter(p => p.id !== id);
    });
  };

  if (isLoading || !user) return null;

  // Active conversation view
  if (activeConversation && otherUser) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center gap-3">
          <button onClick={() => { setActiveConversation(null); setOtherUser(null); setPendingMedia([]); }} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft size={22} />
          </button>
          <button onClick={() => navigate(`/user/${otherUser.id}`)} className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm overflow-hidden">
            {otherUser.avatar_url ? <img src={otherUser.avatar_url} alt="" className="w-full h-full object-cover" /> : otherUser.display_name?.[0]?.toUpperCase() || "?"}
          </button>
          <button onClick={() => navigate(`/user/${otherUser.id}`)} className="text-left flex-1">
            <p className="font-semibold text-foreground text-sm">{otherUser.display_name || "User"}</p>
            <p className="text-xs text-muted-foreground">{otherUser.guest_id}</p>
          </button>
          <button onClick={() => navigate(`/call/${otherUser.id}`)}
            className="p-2 rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-[hsl(var(--emerald))]">
            <Phone size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {messages.length === 0 && (
            <p className="text-center text-muted-foreground text-sm mt-10">কোনো মেসেজ নেই। কথা শুরু করুন! 💬</p>
          )}
          {messages.map((msg) => {
            const isMine = msg.sender_id === user.id;
            return (
              <motion.div key={msg.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${isMine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-secondary text-secondary-foreground rounded-bl-sm"}`}>
                  {msg.message_type === "text" && <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>}
                  {msg.message_type === "image" && msg.media_url && <img src={msg.media_url} alt="" className="rounded-lg max-w-full max-h-60 object-cover" />}
                  {msg.message_type === "voice" && msg.media_url && <audio controls src={msg.media_url} className="max-w-full" />}
                  <p className={`text-[10px] mt-1 ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                    {msg.created_at ? new Date(msg.created_at).toLocaleTimeString("bn-BD", { hour: "2-digit", minute: "2-digit" }) : ""}
                  </p>
                </div>
              </motion.div>
            );
          })}

          {/* Pending media messages */}
          {pendingMedia.map((pm) => (
            <div key={pm.id} className="flex justify-end">
              <div className="max-w-[75%] rounded-2xl px-3 py-2 bg-primary/60 text-primary-foreground rounded-br-sm relative">
                {pm.type === "image" && pm.previewUrl && (
                  <div className="relative">
                    <img src={pm.previewUrl} alt="" className="rounded-lg max-w-full max-h-60 object-cover opacity-70" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-background/80 rounded-full p-2">
                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                      </div>
                    </div>
                  </div>
                )}
                {pm.type === "voice" && (
                  <div className="flex items-center gap-2 py-2 opacity-70">
                    <Mic className="w-4 h-4" />
                    <span className="text-sm">ভয়েস মেসেজ</span>
                  </div>
                )}
                <div className="flex items-center gap-1 mt-1">
                  {pm.status === "failed" ? (
                    <button onClick={() => removePending(pm.id)} className="text-[10px] text-destructive font-bold">
                      ❌ ব্যর্থ — ট্যাপ করে সরান
                    </button>
                  ) : (
                    <p className="text-[10px] text-primary-foreground/70 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {pm.status === "uploading" ? "আপলোড হচ্ছে..." : "পাঠানো হচ্ছে..."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        <div className="sticky bottom-0 bg-card border-t border-border px-3 py-2 flex items-center gap-2">
          <button onClick={() => fileInputRef.current?.click()} className="text-muted-foreground hover:text-primary p-1">
            <Image size={20} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

          {isRecording ? (
            <div className="flex-1 flex items-center gap-2">
              <span className="text-destructive animate-pulse text-sm">● {recordingTime}s</span>
              <button onClick={stopRecording} className="ml-auto bg-destructive text-destructive-foreground rounded-full p-2">
                <MicOff size={18} />
              </button>
            </div>
          ) : (
            <>
              <input value={messageText} onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendText()}
                placeholder="মেসেজ লিখুন..."
                className="flex-1 bg-secondary text-foreground rounded-full px-4 py-2 text-sm border-none outline-none placeholder:text-muted-foreground" />
              {messageText.trim() ? (
                <button onClick={handleSendText} className="bg-primary text-primary-foreground rounded-full p-2">
                  <Send size={18} />
                </button>
              ) : (
                <button onClick={startRecording} className="text-muted-foreground hover:text-primary p-2">
                  <Mic size={20} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // Conversation list
  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-lg font-bold text-foreground">💬 মেসেজ</h1>
        </div>
        <button onClick={() => setShowSearch(!showSearch)} className="text-muted-foreground hover:text-primary">
          {showSearch ? <X size={22} /> : <Search size={22} />}
        </button>
      </div>

      <AnimatePresence>
        {showSearch && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden bg-card border-b border-border">
            <div className="px-4 py-3">
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Guest ID বা নাম দিয়ে খুঁজুন..."
                className="w-full bg-secondary text-foreground rounded-lg px-4 py-2 text-sm border-none outline-none placeholder:text-muted-foreground" autoFocus />
              {searchResults.length > 0 && (
                <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
                  {searchResults.filter((u: any) => u.id !== user.id).map((u: any) => (
                    <button key={u.id} onClick={() => startConversationWith(u)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/80 transition-colors text-left">
                      <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                        {u.display_name?.[0]?.toUpperCase() || "?"}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{u.display_name || "User"}</p>
                        <p className="text-xs text-muted-foreground">{u.guest_id}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {searchQuery.length >= 2 && searchResults.filter((u: any) => u.id !== user.id).length === 0 && (
                <p className="text-sm text-muted-foreground mt-2 text-center">কোনো user পাওয়া যায়নি</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="divide-y divide-border">
        {conversations.length === 0 && !showSearch && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <MessageCircle size={48} className="mb-3 opacity-40" />
            <p className="text-sm">কোনো কথোপকথন নেই</p>
            <p className="text-xs mt-1">🔍 উপরে Search করে কাউকে খুঁজুন</p>
          </div>
        )}
        {conversations.map((convo) => {
          const otherId = getOtherUserId(convo);
          const other = userCache[otherId];
          return (
            <button key={convo.id} onClick={() => openConversation(convo)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left">
              <div className="w-11 h-11 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold overflow-hidden">
                {other?.avatar_url ? <img src={other.avatar_url} alt="" className="w-full h-full object-cover" /> : other?.display_name?.[0]?.toUpperCase() || "?"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <p className="font-semibold text-foreground text-sm truncate">{other?.display_name || `User #${otherId}`}</p>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                    {convo.last_message_at ? new Date(convo.last_message_at).toLocaleDateString("bn-BD") : ""}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{convo.last_message || "কথা শুরু করুন"}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
