import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getOrCreateConversation } from "@/lib/chat-api";
import { toggleLike, getUserLikes, getPostComments, addComment, type Post, type PostComment } from "@/lib/feed-api";
import { ArrowLeft, User, MessageCircle, Heart, Send, Key, Calendar } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

export default function UserProfile() {
  const { userId } = useParams<{ userId: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  const targetUserId = parseInt(userId || "0");

  useEffect(() => {
    if (!authLoading && !user) navigate("/");
  }, [user, authLoading, navigate]);

  // Fetch target user
  const { data: targetUser, isLoading: userLoading } = useQuery({
    queryKey: ["user-profile", targetUserId],
    queryFn: async () => {
      const { data } = await supabase.from("users").select("*").eq("id", targetUserId).single();
      return data;
    },
    enabled: targetUserId > 0,
  });

  // Fetch user's posts
  const { data: posts = [], isLoading: postsLoading } = useQuery({
    queryKey: ["user-posts", targetUserId],
    queryFn: async () => {
      const { data } = await (supabase.from("posts").select("*") as any)
        .eq("user_id", targetUserId)
        .order("created_at", { ascending: false });
      return (data || []).map((p: any) => ({
        ...p,
        user: targetUser ? { display_name: targetUser.display_name, avatar_url: targetUser.avatar_url, guest_id: targetUser.guest_id } : null,
      }));
    },
    enabled: !!targetUser,
  });

  useEffect(() => {
    if (user && posts.length > 0) {
      getUserLikes(user.id, posts.map((p: Post) => p.id)).then(setLikedPosts);
    }
  }, [user, posts]);

  const likeMutation = useMutation({
    mutationFn: async (postId: string) => {
      if (!user) throw new Error("Login");
      return { postId, liked: await toggleLike(postId, user.id) };
    },
    onMutate: async (postId: string) => {
      const wasLiked = likedPosts.has(postId);
      setLikedPosts(p => {
        const next = new Set(p);
        wasLiked ? next.delete(postId) : next.add(postId);
        return next;
      });
      queryClient.setQueryData<Post[]>(["user-posts", targetUserId], old =>
        (old || []).map(p => p.id === postId ? { ...p, likes_count: p.likes_count + (wasLiked ? -1 : 1) } : p)
      );
      return { wasLiked };
    },
    onError: (_err, postId, context) => {
      setLikedPosts(p => {
        const next = new Set(p);
        context?.wasLiked ? next.add(postId) : next.delete(postId);
        return next;
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["user-posts", targetUserId] }),
  });

  const commentMutation = useMutation({
    mutationFn: async () => {
      if (!user || !commentingPostId) throw new Error("Error");
      return addComment(commentingPostId, user.id, commentText.trim());
    },
    onMutate: async () => {
      if (!user || !commentingPostId) return;
      const optimistic: PostComment = {
        id: `temp-${Date.now()}`,
        post_id: commentingPostId,
        user_id: user.id,
        content: commentText.trim(),
        created_at: new Date().toISOString(),
        user: { display_name: user.display_name, avatar_url: user.avatar_url, guest_id: user.guest_id },
      };
      setComments(prev => [...prev, optimistic]);
      setCommentText("");
    },
    onSuccess: () => {
      if (commentingPostId) loadComments(commentingPostId);
      queryClient.invalidateQueries({ queryKey: ["user-posts", targetUserId] });
    },
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

  const startChat = async () => {
    if (!user || !targetUser || targetUser.id === user.id) return;
    try {
      await getOrCreateConversation(user.id, targetUser.id);
      navigate("/chat");
    } catch {}
  };

  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "এইমাত্র";
    if (mins < 60) return `${mins} মি. আগে`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} ঘ. আগে`;
    return `${Math.floor(hrs / 24)} দি. আগে`;
  };

  if (authLoading || !user) return null;

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!targetUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <p className="text-muted-foreground">ইউজার পাওয়া যায়নি</p>
        <button onClick={() => navigate(-1)} className="text-primary font-bold">ফিরে যান</button>
      </div>
    );
  }

  const isOwnProfile = targetUser.id === user.id;
  const joinDate = targetUser.created_at ? new Date(targetUser.created_at).toLocaleDateString("bn-BD", { year: "numeric", month: "long", day: "numeric" }) : "—";

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border/50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-lg font-bold truncate">{targetUser.display_name || "User"}</h1>
        </div>
      </header>

      {/* Profile Card */}
      <div className="max-w-lg mx-auto px-4 pt-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-3xl overflow-hidden mb-6">
          <div className="h-28 bg-gradient-to-br from-primary/30 via-[hsl(var(--purple))]/20 to-[hsl(var(--cyan))]/20 overflow-hidden">
            {(targetUser as any).cover_url && (
              <img src={(targetUser as any).cover_url} alt="Cover" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="px-6 pb-6 -mt-10 text-center">
            <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-background bg-secondary flex items-center justify-center mx-auto mb-3 shadow-xl">
              {targetUser.avatar_url ? (
                <img src={targetUser.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <User className="w-10 h-10 text-muted-foreground" />
              )}
            </div>
            <h2 className="text-xl font-black mb-1">{targetUser.display_name || "User"}</h2>
            <p className="text-xs text-muted-foreground font-mono mb-4">{targetUser.guest_id}</p>

            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="text-center">
                <div className="flex items-center gap-1 justify-center">
                  <Key className="w-3.5 h-3.5 text-primary" />
                  <span className="text-lg font-black text-primary">{targetUser.key_count || 0}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">ভেরিফাইড</p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div className="text-center">
                <div className="flex items-center gap-1 justify-center">
                  <Calendar className="w-3.5 h-3.5 text-[hsl(var(--cyan))]" />
                  <span className="text-xs font-bold">{joinDate}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">জয়েন</p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div className="text-center">
                <span className="text-lg font-black text-[hsl(var(--amber))]">{posts.length}</span>
                <p className="text-[10px] text-muted-foreground">পোস্ট</p>
              </div>
            </div>

            {!isOwnProfile && (
              <button
                onClick={startChat}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-bold text-sm flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4" /> মেসেজ পাঠান
              </button>
            )}
            {isOwnProfile && (
              <button
                onClick={() => navigate("/profile")}
                className="w-full py-2.5 bg-secondary text-foreground rounded-xl font-bold text-sm"
              >
                প্রোফাইল এডিট করুন
              </button>
            )}
          </div>
        </motion.div>

        {/* Posts */}
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 px-1">পোস্টসমূহ</h3>

        {postsLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <p className="text-sm">কোনো পোস্ট নেই</p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post: Post) => (
              <motion.div key={post.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card rounded-2xl p-4">
                {post.content && <p className="text-sm text-foreground leading-relaxed mb-3 whitespace-pre-wrap">{post.content}</p>}
                {post.image_url && (
                  <div className="mb-3 rounded-xl overflow-hidden border border-border/30">
                    <img src={post.image_url} alt="" className="w-full max-h-80 object-cover" />
                  </div>
                )}
                {post.video_url && (
                  <div className="mb-3 rounded-xl overflow-hidden border border-border/30">
                    <video src={post.video_url} controls className="w-full max-h-80" />
                  </div>
                )}

                <div className="flex items-center justify-between text-muted-foreground text-xs pt-1">
                  <div className="flex items-center gap-4">
                    <motion.button whileTap={{ scale: 1.3 }} onClick={() => likeMutation.mutate(post.id)} className="flex items-center gap-1">
                      <Heart className={`w-4 h-4 ${likedPosts.has(post.id) ? "fill-[hsl(var(--pink))] text-[hsl(var(--pink))]" : ""}`} />
                      <span className={likedPosts.has(post.id) ? "text-[hsl(var(--pink))] font-bold" : ""}>{post.likes_count || ""}</span>
                    </motion.button>
                    <button onClick={() => openComments(post.id)} className="flex items-center gap-1 hover:text-[hsl(var(--cyan))]">
                      <MessageCircle className="w-4 h-4" />
                      <span>{post.comments_count || ""}</span>
                    </button>
                  </div>
                  <span>{timeAgo(post.created_at)}</span>
                </div>

                {/* Comments */}
                <AnimatePresence>
                  {commentingPostId === post.id && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="mt-3 pt-3 border-t border-border/30 space-y-2">
                        {loadingComments ? (
                          <p className="text-xs text-muted-foreground text-center py-2">লোড হচ্ছে...</p>
                        ) : comments.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-2">কোনো কমেন্ট নেই</p>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {comments.map((c) => (
                              <div key={c.id} className="flex gap-2">
                                <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                                  <span className="text-[9px] text-primary font-bold">{c.user?.display_name?.[0]?.toUpperCase() || "?"}</span>
                                </div>
                                <div className="bg-secondary/60 rounded-xl px-3 py-1.5 flex-1">
                                  <p className="text-[10px] font-bold text-foreground">{c.user?.display_name || "User"}</p>
                                  <p className="text-xs text-foreground/80">{c.content}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <input value={commentText} onChange={(e) => setCommentText(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && commentText.trim() && commentMutation.mutate()}
                            placeholder="কমেন্ট করুন..." className="flex-1 bg-secondary/50 text-foreground rounded-full px-3 py-1.5 text-xs border-none outline-none placeholder:text-muted-foreground" />
                          <button onClick={() => commentText.trim() && commentMutation.mutate()}
                            disabled={!commentText.trim() || commentMutation.isPending}
                            className="w-7 h-7 bg-primary rounded-full flex items-center justify-center disabled:opacity-50">
                            <Send className="w-3 h-3 text-primary-foreground" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
