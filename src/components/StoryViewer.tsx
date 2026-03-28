import { useEffect, useRef, useState } from "react";
import { X, Trash2, MessageCircle, Phone, Music, Play } from "lucide-react";
import { motion } from "framer-motion";
import { resolveStoryMusic } from "@/lib/story-music";

type StoryViewerProps = {
  story: any;
  userId: number;
  onClose: () => void;
  onDelete: (id: string) => void;
  onMessage: (uid: number) => void;
  onCall: (uid: number) => void;
  onProfile: (uid: number) => void;
  timeAgo: (date: string | null) => string;
};

export default function StoryViewer({ story, userId, onClose, onDelete, onMessage, onCall, onProfile, timeAgo }: StoryViewerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [needsTapToPlay, setNeedsTapToPlay] = useState(false);

  const resolvedMusic = resolveStoryMusic(story.music_name);

  useEffect(() => {
    setNeedsTapToPlay(false);

    if (!resolvedMusic.audioUrl) {
      return;
    }

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
  }, [story.id, resolvedMusic.audioUrl]);

  const handleManualPlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    audioRef.current.play()
      .then(() => setNeedsTapToPlay(false))
      .catch(() => setNeedsTapToPlay(true));
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black flex flex-col" onClick={onClose}>
      <div className="p-4 flex items-center gap-3 relative z-10">
        <button onClick={(e) => { e.stopPropagation(); onProfile(story.user_id); }}
          className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
          {story.user?.avatar_url ? <img src={story.user.avatar_url} className="w-full h-full object-cover" /> :
            <span className="text-white text-xs font-bold">{story.user?.display_name?.[0] || "?"}</span>}
        </button>
        <button onClick={(e) => { e.stopPropagation(); onProfile(story.user_id); }} className="flex-1 text-left">
          <p className="text-white font-bold text-sm">{story.user?.display_name || "User"}</p>
          <p className="text-white/60 text-[10px]">{timeAgo(story.created_at)}</p>
        </button>
        <div className="flex items-center gap-2">
          {story.user_id === userId && (
            <button onClick={(e) => { e.stopPropagation(); onDelete(story.id); }}
              className="text-white/80 hover:text-red-500 p-1"><Trash2 size={20} /></button>
          )}
          <button onClick={(e) => { e.stopPropagation(); onMessage(story.user_id); }}
            className="text-white/80 hover:text-white p-1"><MessageCircle size={20} /></button>
          <button onClick={(e) => { e.stopPropagation(); onCall(story.user_id); }}
            className="text-white/80 hover:text-white p-1"><Phone size={20} /></button>
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-white/80"><X size={24} /></button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 relative">
        <img src={story.image_url} alt="" className="max-w-full max-h-full object-contain rounded-xl" />

        {resolvedMusic.label && (
          <div className="absolute bottom-6 left-4 right-4 flex items-center gap-2 bg-black/60 rounded-full px-3 py-2">
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
