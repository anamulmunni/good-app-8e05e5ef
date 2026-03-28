import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  toggleReaction,
  getUserReactions,
  getPostComments,
  addComment,
  REACTION_EMOJIS,
  type Post,
  type PostComment,
  markReelsSeen,
} from "@/lib/feed-api";
import {
  ArrowLeft,
  Heart,
  MessageCircle,
  Send,
  X,
  User,
  Loader2,
  Share2,
  Volume2,
  VolumeX,
  Play,
  Pause,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

type ReelItem = {
  id: string;
  video_url: string;
  content: string | null;
  likes_count: number;
  comments_count: number;
  user_id: number;
  user?: { display_name: string | null; avatar_url: string | null; guest_id: string } | null;
};

export default function Reels() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [userReactions, setUserReactions] = useState<Record<string, string>>({});
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [muted, setMuted] = useState(true);
  const [pausedId, setPausedId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement>>({});
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) navigate("/");
  }, [user, isLoading, navigate]);

  useEffect(() => {
    if (user) markReelsSeen(user.id);
  }, [user]);

  const { data: reels = [], isLoading: reelsLoading } = useQuery({
    queryKey: ["reels-posts"],
    queryFn: async () => {
      const { data: posts } = await (supabase.from("posts").select("*") as any)
        .not("video_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(80);

      if (!posts || posts.length === 0) return [];

      const userIds = [...new Set(posts.map((p: any) => p.user_id))];
      const { data: users } = await (supabase.from("users").select("id, display_name, avatar_url, guest_id") as any).in("id", userIds);
      const userMap: Record<number, any> = {};
      (users || []).forEach((u: any) => {
        userMap[u.id] = u;
      });

      return posts.map((p: any) => ({ ...p, user: userMap[p.user_id] || null })) as Post[];
    },
    enabled: !!user,
  });

  const allReels = useMemo<ReelItem[]>(() => {
    return reels.map((r) => ({
      id: r.id,
      video_url: r.video_url!,
      content: r.content,
      likes_count: r.likes_count,
      comments_count: r.comments_count,
      user_id: r.user_id,
      user: r.user,
    }));
  }, [reels]);

  useEffect(() => {
    if (user && allReels.length > 0) {
      getUserReactions(user.id, allReels.map((r) => r.id)).then(setUserReactions);
    }
  }, [user, allReels]);

  useEffect(() => {
    setPausedId(null);
  }, [currentIndex]);

  const playVideoSafe = useCallback(async (videoEl: HTMLVideoElement, wantSound: boolean) => {
    videoEl.muted = true;
    try {
      await videoEl.play();
      if (wantSound) videoEl.muted = false;
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (allReels.length === 0) return;

    const current = allReels[currentIndex];
    if (!current) return;

    activeIdRef.current = current.id;

    Object.entries(videoRefs.current).forEach(([id, video]) => {
      if (!video) return;
      if (id !== current.id) {
        video.pause();
        video.muted = true;
      }
    });

    const activeVideo = videoRefs.current[current.id];
    if (!activeVideo) return;

    if (pausedId === current.id) {
      activeVideo.pause();
      return;
    }

    playVideoSafe(activeVideo, !muted).then((ok) => {
      if (!ok) setPausedId(current.id);
    });
  }, [allReels, currentIndex, pausedId, muted, playVideoSafe]);

  const handleVideoPlay = useCallback((reelId: string) => {
    if (reelId !== activeIdRef.current) {
      const v = videoRefs.current[reelId];
      if (v) {
        v.pause();
        v.muted = true;
      }
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!visible || visible.intersectionRatio < 0.72) return;

        const idx = parseInt(visible.target.getAttribute("data-index") || "0", 10);
        if (Number.isNaN(idx)) return;

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          setCurrentIndex((prev) => (prev === idx ? prev : idx));
        }, 120);
      },
      { root: container, threshold: [0.6, 0.72, 0.9] },
    );

    const items = container.querySelectorAll("[data-index]");
    items.forEach((item) => observer.observe(item));

    return () => {
      observer.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [allReels.length]);

  const togglePause = useCallback(
    (reel: ReelItem) => {
      const v = videoRefs.current[reel.id];
      if (!v) return;

      if (pausedId === reel.id) {
        playVideoSafe(v, !muted);
        setPausedId(null);
      } else {
        v.pause();
        setPausedId(reel.id);
      }
    },
    [pausedId, muted, playVideoSafe],
  );

  const handleMuteToggle = useCallback(() => {
    const nextMuted = !muted;
    setMuted(nextMuted);

    const activeId = activeIdRef.current;
    const activeVideo = activeId ? videoRefs.current[activeId] : null;

    if (activeVideo) {
      if (nextMuted) {
        activeVideo.muted = true;
      } else {
        playVideoSafe(activeVideo, true).then((ok) => {
          if (!ok) {
            setMuted(true);
            toast({ title: "সাউন্ড চালু করতে ভিডিওতে আবার ট্যাপ করুন" });
          }
        });
      }
    }
  }, [muted, playVideoSafe, toast]);

  const reactionMutation = useMutation({
    mutationFn: async ({ postId, type }: { postId: string; type: string }) => {
      if (!user) throw new Error("Login");
      return { postId, ...(await toggleReaction(postId, user.id, type)) };
    },
    onMutate: async ({ postId, type }) => {
      const prev = userReactions[postId];
      setUserReactions((r) => {
        const n = { ...r };
        if (prev === type) delete n[postId];
        else n[postId] = type;
        return n;
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
      setComments((prev) => [
        ...prev,
        {
          id: `temp-${Date.now()}`,
          post_id: commentingPostId,
          user_id: user.id,
          content: commentText.trim(),
          created_at: new Date().toISOString(),
          user: { display_name: user.display_name, avatar_url: user.avatar_url, guest_id: user.guest_id },
        },
      ]);
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

  const sharePost = async (reel: ReelItem) => {
    const text = reel.content || "দেখুন এই ভিডিও!";
    if (navigator.share) {
      try {
        await navigator.share({ title: "Good App Reels", text, url: window.location.origin });
      } catch {
        // ignore
      }
    } else {
      navigator.clipboard.writeText(`${text}\n${window.location.origin}`);
      toast({ title: "লিংক কপি হয়েছে!" });
    }
  };

  useEffect(() => {
    return () => {
      Object.values(videoRefs.current).forEach((v) => {
        if (v) {
          v.pause();
          v.muted = true;
        }
      });
    };
  }, []);

  if (isLoading || !user) return null;

  const showEmpty = !reelsLoading && allReels.length === 0;
  const W = 2;

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="absolute top-0 left-0 right-0 z-[70] flex items-center justify-between px-3 py-2.5 bg-gradient-to-b from-black/70 to-transparent pointer-events-auto">
        <button onClick={() => navigate(-1)} className="text-white p-2 -m-1">
          <ArrowLeft size={22} />
        </button>

        <h1 className="text-white font-black text-lg">Reels</h1>

        <button onClick={handleMuteToggle} className="text-white p-2 -m-1">
          {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
      </div>

      {reelsLoading ? (
        <div className="flex items-center justify-center h-full">
          <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      ) : showEmpty ? (
        <div className="flex flex-col items-center justify-center h-full text-white/60 gap-3 px-6 text-center">
          <Play className="w-14 h-14" />
          <p className="font-bold text-lg">এখনও কোনো আপলোড করা reels নেই</p>
          <p className="text-sm text-white/40">প্রথমে নিজের reels upload করলে এখানে smoothly দেখতে পারবেন</p>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="h-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {allReels.map((reel, index) => {
            const myReaction = userReactions[reel.id];
            const isNearby = Math.abs(index - currentIndex) <= W;
            const isActive = index === currentIndex;
            const isPaused = pausedId === reel.id;

            return (
              <div key={reel.id} data-index={index} className="h-full w-full snap-start snap-always relative bg-black">
                {isNearby ? (
                  <>
                    <video
                      ref={(el) => {
                        if (el) videoRefs.current[reel.id] = el;
                      }}
                      src={reel.video_url}
                      className="absolute inset-0 w-full h-full object-cover"
                      loop
                      playsInline
                      muted={muted}
                      preload={isActive ? "auto" : "metadata"}
                      onPlay={() => handleVideoPlay(reel.id)}
                    />

                    <div className="absolute inset-0 z-[15]" onClick={() => togglePause(reel)} />

                    {isPaused && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[16]">
                        <div className="w-20 h-20 bg-black/45 rounded-full flex items-center justify-center">
                          <Play className="w-10 h-10 text-white ml-1" />
                        </div>
                      </div>
                    )}

                    {isActive && (
                      <div className="absolute left-3 top-16 z-[20] bg-black/45 text-white text-[11px] font-bold px-2.5 py-1 rounded-full pointer-events-none">
                        {isPaused ? "Paused" : "Playing"} • {muted ? "Muted" : "Sound On"}
                      </div>
                    )}

                    <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black/70 to-transparent pointer-events-none z-[18]" />

                    <div className="absolute bottom-3 left-3 right-14 z-[20] pointer-events-none">
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className="w-8 h-8 rounded-full overflow-hidden border border-white/50 bg-white/20 flex items-center justify-center shrink-0">
                          {reel.user?.avatar_url ? <img src={reel.user.avatar_url} className="w-full h-full object-cover" /> : <User className="w-4 h-4 text-white" />}
                        </div>
                        <span className="text-white font-bold text-[12px] drop-shadow-lg">{reel.user?.display_name || "User"}</span>
                      </div>
                      {reel.content && <p className="text-white/80 text-[12px] line-clamp-1 drop-shadow-lg">{reel.content}</p>}
                    </div>

                    <div className="absolute right-2 bottom-16 z-[20] flex flex-col items-center gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePause(reel);
                        }}
                        className="flex flex-col items-center"
                      >
                        <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center">
                          {isPaused ? <Play className="w-5 h-5 text-white" /> : <Pause className="w-5 h-5 text-white" />}
                        </div>
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          reactionMutation.mutate({ postId: reel.id, type: myReaction || "love" });
                        }}
                        className="flex flex-col items-center"
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${myReaction ? "bg-red-500/30" : "bg-white/15"}`}>
                          {myReaction ? <span className="text-lg">{REACTION_EMOJIS[myReaction]}</span> : <Heart className="w-5 h-5 text-white" />}
                        </div>
                        {reel.likes_count > 0 && <span className="text-white text-[10px] font-bold mt-0.5">{reel.likes_count}</span>}
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCommentingPostId(reel.id);
                          loadComments(reel.id);
                        }}
                        className="flex flex-col items-center"
                      >
                        <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center">
                          <MessageCircle className="w-5 h-5 text-white" />
                        </div>
                        {reel.comments_count > 0 && <span className="text-white text-[10px] font-bold mt-0.5">{reel.comments_count}</span>}
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          sharePost(reel);
                        }}
                        className="flex flex-col items-center"
                      >
                        <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center">
                          <Share2 className="w-5 h-5 text-white" />
                        </div>
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 bg-black" />
                )}
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {commentingPostId && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute bottom-0 left-0 right-0 z-[80] bg-card rounded-t-3xl max-h-[60vh] flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
              <h3 className="font-bold text-foreground">মন্তব্য</h3>
              <button onClick={() => setCommentingPostId(null)}>
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {loadingComments ? (
                <p className="text-sm text-muted-foreground text-center py-4">লোড হচ্ছে...</p>
              ) : comments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">প্রথম মন্তব্য করুন!</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="flex gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0 overflow-hidden">
                      {c.user?.avatar_url ? (
                        <img src={c.user.avatar_url} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] text-primary font-bold">{c.user?.display_name?.[0]?.toUpperCase() || "?"}</span>
                      )}
                    </div>
                    <div className="bg-secondary/60 rounded-2xl px-3 py-2 flex-1">
                      <p className="text-[12px] font-bold text-foreground">{c.user?.display_name || "User"}</p>
                      <p className="text-[13px] text-foreground/90 mt-0.5">{c.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center gap-2 px-4 py-3 border-t border-border/30">
              <input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && commentText.trim() && commentMutation.mutate()}
                placeholder="মন্তব্য করুন..."
                className="flex-1 bg-secondary text-foreground rounded-full px-4 py-2.5 text-sm border-none outline-none placeholder:text-muted-foreground"
              />
              <button
                onClick={() => commentText.trim() && commentMutation.mutate()}
                disabled={!commentText.trim() || commentMutation.isPending}
                className="w-10 h-10 bg-primary rounded-full flex items-center justify-center disabled:opacity-50"
              >
                {commentMutation.isPending ? <Loader2 className="w-4 h-4 text-primary-foreground animate-spin" /> : <Send className="w-4 h-4 text-primary-foreground" />}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
