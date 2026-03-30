import { useState, useEffect, useRef, useCallback, useMemo, forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  toggleReaction, getUserReactions, getPostComments, addComment,
  type PostComment,
} from "@/lib/feed-api";
import { ArrowLeft, Heart, MessageCircle, Send, X, Loader2, User, Play, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import VerifiedBadge from "@/components/VerifiedBadge";

const ReelsCaption = forwardRef<HTMLDivElement, { text: string }>(function ReelsCaption({ text }, ref) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 80;
  return (
    <div ref={ref} onClick={(e) => { e.stopPropagation(); if (isLong) setExpanded(!expanded); }}>
      <p className={`text-white text-[14px] leading-[20px] drop-shadow-lg ${expanded ? "" : "line-clamp-2"}`}>
        {text}
      </p>
      {isLong && !expanded && (
        <button className="text-white/70 text-[13px] font-semibold mt-0.5">আরো দেখুন</button>
      )}
    </div>
  );
});

// Extract TikTok video ID from various URL formats
function extractTikTokVideoId(url: string): string | null {
  // https://www.tiktok.com/@user/video/1234567890
  const match1 = url.match(/\/video\/(\d+)/);
  if (match1) return match1[1];
  // https://vm.tiktok.com/XXXXXXXX/
  // Short URLs need the original URL stored, we'll use full URL
  const match2 = url.match(/tiktok\.com.*?(\d{15,})/);
  if (match2) return match2[1];
  return null;
}

type ShortVideo = {
  id: string;
  user_id: number;
  video_url: string;
  content: string | null;
  likes_count: number;
  comments_count: number;
  created_at: string | null;
  user?: { display_name: string | null; avatar_url: string | null; guest_id: string; is_verified_badge?: boolean };
  isSample?: boolean;
  isTikTok?: boolean;
  tiktokVideoId?: string;
};

// TikTok Reel Player using embed iframe
const TikTokReelPlayer = forwardRef<HTMLDivElement, {
  videoId: string;
  isActive: boolean;
  isNearby: boolean;
}>(function TikTokReelPlayer({ videoId, isActive, isNearby }, ref) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isActive && !isNearby) setLoaded(false);
  }, [isActive, isNearby]);

  if (!isActive && !isNearby) {
    return (
      <div ref={ref} className="w-full h-full relative bg-black flex items-center justify-center">
        <div className="w-16 h-16 rounded-full bg-white/10 grid place-items-center">
          <Play className="w-8 h-8 text-white ml-1" />
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="w-full h-full relative bg-black overflow-hidden">
      {!loaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black">
          <Loader2 className="w-10 h-10 text-white animate-spin" />
        </div>
      )}
      <iframe
        key={`tiktok-${videoId}-${isActive ? "active" : "buffer"}`}
        src={`https://www.tiktok.com/embed/v2/${videoId}?hide_share_button=1&autoplay=${isActive ? 1 : 0}`}
        className="w-full h-full border-0"
        allow="autoplay; encrypted-media"
        allowFullScreen
        style={{ pointerEvents: isActive ? "auto" : "none" }}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
});

// Category tabs
const CATEGORIES = [
  { id: "mixed", label: "🔥 সব" },
  { id: "gajal", label: "🕌 গজল" },
  { id: "funny", label: "😂 ফানি" },
  { id: "dance", label: "💃 ড্যান্স" },
  { id: "nature", label: "🌿 প্রকৃতি" },
  { id: "music", label: "🎵 মিউজিক" },
];

export default function ShortReels() {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const queryClient = useQueryClient();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [userReactions, setUserReactions] = useState<Record<string, string>>({});
  const [showLoveAnimation, setShowLoveAnimation] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState("mixed");
  const [reelQueue, setReelQueue] = useState<ShortVideo[]>([]);
  const [showAddTikTok, setShowAddTikTok] = useState(false);
  const [newTikTokUrl, setNewTikTokUrl] = useState("");
  const [newTikTokCaption, setNewTikTokCaption] = useState("");
  const [addingTikTok, setAddingTikTok] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});
  const lastTapRef = useRef(0);
  const doubleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isLoading && !user) navigate("/");
  }, [isLoading, user, navigate]);

  // Fetch TikTok videos from database
  const { data: tiktokVideos = [], isLoading: tiktokLoading } = useQuery({
    queryKey: ["tiktok-videos", selectedCategory],
    queryFn: async () => {
      let query = supabase
        .from("tiktok_videos" as any)
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (selectedCategory !== "mixed") {
        query = query.eq("category", selectedCategory);
      }

      const { data, error } = await query;
      if (error || !data) return [];

      return (data as any[]).map((item: any) => ({
        id: `tt-${item.video_id}`,
        user_id: 0,
        video_url: item.video_url,
        content: item.caption || "TikTok Video",
        likes_count: Math.floor(Math.random() * 5000) + 200,
        comments_count: Math.floor(Math.random() * 200),
        created_at: item.created_at,
        user: { display_name: item.added_by || "TikTok", avatar_url: null, guest_id: "tiktok", is_verified_badge: true },
        isSample: true,
        isTikTok: true,
        tiktokVideoId: item.video_id,
      })) as ShortVideo[];
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    refetchOnMount: "always",
  });

  // Fetch user-posted short videos
  const { data: userVideos = [], isLoading: userLoading } = useQuery({
    queryKey: ["short-reels-user"],
    queryFn: async () => {
      const { data: posts } = await (supabase.from("posts").select("*") as any)
        .not("video_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(50);

      const shortPosts = (posts || []).filter((p: any) => !p.content?.startsWith("__GOODAPP_LONG__::"));

      const userIds = [...new Set(shortPosts.map((p: any) => p.user_id))];
      let userMap: Record<number, any> = {};
      if (userIds.length > 0) {
        const { data: users } = await (supabase.from("users").select("id, display_name, avatar_url, guest_id, is_verified_badge") as any).in("id", userIds);
        (users || []).forEach((u: any) => { userMap[u.id] = u; });
      }

      return shortPosts.map((p: any) => ({
        ...p,
        user: userMap[p.user_id] || null,
        isSample: false,
        isTikTok: false,
      })) as ShortVideo[];
    },
    enabled: !!user,
  });

  // Combine TikTok + user videos
  const videos = useMemo(() => {
    if (tiktokVideos.length === 0) return userVideos.slice(0, 5);
    if (userVideos.length === 0) return tiktokVideos;

    const shuffledUploads = [...userVideos].sort(() => Math.random() - 0.5);
    const dailyUploads = shuffledUploads.slice(0, Math.min(3, shuffledUploads.length));

    const result: ShortVideo[] = [...tiktokVideos];
    for (let i = 0; i < dailyUploads.length; i++) {
      const minPos = Math.min(8 + i * 20, result.length);
      const maxPos = Math.min(minPos + 15, result.length);
      const pos = Math.floor(Math.random() * (maxPos - minPos + 1)) + minPos;
      result.splice(Math.min(pos, result.length), 0, dailyUploads[i]);
    }
    return result;
  }, [userVideos, tiktokVideos]);

  const videosLoading = userLoading || tiktokLoading;

  const shuffledVideos = useMemo(() => {
    if (videos.length === 0) return [];
    const arr = [...videos];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [videos]);

  // Load reactions
  useEffect(() => {
    if (user && shuffledVideos.length > 0) {
      const nonSampleIds = shuffledVideos.filter(v => !v.isSample).map(v => v.id);
      if (nonSampleIds.length > 0) {
        getUserReactions(user.id, nonSampleIds).then(setUserReactions);
      }
    }
  }, [user, shuffledVideos]);

  useEffect(() => {
    setReelQueue(shuffledVideos);
    setCurrentIndex(0);
    setPaused(false);
    setExpandedReplies(new Set());
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [shuffledVideos]);

  const appendMoreReels = useCallback(() => {
    if (shuffledVideos.length === 0) return;
    setReelQueue((prev) => {
      const nextBatch = [...shuffledVideos].sort(() => Math.random() - 0.5);
      return [...prev, ...nextBatch];
    });
  }, [shuffledVideos]);

  const goToNextReel = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const nextIndex = currentIndex + 1;
    if (nextIndex >= reelQueue.length - 2) appendMoreReels();
    const h = container.clientHeight || window.innerHeight;
    container.scrollTo({ top: nextIndex * h, behavior: "smooth" });
    setCurrentIndex(nextIndex);
    setPaused(false);
  }, [appendMoreReels, currentIndex, reelQueue.length]);

  useEffect(() => {
    if (reelQueue.length > 0 && currentIndex >= reelQueue.length - 3) {
      appendMoreReels();
    }
  }, [appendMoreReels, currentIndex, reelQueue.length]);

  const currentVideo = reelQueue[currentIndex];

  // Auto-play current video, pause others (for user-uploaded videos)
  useEffect(() => {
    Object.entries(videoRefs.current).forEach(([idx, el]) => {
      if (!el) return;
      if (parseInt(idx) === currentIndex) {
        if (!paused) el.play().catch(() => {});
      } else {
        el.pause();
        el.currentTime = 0;
      }
    });
  }, [currentIndex, paused]);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const scrollTop = container.scrollTop;
    const h = container.clientHeight;
    const newIndex = Math.round(scrollTop / h);
    if (newIndex !== currentIndex && newIndex >= 0 && newIndex < reelQueue.length) {
      setCurrentIndex(newIndex);
      setPaused(false);
    }
  }, [currentIndex, reelQueue.length]);

  const handleVideoTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (doubleTapTimerRef.current) { clearTimeout(doubleTapTimerRef.current); doubleTapTimerRef.current = null; }
      setShowLoveAnimation(true);
      setTimeout(() => setShowLoveAnimation(false), 1000);
      if (currentVideo && !currentVideo.isSample) {
        setUserReactions((prev) => ({ ...prev, [currentVideo.id]: "love" }));
        toggleReaction(currentVideo.id, user!.id, "love").then(() => {
          queryClient.invalidateQueries({ queryKey: ["short-reels-user"] });
        }).catch(() => {});
      }
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
      doubleTapTimerRef.current = setTimeout(() => {
        if (lastTapRef.current === now) {
          setPaused((p) => {
            const next = !p;
            const el = videoRefs.current[currentIndex];
            if (el) { next ? el.pause() : el.play().catch(() => {}); }
            return next;
          });
        }
      }, 250);
    }
  }, [currentVideo, currentIndex, user, queryClient]);

  const loadComments = async (postId: string) => {
    setCommentsLoading(true);
    const c = await getPostComments(postId, user?.id);
    setComments(c);
    setCommentsLoading(false);
  };

  const sendComment = async () => {
    if (!currentVideo || !user || !commentText.trim()) return;
    setCommentSending(true);
    await addComment(currentVideo.id, user.id, commentText.trim(), replyingTo?.id);
    setCommentText("");
    setReplyingTo(null);
    await loadComments(currentVideo.id);
    queryClient.invalidateQueries({ queryKey: ["short-reels-user"] });
    setCommentSending(false);
  };

  const handleAddTikTok = async () => {
    if (!newTikTokUrl.trim()) return;
    const videoId = extractTikTokVideoId(newTikTokUrl.trim());
    if (!videoId) {
      alert("সঠিক TikTok লিংক দিন! উদাহরণ: https://www.tiktok.com/@user/video/1234567890");
      return;
    }
    setAddingTikTok(true);
    await supabase.from("tiktok_videos" as any).insert({
      video_url: newTikTokUrl.trim(),
      video_id: videoId,
      caption: newTikTokCaption.trim() || null,
      added_by: user?.display_name || "admin",
      category: selectedCategory === "mixed" ? "mixed" : selectedCategory,
    } as any);
    setNewTikTokUrl("");
    setNewTikTokCaption("");
    setShowAddTikTok(false);
    setAddingTikTok(false);
    queryClient.invalidateQueries({ queryKey: ["tiktok-videos"] });
  };

  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  // Auto-advance for TikTok embeds (30s timeout since TikTok videos are usually longer)
  useEffect(() => {
    if (!currentVideo || !currentVideo.isTikTok || showComments) return;
    const timer = window.setTimeout(() => {
      goToNextReel();
    }, 30000);
    return () => window.clearTimeout(timer);
  }, [currentVideo?.id, currentVideo?.isTikTok, goToNextReel, showComments]);

  if (isLoading || !user) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-30 bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex items-center justify-between px-3 py-2">
          <button onClick={() => navigate("/feed")} className="w-10 h-10 grid place-items-center">
            <ArrowLeft className="w-6 h-6 text-white" />
          </button>
          <h1 className="font-black text-lg" style={{ background: "linear-gradient(90deg, #fff, #ff0050)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Reels</h1>
          <button onClick={() => setShowAddTikTok(true)} className="w-10 h-10 grid place-items-center">
            <Plus className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 px-3 pb-2 overflow-x-auto scrollbar-hide">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all ${
                selectedCategory === cat.id
                  ? "bg-white text-black"
                  : "bg-white/20 text-white/80"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {videosLoading ? (
        <div className="h-full flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-white animate-spin" />
            <p className="text-white/60 text-sm">ভিডিও খোঁজা হচ্ছে...</p>
          </div>
        </div>
      ) : reelQueue.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-white">
          <Play className="w-16 h-16 mb-4 opacity-40" />
          <p className="text-lg font-bold">কোনো Reels নেই</p>
          <p className="text-sm text-white/60 mt-1">TikTok ভিডিও যোগ করুন</p>
          <button
            onClick={() => setShowAddTikTok(true)}
            className="mt-4 px-6 py-2.5 bg-[#ff0050] rounded-full text-white font-bold text-sm"
          >
            + TikTok লিংক যোগ করুন
          </button>
        </div>
      ) : (
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto snap-y snap-mandatory scrollbar-hide"
          style={{ scrollSnapType: "y mandatory" }}
        >
          {reelQueue.map((video, index) => (
            <div
              key={`${video.id}-${index}`}
              className="h-full w-full relative snap-start snap-always"
              style={{ scrollSnapAlign: "start" }}
            >
              {/* Video */}
              {video.isTikTok ? (
                <TikTokReelPlayer
                  videoId={video.tiktokVideoId!}
                  isActive={index === currentIndex}
                  isNearby={Math.abs(index - currentIndex) <= 2}
                />
              ) : (
                <video
                  ref={(el) => { videoRefs.current[index] = el; }}
                  src={video.video_url}
                  onEnded={() => {
                    if (index === currentIndex) goToNextReel();
                  }}
                  playsInline
                  className="w-full h-full object-cover"
                  style={{ pointerEvents: "none" }}
                />
              )}

              {/* Tap overlay - only for non-TikTok videos */}
              {!video.isTikTok && (
                <div className="absolute inset-0 z-10" onClick={handleVideoTap} />
              )}

              {/* Pause indicator */}
              {!video.isTikTok && paused && index === currentIndex && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-15">
                  <div className="w-16 h-16 rounded-full bg-black/40 grid place-items-center">
                    <Play className="w-8 h-8 text-white ml-1" />
                  </div>
                </div>
              )}

              {/* Love animation */}
              <AnimatePresence>
                {showLoveAnimation && index === currentIndex && (
                  <motion.div
                    initial={{ scale: 0, opacity: 1 }}
                    animate={{ scale: 1.5, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.8 }}
                    className="absolute inset-0 flex items-center justify-center pointer-events-none z-15"
                  >
                    <span className="text-8xl">❤️</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Right side actions */}
              <div className="absolute right-3 bottom-28 flex flex-col items-center gap-5 z-20">
                <button onClick={() => !video.isSample && navigate(`/user/${video.user_id}`)} className="relative">
                  <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white">
                    {video.user?.avatar_url ? (
                      <img src={video.user.avatar_url} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gray-600 grid place-items-center">
                        <User className="w-6 h-6 text-white" />
                      </div>
                    )}
                  </div>
                </button>

                <button
                  onClick={() => {
                    if (!currentVideo || currentVideo.isSample) return;
                    const isLiked = !!userReactions[currentVideo.id];
                    toggleReaction(currentVideo.id, user.id, "love").then(() => {
                      if (isLiked) {
                        setUserReactions((prev) => { const n = { ...prev }; delete n[currentVideo.id]; return n; });
                      } else {
                        setUserReactions((prev) => ({ ...prev, [currentVideo.id]: "love" }));
                      }
                      queryClient.invalidateQueries({ queryKey: ["short-reels-user"] });
                    });
                  }}
                  className="flex flex-col items-center gap-1"
                >
                  <Heart
                    className="w-8 h-8"
                    fill={userReactions[video.id] ? "#ff2d55" : "none"}
                    stroke={userReactions[video.id] ? "#ff2d55" : "white"}
                    strokeWidth={2}
                  />
                  <span className="text-white text-[11px] font-semibold">{video.likes_count || 0}</span>
                </button>

                {!video.isSample && (
                  <button
                    onClick={() => {
                      setShowComments(true);
                      loadComments(video.id);
                    }}
                    className="flex flex-col items-center gap-1"
                  >
                    <MessageCircle className="w-8 h-8 text-white" />
                    <span className="text-white text-[11px] font-semibold">{video.comments_count || 0}</span>
                  </button>
                )}
              </div>

              {/* Bottom info */}
              <div className="absolute bottom-4 left-3 right-16 z-20">
                <button onClick={() => !video.isSample && navigate(`/user/${video.user_id}`)} className="inline-flex items-center gap-2 mb-2">
                  <span className="text-white font-bold text-[14px]">{video.user?.display_name || "User"}</span>
                  {video.user?.is_verified_badge && <VerifiedBadge className="h-3.5 w-3.5" />}
                </button>
                {video.content && !video.content.startsWith("__GOODAPP_LONG__") && (
                  <ReelsCaption text={video.content} />
                )}
              </div>

              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/30 pointer-events-none" />
            </div>
          ))}
        </div>
      )}

      {/* Add TikTok Modal */}
      <AnimatePresence>
        {showAddTikTok && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 flex items-end"
            onClick={() => setShowAddTikTok(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="w-full bg-white dark:bg-card rounded-t-2xl p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-4">TikTok ভিডিও যোগ করুন</h3>
              <input
                value={newTikTokUrl}
                onChange={(e) => setNewTikTokUrl(e.target.value)}
                placeholder="TikTok ভিডিও লিংক পেস্ট করুন..."
                className="w-full bg-gray-100 dark:bg-secondary text-gray-900 dark:text-foreground rounded-xl px-4 py-3 text-[14px] border-none outline-none mb-3"
              />
              <input
                value={newTikTokCaption}
                onChange={(e) => setNewTikTokCaption(e.target.value)}
                placeholder="ক্যাপশন (ঐচ্ছিক)..."
                className="w-full bg-gray-100 dark:bg-secondary text-gray-900 dark:text-foreground rounded-xl px-4 py-3 text-[14px] border-none outline-none mb-4"
              />
              <button
                onClick={handleAddTikTok}
                disabled={!newTikTokUrl.trim() || addingTikTok}
                className="w-full py-3 bg-[#ff0050] text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {addingTikTok ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                যোগ করুন
              </button>
              <p className="text-[12px] text-gray-400 mt-3 text-center">
                উদাহরণ: https://www.tiktok.com/@user/video/1234567890
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Comment Bottom Sheet */}
      <AnimatePresence>
        {showComments && currentVideo && !currentVideo.isSample && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100]"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => { setShowComments(false); setReplyingTo(null); }}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 bg-white dark:bg-card rounded-t-2xl flex flex-col"
              style={{ maxHeight: "70vh" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-border/30">
                <h3 className="text-[16px] font-bold text-gray-900 dark:text-foreground">
                  মন্তব্য ({currentVideo.comments_count || 0})
                </h3>
                <button onClick={() => { setShowComments(false); setReplyingTo(null); }} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-secondary grid place-items-center">
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                {commentsLoading ? (
                  <div className="py-8 flex justify-center">
                    <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                  </div>
                ) : comments.length === 0 ? (
                  <div className="py-8 text-center">
                    <MessageCircle className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    <p className="text-[14px] text-gray-500">এখনো কোনো মন্তব্য নেই</p>
                  </div>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="flex gap-2.5">
                      <button onClick={() => navigate(`/user/${c.user_id}`)}
                        className="w-8 h-8 rounded-full bg-gray-200 dark:bg-secondary shrink-0 overflow-hidden">
                        {c.user?.avatar_url ? <img src={c.user.avatar_url} className="w-full h-full object-cover" /> :
                          <div className="w-full h-full grid place-items-center text-[10px] font-bold text-blue-600">
                            {c.user?.display_name?.[0]?.toUpperCase() || "?"}
                          </div>}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="bg-gray-100 dark:bg-secondary rounded-2xl px-3 py-2">
                          <p className="text-[13px] font-bold text-gray-900 dark:text-foreground inline-flex items-center gap-1">
                            <span>{c.user?.display_name || "User"}</span>
                            {c.user?.is_verified_badge && <VerifiedBadge className="h-3 w-3" />}
                          </p>
                          <p className="text-[14px] text-gray-900 dark:text-foreground mt-0.5">{c.content}</p>
                        </div>
                        <div className="flex items-center gap-3 px-1 mt-1 text-[12px] text-gray-500">
                          <span>{timeAgo(c.created_at)}</span>
                          <button
                            onClick={() => setReplyingTo({ id: c.id, name: c.user?.display_name || "User" })}
                            className="font-bold"
                          >
                            Reply
                          </button>
                        </div>
                        {c.replies && c.replies.length > 0 && (
                          <div className="ml-4 mt-2">
                            {!expandedReplies.has(c.id) ? (
                              <button
                                onClick={() => setExpandedReplies((prev) => new Set(prev).add(c.id))}
                                className="text-[12px] font-bold text-gray-500"
                              >
                                {c.replies.length}টি রিপ্লাই দেখুন
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => setExpandedReplies((prev) => {
                                    const next = new Set(prev);
                                    next.delete(c.id);
                                    return next;
                                  })}
                                  className="text-[12px] font-bold text-gray-500 mb-2"
                                >
                                  রিপ্লাই লুকান
                                </button>
                                <div className="space-y-2 border-l-2 border-gray-200 dark:border-border/30 pl-3">
                                  {c.replies.map((r) => (
                                    <div key={r.id} className="flex gap-2">
                                      <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-secondary shrink-0 overflow-hidden">
                                        {r.user?.avatar_url ? <img src={r.user.avatar_url} className="w-full h-full object-cover" /> :
                                          <div className="w-full h-full grid place-items-center text-[8px] font-bold text-blue-600">
                                            {r.user?.display_name?.[0]?.toUpperCase() || "?"}
                                          </div>}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[11px] text-gray-500 px-1 mb-1">↪️ {c.user?.display_name || "User"}-কে রিপ্লাই</p>
                                        <div className="bg-gray-100 dark:bg-secondary rounded-xl px-2.5 py-1.5">
                                          <p className="text-[12px] font-bold text-gray-900 dark:text-foreground">{r.user?.display_name || "User"}</p>
                                          <p className="text-[13px] text-gray-900 dark:text-foreground">{r.content}</p>
                                        </div>
                                        <span className="text-[11px] text-gray-500 px-1">{timeAgo(r.created_at)}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Comment input */}
              <div className="border-t border-gray-200 dark:border-border/30 px-4 py-3 bg-white dark:bg-card">
                {replyingTo && (
                  <div className="flex items-center gap-2 mb-2 px-1 py-1.5 bg-blue-50 dark:bg-primary/10 rounded-lg text-[13px]">
                    <span className="text-gray-600">↩️ {replyingTo.name}-কে রিপ্লাই</span>
                    <button onClick={() => setReplyingTo(null)} className="text-red-500 font-bold ml-auto">✕</button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden shrink-0">
                    {user.avatar_url ? <img src={user.avatar_url} className="w-full h-full object-cover" /> :
                      <User className="w-4 h-4 text-gray-400 m-auto mt-2" />}
                  </div>
                  <input
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && commentText.trim() && sendComment()}
                    placeholder={replyingTo ? `${replyingTo.name}-কে রিপ্লাই...` : "মন্তব্য লিখুন..."}
                    className="flex-1 bg-gray-100 dark:bg-secondary text-gray-900 dark:text-foreground rounded-full px-4 py-2.5 text-[14px] border-none outline-none"
                    autoFocus
                  />
                  <button
                    onClick={sendComment}
                    disabled={!commentText.trim() || commentSending}
                    className="w-9 h-9 bg-blue-600 rounded-full grid place-items-center disabled:opacity-40 shrink-0"
                  >
                    {commentSending ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
