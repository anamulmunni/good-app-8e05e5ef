import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  getUserConversations, getMessages, sendMessage, getOrCreateConversation,
  searchUsers, uploadChatMedia, markMessagesRead, getUnreadCountsPerConversation,
  deleteMessageForEveryone, deleteMessageForMe,
  type Conversation, type Message
} from "@/lib/chat-api";
import { getUser } from "@/lib/api";
import { getOnlineUsers, isUserOnline } from "@/hooks/use-online";
import { ArrowLeft, Send, Search, Image, Mic, MicOff, X, MessageCircle, Loader2, Phone, Edit3, Camera, Smile, Palette, Video, Trash2 } from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import EmojiPicker from "@/components/EmojiPicker";
import { showMessageNotification } from "@/lib/call-api";
import { playUiSound } from "@/lib/ui-sounds";

type PendingMedia = {
  id: string;
  previewUrl: string;
  type: "image" | "voice";
  status: "uploading" | "sending" | "failed";
};

// Chat themes - Messenger-style beautiful themes
const CHAT_THEMES = [
  { name: "Messenger", gradient: "linear-gradient(135deg, #0084ff, #00c6ff)", bg: "#f0f2f5", bubbleFrom: "#0084ff", bubbleTo: "#00c6ff", accent: "#0084ff" },
  { name: "Love", gradient: "linear-gradient(135deg, #ff4b6e, #ff2d55)", bg: "#fff0f3", bubbleFrom: "#ff4b6e", bubbleTo: "#ff2d55", accent: "#ff2d55" },
  { name: "Ocean", gradient: "linear-gradient(135deg, #00d2ff, #3a7bd5)", bg: "#e8f4f8", bubbleFrom: "#00d2ff", bubbleTo: "#3a7bd5", accent: "#00d2ff" },
  { name: "Purple", gradient: "linear-gradient(135deg, #8b5cf6, #6366f1)", bg: "#f0e6ff", bubbleFrom: "#8b5cf6", bubbleTo: "#6366f1", accent: "#8b5cf6" },
  { name: "Sunset", gradient: "linear-gradient(135deg, #ff6b35, #f72585)", bg: "#fff5f0", bubbleFrom: "#ff6b35", bubbleTo: "#f72585", accent: "#ff6b35" },
  { name: "Dark", gradient: "linear-gradient(135deg, #4a5568, #2d3748)", bg: "#0f172a", bubbleFrom: "#4a5568", bubbleTo: "#2d3748", accent: "#64748b" },
  { name: "Forest", gradient: "linear-gradient(135deg, #22c55e, #16a34a)", bg: "#f0fdf4", bubbleFrom: "#22c55e", bubbleTo: "#16a34a", accent: "#22c55e" },
  { name: "Rose Gold", gradient: "linear-gradient(135deg, #f43f5e, #e11d48)", bg: "#fff1f2", bubbleFrom: "#f43f5e", bubbleTo: "#e11d48", accent: "#f43f5e" },
  { name: "Aurora", gradient: "linear-gradient(135deg, #06b6d4, #8b5cf6)", bg: "#ecfeff", bubbleFrom: "#06b6d4", bubbleTo: "#8b5cf6", accent: "#06b6d4" },
  { name: "Gold", gradient: "linear-gradient(135deg, #f59e0b, #d97706)", bg: "#fffbeb", bubbleFrom: "#f59e0b", bubbleTo: "#d97706", accent: "#f59e0b" },
  { name: "Galaxy", gradient: "linear-gradient(135deg, #6366f1, #ec4899)", bg: "#fdf2f8", bubbleFrom: "#6366f1", bubbleTo: "#ec4899", accent: "#6366f1" },
  { name: "Neon", gradient: "linear-gradient(135deg, #00ff87, #60efff)", bg: "#f0fdf4", bubbleFrom: "#00ff87", bubbleTo: "#60efff", accent: "#00ff87" },
];

const QUICK_EMOJIS = ["❤️", "😍", "🔥", "😂", "👍", "😘", "🥰", "💕"];

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
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [messageActionTarget, setMessageActionTarget] = useState<Message | null>(null);
  const [chatThemeIndex, setChatThemeIndex] = useState(() => {
    try { return parseInt(localStorage.getItem("chat-theme") || "0") || 0; } catch { return 0; }
  });
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [defaultEmoji, setDefaultEmoji] = useState(() => localStorage.getItem("chat-emoji") || "❤️");
  const [showEmojiSwitch, setShowEmojiSwitch] = useState(false);
  // Love hold animation
  const [loveScale, setLoveScale] = useState(1);
  const [loveHolding, setLoveHolding] = useState(false);
  const loveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loveStartRef = useRef(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);
  const recordingSecondsRef = useRef(0);
  const recordingDurationAtStopRef = useRef(0);
  const shouldSendRecordingRef = useRef(true);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const theme = CHAT_THEMES[chatThemeIndex] || CHAT_THEMES[0];

  useEffect(() => {
    if (!isLoading && !user) navigate("/");
  }, [user, isLoading, navigate]);

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations", user?.id],
    queryFn: () => getUserConversations(user!.id),
    enabled: !!user,
    refetchInterval: 2000,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", activeConversation?.id],
    queryFn: () => getMessages(activeConversation!.id, user?.id, 200),
    enabled: !!activeConversation,
    refetchInterval: 1200,
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

  const { data: unreadCounts = {} } = useQuery({
    queryKey: ["unread-counts-per-convo", user?.id, conversations.map(c => c.id).join(",")],
    queryFn: () => getUnreadCountsPerConversation(user!.id, conversations.map(c => c.id)),
    enabled: !!user && conversations.length > 0,
    refetchInterval: 3000,
  });

  const orderedConversations = [...conversations].sort((a, b) => {
    const ta = new Date(a.last_message_at || a.created_at || 0).getTime();
    const tb = new Date(b.last_message_at || b.created_at || 0).getTime();
    return tb - ta;
  });

  // Realtime - active conversation
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

  // Realtime - all messages (for notifications + sound)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`all-messages-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload: any) => {
        queryClient.invalidateQueries({ queryKey: ["conversations", user.id] });
        const msg = payload.new;
        if (msg && msg.sender_id !== user.id) {
          playUiSound("message");
          const preview = msg.message_type === "text" ? (msg.content || "") : (msg.message_type === "image" ? "📷 ছবি" : "🎤 ভয়েস");
          showMessageNotification("New Message", preview);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, queryClient]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingMedia]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

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
    onMutate: async ({ type, content, mediaUrl }) => {
      if (!activeConversation || !user) return null;
      const tempId = `temp-msg-${Date.now()}`;
      const optimisticTime = new Date().toISOString();
      const optimisticPreview = type === "text" ? (content || "") : type === "image" ? "📷 ছবি" : "🎤 ভয়েস";
      const optimisticMessage: Message = {
        id: tempId, conversation_id: activeConversation.id, sender_id: user.id,
        content: content || null, message_type: type, media_url: mediaUrl || null,
        is_read: false, created_at: optimisticTime,
      };
      queryClient.setQueryData(["messages", activeConversation.id], (old: Message[] = []) => [...old, optimisticMessage]);
      queryClient.setQueryData(["conversations", user.id], (old: Conversation[] = []) => {
        const updatedCurrent: Conversation = { ...activeConversation, last_message: optimisticPreview || activeConversation.last_message, last_message_at: optimisticTime };
        const rest = old.filter((c) => c.id !== activeConversation.id);
        return [updatedCurrent, ...rest].sort((a, b) => new Date(b.last_message_at || b.created_at || 0).getTime() - new Date(a.last_message_at || a.created_at || 0).getTime());
      });
      return { tempId, conversationId: activeConversation.id };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      queryClient.setQueryData(["messages", ctx.conversationId], (old: Message[] = []) => old.filter((m) => m.id !== ctx.tempId));
    },
    onSuccess: (saved, _vars, ctx) => {
      if (!ctx) return;
      queryClient.setQueryData(["messages", ctx.conversationId], (old: Message[] = []) => old.map((m) => (m.id === ctx.tempId ? saved : m)));
      queryClient.invalidateQueries({ queryKey: ["conversations", user?.id] });
    },
  });

  const deleteForMeMutation = useMutation({
    mutationFn: async (messageId: string) => {
      if (!user) throw new Error("Login required");
      await deleteMessageForMe(messageId, user.id);
    },
    onSuccess: () => {
      if (activeConversation) queryClient.invalidateQueries({ queryKey: ["messages", activeConversation.id] });
      queryClient.invalidateQueries({ queryKey: ["conversations", user?.id] });
      setMessageActionTarget(null);
    },
    onError: () => toast({ title: "ডিলিট করা যায়নি", variant: "destructive" }),
  });

  const deleteForEveryoneMutation = useMutation({
    mutationFn: async (messageId: string) => {
      if (!user) throw new Error("Login required");
      await deleteMessageForEveryone(messageId, user.id);
    },
    onSuccess: () => {
      if (activeConversation) queryClient.invalidateQueries({ queryKey: ["messages", activeConversation.id] });
      queryClient.invalidateQueries({ queryKey: ["conversations", user?.id] });
      setMessageActionTarget(null);
    },
    onError: () => toast({ title: "সবাইর জন্য ডিলিট করা যায়নি", variant: "destructive" }),
  });

  const handleSendText = () => {
    const text = messageText.trim();
    if (!text) return;
    setMessageText("");
    playUiSound("message");
    sendMutation.mutate({ type: "text", content: text });
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
    } catch {
      setPendingMedia(prev => prev.map(p => p.id === pendingId ? { ...p, status: "failed" as const } : p));
      toast({ title: "ছবি পাঠানো যায়নি", variant: "destructive" });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startRecording = async () => {
    if (isRecording || mediaRecorderRef.current?.state === "recording") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast({ title: "এই ডিভাইসে ভয়েস রেকর্ডিং সাপোর্ট নেই", variant: "destructive" }); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      const recorder = preferredMimeType ? new MediaRecorder(stream, { mimeType: preferredMimeType }) : new MediaRecorder(stream);
      audioChunksRef.current = [];
      recordingDurationAtStopRef.current = 0;
      shouldSendRecordingRef.current = true;
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const elapsed = recordingDurationAtStopRef.current || recordingSecondsRef.current;
        if (!shouldSendRecordingRef.current || elapsed < 1 || audioChunksRef.current.length === 0) {
          recordingDurationAtStopRef.current = 0; recordingSecondsRef.current = 0; setRecordingTime(0); return;
        }
        const mimeType = recorder.mimeType || preferredMimeType || "audio/webm";
        const extension = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const pendingId = `pending-voice-${Date.now()}`;
        setPendingMedia(prev => [...prev, { id: pendingId, previewUrl: "", type: "voice", status: "uploading" }]);
        try {
          const url = await uploadChatMedia(blob, `voice.${extension}`);
          setPendingMedia(prev => prev.map(p => p.id === pendingId ? { ...p, status: "sending" as const } : p));
          await sendMutation.mutateAsync({ type: "voice", content: "", mediaUrl: url });
          setPendingMedia(prev => prev.filter(p => p.id !== pendingId));
        } catch {
          setPendingMedia(prev => prev.map(p => p.id === pendingId ? { ...p, status: "failed" as const } : p));
        } finally {
          recordingDurationAtStopRef.current = 0; recordingSecondsRef.current = 0; setRecordingTime(0);
        }
      };
      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setIsRecording(true); setRecordingTime(0); recordingSecondsRef.current = 0;
      recordingTimerRef.current = setInterval(() => { recordingSecondsRef.current += 1; setRecordingTime(recordingSecondsRef.current); }, 1000);
    } catch { toast({ title: "মাইক্রোফোন access দিন", variant: "destructive" }); }
  };

  const stopRecording = (shouldSend = true) => {
    shouldSendRecordingRef.current = shouldSend;
    recordingDurationAtStopRef.current = recordingSecondsRef.current;
    clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; setIsRecording(false);
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try { recorder.requestData(); } catch {}
      recorder.stop();
    } else { recordingDurationAtStopRef.current = 0; recordingSecondsRef.current = 0; setRecordingTime(0); }
    mediaRecorderRef.current = null;
  };

  const handleMicToggle = async () => {
    if (messageText.trim()) return;
    if (isRecording) stopRecording(true); else { shouldSendRecordingRef.current = true; await startRecording(); }
  };

  const removePending = (id: string) => {
    setPendingMedia(prev => {
      const item = prev.find(p => p.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter(p => p.id !== id);
    });
  };

  const cancelLongPress = () => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } };
  const startLongPress = (msg: Message) => {
    cancelLongPress();
    longPressTimerRef.current = setTimeout(() => setMessageActionTarget(msg), 450);
  };

  // Love hold-to-grow
  const startLoveHold = useCallback(() => {
    setLoveHolding(true);
    setLoveScale(1);
    loveStartRef.current = Date.now();
    loveIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - loveStartRef.current;
      const scale = Math.min(1 + elapsed / 500, 3); // grows up to 3x over 1s
      setLoveScale(scale);
    }, 30);
  }, []);

  const endLoveHold = useCallback(() => {
    setLoveHolding(false);
    if (loveIntervalRef.current) { clearInterval(loveIntervalRef.current); loveIntervalRef.current = null; }
    const finalScale = loveScale;
    setLoveScale(1);
    // Send emoji sized by hold duration
    const repeatCount = finalScale >= 2.5 ? 3 : finalScale >= 1.8 ? 2 : 1;
    const emojiStr = defaultEmoji.repeat(repeatCount);
    playUiSound("like");
    sendMutation.mutate({ type: "text", content: emojiStr });
  }, [loveScale, defaultEmoji, sendMutation]);

  const cancelLoveHold = useCallback(() => {
    setLoveHolding(false);
    setLoveScale(1);
    if (loveIntervalRef.current) { clearInterval(loveIntervalRef.current); loveIntervalRef.current = null; }
  }, []);

  const setTheme = (idx: number) => {
    setChatThemeIndex(idx);
    localStorage.setItem("chat-theme", String(idx));
    setShowThemePicker(false);
  };

  const setEmoji = (emoji: string) => {
    setDefaultEmoji(emoji);
    localStorage.setItem("chat-emoji", emoji);
    setShowEmojiSwitch(false);
  };

  const lastSeenAgo = (onlineAt: string | null) => {
    if (!onlineAt) return "কিছুক্ষণ আগে";
    const diffMs = Date.now() - new Date(onlineAt).getTime();
    const mins = Math.max(1, Math.floor(diffMs / 60000));
    if (mins < 60) return `${mins} মিনিট আগে`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} ঘন্টা আগে`;
    return `${Math.floor(hrs / 24)} দিন আগে`;
  };

  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "এইমাত্র";
    if (mins < 60) return `${mins} মি.`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} ঘ.`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days} দি.`;
    const d = new Date(dateStr);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear().toString().slice(2)}`;
  };

  if (isLoading || !user) return null;

  // ========== ACTIVE CONVERSATION ==========
  if (activeConversation && otherUser) {
    const otherOnline = isUserOnline(otherUser?.online_at);
    const isDarkTheme = chatThemeIndex === 5;
    return (
      <div className="min-h-screen flex flex-col" style={{ background: isDarkTheme ? "#111827" : "#fff" }}>
        {/* Header */}
        <div className="sticky top-0 z-10 px-2 py-2 flex items-center gap-2" style={{ background: isDarkTheme ? "#1f2937" : "#fff", borderBottom: `1px solid ${isDarkTheme ? "#374151" : "#f0f0f0"}` }}>
          <button onClick={() => { setActiveConversation(null); setOtherUser(null); setPendingMedia([]); }}
            className="p-1.5 rounded-full" style={{ color: theme.accent }}>
            <ArrowLeft size={22} />
          </button>
          <button onClick={() => navigate(`/user/${otherUser.id}`)} className="relative">
            <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center" style={{ background: isDarkTheme ? "#374151" : "#e5e7eb" }}>
              {otherUser.avatar_url ? <img src={otherUser.avatar_url} alt="" className="w-full h-full object-cover" /> :
                <span className="font-bold text-sm" style={{ color: theme.accent }}>{otherUser.display_name?.[0]?.toUpperCase() || "?"}</span>}
            </div>
            {otherOnline && <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2" style={{ borderColor: isDarkTheme ? "#1f2937" : "#fff" }} />}
          </button>
          <button onClick={() => navigate(`/user/${otherUser.id}`)} className="flex-1 text-left min-w-0">
            <p className="font-bold text-[15px] truncate inline-flex items-center gap-1" style={{ color: isDarkTheme ? "#f9fafb" : "#111827" }}>
              <span>{otherUser.display_name || "User"}</span>
              {otherUser.is_verified_badge && <VerifiedBadge className="h-3.5 w-3.5" />}
            </p>
            <p className="text-[11px]" style={{ color: isDarkTheme ? "#9ca3af" : "#6b7280" }}>{otherOnline ? "Active now" : `Last seen ${lastSeenAgo(otherUser.online_at)}`}</p>
          </button>
          <button onClick={() => navigate(`/call/${otherUser.id}`)}
            className="w-9 h-9 rounded-full flex items-center justify-center" style={{ color: theme.accent }}>
            <Phone size={20} />
          </button>
          <button onClick={() => setShowThemePicker(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center" style={{ color: theme.accent }}>
            <Palette size={18} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1" style={{ background: isDarkTheme ? "#111827" : theme.bg }}>
          {/* Top profile */}
          <div className="flex flex-col items-center py-6 gap-2">
            <div className="w-16 h-16 rounded-full overflow-hidden" style={{ background: isDarkTheme ? "#374151" : "#e5e7eb" }}>
              {otherUser.avatar_url ? <img src={otherUser.avatar_url} className="w-full h-full object-cover" /> :
                <div className="w-full h-full flex items-center justify-center"><span className="text-2xl font-bold" style={{ color: isDarkTheme ? "#6b7280" : "#9ca3af" }}>{otherUser.display_name?.[0]?.toUpperCase() || "?"}</span></div>}
            </div>
            <p className="font-bold text-[15px] inline-flex items-center gap-1" style={{ color: isDarkTheme ? "#f9fafb" : "#111827" }}>
              <span>{otherUser.display_name || "User"}</span>
              {otherUser.is_verified_badge && <VerifiedBadge className="h-3.5 w-3.5" />}
            </p>
            <p className="text-[12px]" style={{ color: "#9ca3af" }}>Good App</p>
          </div>

          {messages.map((msg, i) => {
            const isMine = msg.sender_id === user.id;
            const showAvatar = !isMine && (i === messages.length - 1 || messages[i + 1]?.sender_id !== msg.sender_id);
            const isLastMyMsg = isMine && (i === messages.length - 1 || messages[i + 1]?.sender_id !== msg.sender_id);
            const isLastMsgOverall = i === messages.length - 1;
            // Check if message is just emojis
            const isEmojiOnly = msg.message_type === "text" && msg.content && /^[\p{Emoji}\s]+$/u.test(msg.content) && msg.content.length <= 12;
            return (
              <div key={msg.id} className={`flex items-end gap-1.5 ${isMine ? "justify-end" : "justify-start"}`}>
                {!isMine && (
                  <div className="w-7 h-7 shrink-0">
                    {showAvatar ? (
                      <div className="w-7 h-7 rounded-full overflow-hidden" style={{ background: isDarkTheme ? "#4b5563" : "#d1d5db" }}>
                        {otherUser.avatar_url ? <img src={otherUser.avatar_url} className="w-full h-full object-cover" /> :
                          <span className="w-full h-full flex items-center justify-center text-[10px] font-bold" style={{ color: "#9ca3af" }}>{otherUser.display_name?.[0] || "?"}</span>}
                      </div>
                    ) : null}
                  </div>
                )}
                <div
                  className="max-w-[70%]"
                  onContextMenu={(e) => { e.preventDefault(); setMessageActionTarget(msg); }}
                  onMouseDown={() => startLongPress(msg)} onMouseUp={cancelLongPress} onMouseLeave={cancelLongPress}
                  onTouchStart={() => startLongPress(msg)} onTouchEnd={cancelLongPress} onTouchCancel={cancelLongPress}
                >
                  {msg.message_type === "text" && isEmojiOnly ? (
                    <p className="text-[42px] leading-tight py-1">{msg.content}</p>
                  ) : msg.message_type === "text" ? (
                    <div className={`px-3 py-2 rounded-2xl ${isMine ? "rounded-br-md" : "rounded-bl-md"}`}
                      style={isMine ? { background: theme.gradient } : { background: isDarkTheme ? "#374151" : "#fff", boxShadow: isDarkTheme ? "none" : "0 1px 2px rgba(0,0,0,0.08)" }}>
                      <p className="text-[15px] leading-6 whitespace-pre-wrap break-words" style={{ color: isMine ? "#fff" : isDarkTheme ? "#f9fafb" : "#111827" }}>{msg.content}</p>
                    </div>
                  ) : null}
                  {msg.message_type === "image" && msg.media_url && (
                    <button onClick={() => setViewingImage(msg.media_url!)} className="block">
                      <img src={msg.media_url} alt="" className={`rounded-2xl max-w-full max-h-60 object-cover ${isMine ? "rounded-br-md" : "rounded-bl-md"}`} />
                    </button>
                  )}
                  {msg.message_type === "voice" && msg.media_url && (
                    <div className={`px-3 py-2 rounded-2xl ${isMine ? "rounded-br-md" : "rounded-bl-md"}`}
                      style={isMine ? { background: theme.gradient } : { background: isDarkTheme ? "#374151" : "#fff" }}>
                      <audio controls preload="metadata" src={msg.media_url} className="w-[240px] max-w-[62vw] h-10" />
                    </div>
                  )}
                  <p className={`text-[10px] mt-0.5 px-1 ${isMine ? "text-right" : ""}`} style={{ color: "#9ca3af" }}>
                    {msg.created_at ? new Date(msg.created_at).toLocaleTimeString("bn-BD", { hour: "2-digit", minute: "2-digit" }) : ""}
                  </p>
                  {isMine && isLastMyMsg && isLastMsgOverall && msg.is_read && (
                    <div className="flex justify-end px-1">
                      {otherUser?.avatar_url ? (
                        <img src={otherUser.avatar_url} className="w-3.5 h-3.5 rounded-full object-cover" alt="" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ background: theme.accent }}>
                          <span className="text-[6px] text-white font-bold">✓</span>
                        </div>
                      )}
                    </div>
                  )}
                  {isMine && isLastMyMsg && isLastMsgOverall && !msg.is_read && (
                    <p className="text-[9px] text-right px-1" style={{ color: "#9ca3af" }}>Sent</p>
                  )}
                </div>
              </div>
            );
          })}

          {/* Pending media */}
          {pendingMedia.map((pm) => (
            <div key={pm.id} className="flex justify-end items-end gap-1.5">
              <div className="max-w-[70%]">
                {pm.type === "image" && pm.previewUrl && (
                  <div className="relative">
                    <img src={pm.previewUrl} alt="" className="rounded-2xl rounded-br-md max-w-full max-h-60 object-cover opacity-60" />
                    <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-6 h-6 text-white animate-spin" /></div>
                  </div>
                )}
                {pm.type === "voice" && (
                  <div className="px-3 py-2 rounded-2xl rounded-br-md flex items-center gap-2 opacity-60" style={{ background: theme.gradient }}>
                    <Mic className="w-4 h-4 text-white" /><span className="text-sm text-white">ভয়েস...</span><Loader2 className="w-3 h-3 text-white animate-spin" />
                  </div>
                )}
                {pm.status === "failed" && <button onClick={() => removePending(pm.id)} className="text-[10px] text-red-500 mt-0.5 px-1">❌ ব্যর্থ — ট্যাপ করুন</button>}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="sticky bottom-0 px-2 py-2 flex items-center gap-1.5" style={{ background: isDarkTheme ? "#1f2937" : "#fff", borderTop: `1px solid ${isDarkTheme ? "#374151" : "#f0f0f0"}` }}>
          <button onClick={() => fileInputRef.current?.click()} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ color: theme.accent }}>
            <Camera size={22} />
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ color: theme.accent }}>
            <Image size={22} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

          <div className={`flex-1 flex items-center rounded-full px-3 py-1.5 ${isRecording ? "" : ""}`}
            style={{ background: isRecording ? "rgba(239,68,68,0.1)" : isDarkTheme ? "#374151" : "#f3f4f6", border: isRecording ? "1px solid rgba(239,68,68,0.2)" : "none" }}>
            {isRecording ? (
              <div className="flex items-center gap-2 w-full">
                <span className="text-red-500 animate-pulse text-sm font-bold">● {recordingTime}s</span>
                <span className="text-[12px] font-medium text-red-400">রেকর্ডিং...</span>
                <button onClick={() => stopRecording(false)} className="ml-auto text-red-500 text-xs font-bold">বাতিল</button>
              </div>
            ) : (
              <>
                <input value={messageText} onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendText()}
                  placeholder="Aa"
                  className="flex-1 bg-transparent text-[16px] border-none outline-none"
                  style={{ color: isDarkTheme ? "#f9fafb" : "#111827" }} />
                <button onClick={() => setShowEmoji(!showEmoji)} className="p-1" style={{ color: theme.accent }}><Smile size={20} /></button>
              </>
            )}
          </div>

          {messageText.trim() ? (
            <button onClick={handleSendText} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ color: theme.accent }}>
              <Send size={22} />
            </button>
          ) : (
            <>
              <button onClick={handleMicToggle}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors select-none ${isRecording ? "animate-pulse" : ""}`}
                style={{ color: isRecording ? "#ef4444" : theme.accent, background: isRecording ? "rgba(239,68,68,0.15)" : "transparent" }}>
                {isRecording ? <MicOff size={22} /> : <Mic size={22} />}
              </button>
              {!isRecording && (
                <button
                  onMouseDown={startLoveHold} onMouseUp={endLoveHold} onMouseLeave={cancelLoveHold}
                  onTouchStart={startLoveHold} onTouchEnd={endLoveHold} onTouchCancel={cancelLoveHold}
                  onContextMenu={(e) => { e.preventDefault(); setShowEmojiSwitch(true); }}
                  className="w-9 h-9 rounded-full flex items-center justify-center select-none"
                  style={{ transform: `scale(${loveScale})`, transition: loveHolding ? "none" : "transform 0.2s ease-out" }}
                >
                  <span className="text-[22px]">{defaultEmoji}</span>
                </button>
              )}
            </>
          )}
        </div>

        {/* Emoji Picker */}
        <EmojiPicker isOpen={showEmoji} onClose={() => setShowEmoji(false)} onSelect={(emoji) => setMessageText(prev => prev + emoji)} />

        {/* Theme Picker */}
        <AnimatePresence>
          {showThemePicker && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[220] bg-black/40" onClick={() => setShowThemePicker(false)}>
              <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
                className="absolute bottom-0 left-0 right-0 rounded-t-2xl p-4 space-y-3"
                style={{ background: isDarkTheme ? "#1f2937" : "#fff" }}
                onClick={(e) => e.stopPropagation()}>
                <p className="text-center font-bold text-[16px]" style={{ color: isDarkTheme ? "#f9fafb" : "#111827" }}>Chat Theme</p>
                <div className="grid grid-cols-3 gap-3">
                  {CHAT_THEMES.map((t, idx) => (
                    <button key={idx} onClick={() => setTheme(idx)}
                      className={`rounded-xl p-3 flex flex-col items-center gap-2 border-2 ${chatThemeIndex === idx ? "border-blue-500" : "border-transparent"}`}
                      style={{ background: isDarkTheme ? "#374151" : "#f9fafb" }}>
                      <div className="w-10 h-10 rounded-full" style={{ background: t.gradient }} />
                      <span className="text-[11px] font-semibold" style={{ color: isDarkTheme ? "#d1d5db" : "#374151" }}>{t.name}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowThemePicker(false)} className="w-full py-2.5 rounded-xl text-[14px] font-semibold" style={{ background: isDarkTheme ? "#374151" : "#f3f4f6", color: isDarkTheme ? "#f9fafb" : "#374151" }}>
                  বন্ধ করুন
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Emoji Switch (long-press on love button) */}
        <AnimatePresence>
          {showEmojiSwitch && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[220] bg-black/40" onClick={() => setShowEmojiSwitch(false)}>
              <motion.div initial={{ y: 60, scale: 0.9 }} animate={{ y: 0, scale: 1 }} exit={{ y: 60, scale: 0.9 }}
                className="absolute bottom-16 left-2 right-2 rounded-2xl p-4"
                style={{ background: isDarkTheme ? "#1f2937" : "#fff" }}
                onClick={(e) => e.stopPropagation()}>
                <p className="text-center font-bold text-[14px] mb-3" style={{ color: isDarkTheme ? "#f9fafb" : "#111827" }}>Default Emoji বদলান</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {QUICK_EMOJIS.map((em) => (
                    <button key={em} onClick={() => setEmoji(em)}
                      className={`w-12 h-12 rounded-xl flex items-center justify-center text-[28px] border-2 ${defaultEmoji === em ? "border-blue-500" : "border-transparent"}`}
                      style={{ background: isDarkTheme ? "#374151" : "#f9fafb" }}>
                      {em}
                    </button>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Message action sheet */}
        <AnimatePresence>
          {messageActionTarget && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[210] bg-black/40" onClick={() => setMessageActionTarget(null)}>
              <motion.div initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }}
                className="absolute bottom-0 left-0 right-0 rounded-t-2xl p-3 space-y-2"
                style={{ background: isDarkTheme ? "#1f2937" : "#fff" }}
                onClick={(e) => e.stopPropagation()}>
                <button onClick={() => deleteForMeMutation.mutate(messageActionTarget.id)}
                  className="w-full h-11 rounded-xl text-sm font-semibold" style={{ background: isDarkTheme ? "#374151" : "#f3f4f6", color: isDarkTheme ? "#f9fafb" : "#111827" }}>
                  Delete for you
                </button>
                {messageActionTarget.sender_id === user.id && (
                  <button onClick={() => deleteForEveryoneMutation.mutate(messageActionTarget.id)}
                    className="w-full h-11 rounded-xl bg-red-500 text-white text-sm font-semibold">
                    Delete for everyone
                  </button>
                )}
                <button onClick={() => setMessageActionTarget(null)}
                  className="w-full h-11 rounded-xl text-sm font-medium" style={{ background: isDarkTheme ? "#374151" : "#f3f4f6", color: isDarkTheme ? "#d1d5db" : "#6b7280" }}>
                  Cancel
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Image viewer */}
        <AnimatePresence>
          {viewingImage && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center" onClick={() => setViewingImage(null)}>
              <button onClick={() => setViewingImage(null)} className="absolute top-4 right-4 z-10 text-white/80"><X size={28} /></button>
              <img src={viewingImage} alt="" className="max-w-full max-h-full object-contain p-4" onClick={(e) => e.stopPropagation()} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ========== CONVERSATION LIST ==========
  return (
    <div className="min-h-screen" style={{ background: "#fff" }}>
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 pt-3 pb-1" style={{ background: "#fff", borderBottom: "1px solid #f0f0f0" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate("/feed")} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#f3f4f6", color: "#0084ff" }}>
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-[22px] font-black" style={{ color: "#111827" }}>Chats</h1>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowSearch(!showSearch)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#f3f4f6", color: "#374151" }}>
              {showSearch ? <X size={18} /> : <Search size={18} />}
            </button>
            <button onClick={() => setShowSearch(!showSearch)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#f3f4f6", color: "#374151" }}>
              <Edit3 size={18} />
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showSearch && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search" autoFocus
                className="w-full rounded-full px-4 py-2.5 text-[14px] border-none outline-none mb-2" style={{ background: "#f3f4f6", color: "#111827" }} />
              {searchResults.length > 0 && (
                <div className="space-y-0.5 mb-2">
                  {searchResults.filter((u: any) => u.id !== user.id).map((u: any) => (
                    <button key={u.id} onClick={() => startConversationWith(u)}
                      className="w-full flex items-center gap-3 p-2 rounded-xl text-left" style={{ background: "transparent" }}>
                      <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center" style={{ background: "#e5e7eb" }}>
                        {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" /> :
                          <span className="text-sm font-bold" style={{ color: "#0084ff" }}>{u.display_name?.[0]?.toUpperCase() || "?"}</span>}
                      </div>
                      <div>
                        <p className="text-[14px] font-semibold inline-flex items-center gap-1" style={{ color: "#111827" }}>
                          <span>{u.display_name || "User"}</span>
                          {u.is_verified_badge && <VerifiedBadge className="h-3 w-3" />}
                        </p>
                        <p className="text-[12px]" style={{ color: "#6b7280" }}>{u.guest_id}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Online users */}
      {onlineUsers.length > 0 && !showSearch && (
        <div className="px-4 py-2" style={{ borderBottom: "1px solid #f3f4f6" }}>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
            {onlineUsers.map((u: any) => (
              <button key={u.id} onClick={() => startConversationWith(u)} className="flex flex-col items-center gap-1 min-w-[60px]">
                <div className="relative">
                  <div className="w-14 h-14 rounded-full overflow-hidden border-2" style={{ background: "#e5e7eb", borderColor: "#0084ff" }}>
                    {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" /> :
                      <span className="w-full h-full flex items-center justify-center font-bold" style={{ color: "#0084ff" }}>{u.display_name?.[0]?.toUpperCase() || "?"}</span>}
                  </div>
                  <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full" style={{ border: "2.5px solid #fff" }} />
                </div>
                <p className="text-[11px] font-medium truncate max-w-[60px] inline-flex items-center gap-0.5" style={{ color: "#374151" }}>
                  <span>{u.display_name || "User"}</span>
                  {u.is_verified_badge && <VerifiedBadge className="h-2.5 w-2.5" />}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Conversations */}
      <div className="px-2">
        {conversations.length === 0 && !showSearch && onlineUsers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20" style={{ color: "#9ca3af" }}>
            <MessageCircle size={48} className="mb-3 opacity-40" />
            <p className="text-[14px] font-semibold" style={{ color: "#4b5563" }}>কোনো কথোপকথন নেই</p>
            <p className="text-[12px] mt-1">🔍 উপরে Search করে কাউকে খুঁজুন</p>
          </div>
        )}
        {orderedConversations.map((convo) => {
          const otherId = getOtherUserId(convo);
          const other = userCache[otherId];
          const otherOnline = isUserOnline(other?.online_at);
          const unreadCount = unreadCounts[convo.id] || 0;
          const hasUnread = unreadCount > 0;
          return (
            <button key={convo.id} onClick={() => openConversation(convo)}
              className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl text-left transition-colors"
              style={{ background: hasUnread ? "rgba(0,132,255,0.06)" : "transparent" }}>
              <div className="relative">
                <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center" style={{ background: "#e5e7eb" }}>
                  {other?.avatar_url ? <img src={other.avatar_url} alt="" className="w-full h-full object-cover" /> :
                    <span className="font-bold text-lg" style={{ color: "#0084ff" }}>{other?.display_name?.[0]?.toUpperCase() || "?"}</span>}
                </div>
                {otherOnline && <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full" style={{ border: "2.5px solid #fff" }} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <p className={`text-[15px] truncate inline-flex items-center gap-1 ${hasUnread ? "font-black" : "font-semibold"}`} style={{ color: hasUnread ? "#111827" : "#4b5563" }}>
                    <span>{other?.display_name || `User #${otherId}`}</span>
                    {other?.is_verified_badge && <VerifiedBadge className="h-3.5 w-3.5" />}
                  </p>
                  <span className={`text-[11px] whitespace-nowrap ml-2 ${hasUnread ? "font-bold" : ""}`} style={{ color: hasUnread ? "#0084ff" : "#9ca3af" }}>
                    {timeAgo(convo.last_message_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className={`text-[15px] truncate flex-1 ${hasUnread ? "font-bold" : ""}`} style={{ color: hasUnread ? "#111827" : "#6b7280" }}>
                    {convo.last_message || "কথা শুরু করুন"}
                  </p>
                  {hasUnread && (
                    <span className="min-w-[20px] h-[20px] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shrink-0" style={{ background: "#0084ff" }}>
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
