import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  getFeedPosts, createPost, toggleReaction, getUserReactions,
  getPostComments, addComment, uploadPostMedia, getActiveStories,
  createStory, uploadStoryMedia, searchFeedUsers, getSuggestedUsers,
  deletePost, deleteStory,
  REACTION_EMOJIS, type Post, type PostComment, type Story
} from "@/lib/feed-api";
import { getOrCreateConversation, getUnreadCount } from "@/lib/chat-api";
import { getOnlineUsers, isUserOnline } from "@/hooks/use-online";
import {
  Heart, MessageCircle, Send, Image, X, ArrowLeft,
  Plus, User, Search, Phone, Share2, Loader2, MoreVertical, Trash2, ZoomIn, Play
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

export default function Feed() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showCreatePost, setShowCreatePost] = useState(false);
  const [postContent, setPostContent] = useState("");
  const [postImageFile, setPostImageFile] = useState<File | null>(null);
  const [postImagePreview, setPostImagePreview] = useState<string | null>(null);
  const [postVideoFile, setPostVideoFile] = useState<File | null>(null);
  const [postVideoPreview, setPostVideoPreview] = useState<string | null>(null);
  const [userReactions, setUserReactions] = useState<Record<string, string>>({});
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [viewingStory, setViewingStory] = useState<Story | null>(null);
  const [showPostMenu, setShowPostMenu] = useState<string | null>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [doubleTapTimer, setDoubleTapTimer] = useState<Record<string, number>>({});
  const [showLoveAnimation, setShowLoveAnimation] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const storyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoading && !user) navigate("/");
  }, [user, isLoading, navigate]);

  const { data: posts = [], isLoading: postsLoading } = useQuery({
    queryKey: ["feed-posts", searchQuery],
    queryFn: () => getFeedPosts(30, searchQuery),
    enabled: !!user,
  });

  const { data: stories = [] } = useQuery({
    queryKey: ["stories"],
    queryFn: getActiveStories,
    enabled: !!user,
  });

  const { data: onlineUsers = [] } = useQuery({
    queryKey: ["online-users"],
    queryFn: () => getOnlineUsers(user!.id),
    enabled: !!user,
    refetchInterval: 30000,
  });

  const { data: suggestedUsers = [] } = useQuery({
    queryKey: ["suggested-users"],
    queryFn: () => getSuggestedUsers(user!.id),
    enabled: !!user && showSearch && onlineUsers.length === 0,
  });

  const { data: searchResults = [] } = useQuery({
    queryKey: ["feed-user-search", searchQuery],
    queryFn: () => searchFeedUsers(searchQuery),
    enabled: searchQuery.length >= 2,
  });

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["unread-count"],
    queryFn: () => getUnreadCount(user!.id),
    enabled: !!user,
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (user && posts.length > 0) {
      getUserReactions(user.id, posts.map(p => p.id)).then(setUserReactions);
    }
  }, [user, posts]);

  useEffect(() => {
    const channel = supabase.channel("feed-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => {
        queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, () => {
        queryClient.invalidateQueries({ queryKey: ["stories"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["unread-count"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const createPostMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Login required");
      let imageUrl: string | undefined;
      let videoUrl: string | undefined;
      if (postImageFile) imageUrl = await uploadPostMedia(postImageFile, postImageFile.name);
      if (postVideoFile) videoUrl = await uploadPostMedia(postVideoFile, postVideoFile.name);
      return createPost(user.id, postContent, imageUrl, videoUrl);
    },
    onSuccess: () => {
      setPostContent(""); setPostImageFile(null); setPostImagePreview(null);
      setPostVideoFile(null); setPostVideoPreview(null); setShowCreatePost(false);
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
      toast({ title: "পোস্ট প্রকাশিত! 🎉" });
    },
    onError: (e: Error) => toast({ title: "পোস্ট করা যায়নি", description: e.message, variant: "destructive" }),
  });

  const deletePostMutation = useMutation({
    mutationFn: async (postId: string) => {
      if (!user) throw new Error("Login");
      await deletePost(postId, user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
      toast({ title: "পোস্ট মুছে ফেলা হয়েছে 🗑️" });
      setShowPostMenu(null);
    },
    onError: () => toast({ title: "মুছতে পারা যায়নি", variant: "destructive" }),
  });

  const deleteStoryMutation = useMutation({
    mutationFn: async (storyId: string) => {
      if (!user) throw new Error("Login");
      await deleteStory(storyId, user.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stories"] });
      setViewingStory(null);
      toast({ title: "স্টোরি মুছে ফেলা হয়েছে" });
    },
  });

  const reactionMutation = useMutation({
    mutationFn: async ({ postId, type }: { postId: string; type: string }) => {
      if (!user) throw new Error("Login");
      return { postId, ...(await toggleReaction(postId, user.id, type)) };
    },
    onMutate: async ({ postId, type }) => {
      const prev = userReactions[postId];
      const wasReacted = !!prev;
      const isSameReaction = prev === type;

      setUserReactions(r => {
        const next = { ...r };
        if (isSameReaction) delete next[postId];
        else next[postId] = type;
        return next;
      });
      queryClient.setQueryData<Post[]>(["feed-posts", searchQuery], old =>
        (old || []).map(p => p.id === postId
          ? { ...p, likes_count: p.likes_count + (isSameReaction ? -1 : wasReacted ? 0 : 1) }
          : p
        )
      );
      setShowReactionPicker(null);
      return { prev };
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["feed-posts"] }),
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
      queryClient.setQueryData<Post[]>(["feed-posts", searchQuery], old =>
        (old || []).map(p => p.id === commentingPostId ? { ...p, comments_count: p.comments_count + 1 } : p)
      );
      setCommentText("");
    },
    onSuccess: () => {
      if (commentingPostId) loadComments(commentingPostId);
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
    },
  });

  const storyMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error("Login");
      const url = await uploadStoryMedia(file);
      return createStory(user.id, url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stories"] });
      toast({ title: "স্টোরি যোগ হয়েছে! ✨" });
    },
    onError: () => toast({ title: "স্টোরি আপলোড ব্যর্থ", variant: "destructive" }),
  });

  const loadComments = async (postId: string) => {
    setLoadingComments(true);
    setComments(await getPostComments(postId));
    setLoadingComments(false);
  };

  const openComments = (postId: string) => {
    if (commentingPostId === postId) { setCommentingPostId(null); return; }
    setCommentingPostId(postId);
    loadComments(postId);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPostImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setPostImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Max 2 minutes check
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      if (video.duration > 120) {
        toast({ title: "ভিডিও সর্বোচ্চ ২ মিনিট হতে পারবে", variant: "destructive" });
        return;
      }
      setPostVideoFile(file);
      setPostVideoPreview(video.src);
    };
  };

  const handleStorySelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) storyMutation.mutate(file);
  };

  // Single tap = zoom, double tap = love
  const tapTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const handleImageTap = (postId: string, imageUrl: string) => {
    const now = Date.now();
    const lastTap = doubleTapTimer[postId] || 0;
    if (now - lastTap < 300) {
      // Double tap = love
      clearTimeout(tapTimerRef.current[postId]);
      if (!userReactions[postId]) {
        reactionMutation.mutate({ postId, type: "love" });
      }
      setShowLoveAnimation(postId);
      setTimeout(() => setShowLoveAnimation(null), 1000);
      setDoubleTapTimer(prev => ({ ...prev, [postId]: 0 }));
    } else {
      // Single tap = zoom (with delay to check for double tap)
      setDoubleTapTimer(prev => ({ ...prev, [postId]: now }));
      tapTimerRef.current[postId] = setTimeout(() => {
        setViewingImage(imageUrl);
      }, 320);
    }
  };

  const startChatWith = async (targetUserId: number) => {
    if (!user || targetUserId === user.id) return;
    try { await getOrCreateConversation(user.id, targetUserId); navigate("/chat"); } catch {}
  };

  const sharePost = async (post: Post) => {
    const text = post.content || "দেখুন এই পোস্টটি!";
    const shareUrl = window.location.origin;
    if (navigator.share) {
      const shareData: ShareData = { title: "Good App - পোস্ট শেয়ার", text, url: shareUrl };
      if (post.image_url) {
        try {
          const response = await fetch(post.image_url);
          const blob = await response.blob();
          const file = new File([blob], "post-image.jpg", { type: blob.type });
          if (navigator.canShare && navigator.canShare({ files: [file] })) shareData.files = [file];
        } catch {}
      }
      try { await navigator.share(shareData); } catch {}
    } else {
      navigator.clipboard.writeText(`${text}\n${shareUrl}`);
      toast({ title: "লিংক কপি করা হয়েছে!" });
    }
  };

  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "এইমাত্র";
    if (mins < 60) return `${mins} মি.`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} ঘ.`;
    return `${Math.floor(hrs / 24)} দি.`;
  };

  // Group stories by user
  const storyGroups = stories.reduce<Record<number, Story[]>>((acc, s) => {
    (acc[s.user_id] = acc[s.user_id] || []).push(s);
    return acc;
  }, {});

  if (isLoading || !user) return null;

  return (
    <div className="min-h-screen bg-background pb-4">
      {/* Header - Facebook style */}
      <header className="sticky top-0 z-50 bg-card border-b border-border/50 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-foreground p-1">
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-xl font-black bg-gradient-to-r from-primary to-[hsl(var(--cyan))] bg-clip-text text-transparent">
              নিউজ ফিড
            </h1>
          </div>
          <div className="flex items-center gap-1">
            {/* Reels button */}
            <button onClick={() => navigate("/reels")} className="p-2 rounded-full text-muted-foreground hover:text-foreground transition-colors">
              <Play size={20} />
            </button>
            <button onClick={() => setShowSearch(!showSearch)} className={`p-2 rounded-full transition-colors ${showSearch ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
              <Search size={20} />
            </button>
            {/* Chat button with unread badge */}
            <button onClick={() => navigate("/chat")} className="relative p-2 rounded-full text-muted-foreground hover:text-foreground transition-colors">
              <MessageCircle size={20} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-destructive text-destructive-foreground text-[10px] font-black rounded-full flex items-center justify-center px-1 animate-pulse">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowCreatePost(true)}
              className="w-9 h-9 bg-primary rounded-full flex items-center justify-center shadow-md shadow-primary/30">
              <Plus className="w-5 h-5 text-primary-foreground" />
            </motion.button>
          </div>
        </div>

        {/* Search bar */}
        <AnimatePresence>
          {showSearch && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-border/30">
              <div className="px-4 py-2.5">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="পোস্ট বা ইউজার খুঁজুন..."
                    className="w-full bg-secondary text-foreground rounded-full pl-10 pr-4 py-2 text-sm border-none outline-none placeholder:text-muted-foreground" autoFocus />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  )}
                </div>

                {searchResults.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {searchResults.filter((u: any) => u.id !== user.id).slice(0, 4).map((u: any) => (
                      <button key={u.id} onClick={() => navigate(`/user/${u.id}`)}
                        className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-secondary/80 transition-colors text-left">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs overflow-hidden">
                          {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" /> : u.display_name?.[0]?.toUpperCase() || "?"}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground">{u.display_name || "User"}</p>
                          <p className="text-[10px] text-muted-foreground">{u.guest_id}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {!searchQuery && onlineUsers.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1.5 px-1">🟢 অনলাইন</p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {onlineUsers.map((u: any) => (
                        <button key={u.id} onClick={() => navigate(`/user/${u.id}`)}
                          className="flex flex-col items-center gap-1 min-w-[60px] p-2 rounded-xl hover:bg-secondary/80 transition-colors">
                          <div className="relative">
                            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm overflow-hidden">
                              {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" /> : u.display_name?.[0]?.toUpperCase() || "?"}
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-[hsl(var(--emerald))] rounded-full border-2 border-background" />
                          </div>
                          <p className="text-[10px] text-foreground font-bold truncate max-w-[60px]">{u.display_name || "User"}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {!searchQuery && onlineUsers.length === 0 && suggestedUsers.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1.5 px-1">সাজেস্টেড</p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {suggestedUsers.map((u: any) => (
                        <button key={u.id} onClick={() => navigate(`/user/${u.id}`)}
                          className="flex flex-col items-center gap-1 min-w-[60px] p-2 rounded-xl hover:bg-secondary/80 transition-colors">
                          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm overflow-hidden">
                            {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" /> : u.display_name?.[0]?.toUpperCase() || "?"}
                          </div>
                          <p className="text-[10px] text-foreground font-bold truncate max-w-[60px]">{u.display_name || "User"}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Stories Section */}
      {!showSearch && Object.keys(storyGroups).length > 0 && (
        <div className="border-b border-border/30 bg-card/50">
          <div className="max-w-lg mx-auto px-4 py-3">
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
              <button onClick={() => storyInputRef.current?.click()}
                className="flex flex-col items-center gap-1.5 min-w-[68px]">
                <div className="w-16 h-16 rounded-full border-2 border-dashed border-primary/40 flex items-center justify-center bg-primary/5">
                  {storyMutation.isPending ? <Loader2 className="w-5 h-5 text-primary animate-spin" /> : <Plus className="w-6 h-6 text-primary" />}
                </div>
                <p className="text-[10px] text-muted-foreground font-bold">আপনার</p>
              </button>
              <input ref={storyInputRef} type="file" accept="image/*" className="hidden" onChange={handleStorySelect} />

              {Object.entries(storyGroups).map(([uid, userStories]) => {
                const storyUser = userStories[0].user;
                return (
                  <button key={uid} onClick={() => setViewingStory(userStories[0])}
                    className="flex flex-col items-center gap-1.5 min-w-[68px]">
                    <div className="w-16 h-16 rounded-full p-[3px] bg-gradient-to-br from-primary via-[hsl(var(--pink))] to-[hsl(var(--amber))]">
                      <div className="w-full h-full rounded-full overflow-hidden bg-background border-2 border-background">
                        {storyUser?.avatar_url ? (
                          <img src={storyUser.avatar_url} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-secondary">
                            <span className="text-sm font-bold text-primary">{storyUser?.display_name?.[0]?.toUpperCase() || "?"}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] text-foreground font-bold truncate max-w-[68px]">
                      {parseInt(uid) === user.id ? "আপনি" : storyUser?.display_name || "User"}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!showSearch && Object.keys(storyGroups).length === 0 && (
        <div className="border-b border-border/30 bg-card/50">
          <div className="max-w-lg mx-auto px-4 py-3">
            <div className="flex gap-3">
              <button onClick={() => storyInputRef.current?.click()}
                className="flex flex-col items-center gap-1.5 min-w-[68px]">
                <div className="w-16 h-16 rounded-full border-2 border-dashed border-primary/40 flex items-center justify-center bg-primary/5">
                  {storyMutation.isPending ? <Loader2 className="w-5 h-5 text-primary animate-spin" /> : <Plus className="w-6 h-6 text-primary" />}
                </div>
                <p className="text-[10px] text-muted-foreground font-bold">স্টোরি দিন</p>
              </button>
              <input ref={storyInputRef} type="file" accept="image/*" className="hidden" onChange={handleStorySelect} />
            </div>
          </div>
        </div>
      )}

      {/* Story viewer with delete option */}
      <AnimatePresence>
        {viewingStory && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black flex flex-col" onClick={() => setViewingStory(null)}>
            <div className="p-4 flex items-center gap-3 relative z-10">
              <button onClick={(e) => { e.stopPropagation(); setViewingStory(null); navigate(`/user/${viewingStory.user_id}`); }}
                className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
                {viewingStory.user?.avatar_url ? <img src={viewingStory.user.avatar_url} className="w-full h-full object-cover" /> :
                  <span className="text-white text-xs font-bold">{viewingStory.user?.display_name?.[0] || "?"}</span>}
              </button>
              <button onClick={(e) => { e.stopPropagation(); setViewingStory(null); navigate(`/user/${viewingStory.user_id}`); }} className="flex-1 text-left">
                <p className="text-white font-bold text-sm">{viewingStory.user?.display_name || "User"}</p>
                <p className="text-white/60 text-[10px]">{timeAgo(viewingStory.created_at)}</p>
              </button>
              <div className="flex items-center gap-2">
                {viewingStory.user_id === user.id && (
                  <button onClick={(e) => { e.stopPropagation(); deleteStoryMutation.mutate(viewingStory.id); }}
                    className="text-white/80 hover:text-destructive p-1">
                    <Trash2 size={20} />
                  </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); setViewingStory(null); navigate(`/chat`); startChatWith(viewingStory.user_id); }}
                  className="text-white/80 hover:text-white p-1"><MessageCircle size={20} /></button>
                <button onClick={(e) => { e.stopPropagation(); setViewingStory(null); navigate(`/call/${viewingStory.user_id}`); }}
                  className="text-white/80 hover:text-white p-1"><Phone size={20} /></button>
                <button onClick={() => setViewingStory(null)} className="text-white/80"><X size={24} /></button>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center p-4">
              <img src={viewingStory.image_url} alt="" className="max-w-full max-h-full object-contain rounded-2xl" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image Zoom Viewer */}
      <AnimatePresence>
        {viewingImage && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center" onClick={() => setViewingImage(null)}>
            <button onClick={() => setViewingImage(null)} className="absolute top-4 right-4 z-10 text-white/80 hover:text-white">
              <X size={28} />
            </button>
            <motion.img
              src={viewingImage}
              alt=""
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="max-w-full max-h-full object-contain p-4"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Post Quick Bar */}
      {!showSearch && (
        <div className="max-w-lg mx-auto px-4 py-3 border-b border-border/30">
          <button onClick={() => setShowCreatePost(true)}
            className="w-full flex items-center gap-3 bg-secondary/50 rounded-full px-4 py-2.5 border border-border/50 hover:bg-secondary transition-colors">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
              {user.avatar_url ? <img src={user.avatar_url} className="w-full h-full object-cover" /> : <User className="w-4 h-4 text-primary" />}
            </div>
            <span className="text-sm text-muted-foreground">কি মনে হচ্ছে?</span>
          </button>
        </div>
      )}

      {/* Create Post Modal */}
      <AnimatePresence>
        {showCreatePost && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm">
            <div className="max-w-lg mx-auto px-4 pt-4">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => { setShowCreatePost(false); setPostImageFile(null); setPostImagePreview(null); setPostVideoFile(null); setPostVideoPreview(null); setPostContent(""); }}>
                  <X className="w-6 h-6 text-muted-foreground" />
                </button>
                <h2 className="font-bold text-lg">নতুন পোস্ট</h2>
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => createPostMutation.mutate()}
                  disabled={createPostMutation.isPending || (!postContent.trim() && !postImageFile && !postVideoFile)}
                  className="px-5 py-2 bg-primary text-primary-foreground rounded-full text-sm font-bold disabled:opacity-50">
                  {createPostMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "পোস্ট"}
                </motion.button>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-[hsl(var(--cyan))]/20 flex items-center justify-center border border-primary/20 overflow-hidden shrink-0">
                  {user.avatar_url ? <img src={user.avatar_url} className="w-full h-full object-cover" /> : <User className="w-5 h-5 text-primary" />}
                </div>
                <textarea value={postContent} onChange={(e) => setPostContent(e.target.value)}
                  placeholder="কি মনে হচ্ছে? শেয়ার করুন..."
                  className="flex-1 bg-transparent text-foreground text-base resize-none border-none outline-none placeholder:text-muted-foreground min-h-[120px]" autoFocus />
              </div>

              {postImagePreview && (
                <div className="mt-4 relative">
                  <img src={postImagePreview} className="w-full rounded-2xl max-h-60 object-cover" />
                  <button onClick={() => { setPostImageFile(null); setPostImagePreview(null); }}
                    className="absolute top-2 right-2 w-8 h-8 bg-background/80 rounded-full flex items-center justify-center">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {postVideoPreview && (
                <div className="mt-4 relative">
                  <video src={postVideoPreview} className="w-full rounded-2xl max-h-60" controls />
                  <button onClick={() => { setPostVideoFile(null); setPostVideoPreview(null); }}
                    className="absolute top-2 right-2 w-8 h-8 bg-background/80 rounded-full flex items-center justify-center">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="mt-4 flex items-center gap-3 border-t border-border/50 pt-4">
                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 text-primary hover:bg-primary/10 px-3 py-2 rounded-xl transition-colors">
                  <Image className="w-5 h-5" /><span className="text-sm font-medium">ছবি</span>
                </button>
                <button onClick={() => videoInputRef.current?.click()} className="flex items-center gap-2 text-[hsl(var(--pink))] hover:bg-[hsl(var(--pink))]/10 px-3 py-2 rounded-xl transition-colors">
                  <span className="text-lg">🎬</span><span className="text-sm font-medium">ভিডিও</span>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoSelect} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Posts */}
      <div className="max-w-lg mx-auto">
        {postsLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-muted-foreground">
            <MessageCircle className="w-12 h-12 text-primary/30 mb-3" />
            <p className="font-bold">{searchQuery ? "কিছু পাওয়া যায়নি" : "কোনো পোস্ট নেই"}</p>
            <p className="text-sm mt-1">{searchQuery ? "অন্য কিছু খুঁজুন" : "প্রথম পোস্ট করুন! ✨"}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/20">
            {posts.map((post) => {
              const myReaction = userReactions[post.id];
              return (
                <div key={post.id} className="bg-card">
                  {/* Post header with 3-dot menu */}
                  <div className="flex items-center gap-3 px-4 pt-3 pb-2">
                    <button onClick={() => navigate(`/user/${post.user_id}`)}
                      className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-[hsl(var(--cyan))]/20 flex items-center justify-center border border-primary/20 overflow-hidden">
                      {post.user?.avatar_url ? <img src={post.user.avatar_url} className="w-full h-full object-cover" /> :
                        <span className="text-primary font-bold text-sm">{post.user?.display_name?.[0]?.toUpperCase() || "?"}</span>}
                    </button>
                    <div className="flex-1 min-w-0">
                      <button onClick={() => navigate(`/user/${post.user_id}`)} className="font-bold text-sm text-foreground hover:underline">
                        {post.user?.display_name || "User"}
                      </button>
                      <p className="text-[10px] text-muted-foreground">{timeAgo(post.created_at)}</p>
                    </div>
                    {/* 3-dot menu for all posts - Facebook Lite style */}
                    <div className="relative">
                      <button onClick={() => setShowPostMenu(showPostMenu === post.id ? null : post.id)}
                        className="p-2 rounded-full hover:bg-secondary transition-colors text-muted-foreground">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      <AnimatePresence>
                        {showPostMenu === post.id && (
                          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                            className="absolute right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden min-w-[160px]">
                            {post.user_id === user.id ? (
                              <button onClick={() => deletePostMutation.mutate(post.id)}
                                className="w-full flex items-center gap-2 px-4 py-3 text-destructive hover:bg-destructive/10 text-sm font-bold transition-colors">
                                <Trash2 className="w-4 h-4" /> পোস্ট মুছুন
                              </button>
                            ) : (
                              <>
                                <button onClick={() => { navigate(`/user/${post.user_id}`); setShowPostMenu(null); }}
                                  className="w-full flex items-center gap-2 px-4 py-3 text-foreground hover:bg-secondary text-sm transition-colors">
                                  <User className="w-4 h-4" /> প্রোফাইল দেখুন
                                </button>
                                <button onClick={() => { startChatWith(post.user_id); setShowPostMenu(null); }}
                                  className="w-full flex items-center gap-2 px-4 py-3 text-foreground hover:bg-secondary text-sm transition-colors">
                                  <MessageCircle className="w-4 h-4" /> মেসেজ পাঠান
                                </button>
                                <button onClick={() => { navigate(`/call/${post.user_id}`); setShowPostMenu(null); }}
                                  className="w-full flex items-center gap-2 px-4 py-3 text-foreground hover:bg-secondary text-sm transition-colors">
                                  <Phone className="w-4 h-4" /> কল করুন
                                </button>
                              </>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Content */}
                  {post.content && <p className="text-sm text-foreground leading-relaxed px-4 pb-2 whitespace-pre-wrap">{post.content}</p>}

                  {/* Image - clickable to zoom + double tap to love */}
                  {post.image_url && (
                    <div className="border-y border-border/20 relative cursor-pointer" onClick={() => handleDoubleTap(post.id)}>
                      <img src={post.image_url} alt="" className="w-full max-h-[400px] object-cover" onClick={(e) => {
                        // Single tap opens zoom after a delay
                      }} />
                      <button onClick={(e) => { e.stopPropagation(); setViewingImage(post.image_url); }}
                        className="absolute bottom-2 right-2 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white/80 hover:text-white">
                        <ZoomIn className="w-4 h-4" />
                      </button>
                      {/* Love animation on double tap */}
                      <AnimatePresence>
                        {showLoveAnimation === post.id && (
                          <motion.div
                            initial={{ scale: 0, opacity: 1 }}
                            animate={{ scale: 1.5, opacity: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.8 }}
                            className="absolute inset-0 flex items-center justify-center pointer-events-none"
                          >
                            <span className="text-7xl">❤️</span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Video */}
                  {post.video_url && (
                    <div className="border-y border-border/20">
                      <video src={post.video_url} controls className="w-full max-h-[400px]" />
                    </div>
                  )}

                  {/* Reaction summary */}
                  {post.likes_count > 0 && (
                    <div className="px-4 py-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="flex -space-x-0.5">
                        {myReaction ? REACTION_EMOJIS[myReaction] : "👍"}
                      </span>
                      <span>{post.likes_count}</span>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="px-4 py-1 border-t border-border/20 grid grid-cols-3 relative">
                    <div className="relative">
                      <motion.button whileTap={{ scale: 0.9 }}
                        onClick={() => reactionMutation.mutate({ postId: post.id, type: myReaction || "like" })}
                        onContextMenu={(e) => { e.preventDefault(); setShowReactionPicker(showReactionPicker === post.id ? null : post.id); }}
                        onTouchStart={() => {
                          const timer = setTimeout(() => setShowReactionPicker(showReactionPicker === post.id ? null : post.id), 500);
                          const cleanup = () => { clearTimeout(timer); document.removeEventListener("touchend", cleanup); };
                          document.addEventListener("touchend", cleanup);
                        }}
                        className={`flex items-center justify-center gap-1.5 py-2 w-full rounded-lg transition-colors ${
                          myReaction ? "text-[hsl(var(--pink))]" : "text-muted-foreground hover:bg-secondary/50"
                        }`}>
                        {myReaction ? (
                          <span className="text-base">{REACTION_EMOJIS[myReaction]}</span>
                        ) : (
                          <Heart className="w-4 h-4" />
                        )}
                        <span className="text-xs font-bold">{myReaction ? "" : "পছন্দ"}</span>
                      </motion.button>

                      <AnimatePresence>
                        {showReactionPicker === post.id && (
                          <motion.div initial={{ opacity: 0, scale: 0.8, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }}
                            className="absolute bottom-full left-0 mb-2 bg-card border border-border rounded-full shadow-xl px-2 py-1 flex gap-1 z-50">
                            {Object.entries(REACTION_EMOJIS).map(([type, emoji]) => (
                              <motion.button key={type} whileHover={{ scale: 1.4 }} whileTap={{ scale: 0.9 }}
                                onClick={() => reactionMutation.mutate({ postId: post.id, type })}
                                className={`text-xl p-1 rounded-full hover:bg-secondary transition-colors ${myReaction === type ? "bg-primary/20" : ""}`}
                                title={type}>
                                {emoji}
                              </motion.button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <button onClick={() => openComments(post.id)}
                      className="flex items-center justify-center gap-1.5 py-2 text-muted-foreground hover:bg-secondary/50 rounded-lg transition-colors">
                      <MessageCircle className="w-4 h-4" />
                      <span className="text-xs font-bold">মন্তব্য</span>
                      {post.comments_count > 0 && <span className="text-[10px]">({post.comments_count})</span>}
                    </button>

                    <button onClick={() => sharePost(post)}
                      className="flex items-center justify-center gap-1.5 py-2 text-muted-foreground hover:bg-secondary/50 rounded-lg transition-colors">
                      <Share2 className="w-4 h-4" />
                      <span className="text-xs font-bold">শেয়ার</span>
                    </button>
                  </div>

                  {/* Comments section */}
                  <AnimatePresence>
                    {commentingPostId === post.id && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="px-4 pb-3 pt-1 border-t border-border/20 space-y-2">
                          {loadingComments ? <p className="text-xs text-muted-foreground text-center py-2">লোড হচ্ছে...</p> :
                            comments.length === 0 ? <p className="text-xs text-muted-foreground text-center py-2">কোনো মন্তব্য নেই</p> : (
                              <div className="space-y-2 max-h-60 overflow-y-auto">
                                {comments.map((c) => (
                                  <div key={c.id} className="flex gap-2">
                                    <button onClick={() => navigate(`/user/${c.user_id}`)} className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0 overflow-hidden">
                                      {c.user?.avatar_url ? <img src={c.user.avatar_url} className="w-full h-full object-cover" /> :
                                        <span className="text-[10px] text-primary font-bold">{c.user?.display_name?.[0]?.toUpperCase() || "?"}</span>}
                                    </button>
                                    <div className="bg-secondary/60 rounded-2xl px-3 py-1.5 flex-1">
                                      <button onClick={() => navigate(`/user/${c.user_id}`)} className="text-xs font-bold text-foreground hover:underline">
                                        {c.user?.display_name || "User"}
                                      </button>
                                      <p className="text-xs text-foreground/80">{c.content}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          <div className="flex items-center gap-2">
                            <input value={commentText} onChange={(e) => setCommentText(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && commentText.trim() && commentMutation.mutate()}
                              placeholder="মন্তব্য করুন..."
                              className="flex-1 bg-secondary/50 text-foreground rounded-full px-4 py-2 text-xs border-none outline-none placeholder:text-muted-foreground" />
                            <button onClick={() => commentText.trim() && commentMutation.mutate()}
                              disabled={!commentText.trim() || commentMutation.isPending}
                              className="w-8 h-8 bg-primary rounded-full flex items-center justify-center disabled:opacity-50">
                              <Send className="w-3.5 h-3.5 text-primary-foreground" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
