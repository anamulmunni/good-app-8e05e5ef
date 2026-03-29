import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  toggleReaction, getUserReactions, getPostComments, addComment,
  type PostComment,
} from "@/lib/feed-api";
import { ArrowLeft, Heart, MessageCircle, Send, X, Loader2, User, Music, Play, Pause } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import VerifiedBadge from "@/components/VerifiedBadge";
import { getShuffledSampleReels } from "@/lib/sample-reels";

function ReelsCaption({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 80;
  return (
    <div onClick={(e) => { e.stopPropagation(); if (isLong) setExpanded(!expanded); }}>
      <p className={`text-white text-[14px] leading-[20px] drop-shadow-lg ${expanded ? "" : "line-clamp-2"}`}>
        {text}
      </p>
      {isLong && !expanded && (
        <button className="text-white/70 text-[13px] font-semibold mt-0.5">আরো দেখুন</button>
      )}
    </div>
  );
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
};

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
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});
  const lastTapRef = useRef(0);
  const doubleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Memoized sample reels (shuffled once per mount)
  const sampleReels = useMemo(() => getShuffledSampleReels(), []);

  useEffect(() => {
    if (!isLoading && !user) navigate("/");
  }, [isLoading, user, navigate]);

  // Fetch short videos (≤2min, from feed posts with video_url)
  const { data: videos = [], isLoading: videosLoading } = useQuery({
    queryKey: ["short-reels"],
    queryFn: async () => {
      const { data: posts } = await (supabase.from("posts").select("*") as any)
        .not("video_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(100);

      const shortPosts = (posts || []).filter((p: any) => !p.content?.startsWith("__GOODAPP_LONG__::"));

      const userIds = [...new Set(shortPosts.map((p: any) => p.user_id))];
      let userMap: Record<number, any> = {};
      if (userIds.length > 0) {
        const { data: users } = await (supabase.from("users").select("id, display_name, avatar_url, guest_id, is_verified_badge") as any).in("id", userIds);
        (users || []).forEach((u: any) => { userMap[u.id] = u; });
      }

      const userVideos: ShortVideo[] = shortPosts.map((p: any) => ({
        ...p,
        user: userMap[p.user_id] || null,
        isSample: false,
      }));

      // Add sample reels at the end (always available)
      const sampleVideos: ShortVideo[] = sampleReels.map((s) => ({
        id: s.id,
        user_id: 0,
        video_url: s.video_url,
        content: s.caption,
        likes_count: Math.floor(Math.random() * 500) + 50,
        comments_count: Math.floor(Math.random() * 30),
        created_at: new Date().toISOString(),
        user: { display_name: s.creator, avatar_url: null, guest_id: "sample", is_verified_badge: true },
        isSample: true,
      }));

      // User videos first, then sample
      return [...userVideos, ...sampleVideos];
    },
    enabled: !!user,
  });

  // Load reactions
  useEffect(() => {
    if (user && videos.length > 0) {
      getUserReactions(user.id, videos.map((v) => v.id)).then(setUserReactions);
    }
  }, [user, videos]);

  const currentVideo = videos[currentIndex];

  // Auto-play current video, pause others
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
    if (newIndex !== currentIndex && newIndex >= 0 && newIndex < videos.length) {
      setCurrentIndex(newIndex);
      setPaused(false);
    }
  }, [currentIndex, videos.length]);

  const handleVideoTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double tap = love (instant, optimistic)
      if (doubleTapTimerRef.current) { clearTimeout(doubleTapTimerRef.current); doubleTapTimerRef.current = null; }
      setShowLoveAnimation(true);
      setTimeout(() => setShowLoveAnimation(false), 1000);
      if (currentVideo) {
        // Instant UI update
        setUserReactions((prev) => ({ ...prev, [currentVideo.id]: "love" }));
        // Fire-and-forget API call
        toggleReaction(currentVideo.id, user!.id, "love").then(() => {
          queryClient.invalidateQueries({ queryKey: ["short-reels"] });
        }).catch(() => {});
      }
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
      doubleTapTimerRef.current = setTimeout(() => {
        if (lastTapRef.current === now) {
          // Single tap = instant pause/play
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
    queryClient.invalidateQueries({ queryKey: ["short-reels"] });
    setCommentSending(false);
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

  if (isLoading || !user) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-3 py-2 bg-gradient-to-b from-black/60 to-transparent">
        <button onClick={() => navigate("/feed")} className="w-10 h-10 grid place-items-center">
          <ArrowLeft className="w-6 h-6 text-white" />
        </button>
        <h1 className="text-white font-bold text-lg">Reels</h1>
        <div className="w-10" />
      </div>

      {videosLoading ? (
        <div className="h-full flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      ) : videos.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-white">
          <Play className="w-16 h-16 mb-4 opacity-40" />
          <p className="text-lg font-bold">কোনো Reels নেই</p>
          <p className="text-sm text-white/60 mt-1">Feed এ ভিডিও পোস্ট করলে এখানে দেখাবে</p>
        </div>
      ) : (
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto snap-y snap-mandatory scrollbar-hide"
          style={{ scrollSnapType: "y mandatory" }}
        >
          {videos.map((video, index) => (
            <div
              key={video.id}
              className="h-full w-full relative snap-start snap-always"
              style={{ scrollSnapAlign: "start" }}
            >
              {/* Video */}
              <video
                ref={(el) => { videoRefs.current[index] = el; }}
                src={video.video_url}
                loop
                muted={false}
                playsInline
                className="w-full h-full object-cover"
                style={{ pointerEvents: "none" }}
              />
              {/* Tap overlay for pause/love */}
              <div
                className="absolute inset-0 z-10"
                onClick={handleVideoTap}
              />

              {/* Pause indicator */}
              {paused && index === currentIndex && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
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
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  >
                    <span className="text-8xl">❤️</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Right side actions */}
              <div className="absolute right-3 bottom-28 flex flex-col items-center gap-5 z-20">
                {/* Avatar */}
                <button onClick={() => navigate(`/user/${video.user_id}`)} className="relative">
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

                {/* Like */}
                <button
                  onClick={() => {
                    if (!currentVideo) return;
                    const isLiked = !!userReactions[currentVideo.id];
                    toggleReaction(currentVideo.id, user.id, "love").then(() => {
                      if (isLiked) {
                        setUserReactions((prev) => { const n = { ...prev }; delete n[currentVideo.id]; return n; });
                      } else {
                        setUserReactions((prev) => ({ ...prev, [currentVideo.id]: "love" }));
                      }
                      queryClient.invalidateQueries({ queryKey: ["short-reels"] });
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

                {/* Comment */}
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
              </div>

              {/* Bottom info */}
              <div className="absolute bottom-4 left-3 right-16 z-20">
                <button onClick={() => navigate(`/user/${video.user_id}`)} className="inline-flex items-center gap-2 mb-2">
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

      {/* Comment Bottom Sheet */}
      <AnimatePresence>
        {showComments && currentVideo && (
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
                        {/* Replies */}
                        {c.replies && c.replies.length > 0 && (
                          <div className="ml-4 mt-2 space-y-2 border-l-2 border-gray-200 dark:border-border/30 pl-3">
                            {c.replies.map((r) => (
                              <div key={r.id} className="flex gap-2">
                                <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-secondary shrink-0 overflow-hidden">
                                  {r.user?.avatar_url ? <img src={r.user.avatar_url} className="w-full h-full object-cover" /> :
                                    <div className="w-full h-full grid place-items-center text-[8px] font-bold text-blue-600">
                                      {r.user?.display_name?.[0]?.toUpperCase() || "?"}
                                    </div>}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="bg-gray-100 dark:bg-secondary rounded-xl px-2.5 py-1.5">
                                    <p className="text-[12px] font-bold text-gray-900 dark:text-foreground">{r.user?.display_name || "User"}</p>
                                    <p className="text-[13px] text-gray-900 dark:text-foreground">{r.content}</p>
                                  </div>
                                  <span className="text-[11px] text-gray-500 px-1">{timeAgo(r.created_at)}</span>
                                </div>
                              </div>
                            ))}
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
