import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  toggleReaction, getUserReactions, getPostComments, addComment,
  REACTION_EMOJIS, type Post, type PostComment, markReelsSeen
} from "@/lib/feed-api";
import {
  ArrowLeft, Heart, MessageCircle, Send, X, User,
  Share2, Volume2, VolumeX, Play
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

export default function Reels() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [userReactions, setUserReactions] = useState<Record<string, string>>({});
  const [showLoveAnim, setShowLoveAnim] = useState<string | null>(null);
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement>>({});
  const lastTapRef = useRef<Record<string, number>>({});
  const tapTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!isLoading && !user) navigate("/");
  }, [user, isLoading, navigate]);

  // Mark reels as seen when entering
  useEffect(() => {
    if (user) {
      markReelsSeen(user.id);
    }
  }, [user]);

  // Fetch video posts only
  const { data: reels = [], isLoading: reelsLoading } = useQuery({
    queryKey: ["reels-posts"],
    queryFn: async () => {
      const { data: posts } = await (supabase.from("posts").select("*") as any)
        .not("video_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!posts || posts.length === 0) return [];

      const userIds = [...new Set(posts.map((p: any) => p.user_id))];
      const { data: users } = await (supabase.from("users").select("id, display_name, avatar_url, guest_id") as any).in("id", userIds);
      const userMap: Record<number, any> = {};
      (users || []).forEach((u: any) => { userMap[u.id] = u; });

      return posts.map((p: any) => ({ ...p, user: userMap[p.user_id] || null })) as Post[];
    },
    enabled: !!user,
  });

  // Load user reactions
  useEffect(() => {
    if (user && reels.length > 0) {
      getUserReactions(user.id, reels.map(r => r.id)).then(setUserReactions);
    }
  }, [user, reels]);

  // Auto-play current video, pause ALL others
  useEffect(() => {
    if (reels.length === 0) return;
    const currentReel = reels[currentIndex];
    if (!currentReel) return;

    Object.entries(videoRefs.current).forEach(([id, video]) => {
      if (!video) return;
      if (id === currentReel.id) {
        video.currentTime = 0;
        video.muted = muted;
        video.play().catch(() => {});
        setPaused(null);
      } else {
        video.pause();
        video.currentTime = 0;
      }
    });
  }, [currentIndex, reels, muted]);

  // Scroll snap observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = parseInt(entry.target.getAttribute("data-index") || "0");
            setCurrentIndex(idx);
          }
        });
      },
      { root: container, threshold: 0.7 }
    );

    const items = container.querySelectorAll("[data-index]");
    items.forEach((item) => observer.observe(item));

    return () => observer.disconnect();
  }, [reels]);

  const reactionMutation = useMutation({
    mutationFn: async ({ postId, type }: { postId: string; type: string }) => {
      if (!user) throw new Error("Login");
      return { postId, ...(await toggleReaction(postId, user.id, type)) };
    },
    onMutate: async ({ postId, type }) => {
      const prev = userReactions[postId];
      const isSame = prev === type;
      setUserReactions(r => {
        const next = { ...r };
        if (isSame) delete next[postId];
        else next[postId] = type;
        return next;
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["reels-posts"] }),
  });

  const commentMutation = useMutation({
    mutationFn: async () => {
      if (!user || !commentingPostId) throw new Error("Error");
      return addComment(commentingPostId, user.id, commentText.trim());
    },
    onMutate: async () => {
      if (!user || !commentingPostId) return;
      setComments(prev => [...prev, {
        id: `temp-${Date.now()}`, post_id: commentingPostId, user_id: user.id,
        content: commentText.trim(), created_at: new Date().toISOString(),
        user: { display_name: user.display_name, avatar_url: user.avatar_url, guest_id: user.guest_id },
      }]);
      setCommentText("");
    },
    onSuccess: () => {
      if (commentingPostId) loadComments(commentingPostId);
    },
  });

  const loadComments = async (postId: string) => {
    setLoadingComments(true);
    setComments(await getPostComments(postId));
    setLoadingComments(false);
  };

  const handleVideoTap = (postId: string) => {
    const now = Date.now();
    const last = lastTapRef.current[postId] || 0;

    // Clear any pending single-tap timer
    if (tapTimerRef.current[postId]) {
      clearTimeout(tapTimerRef.current[postId]);
    }

    if (now - last < 300) {
      // Double tap = like
      lastTapRef.current[postId] = 0;
      if (!userReactions[postId]) {
        reactionMutation.mutate({ postId, type: "love" });
      }
      setShowLoveAnim(postId);
      setTimeout(() => setShowLoveAnim(null), 1000);
    } else {
      // Single tap = play/pause (with delay to detect double tap)
      lastTapRef.current[postId] = now;
      tapTimerRef.current[postId] = setTimeout(() => {
        togglePause(postId);
      }, 300);
    }
  };

  const togglePause = (postId: string) => {
    const video = videoRefs.current[postId];
    if (!video) return;
    if (video.paused) {
      video.play();
      setPaused(null);
    } else {
      video.pause();
      setPaused(postId);
    }
  };

  const sharePost = async (post: Post) => {
    const text = post.content || "দেখুন এই ভিডিও!";
    if (navigator.share) {
      try { await navigator.share({ title: "Good App Reels", text, url: window.location.origin }); } catch {}
    } else {
      navigator.clipboard.writeText(`${text}\n${window.location.origin}`);
      toast({ title: "লিংক কপি হয়েছে!" });
    }
  };

  if (isLoading || !user) return null;

  return (
    <div className="fixed inset-0 bg-black z-50">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent">
        <button onClick={() => navigate(-1)} className="text-white">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-white font-black text-lg">Reels</h1>
        <button onClick={() => setMuted(!muted)} className="text-white">
          {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
        </button>
      </div>

      {reelsLoading ? (
        <div className="flex items-center justify-center h-full">
          <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      ) : reels.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-white/60 gap-3">
          <Play className="w-16 h-16" />
          <p className="font-bold text-lg">কোনো Reels নেই</p>
          <p className="text-sm">Feed থেকে ভিডিও পোস্ট করুন!</p>
          <button onClick={() => navigate("/feed")} className="mt-4 px-6 py-2 bg-primary rounded-full text-primary-foreground font-bold">
            Feed এ যান
          </button>
        </div>
      ) : (
        <div ref={containerRef} className="h-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide">
          {reels.map((reel, index) => {
            const myReaction = userReactions[reel.id];
            return (
              <div
                key={reel.id}
                data-index={index}
                className="h-full w-full snap-start snap-always relative flex items-center justify-center"
              >
                {/* Video */}
                <video
                  ref={(el) => { if (el) videoRefs.current[reel.id] = el; }}
                  src={reel.video_url!}
                  className="absolute inset-0 w-full h-full object-cover"
                  loop
                  playsInline
                  muted={muted}
                  onClick={() => handleVideoTap(reel.id)}
                  onTouchEnd={() => {}} // keep touch events
                />

                {/* Pause indicator */}
                <AnimatePresence>
                  {paused === reel.id && (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0, opacity: 0 }}
                      className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                      <div className="w-20 h-20 bg-black/40 rounded-full flex items-center justify-center">
                        <Play className="w-10 h-10 text-white ml-1" />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Love animation */}
                <AnimatePresence>
                  {showLoveAnim === reel.id && (
                    <motion.div
                      initial={{ scale: 0, opacity: 1 }}
                      animate={{ scale: 2, opacity: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.8 }}
                      className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
                    >
                      <span className="text-8xl">❤️</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Bottom gradient */}
                <div className="absolute bottom-0 left-0 right-0 h-60 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

                {/* Bottom info */}
                <div className="absolute bottom-4 left-4 right-16 z-10">
                  <button onClick={() => navigate(`/user/${reel.user_id}`)} className="flex items-center gap-2 mb-2">
                    <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white/50 bg-white/20 flex items-center justify-center">
                      {reel.user?.avatar_url ? <img src={reel.user.avatar_url} className="w-full h-full object-cover" /> :
                        <User className="w-5 h-5 text-white" />}
                    </div>
                    <span className="text-white font-bold text-sm drop-shadow-lg">{reel.user?.display_name || "User"}</span>
                  </button>
                  {reel.content && (
                    <p className="text-white/90 text-sm line-clamp-2 drop-shadow-lg">{reel.content}</p>
                  )}
                </div>

                {/* Right side actions */}
                <div className="absolute right-3 bottom-24 z-10 flex flex-col items-center gap-5">
                  {/* Like/React */}
                  <button onClick={() => reactionMutation.mutate({ postId: reel.id, type: myReaction || "love" })}
                    className="flex flex-col items-center gap-1">
                    <motion.div whileTap={{ scale: 1.3 }}
                      className={`w-12 h-12 rounded-full flex items-center justify-center ${myReaction ? "bg-[hsl(var(--pink))]/30" : "bg-white/20"}`}>
                      {myReaction ? (
                        <span className="text-2xl">{REACTION_EMOJIS[myReaction]}</span>
                      ) : (
                        <Heart className="w-6 h-6 text-white" />
                      )}
                    </motion.div>
                    <span className="text-white text-xs font-bold drop-shadow-lg">{reel.likes_count || ""}</span>
                  </button>

                  {/* Comment */}
                  <button onClick={() => { setCommentingPostId(reel.id); loadComments(reel.id); }}
                    className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                      <MessageCircle className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-white text-xs font-bold drop-shadow-lg">{reel.comments_count || ""}</span>
                  </button>

                  {/* Share */}
                  <button onClick={() => sharePost(reel)}
                    className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                      <Share2 className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-white text-xs font-bold drop-shadow-lg">শেয়ার</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Comments drawer */}
      <AnimatePresence>
        {commentingPostId && (
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute bottom-0 left-0 right-0 z-40 bg-card rounded-t-3xl max-h-[60vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
              <h3 className="font-bold text-foreground">মন্তব্য</h3>
              <button onClick={() => setCommentingPostId(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {loadingComments ? (
                <p className="text-xs text-muted-foreground text-center py-4">লোড হচ্ছে...</p>
              ) : comments.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">কোনো মন্তব্য নেই — প্রথম মন্তব্য করুন!</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="flex gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0 overflow-hidden">
                      {c.user?.avatar_url ? <img src={c.user.avatar_url} className="w-full h-full object-cover" /> :
                        <span className="text-[10px] text-primary font-bold">{c.user?.display_name?.[0]?.toUpperCase() || "?"}</span>}
                    </div>
                    <div className="bg-secondary/60 rounded-2xl px-3 py-2 flex-1">
                      <p className="text-xs font-bold text-foreground">{c.user?.display_name || "User"}</p>
                      <p className="text-xs text-foreground/80">{c.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center gap-2 px-4 py-3 border-t border-border/30">
              <input value={commentText} onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && commentText.trim() && commentMutation.mutate()}
                placeholder="মন্তব্য করুন..."
                className="flex-1 bg-secondary text-foreground rounded-full px-4 py-2.5 text-sm border-none outline-none placeholder:text-muted-foreground" />
              <button onClick={() => commentText.trim() && commentMutation.mutate()}
                disabled={!commentText.trim() || commentMutation.isPending}
                className="w-10 h-10 bg-primary rounded-full flex items-center justify-center disabled:opacity-50">
                <Send className="w-4 h-4 text-primary-foreground" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
