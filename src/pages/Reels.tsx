import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  toggleReaction, getUserReactions, getPostComments, addComment,
  REACTION_EMOJIS, type Post, type PostComment, markReelsSeen,
  getBangladeshExternalVideos, type ExternalReelVideo,
} from "@/lib/feed-api";
import {
  ArrowLeft, Heart, MessageCircle, Send, X, User, Loader2,
  Share2, Volume2, VolumeX, Play, Globe, Search
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
  isExternal?: boolean;
  externalTitle?: string;
  externalCreator?: string | null;
  thumbnail_url?: string | null;
  category?: string;
};

function getWatchedCategories(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem("reels_cat_prefs") || "{}"); } catch { return {}; }
}
function trackCategory(cat: string) {
  const p = getWatchedCategories(); p[cat] = (p[cat] || 0) + 1;
  localStorage.setItem("reels_cat_prefs", JSON.stringify(p));
}
function getPreferredCategories(): string[] {
  return Object.entries(getWatchedCategories()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
}

const CAT_LABEL: Record<string, string> = {
  funny: "😂 মজার", cartoon: "🎨 কার্টুন", romantic: "❤️ রোমান্টিক",
  natok: "🎭 নাটক", viral: "🔥 ভাইরাল", music: "🎵 মিউজিক",
  comedy: "😄 কমেডি", vlog: "📹 ভ্লগ", tiktok: "📱 টিকটক",
  movie: "🎬 মুভি", song: "🎶 গান", shortfilm: "🎥 শর্ট ফিল্ম",
};

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
  const [extPage, setExtPage] = useState(1);
  const [extVideos, setExtVideos] = useState<ExternalReelVideo[]>([]);
  const [extHasMore, setExtHasMore] = useState(true);
  const [extLoading, setExtLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement>>({});
  const activeVideoIdRef = useRef<string | null>(null);
  const lastTapRef = useRef<Record<string, number>>({});
  const tapTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const touchStartY = useRef(0);

  useEffect(() => { if (!isLoading && !user) navigate("/"); }, [user, isLoading, navigate]);
  useEffect(() => { if (user) markReelsSeen(user.id); }, [user]);

  const { data: reels = [], isLoading: reelsLoading } = useQuery({
    queryKey: ["reels-posts"],
    queryFn: async () => {
      const { data: posts } = await (supabase.from("posts").select("*") as any)
        .not("video_url", "is", null).order("created_at", { ascending: false }).limit(50);
      if (!posts || posts.length === 0) return [];
      const userIds = [...new Set(posts.map((p: any) => p.user_id))];
      const { data: users } = await (supabase.from("users").select("id, display_name, avatar_url, guest_id") as any).in("id", userIds);
      const userMap: Record<number, any> = {};
      (users || []).forEach((u: any) => { userMap[u.id] = u; });
      return posts.map((p: any) => ({ ...p, user: userMap[p.user_id] || null })) as Post[];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!user || initialLoaded) return;
    setInitialLoaded(true);
    loadMoreExternal();
  }, [user, initialLoaded]);

  const loadMoreExternal = useCallback(async () => {
    if (extLoading) return;
    setExtLoading(true);
    try {
      const preferred = getPreferredCategories();
      const result = await getBangladeshExternalVideos(extPage, 12, preferred, activeSearch || undefined);
      setExtVideos(prev => {
        const ids = new Set(prev.map(v => v.id));
        return [...prev, ...result.videos.filter(v => !ids.has(v.id))];
      });
      setExtHasMore(result.hasMore);
      setExtPage(p => p + 1);
    } catch {}
    setExtLoading(false);
  }, [extPage, extLoading, activeSearch]);

  // Reset and search when user submits search
  const handleSearch = useCallback(() => {
    const q = searchInput.trim();
    setActiveSearch(q);
    setExtVideos([]);
    setExtPage(1);
    setExtHasMore(true);
    setCurrentIndex(0);
    setShowSearch(false);
    // Will trigger loadMoreExternal via the effect below
  }, [searchInput]);

  // Load when search changes
  useEffect(() => {
    if (!user || !initialLoaded) return;
    if (extVideos.length === 0 && extHasMore && !extLoading) {
      loadMoreExternal();
    }
  }, [activeSearch, extVideos.length, extHasMore, extLoading, user, initialLoaded]);

  const allReels = useMemo<ReelItem[]>(() => {
    const ur: ReelItem[] = activeSearch ? [] : reels.map(r => ({
      id: r.id, video_url: r.video_url!, content: r.content,
      likes_count: r.likes_count, comments_count: r.comments_count,
      user_id: r.user_id, user: r.user, isExternal: false,
    }));
    const ext: ReelItem[] = extVideos.map(v => ({
      id: v.id, video_url: v.video_url, content: v.title,
      likes_count: 0, comments_count: 0, user_id: 0, user: null,
      isExternal: true, externalTitle: v.title, externalCreator: v.creator,
      thumbnail_url: v.thumbnail_url, category: v.category,
    }));
    return [...ur, ...ext];
  }, [reels, extVideos, activeSearch]);

  // Track category preference
  useEffect(() => {
    const reel = allReels[currentIndex];
    if (!reel?.isExternal || !reel.category) return;
    const t = setTimeout(() => trackCategory(reel.category!), 3000);
    return () => clearTimeout(t);
  }, [currentIndex, allReels]);

  useEffect(() => {
    if (user && reels.length > 0) getUserReactions(user.id, reels.map(r => r.id)).then(setUserReactions);
  }, [user, reels]);

  // Playback controller
  useEffect(() => {
    if (allReels.length === 0) return;
    const curr = allReels[currentIndex];
    if (!curr) return;
    activeVideoIdRef.current = curr.id;

    // Pause all native videos
    Object.values(videoRefs.current).forEach(v => { if (v) { v.pause(); v.muted = true; } });

    if (!curr.isExternal) {
      const vid = videoRefs.current[curr.id];
      if (vid) { vid.currentTime = 0; vid.muted = muted; vid.play().catch(() => {}); setPaused(null); }
    }

    // Preload next batch
    if (currentIndex >= allReels.length - 4 && extHasMore && !extLoading) {
      loadMoreExternal();
    }
  }, [currentIndex, allReels, muted]);

  const handleVideoPlay = useCallback((reelId: string) => {
    if (reelId !== activeVideoIdRef.current) {
      const v = videoRefs.current[reelId];
      if (v) { v.pause(); v.muted = true; }
    }
  }, []);

  // Scroll snap observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) setCurrentIndex(parseInt(e.target.getAttribute("data-index") || "0"));
      });
    }, { root: container, threshold: 0.6 });
    const items = container.querySelectorAll("[data-index]");
    items.forEach(item => observer.observe(item));
    return () => observer.disconnect();
  }, [allReels.length]);

  const reactionMutation = useMutation({
    mutationFn: async ({ postId, type }: { postId: string; type: string }) => {
      if (!user) throw new Error("Login");
      return { postId, ...(await toggleReaction(postId, user.id, type)) };
    },
    onMutate: async ({ postId, type }) => {
      const prev = userReactions[postId];
      setUserReactions(r => { const n = { ...r }; if (prev === type) delete n[postId]; else n[postId] = type; return n; });
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
    onSuccess: () => { if (commentingPostId) loadComments(commentingPostId); },
  });

  const loadComments = async (postId: string) => {
    setLoadingComments(true); setComments(await getPostComments(postId)); setLoadingComments(false);
  };

  const handleVideoTap = (postId: string) => {
    const now = Date.now();
    const last = lastTapRef.current[postId] || 0;
    if (tapTimerRef.current[postId]) clearTimeout(tapTimerRef.current[postId]);
    if (now - last < 300) {
      lastTapRef.current[postId] = 0;
      if (!userReactions[postId]) reactionMutation.mutate({ postId, type: "love" });
      setShowLoveAnim(postId);
      setTimeout(() => setShowLoveAnim(null), 1000);
    } else {
      lastTapRef.current[postId] = now;
      tapTimerRef.current[postId] = setTimeout(() => {
        const v = videoRefs.current[postId];
        if (!v) return;
        if (v.paused) { v.play(); setPaused(null); } else { v.pause(); setPaused(postId); }
      }, 300);
    }
  };

  const sharePost = async (reel: ReelItem) => {
    const text = reel.content || "দেখুন এই ভিডিও!";
    if (navigator.share) {
      try { await navigator.share({ title: "Good App Reels", text, url: window.location.origin }); } catch {}
    } else {
      navigator.clipboard.writeText(`${text}\n${window.location.origin}`);
      toast({ title: "লিংক কপি হয়েছে!" });
    }
  };

  useEffect(() => {
    return () => { Object.values(videoRefs.current).forEach(v => { if (v) { v.pause(); v.muted = true; } }); };
  }, []);

  if (isLoading || !user) return null;

  const showEmpty = !reelsLoading && allReels.length === 0 && !extLoading && initialLoaded;
  const W = 2; // render window ±2

  return (
    <div className="fixed inset-0 bg-black z-50">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-[60] flex items-center justify-between px-3 py-2.5 bg-gradient-to-b from-black/70 to-transparent pointer-events-auto">
        <button onClick={() => navigate(-1)} className="text-white p-1"><ArrowLeft size={22} /></button>
        <h1 className="text-white font-black text-lg">
          {activeSearch ? `🔍 ${activeSearch}` : "Reels"}
        </h1>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowSearch(!showSearch)} className="text-white p-1"><Search size={20} /></button>
          <button onClick={() => setMuted(!muted)} className="text-white p-1">
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
        </div>
      </div>

      {/* Search overlay */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -60, opacity: 0 }}
            className="absolute top-12 left-0 right-0 z-40 px-3 py-2"
          >
            <div className="bg-black/80 backdrop-blur-md rounded-2xl p-3 border border-white/10">
              <div className="flex gap-2">
                <input
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                  placeholder="গান, কার্টুন, ফানি, রোমান্টিক খুঁজুন..."
                  className="flex-1 bg-white/10 text-white rounded-full px-4 py-2.5 text-[14px] border-none outline-none placeholder:text-white/40"
                  autoFocus
                />
                <button onClick={handleSearch}
                  className="bg-blue-600 text-white px-4 py-2 rounded-full text-[13px] font-bold shrink-0">
                  খুঁজুন
                </button>
              </div>
              {/* Quick search chips */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {["গোপাল ভার", "ফানি ভিডিও", "বাংলা গান", "রোমান্টিক", "কার্টুন", "নাটক", "ভাইরাল", "TikTok"].map(q => (
                  <button key={q} onClick={() => { setSearchInput(q); setActiveSearch(q); setExtVideos([]); setExtPage(1); setExtHasMore(true); setCurrentIndex(0); setShowSearch(false); }}
                    className="bg-white/10 text-white/80 text-[12px] px-3 py-1.5 rounded-full hover:bg-white/20 transition-colors">
                    {q}
                  </button>
                ))}
              </div>
              {activeSearch && (
                <button onClick={() => { setActiveSearch(""); setSearchInput(""); setExtVideos([]); setExtPage(1); setExtHasMore(true); setCurrentIndex(0); setShowSearch(false); }}
                  className="mt-2 text-red-400 text-[12px] font-medium">
                  ✕ সার্চ ক্লিয়ার করুন
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {(reelsLoading && !initialLoaded && extVideos.length === 0) ? (
        <div className="flex items-center justify-center h-full">
          <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      ) : showEmpty ? (
        <div className="flex flex-col items-center justify-center h-full text-white/60 gap-3 px-6 text-center">
          <Play className="w-14 h-14" />
          <p className="font-bold text-lg">{activeSearch ? `"${activeSearch}" পাওয়া যায়নি` : "ভিডিও লোড হচ্ছে..."}</p>
          <div className="flex gap-2">
            {activeSearch && (
              <button onClick={() => { setActiveSearch(""); setExtVideos([]); setExtPage(1); setExtHasMore(true); }}
                className="px-5 py-2 bg-white/20 rounded-full text-white font-bold text-sm">ক্লিয়ার</button>
            )}
            <button onClick={() => { setExtPage(1); setExtHasMore(true); loadMoreExternal(); }}
              className="px-5 py-2 bg-primary rounded-full text-primary-foreground font-bold text-sm">আবার চেষ্টা</button>
          </div>
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

            return (
              <div key={reel.id} data-index={index} className="h-full w-full snap-start snap-always relative">
                {isNearby ? (
                  <>
                    {reel.isExternal ? (
                      /* Dailymotion iframe — directly plays video, no thumbnail */
                      <iframe
                        src={isActive || Math.abs(index - currentIndex) <= 1 ? reel.video_url : undefined}
                        className="absolute inset-0 w-full h-full"
                        allow="autoplay; fullscreen; picture-in-picture"
                        allowFullScreen
                        style={{ border: "none" }}
                      />
                    ) : (
                      <video
                        ref={el => { if (el) videoRefs.current[reel.id] = el; }}
                        src={reel.video_url}
                        className="absolute inset-0 w-full h-full object-cover"
                        loop playsInline muted={muted} preload="auto"
                        onClick={() => handleVideoTap(reel.id)}
                        onPlay={() => handleVideoPlay(reel.id)}
                      />
                    )}

                    {!reel.isExternal && paused === reel.id && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                        <div className="w-16 h-16 bg-black/40 rounded-full flex items-center justify-center">
                          <Play className="w-8 h-8 text-white ml-0.5" />
                        </div>
                      </div>
                    )}

                    <AnimatePresence>
                      {showLoveAnim === reel.id && (
                        <motion.div initial={{ scale: 0, opacity: 1 }} animate={{ scale: 2, opacity: 0 }} exit={{ opacity: 0 }}
                          transition={{ duration: 0.8 }} className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                          <span className="text-7xl">❤️</span>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Bottom gradient */}
                    <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black/70 to-transparent pointer-events-none z-10" />

                    {/* Info */}
                    <div className="absolute bottom-3 left-3 right-14 z-20">
                      {reel.isExternal ? (
                        <div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <Globe className="w-4 h-4 text-white/70 shrink-0" />
                            <span className="text-white font-bold text-[12px] drop-shadow-lg truncate">{reel.externalCreator || "বাংলা"}</span>
                            {reel.category && <span className="text-white/50 text-[10px]">{CAT_LABEL[reel.category] || ""}</span>}
                          </div>
                          <p className="text-white/80 text-[12px] line-clamp-1 drop-shadow-lg">{reel.externalTitle}</p>
                        </div>
                      ) : (
                        <div>
                          <button onClick={() => navigate(`/user/${reel.user_id}`)} className="flex items-center gap-1.5 mb-1">
                            <div className="w-8 h-8 rounded-full overflow-hidden border border-white/50 bg-white/20 flex items-center justify-center shrink-0">
                              {reel.user?.avatar_url ? <img src={reel.user.avatar_url} className="w-full h-full object-cover" /> :
                                <User className="w-4 h-4 text-white" />}
                            </div>
                            <span className="text-white font-bold text-[12px] drop-shadow-lg">{reel.user?.display_name || "User"}</span>
                          </button>
                          {reel.content && <p className="text-white/80 text-[12px] line-clamp-1 drop-shadow-lg">{reel.content}</p>}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="absolute right-2 bottom-16 z-20 flex flex-col items-center gap-3">
                      {!reel.isExternal && (
                        <>
                          <button onClick={() => reactionMutation.mutate({ postId: reel.id, type: myReaction || "love" })}
                            className="flex flex-col items-center">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${myReaction ? "bg-red-500/30" : "bg-white/15"}`}>
                              {myReaction ? <span className="text-lg">{REACTION_EMOJIS[myReaction]}</span> : <Heart className="w-5 h-5 text-white" />}
                            </div>
                            {reel.likes_count > 0 && <span className="text-white text-[10px] font-bold mt-0.5">{reel.likes_count}</span>}
                          </button>
                          <button onClick={() => { setCommentingPostId(reel.id); loadComments(reel.id); }} className="flex flex-col items-center">
                            <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center">
                              <MessageCircle className="w-5 h-5 text-white" />
                            </div>
                            {reel.comments_count > 0 && <span className="text-white text-[10px] font-bold mt-0.5">{reel.comments_count}</span>}
                          </button>
                        </>
                      )}
                      <button onClick={() => sharePost(reel)} className="flex flex-col items-center">
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

          {/* Bottom loading */}
          {extHasMore && (
            <div className="h-16 flex items-center justify-center snap-start">
              {extLoading && <Loader2 className="w-6 h-6 text-white/40 animate-spin" />}
            </div>
          )}
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
                <p className="text-sm text-muted-foreground text-center py-4">লোড হচ্ছে...</p>
              ) : comments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">প্রথম মন্তব্য করুন!</p>
              ) : comments.map(c => (
                <div key={c.id} className="flex gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0 overflow-hidden">
                    {c.user?.avatar_url ? <img src={c.user.avatar_url} className="w-full h-full object-cover" /> :
                      <span className="text-[10px] text-primary font-bold">{c.user?.display_name?.[0]?.toUpperCase() || "?"}</span>}
                  </div>
                  <div className="bg-secondary/60 rounded-2xl px-3 py-2 flex-1">
                    <p className="text-[12px] font-bold text-foreground">{c.user?.display_name || "User"}</p>
                    <p className="text-[13px] text-foreground/90 mt-0.5">{c.content}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 px-4 py-3 border-t border-border/30">
              <input value={commentText} onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => e.key === "Enter" && commentText.trim() && commentMutation.mutate()}
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
