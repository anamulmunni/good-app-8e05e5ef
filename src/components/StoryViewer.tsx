import { useEffect, useRef, useState, useCallback } from "react";
import { X, Trash2, MessageCircle, Phone, Music, Play, Eye } from "lucide-react";
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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(Date.now());

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
    if (paused || showViewers) return;
    startTimeRef.current = Date.now();
    setProgress(0);
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(100, (elapsed / STORY_DURATION) * 100);
      setProgress(pct);
      if (elapsed >= STORY_DURATION) goNext();
    }, 50);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [currentIndex, paused, showViewers]);

  const goNext = useCallback(() => {
    if (currentIndex < stories.length - 1) { setCurrentIndex((i) => i + 1); setProgress(0); }
    else onClose();
  }, [currentIndex, stories.length, onClose]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) { setCurrentIndex((i) => i - 1); setProgress(0); }
  }, [currentIndex]);

  const handleTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    if (showViewers) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0]?.clientX || 0 : e.clientX;
    const x = clientX - rect.left;
    const third = rect.width / 3;
    if (x < third) goPrev();
    else if (x > third * 2) goNext();
    else setPaused((p) => !p);
  }, [goPrev, goNext, showViewers]);

  const handleManualPlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    audioRef.current.play().then(() => setNeedsTapToPlay(false)).catch(() => setNeedsTapToPlay(true));
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
          <button onClick={(e) => { e.stopPropagation(); onMessage(currentStory.user_id); }}
            className="text-white/80 hover:text-white p-1"><MessageCircle size={20} /></button>
          <button onClick={(e) => { e.stopPropagation(); onCall(currentStory.user_id); }}
            className="text-white/80 hover:text-white p-1"><Phone size={20} /></button>
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

        {paused && !showViewers && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/50 rounded-full px-4 py-2 text-white text-sm font-semibold">Paused</div>
          </div>
        )}

        {resolvedMusic.label && (
          <div className="absolute bottom-6 left-4 right-4 flex items-center gap-2 bg-black/60 rounded-full px-3 py-2 z-10">
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
