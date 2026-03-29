import { useEffect, useRef, useState, useCallback } from "react";
import { X, Trash2, MessageCircle, Phone, Music, Play, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { resolveStoryMusic } from "@/lib/story-music";
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

const STORY_DURATION = 5000;

export default function StoryViewer({ story, allStories, userId, onClose, onDelete, onMessage, onCall, onProfile, timeAgo }: StoryViewerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [needsTapToPlay, setNeedsTapToPlay] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(Date.now());

  // Build story list from same user
  const stories = allStories && allStories.length > 0
    ? allStories
    : [story];

  const currentStory = stories[currentIndex] || story;
  const resolvedMusic = resolveStoryMusic(currentStory.music_name);

  // Find initial index
  useEffect(() => {
    if (allStories && allStories.length > 0) {
      const idx = allStories.findIndex((s: any) => s.id === story.id);
      if (idx >= 0) setCurrentIndex(idx);
    }
  }, [story.id, allStories]);

  // Audio
  useEffect(() => {
    setNeedsTapToPlay(false);
    if (!resolvedMusic.audioUrl) return;

    const audio = new Audio(resolvedMusic.audioUrl);
    audio.volume = 0.65;
    audio.loop = true;
    audioRef.current = audio;

    audio.play()
      .then(() => setNeedsTapToPlay(false))
      .catch(() => setNeedsTapToPlay(true));

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [currentStory.id, resolvedMusic.audioUrl]);

  // Auto-progress timer
  useEffect(() => {
    if (paused) return;
    startTimeRef.current = Date.now();
    setProgress(0);

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(100, (elapsed / STORY_DURATION) * 100);
      setProgress(pct);

      if (elapsed >= STORY_DURATION) {
        goNext();
      }
    }, 50);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentIndex, paused]);

  const goNext = useCallback(() => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex((i) => i + 1);
      setProgress(0);
    } else {
      onClose();
    }
  }, [currentIndex, stories.length, onClose]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setProgress(0);
    }
  }, [currentIndex]);

  const handleTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0]?.clientX || 0 : e.clientX;
    const x = clientX - rect.left;
    const third = rect.width / 3;

    if (x < third) {
      goPrev();
    } else if (x > third * 2) {
      goNext();
    } else {
      // Middle tap = pause/resume
      setPaused((p) => !p);
    }
  }, [goPrev, goNext]);

  const handleManualPlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    audioRef.current.play()
      .then(() => setNeedsTapToPlay(false))
      .catch(() => setNeedsTapToPlay(true));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black flex flex-col"
    >
      {/* Progress bars */}
      <div className="absolute top-0 left-0 right-0 z-30 flex gap-1 px-2 pt-2">
        {stories.map((_, i) => (
          <div key={i} className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.3)" }}>
            <div
              className="h-full rounded-full transition-none"
              style={{
                background: "#fff",
                width: i < currentIndex ? "100%" : i === currentIndex ? `${progress}%` : "0%",
              }}
            />
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
            <button onClick={(e) => { e.stopPropagation(); onDelete(currentStory.id); }}
              className="text-white/80 hover:text-red-500 p-1"><Trash2 size={20} /></button>
          )}
          <button onClick={(e) => { e.stopPropagation(); onMessage(currentStory.user_id); }}
            className="text-white/80 hover:text-white p-1"><MessageCircle size={20} /></button>
          <button onClick={(e) => { e.stopPropagation(); onCall(currentStory.user_id); }}
            className="text-white/80 hover:text-white p-1"><Phone size={20} /></button>
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-white/80"><X size={24} /></button>
        </div>
      </div>

      {/* Story image - full screen, tap to navigate */}
      <div className="flex-1 flex items-center justify-center relative" onClick={handleTap}>
        <AnimatePresence mode="wait">
          <motion.img
            key={currentStory.id}
            src={currentStory.image_url}
            alt=""
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 w-full h-full object-cover"
          />
        </AnimatePresence>

        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/30 pointer-events-none" />

        {/* Pause indicator */}
        {paused && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/50 rounded-full px-4 py-2 text-white text-sm font-semibold">Paused</div>
          </div>
        )}

        {resolvedMusic.label && (
          <div className="absolute bottom-6 left-4 right-4 flex items-center gap-2 bg-black/60 rounded-full px-3 py-2 z-10">
            <Music className="w-4 h-4 text-white shrink-0 animate-pulse" />
            <p className="text-white text-xs truncate flex-1">🎵 {resolvedMusic.label}</p>
            {needsTapToPlay && (
              <button
                onClick={handleManualPlay}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/20 text-white text-[10px] font-semibold"
              >
                <Play className="w-3 h-3" /> Tap
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
