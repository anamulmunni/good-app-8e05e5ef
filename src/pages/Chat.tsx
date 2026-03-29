import { useState, useEffect, useRef } from "react";
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
import { ArrowLeft, Send, Search, Image, Mic, MicOff, X, MessageCircle, Loader2, Phone, Edit3, Camera, Info, ThumbsUp, Smile } from "lucide-react";
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);
  const recordingSecondsRef = useRef(0);
  const recordingDurationAtStopRef = useRef(0);
  const shouldSendRecordingRef = useRef(true);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Also listen for new messages on all conversations (for unread indicators)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`all-messages-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload: any) => {
        queryClient.invalidateQueries({ queryKey: ["conversations", user.id] });
        // Show notification for messages from others when page is hidden
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
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
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
      const optimisticPreview = type === "text"
        ? (content || "")
        : type === "image"
          ? "📷 ছবি"
          : "🎤 ভয়েস";
      const optimisticMessage: Message = {
        id: tempId,
        conversation_id: activeConversation.id,
        sender_id: user.id,
        content: content || null,
        message_type: type,
        media_url: mediaUrl || null,
        is_read: false,
        created_at: optimisticTime,
      };

      queryClient.setQueryData(["messages", activeConversation.id], (old: Message[] = []) => [
        ...old,
        optimisticMessage,
      ]);

      queryClient.setQueryData(["conversations", user.id], (old: Conversation[] = []) => {
        const updatedCurrent: Conversation = {
          ...activeConversation,
          last_message: optimisticPreview || activeConversation.last_message,
          last_message_at: optimisticTime,
        };

        const rest = old.filter((c) => c.id !== activeConversation.id);
        return [updatedCurrent, ...rest].sort((a, b) => {
          const ta = new Date(a.last_message_at || a.created_at || 0).getTime();
          const tb = new Date(b.last_message_at || b.created_at || 0).getTime();
          return tb - ta;
        });
      });

      return { tempId, conversationId: activeConversation.id };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      queryClient.setQueryData(["messages", ctx.conversationId], (old: Message[] = []) =>
        old.filter((m) => m.id !== ctx.tempId)
      );
    },
    onSuccess: (saved, _vars, ctx) => {
      if (!ctx) return;
      queryClient.setQueryData(["messages", ctx.conversationId], (old: Message[] = []) =>
        old.map((m) => (m.id === ctx.tempId ? saved : m))
      );
      queryClient.invalidateQueries({ queryKey: ["conversations", user?.id] });
    },
  });

  const deleteForMeMutation = useMutation({
    mutationFn: async (messageId: string) => {
      if (!user) throw new Error("Login required");
      await deleteMessageForMe(messageId, user.id);
    },
    onSuccess: () => {
      if (activeConversation) {
        queryClient.invalidateQueries({ queryKey: ["messages", activeConversation.id] });
      }
      queryClient.invalidateQueries({ queryKey: ["conversations", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["unread-counts-per-convo"] });
      setMessageActionTarget(null);
    },
    onError: () => {
      toast({ title: "ডিলিট করা যায়নি", variant: "destructive" });
    },
  });

  const deleteForEveryoneMutation = useMutation({
    mutationFn: async (messageId: string) => {
      if (!user) throw new Error("Login required");
      await deleteMessageForEveryone(messageId, user.id);
    },
    onSuccess: () => {
      if (activeConversation) {
        queryClient.invalidateQueries({ queryKey: ["messages", activeConversation.id] });
      }
      queryClient.invalidateQueries({ queryKey: ["conversations", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["unread-counts-per-convo"] });
      setMessageActionTarget(null);
    },
    onError: () => {
      toast({ title: "সবাইর জন্য ডিলিট করা যায়নি", variant: "destructive" });
    },
  });

  const handleSendText = () => {
    const text = messageText.trim();
    if (!text) return;
    setMessageText("");
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
      toast({ title: "এই ডিভাইসে ভয়েস রেকর্ডিং সাপোর্ট নেই", variant: "destructive" });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";

      const recorder = preferredMimeType
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      recordingDurationAtStopRef.current = 0;
      shouldSendRecordingRef.current = true;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const elapsed = recordingDurationAtStopRef.current || recordingSecondsRef.current;

        if (!shouldSendRecordingRef.current || elapsed < 1 || audioChunksRef.current.length === 0) {
          recordingDurationAtStopRef.current = 0;
          recordingSecondsRef.current = 0;
          setRecordingTime(0);
          return;
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
          recordingDurationAtStopRef.current = 0;
          recordingSecondsRef.current = 0;
          setRecordingTime(0);
        }
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      recordingSecondsRef.current = 0;
      recordingTimerRef.current = setInterval(() => {
        recordingSecondsRef.current += 1;
        setRecordingTime(recordingSecondsRef.current);
      }, 1000);
    } catch {
      toast({ title: "মাইক্রোফোন access দিন", variant: "destructive" });
    }
  };

  const stopRecording = (shouldSend = true) => {
    shouldSendRecordingRef.current = shouldSend;
    recordingDurationAtStopRef.current = recordingSecondsRef.current;

    clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    setIsRecording(false);

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.requestData();
      } catch {
        // Some browsers do not support requestData here
      }
      recorder.stop();
    } else {
      recordingDurationAtStopRef.current = 0;
      recordingSecondsRef.current = 0;
      setRecordingTime(0);
    }

    mediaRecorderRef.current = null;
  };

  const handleMicToggle = async () => {
    if (messageText.trim()) return;
    if (isRecording) {
      stopRecording(true);
    } else {
      shouldSendRecordingRef.current = true;
      await startRecording();
    }
  };

  const removePending = (id: string) => {
    setPendingMedia(prev => {
      const item = prev.find(p => p.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter(p => p.id !== id);
    });
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const startLongPress = (msg: Message) => {
    cancelLongPress();
    longPressTimerRef.current = setTimeout(() => {
      setMessageActionTarget(msg);
    }, 450);
  };

  const lastSeenAgo = (onlineAt: string | null) => {
    if (!onlineAt) return "কিছুক্ষণ আগে";
    const diffMs = Date.now() - new Date(onlineAt).getTime();
    const mins = Math.max(1, Math.floor(diffMs / 60000));
    if (mins < 60) return `${mins} মিনিট আগে`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} ঘন্টা আগে`;
    const days = Math.floor(hrs / 24);
    return `${days} দিন আগে`;
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

  // ========== ACTIVE CONVERSATION (Messenger Style) ==========
  if (activeConversation && otherUser) {
    const otherOnline = isUserOnline(otherUser?.online_at);
    return (
      <div className="min-h-screen bg-white dark:bg-background flex flex-col">
        {/* Messenger-style header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-card border-b border-gray-100 dark:border-border px-2 py-2 flex items-center gap-2">
          <button onClick={() => { setActiveConversation(null); setOtherUser(null); setPendingMedia([]); }}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-secondary text-blue-600 dark:text-primary">
            <ArrowLeft size={22} />
          </button>
          <button onClick={() => navigate(`/user/${otherUser.id}`)} className="relative">
            <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-primary/20 flex items-center justify-center overflow-hidden">
              {otherUser.avatar_url ? <img src={otherUser.avatar_url} alt="" className="w-full h-full object-cover" /> :
                <span className="text-blue-600 font-bold text-sm">{otherUser.display_name?.[0]?.toUpperCase() || "?"}</span>}
            </div>
            {otherOnline && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-card" />}
          </button>
          <button onClick={() => navigate(`/user/${otherUser.id}`)} className="flex-1 text-left min-w-0">
            <p className="font-bold text-[15px] text-gray-900 dark:text-foreground truncate">{otherUser.display_name || "User"}</p>
            <p className="text-[11px] text-gray-500 dark:text-muted-foreground">{otherOnline ? "Active now" : `Last seen ${lastSeenAgo(otherUser.online_at)}`}</p>
          </button>
          <button onClick={() => navigate(`/call/${otherUser.id}`)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-blue-600 dark:text-primary hover:bg-blue-50 dark:hover:bg-primary/10">
            <Phone size={20} />
          </button>
        </div>

        {/* Messages area - Messenger gradient bubbles */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1" style={{ background: "linear-gradient(180deg, #f0f0f0 0%, #e8e8e8 100%)" }}>
          {/* Other user avatar at top */}
          <div className="flex flex-col items-center py-6 gap-2">
            <div className="w-16 h-16 rounded-full bg-gray-200 overflow-hidden">
              {otherUser.avatar_url ? <img src={otherUser.avatar_url} className="w-full h-full object-cover" /> :
                <div className="w-full h-full flex items-center justify-center"><span className="text-2xl font-bold text-gray-400">{otherUser.display_name?.[0]?.toUpperCase() || "?"}</span></div>}
            </div>
            <p className="font-bold text-gray-900 text-[15px]">{otherUser.display_name || "User"}</p>
            <p className="text-[12px] text-gray-500">Good App</p>
          </div>

          {messages.map((msg, i) => {
            const isMine = msg.sender_id === user.id;
            const showAvatar = !isMine && (i === messages.length - 1 || messages[i + 1]?.sender_id !== msg.sender_id);
            const isLastMyMsg = isMine && (i === messages.length - 1 || messages[i + 1]?.sender_id !== msg.sender_id);
            const isLastMsgOverall = i === messages.length - 1;
            return (
              <div key={msg.id} className={`flex items-end gap-1.5 ${isMine ? "justify-end" : "justify-start"}`}>
                {!isMine && (
                  <div className="w-7 h-7 shrink-0">
                    {showAvatar ? (
                      <div className="w-7 h-7 rounded-full bg-gray-300 overflow-hidden">
                        {otherUser.avatar_url ? <img src={otherUser.avatar_url} className="w-full h-full object-cover" /> :
                          <span className="w-full h-full flex items-center justify-center text-[10px] font-bold text-gray-500">{otherUser.display_name?.[0] || "?"}</span>}
                      </div>
                    ) : null}
                  </div>
                )}
                <div
                  className={`max-w-[70%] ${isMine ? "" : ""}`}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMessageActionTarget(msg);
                  }}
                  onMouseDown={() => startLongPress(msg)}
                  onMouseUp={cancelLongPress}
                  onMouseLeave={cancelLongPress}
                  onTouchStart={() => startLongPress(msg)}
                  onTouchEnd={cancelLongPress}
                  onTouchCancel={cancelLongPress}
                >
                  {msg.message_type === "text" && (
                    <div className={`px-3 py-2 rounded-2xl ${
                      isMine
                        ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-br-md"
                        : "bg-white dark:bg-card text-gray-900 dark:text-foreground rounded-bl-md shadow-sm"
                    }`}>
                      <p className="text-[16px] leading-6 whitespace-pre-wrap break-words">{msg.content}</p>
                    </div>
                  )}
                  {msg.message_type === "image" && msg.media_url && (
                    <button onClick={() => setViewingImage(msg.media_url!)} className="block">
                      <img src={msg.media_url} alt="" className={`rounded-2xl max-w-full max-h-60 object-cover ${isMine ? "rounded-br-md" : "rounded-bl-md"}`} />
                    </button>
                  )}
                  {msg.message_type === "voice" && msg.media_url && (
                    <div className={`px-3 py-2 rounded-2xl ${isMine ? "bg-primary rounded-br-md" : "bg-card rounded-bl-md border border-border/40 shadow-sm"}`}>
                      <audio controls preload="metadata" src={msg.media_url} className="w-[240px] max-w-[62vw] h-10" />
                    </div>
                  )}
                  <p className={`text-[10px] mt-0.5 px-1 ${isMine ? "text-right text-gray-500" : "text-gray-400"}`}>
                    {msg.created_at ? new Date(msg.created_at).toLocaleTimeString("bn-BD", { hour: "2-digit", minute: "2-digit" }) : ""}
                  </p>
                  {/* Seen indicator - Messenger style */}
                  {isMine && isLastMyMsg && isLastMsgOverall && msg.is_read && (
                    <div className="flex justify-end px-1">
                      <div className="flex items-center gap-0.5">
                        {otherUser?.avatar_url ? (
                          <img src={otherUser.avatar_url} className="w-3.5 h-3.5 rounded-full object-cover" alt="" />
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full bg-blue-500 flex items-center justify-center">
                            <span className="text-[6px] text-white font-bold">✓</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {isMine && isLastMyMsg && isLastMsgOverall && !msg.is_read && (
                    <p className="text-[9px] text-right text-gray-400 px-1">Sent</p>
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
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>
                  </div>
                )}
                {pm.type === "voice" && (
                  <div className="px-3 py-2 rounded-2xl rounded-br-md bg-blue-400 flex items-center gap-2 opacity-60">
                    <Mic className="w-4 h-4 text-white" />
                    <span className="text-sm text-white">ভয়েস...</span>
                    <Loader2 className="w-3 h-3 text-white animate-spin" />
                  </div>
                )}
                {pm.status === "failed" && (
                  <button onClick={() => removePending(pm.id)} className="text-[10px] text-red-500 mt-0.5 px-1">❌ ব্যর্থ — ট্যাপ করুন</button>
                )}
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* Messenger-style input bar */}
        <div className="sticky bottom-0 bg-white dark:bg-card border-t border-gray-100 dark:border-border px-2 py-2 flex items-center gap-1.5">
          <button onClick={() => fileInputRef.current?.click()}
            className="w-9 h-9 rounded-full flex items-center justify-center text-blue-600 hover:bg-blue-50">
            <Camera size={22} />
          </button>
          <button onClick={() => fileInputRef.current?.click()}
            className="w-9 h-9 rounded-full flex items-center justify-center text-blue-600 hover:bg-blue-50">
            <Image size={22} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

          <>
            <div className={`flex-1 flex items-center rounded-full px-3 py-1.5 ${isRecording ? "bg-destructive/10 border border-destructive/20" : "bg-gray-100 dark:bg-secondary"}`}>
              {isRecording ? (
                <div className="flex items-center gap-2 w-full">
                  <span className="text-destructive animate-pulse text-sm font-bold">● {recordingTime}s</span>
                  <span className="text-[12px] font-medium text-destructive/90">রেকর্ডিং চলছে... থামাতে ক্লিক করুন</span>
                  <button onClick={() => stopRecording(false)} className="ml-auto text-red-500 text-xs font-bold">বাতিল</button>
                </div>
              ) : (
                <>
                  <input value={messageText} onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendText()}
                    placeholder="Aa"
                    className="flex-1 bg-transparent text-gray-900 dark:text-foreground text-[16px] border-none outline-none placeholder:text-gray-400" />
                  <button onClick={() => setShowEmoji(!showEmoji)} className={`p-1 ${showEmoji ? "text-blue-700" : "text-blue-600"}`}><Smile size={20} /></button>
                </>
              )}
            </div>

            {messageText.trim() ? (
              <button onClick={handleSendText}
                className="w-9 h-9 rounded-full flex items-center justify-center text-blue-600 hover:bg-blue-50">
                <Send size={22} />
              </button>
            ) : (
              <>
                <button
                  onClick={handleMicToggle}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors select-none ${isRecording ? "bg-destructive text-destructive-foreground animate-pulse" : "text-blue-600 hover:bg-blue-50"}`}
                >
                  {isRecording ? <MicOff size={22} /> : <Mic size={22} />}
                </button>
                {!isRecording && (
                  <button onClick={() => sendMutation.mutate({ type: "text", content: "❤️" })}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-blue-600 hover:bg-blue-50">
                    <span className="text-[22px]">❤️</span>
                  </button>
                )}
              </>
            )}
          </>
        </div>

        {/* Emoji Picker */}
        <EmojiPicker
          isOpen={showEmoji}
          onClose={() => setShowEmoji(false)}
          onSelect={(emoji) => setMessageText(prev => prev + emoji)}
        />

        {/* Message action sheet */}
        <AnimatePresence>
          {messageActionTarget && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[210] bg-black/40"
              onClick={() => setMessageActionTarget(null)}
            >
              <motion.div
                initial={{ y: 80 }}
                animate={{ y: 0 }}
                exit={{ y: 80 }}
                className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-card border-t border-border p-3 space-y-2"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => deleteForMeMutation.mutate(messageActionTarget.id)}
                  className="w-full h-11 rounded-xl bg-muted text-foreground text-sm font-semibold"
                >
                  Delete for you
                </button>

                {messageActionTarget.sender_id === user.id && (
                  <button
                    onClick={() => deleteForEveryoneMutation.mutate(messageActionTarget.id)}
                    className="w-full h-11 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold"
                  >
                    Delete for everyone
                  </button>
                )}

                <button
                  onClick={() => setMessageActionTarget(null)}
                  className="w-full h-11 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium"
                >
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
              <button onClick={() => setViewingImage(null)} className="absolute top-4 right-4 z-10 text-white/80">
                <X size={28} />
              </button>
              <img src={viewingImage} alt="" className="max-w-full max-h-full object-contain p-4" onClick={(e) => e.stopPropagation()} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ========== CONVERSATION LIST (Messenger Style) ==========
  return (
    <div className="min-h-screen bg-white dark:bg-background">
      {/* Messenger header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-card px-4 pt-3 pb-1">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate("/feed")}
              className="w-9 h-9 rounded-full bg-gray-100 dark:bg-secondary flex items-center justify-center text-blue-600">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-[22px] font-black text-gray-900 dark:text-foreground">Chats</h1>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowSearch(!showSearch)}
              className="w-9 h-9 rounded-full bg-gray-100 dark:bg-secondary flex items-center justify-center text-gray-700 dark:text-foreground">
              {showSearch ? <X size={18} /> : <Search size={18} />}
            </button>
            <button onClick={() => setShowSearch(!showSearch)}
              className="w-9 h-9 rounded-full bg-gray-100 dark:bg-secondary flex items-center justify-center text-gray-700 dark:text-foreground">
              <Edit3 size={18} />
            </button>
          </div>
        </div>

        {/* Search */}
        <AnimatePresence>
          {showSearch && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search"
                className="w-full bg-gray-100 dark:bg-secondary text-gray-900 dark:text-foreground rounded-full px-4 py-2.5 text-[14px] border-none outline-none placeholder:text-gray-400 mb-2" autoFocus />
              {searchResults.length > 0 && (
                <div className="space-y-0.5 mb-2">
                  {searchResults.filter((u: any) => u.id !== user.id).map((u: any) => (
                    <button key={u.id} onClick={() => startConversationWith(u)}
                      className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-secondary transition-colors text-left">
                      <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-primary/20 flex items-center justify-center overflow-hidden">
                        {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" /> :
                          <span className="text-sm font-bold text-blue-600">{u.display_name?.[0]?.toUpperCase() || "?"}</span>}
                      </div>
                      <div>
                        <p className="text-[14px] font-semibold text-gray-900 dark:text-foreground">{u.display_name || "User"}</p>
                        <p className="text-[12px] text-gray-500">{u.guest_id}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Online users - Messenger story-like circles */}
      {onlineUsers.length > 0 && !showSearch && (
        <div className="px-4 py-2 border-b border-gray-100 dark:border-border/30">
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
            {onlineUsers.map((u: any) => (
              <button key={u.id} onClick={() => startConversationWith(u)}
                className="flex flex-col items-center gap-1 min-w-[60px]">
                <div className="relative">
                  <div className="w-14 h-14 rounded-full bg-gray-200 dark:bg-primary/20 flex items-center justify-center overflow-hidden border-2 border-blue-500">
                    {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" /> :
                      <span className="font-bold text-blue-600">{u.display_name?.[0]?.toUpperCase() || "?"}</span>}
                  </div>
                  <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-[2.5px] border-white dark:border-card" />
                </div>
                <p className="text-[11px] text-gray-700 dark:text-foreground font-medium truncate max-w-[60px]">{u.display_name || "User"}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Conversations */}
      <div className="px-2">
        {conversations.length === 0 && !showSearch && onlineUsers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <MessageCircle size={48} className="mb-3 opacity-40" />
            <p className="text-[14px] font-semibold text-gray-600">কোনো কথোপকথন নেই</p>
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
              className={`w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-secondary/50 transition-colors text-left ${hasUnread ? "bg-blue-50/60 dark:bg-primary/5" : ""}`}>
              <div className="relative">
                <div className="w-14 h-14 rounded-full bg-gray-200 dark:bg-primary/20 flex items-center justify-center overflow-hidden">
                  {other?.avatar_url ? <img src={other.avatar_url} alt="" className="w-full h-full object-cover" /> :
                    <span className="font-bold text-blue-600 text-lg">{other?.display_name?.[0]?.toUpperCase() || "?"}</span>}
                </div>
                {otherOnline && <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-[2.5px] border-white dark:border-card" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <p className={`text-[15px] truncate ${hasUnread ? "font-black text-gray-900 dark:text-foreground" : "font-semibold text-gray-700 dark:text-foreground/80"}`}>{other?.display_name || `User #${otherId}`}</p>
                  <span className={`text-[11px] whitespace-nowrap ml-2 ${hasUnread ? "text-blue-600 dark:text-primary font-bold" : "text-gray-400"}`}>
                    {timeAgo(convo.last_message_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className={`text-[15px] truncate flex-1 ${hasUnread ? "font-bold text-gray-900 dark:text-foreground" : "text-gray-500 dark:text-muted-foreground"}`}>{convo.last_message || "কথা শুরু করুন"}</p>
                  {hasUnread && (
                    <span className="min-w-[20px] h-[20px] bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shrink-0">
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
