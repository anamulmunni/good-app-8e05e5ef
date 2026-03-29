import { useEffect, useRef, useState, useCallback } from "react";
import { X, Trash2, MessageCircle, Phone, Music, Play, Eye, Send, Smile } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { resolveStoryMusic } from "@/lib/story-music";
import { supabase } from "@/integrations/supabase/client";
import VerifiedBadge from "@/components/VerifiedBadge";

type StoryViewerProps = {
  story: any;
  allStories?: any[];
  userId: number;
  onClose: () => void;
  onDelete: (id: string) => void;
  onMessage: (uid: number) => void;
  onCall: (uid: number) => void;
  onProfile: (uid: number) => void;
  timeAgo: (date: string | null) => string;
};

const STORY_DURATION = 30000;

const STORY_REACTIONS = [
  { type: "love", emoji: "❤️" },
  { type: "haha", emoji: "😂" },
  { type: "wow", emoji: "😮" },
  { type: "sad", emoji: "😢" },
  { type: "fire", emoji: "🔥" },
];

type ViewerUser = { viewer_user_id: number; user?: { display_name: string | null; avatar_url: string | null } };

export default function StoryViewer({ story, allStories, userId, onClose, onDelete, onMessage, onCall, onProfile, timeAgo }: StoryViewerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [needsTapToPlay, setNeedsTapToPlay] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<ViewerUser[]>([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [showReactions, setShowReactions] = useState(false);
  const [myReactions, setMyReactions] = useState<Set<string>>(new Set());
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [flyingEmoji, setFlyingEmoji] = useState<{ id: number; emoji: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(Date.now());
  const flyIdRef = useRef(0);

  const stories = allStories && allStories.length > 0 ? allStories : [story];
  const currentStory = stories[currentIndex] || story;
  const resolvedMusic = resolveStoryMusic(currentStory.music_name);

  // Find initial index
  useEffect(() => {
    if (allStories && allStories.length > 0) {
      const idx = allStories.findIndex((s: any) => s.id === story.id);
      if (idx >= 0) setCurrentIndex(idx);
    }
  }, [story.id, allStories]);

  // Record view
  useEffect(() => {
    if (!currentStory?.id || !userId) return;
    supabase.from("story_views").upsert(
      { story_id: currentStory.id, viewer_user_id: userId },
      { onConflict: "story_id,viewer_user_id" }
    ).then(() => {});
  }, [currentStory?.id, userId]);

  // Load viewer count
  useEffect(() => {
    if (!currentStory?.id) return;
    supabase.from("story_views").select("viewer_user_id", { count: "exact", head: true })
      .eq("story_id", currentStory.id)
      .then(({ count }) => setViewerCount(count || 0));
  }, [currentStory?.id]);

  // Load reactions
  useEffect(() => {
    if (!currentStory?.id) return;
    (async () => {
      const { data } = await supabase.from("story_reactions")
        .select("reaction_type, user_id")
        .eq("story_id", currentStory.id);
      if (data) {
        const counts: Record<string, number> = {};
        const mine = new Set<string>();
        data.forEach((r: any) => {
          counts[r.reaction_type] = (counts[r.reaction_type] || 0) + 1;
          if (r.user_id === userId) mine.add(r.reaction_type);
        });
        setReactionCounts(counts);
        setMyReactions(mine);
      }
    })();
  }, [currentStory?.id, userId]);

  // Audio
  useEffect(() => {
    setNeedsTapToPlay(false);
    if (!resolvedMusic.audioUrl) return;
    const audio = new Audio(resolvedMusic.audioUrl);
    audio.volume = 0.65;
    audio.loop = true;
    audioRef.current = audio;
    audio.play().then(() => setNeedsTapToPlay(false)).catch(() => setNeedsTapToPlay(true));
    return () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } };
  }, [currentStory.id, resolvedMusic.audioUrl]);

  // Auto-progress timer
  useEffect(() => {
    if (paused || showViewers || showReplyInput) return;
    startTimeRef.current = Date.now();
    setProgress(0);
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(100, (elapsed / STORY_DURATION) * 100);
      setProgress(pct);
      if (elapsed >= STORY_DURATION) goNext();
    }, 50);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [currentIndex, paused, showViewers, showReplyInput]);

  const goNext = useCallback(() => {
    if (currentIndex < stories.length - 1) { setCurrentIndex((i) => i + 1); setProgress(0); }
    else onClose();
  }, [currentIndex, stories.length, onClose]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) { setCurrentIndex((i) => i - 1); setProgress(0); }
  }, [currentIndex]);

  const handleTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    if (showViewers || showReplyInput) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0]?.clientX || 0 : e.clientX;
    const x = clientX - rect.left;
    const third = rect.width / 3;
    if (x < third) goPrev();
    else if (x > third * 2) goNext();
    else setPaused((p) => !p);
  }, [goPrev, goNext, showViewers, showReplyInput]);

  const handleManualPlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    audioRef.current.play().then(() => setNeedsTapToPlay(false)).catch(() => setNeedsTapToPlay(true));
  };

  const handleReaction = async (reactionType: string, emoji: string) => {
    // Flying emoji animation
    flyIdRef.current += 1;
    setFlyingEmoji({ id: flyIdRef.current, emoji });
    setTimeout(() => setFlyingEmoji(null), 1200);

    if (myReactions.has(reactionType)) {
      // Remove reaction
      setMyReactions(prev => { const n = new Set(prev); n.delete(reactionType); return n; });
      setReactionCounts(prev => ({ ...prev, [reactionType]: Math.max(0, (prev[reactionType] || 1) - 1) }));
      await supabase.from("story_reactions").delete()
        .eq("story_id", currentStory.id)
        .eq("user_id", userId)
        .eq("reaction_type", reactionType);
    } else {
      // Check max 5 reactions
      if (myReactions.size >= 5) return;
      setMyReactions(prev => new Set(prev).add(reactionType));
      setReactionCounts(prev => ({ ...prev, [reactionType]: (prev[reactionType] || 0) + 1 }));
      await supabase.from("story_reactions").upsert(
        { story_id: currentStory.id, user_id: userId, reaction_type: reactionType },
        { onConflict: "story_id,user_id,reaction_type" }
      );
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || sendingReply) return;
    setSendingReply(true);
    try {
      const storyOwnerUid = currentStory.user_id;
      // Find or create conversation
      const { data: existingConv } = await supabase
        .from("conversations")
        .select("id")
        .or(`and(participant_1.eq.${userId},participant_2.eq.${storyOwnerUid}),and(participant_1.eq.${storyOwnerUid},participant_2.eq.${userId})`)
        .single();

      let convId: string;
      if (existingConv) {
        convId = existingConv.id;
      } else {
        const { data: newConv } = await supabase
          .from("conversations")
          .insert({ participant_1: userId, participant_2: storyOwnerUid })
          .select("id")
          .single();
        convId = newConv!.id;
      }

      // Send story reply message with story thumbnail
      const storyReplyContent = `📷 স্টোরি রিপ্লাই: ${replyText.trim()}\n🖼️ ${currentStory.image_url}`;
      await supabase.from("messages").insert({
        conversation_id: convId,
        sender_id: userId,
        content: storyReplyContent,
        message_type: "text",
      });

      // Update last message
      await supabase.from("conversations").update({
        last_message: `📷 স্টোরি রিপ্লাই: ${replyText.trim().slice(0, 50)}`,
        last_message_at: new Date().toISOString(),
      }).eq("id", convId);

      // Send notification
      await supabase.from("notifications").insert({
        user_id: storyOwnerUid,
        from_user_id: userId,
        type: "story_reply",
        content: `আপনার স্টোরিতে রিপ্লাই দিয়েছে: "${replyText.trim().slice(0, 50)}"`,
        reference_id: currentStory.id,
      });

      setReplyText("");
      setShowReplyInput(false);
      setPaused(false);
    } finally {
      setSendingReply(false);
    }
  };

  const loadViewers = async () => {
    setPaused(true);
    setShowViewers(true);
    const { data } = await supabase.from("story_views")
      .select("viewer_user_id")
      .eq("story_id", currentStory.id)
      .order("viewed_at", { ascending: false })
      .limit(100);
    if (data) {
      const uids = data.map(d => d.viewer_user_id);
      const { data: users } = await supabase.from("users")
        .select("id, display_name, avatar_url")
        .in("id", uids);
      const userMap: Record<number, any> = {};
      (users || []).forEach(u => { userMap[u.id] = u; });
      setViewers(data.map(d => ({ ...d, user: userMap[d.viewer_user_id] })));
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black flex flex-col">
      {/* Progress bars */}
      <div className="absolute top-0 left-0 right-0 z-30 flex gap-1 px-2 pt-2">
        {stories.map((_, i) => (
          <div key={i} className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.3)" }}>
            <div className="h-full rounded-full transition-none" style={{
              background: "#fff",
              width: i < currentIndex ? "100%" : i === currentIndex ? `${progress}%` : "0%",
            }} />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="p-4 pt-6 flex items-center gap-3 relative z-20">
        <button onClick={(e) => { e.stopPropagation(); onProfile(currentStory.user_id); }}
          className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
          {currentStory.user?.avatar_url ? <img src={currentStory.user.avatar_url} className="w-full h-full object-cover" /> :
            <span className="text-white text-xs font-bold">{currentStory.user?.display_name?.[0] || "?"}</span>}
        </button>
        <button onClick={(e) => { e.stopPropagation(); onProfile(currentStory.user_id); }} className="flex-1 text-left">
          <p className="text-white font-bold text-sm inline-flex items-center gap-1">
            <span>{currentStory.user?.display_name || "User"}</span>
            {currentStory.user?.is_verified_badge && <VerifiedBadge className="h-3.5 w-3.5" />}
          </p>
          <p className="text-white/60 text-[10px]">{timeAgo(currentStory.created_at)}</p>
        </button>
        <div className="flex items-center gap-2">
          {currentStory.user_id === userId && (
            <>
              <button onClick={(e) => { e.stopPropagation(); loadViewers(); }}
                className="text-white/80 hover:text-white p-1 flex items-center gap-1">
                <Eye size={18} />
                <span className="text-[11px] font-semibold">{viewerCount}</span>
              </button>
              <button onClick={(e) => { e.stopPropagation(); onDelete(currentStory.id); }}
                className="text-white/80 hover:text-red-500 p-1"><Trash2 size={20} /></button>
            </>
          )}
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-white/80"><X size={24} /></button>
        </div>
      </div>

      {/* Story image */}
      <div className="flex-1 flex items-center justify-center relative" onClick={handleTap}>
        <AnimatePresence mode="wait">
          <motion.img key={currentStory.id} src={currentStory.image_url} alt=""
            initial={{ opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            className="absolute inset-0 w-full h-full object-cover" />
        </AnimatePresence>

        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/30 pointer-events-none" />

        {paused && !showViewers && !showReplyInput && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/50 rounded-full px-4 py-2 text-white text-sm font-semibold">Paused</div>
          </div>
        )}

        {/* Flying emoji animation */}
        <AnimatePresence>
          {flyingEmoji && (
            <motion.div
              key={flyingEmoji.id}
              initial={{ opacity: 1, y: 0, scale: 1 }}
              animate={{ opacity: 0, y: -200, scale: 2 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="absolute bottom-32 left-1/2 -translate-x-1/2 text-5xl pointer-events-none z-30"
            >
              {flyingEmoji.emoji}
            </motion.div>
          )}
        </AnimatePresence>

        {resolvedMusic.label && (
          <div className="absolute bottom-20 left-4 right-4 flex items-center gap-2 bg-black/60 rounded-full px-3 py-2 z-10">
            <Music className="w-4 h-4 text-white shrink-0 animate-pulse" />
            <p className="text-white text-xs truncate flex-1">🎵 {resolvedMusic.label}</p>
            {needsTapToPlay && (
              <button onClick={handleManualPlay}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/20 text-white text-[10px] font-semibold">
                <Play className="w-3 h-3" /> Tap
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom bar: Reactions + Reply */}
      {currentStory.user_id !== userId && (
        <div className="absolute bottom-0 left-0 right-0 z-20 px-3 pb-4 pt-2"
          style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.7))" }}
          onClick={(e) => e.stopPropagation()}>

          {/* Reaction emoji bar */}
          <div className="flex items-center gap-1 mb-2 justify-center">
            {STORY_REACTIONS.map(r => {
              const isActive = myReactions.has(r.type);
              const count = reactionCounts[r.type] || 0;
              return (
                <button
                  key={r.type}
                  onClick={() => handleReaction(r.type, r.emoji)}
                  className={`relative flex flex-col items-center px-2.5 py-1.5 rounded-full transition-all ${isActive ? "bg-white/25 scale-110" : "bg-white/10 hover:bg-white/15"}`}
                >
                  <span className="text-2xl">{r.emoji}</span>
                  {count > 0 && (
                    <span className="text-[9px] text-white/80 font-medium mt-0.5">{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Reply input */}
          {showReplyInput ? (
            <div className="flex items-center gap-2">
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="রিপ্লাই লিখুন..."
                className="flex-1 h-10 rounded-full px-4 text-sm outline-none"
                style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)" }}
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleSendReply(); }}
              />
              <button
                onClick={handleSendReply}
                disabled={!replyText.trim() || sendingReply}
                className="w-10 h-10 rounded-full grid place-items-center"
                style={{ background: replyText.trim() ? "#3ea6ff" : "rgba(255,255,255,0.15)" }}
              >
                <Send className="w-4 h-4" style={{ color: "#fff" }} />
              </button>
              <button
                onClick={() => { setShowReplyInput(false); setPaused(false); }}
                className="w-10 h-10 rounded-full grid place-items-center"
                style={{ background: "rgba(255,255,255,0.15)" }}
              >
                <X className="w-4 h-4" style={{ color: "#fff" }} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setShowReplyInput(true); setPaused(true); }}
                className="flex-1 h-10 rounded-full px-4 text-left text-sm"
                style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.15)" }}
              >
                রিপ্লাই পাঠান...
              </button>
              <button onClick={(e) => { e.stopPropagation(); onMessage(currentStory.user_id); }}
                className="w-10 h-10 rounded-full grid place-items-center"
                style={{ background: "rgba(255,255,255,0.12)" }}>
                <MessageCircle className="w-5 h-5" style={{ color: "#fff" }} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); onCall(currentStory.user_id); }}
                className="w-10 h-10 rounded-full grid place-items-center"
                style={{ background: "rgba(255,255,255,0.12)" }}>
                <Phone className="w-5 h-5" style={{ color: "#fff" }} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Viewers bottom sheet */}
      <AnimatePresence>
        {showViewers && (
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 z-40 bg-gray-900 rounded-t-2xl max-h-[60vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-white/70" />
                <span className="text-white font-bold text-sm">{viewers.length} জন দেখেছেন</span>
              </div>
              <button onClick={() => { setShowViewers(false); setPaused(false); }}
                className="w-8 h-8 rounded-full bg-white/10 grid place-items-center">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
              {viewers.map((v) => (
                <button key={v.viewer_user_id} onClick={() => onProfile(v.viewer_user_id)}
                  className="w-full flex items-center gap-3 py-2.5 hover:bg-white/5 rounded-lg px-2 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-white/20 overflow-hidden flex items-center justify-center">
                    {v.user?.avatar_url ? <img src={v.user.avatar_url} className="w-full h-full object-cover" /> :
                      <span className="text-white text-xs font-bold">{v.user?.display_name?.[0] || "?"}</span>}
                  </div>
                  <span className="text-white text-sm font-medium">{v.user?.display_name || "User"}</span>
                </button>
              ))}
              {viewers.length === 0 && (
                <p className="text-white/50 text-sm text-center py-8">এখনো কেউ দেখেনি</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
