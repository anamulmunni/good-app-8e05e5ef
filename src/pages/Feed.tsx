import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  getFeedPosts, createPost, toggleLike, getUserLikes,
  getPostComments, addComment, uploadPostMedia,
  type Post, type PostComment
} from "@/lib/feed-api";
import {
  Heart, MessageCircle, Send, Image, X, ArrowLeft,
  Plus, User
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { getOrCreateConversation } from "@/lib/chat-api";

export default function Feed() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [postContent, setPostContent] = useState("");
  const [postImageFile, setPostImageFile] = useState<File | null>(null);
  const [postImagePreview, setPostImagePreview] = useState<string | null>(null);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoading && !user) navigate("/");
  }, [user, isLoading, navigate]);

  const { data: posts = [], isLoading: postsLoading } = useQuery({
    queryKey: ["feed-posts"],
    queryFn: () => getFeedPosts(),
    enabled: !!user,
  });

  useEffect(() => {
    if (user && posts.length > 0) {
      getUserLikes(user.id, posts.map(p => p.id)).then(setLikedPosts);
    }
  }, [user, posts]);

  useEffect(() => {
    const channel = supabase
      .channel("feed-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => {
        queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const createPostMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Login required");
      let imageUrl: string | undefined;
      if (postImageFile) {
        imageUrl = await uploadPostMedia(postImageFile, postImageFile.name);
      }
      return createPost(user.id, postContent, imageUrl);
    },
    onSuccess: () => {
      setPostContent("");
      setPostImageFile(null);
      setPostImagePreview(null);
      setShowCreatePost(false);
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
      toast({ title: "পোস্ট প্রকাশিত হয়েছে! 🎉" });
    },
    onError: (e: Error) => toast({ title: "পোস্ট করা যায়নি", description: e.message, variant: "destructive" }),
  });

  // Optimistic like
  const likeMutation = useMutation({
    mutationFn: async (postId: string) => {
      if (!user) throw new Error("Login");
      return { postId, liked: await toggleLike(postId, user.id) };
    },
    onMutate: async (postId: string) => {
      await queryClient.cancelQueries({ queryKey: ["feed-posts"] });
      const prev = queryClient.getQueryData<Post[]>(["feed-posts"]);
      const wasLiked = likedPosts.has(postId);

      // Optimistic update
      setLikedPosts(p => {
        const next = new Set(p);
        wasLiked ? next.delete(postId) : next.add(postId);
        return next;
      });
      queryClient.setQueryData<Post[]>(["feed-posts"], old =>
        (old || []).map(p => p.id === postId
          ? { ...p, likes_count: p.likes_count + (wasLiked ? -1 : 1) }
          : p
        )
      );
      return { prev, wasLiked };
    },
    onError: (_err, postId, context) => {
      if (context?.prev) queryClient.setQueryData(["feed-posts"], context.prev);
      setLikedPosts(p => {
        const next = new Set(p);
        context?.wasLiked ? next.add(postId) : next.delete(postId);
        return next;
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
    },
  });

  // Optimistic comment
  const commentMutation = useMutation({
    mutationFn: async () => {
      if (!user || !commentingPostId) throw new Error("Error");
      return addComment(commentingPostId, user.id, commentText.trim());
    },
    onMutate: async () => {
      if (!user || !commentingPostId) return;
      const optimisticComment: PostComment = {
        id: `temp-${Date.now()}`,
        post_id: commentingPostId,
        user_id: user.id,
        content: commentText.trim(),
        created_at: new Date().toISOString(),
        user: { display_name: user.display_name, avatar_url: user.avatar_url, guest_id: user.guest_id },
      };
      setComments(prev => [...prev, optimisticComment]);
      // Optimistic count update
      queryClient.setQueryData<Post[]>(["feed-posts"], old =>
        (old || []).map(p => p.id === commentingPostId
          ? { ...p, comments_count: p.comments_count + 1 }
          : p
        )
      );
      const savedText = commentText;
      setCommentText("");
      return { savedText };
    },
    onSuccess: () => {
      if (commentingPostId) loadComments(commentingPostId);
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
    },
    onError: (_err, _vars, context) => {
      if (context?.savedText) setCommentText(context.savedText);
    },
  });

  const loadComments = async (postId: string) => {
    setLoadingComments(true);
    const data = await getPostComments(postId);
    setComments(data);
    setLoadingComments(false);
  };

  const openComments = (postId: string) => {
    if (commentingPostId === postId) {
      setCommentingPostId(null);
      return;
    }
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

  const startChatWith = async (targetUserId: number) => {
    if (!user || targetUserId === user.id) return;
    try {
      await getOrCreateConversation(user.id, targetUserId);
      navigate("/chat");
    } catch {}
  };

  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "এইমাত্র";
    if (mins < 60) return `${mins} মিনিট আগে`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} ঘণ্টা আগে`;
    const days = Math.floor(hrs / 24);
    return `${days} দিন আগে`;
  };

  if (isLoading || !user) return null;

  return (
    <div className="min-h-screen bg-background pb-4">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border/50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft size={22} />
            </button>
            <h1 className="text-xl font-black bg-gradient-to-r from-primary to-[hsl(var(--cyan))] bg-clip-text text-transparent">
              ফিড
            </h1>
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowCreatePost(true)}
            className="w-10 h-10 bg-gradient-to-br from-primary to-[hsl(var(--cyan))] rounded-xl flex items-center justify-center shadow-lg shadow-primary/30"
          >
            <Plus className="w-5 h-5 text-primary-foreground" />
          </motion.button>
        </div>
      </header>

      {/* Create Post Modal */}
      <AnimatePresence>
        {showCreatePost && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm"
          >
            <div className="max-w-lg mx-auto px-4 pt-4">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => { setShowCreatePost(false); setPostImageFile(null); setPostImagePreview(null); setPostContent(""); }}>
                  <X className="w-6 h-6 text-muted-foreground" />
                </button>
                <h2 className="font-bold text-lg">নতুন পোস্ট</h2>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => createPostMutation.mutate()}
                  disabled={createPostMutation.isPending || (!postContent.trim() && !postImageFile)}
                  className="px-5 py-2 bg-primary text-primary-foreground rounded-full text-sm font-bold disabled:opacity-50"
                >
                  {createPostMutation.isPending ? "..." : "পোস্ট"}
                </motion.button>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-[hsl(var(--cyan))]/20 flex items-center justify-center border border-primary/20 overflow-hidden shrink-0">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-5 h-5 text-primary" />
                  )}
                </div>
                <textarea
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  placeholder="কি মনে হচ্ছে? শেয়ার করুন..."
                  className="flex-1 bg-transparent text-foreground text-base resize-none border-none outline-none placeholder:text-muted-foreground min-h-[120px]"
                  autoFocus
                />
              </div>

              {postImagePreview && (
                <div className="mt-4 relative">
                  <img src={postImagePreview} alt="" className="w-full rounded-2xl max-h-60 object-cover" />
                  <button
                    onClick={() => { setPostImageFile(null); setPostImagePreview(null); }}
                    className="absolute top-2 right-2 w-8 h-8 bg-background/80 rounded-full flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="mt-4 flex items-center gap-3 border-t border-border/50 pt-4">
                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 text-primary hover:bg-primary/10 px-3 py-2 rounded-xl transition-colors">
                  <Image className="w-5 h-5" />
                  <span className="text-sm font-medium">ছবি</span>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Posts Feed */}
      <div className="max-w-lg mx-auto">
        {postsLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-muted-foreground">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <MessageCircle className="w-10 h-10 text-primary/40" />
            </div>
            <p className="font-bold">কোনো পোস্ট নেই</p>
            <p className="text-sm mt-1">প্রথম পোস্ট করুন! ✨</p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {posts.map((post) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="px-4 py-4"
              >
                {/* Post header */}
                <div className="flex items-center gap-3 mb-3">
                  <button
                    onClick={() => navigate(`/user/${post.user_id}`)}
                    className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-[hsl(var(--cyan))]/20 flex items-center justify-center border border-primary/20 overflow-hidden"
                  >
                    {post.user?.avatar_url ? (
                      <img src={post.user.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-primary font-bold text-sm">
                        {post.user?.display_name?.[0]?.toUpperCase() || "?"}
                      </span>
                    )}
                  </button>
                  <div className="flex-1">
                    <button onClick={() => navigate(`/user/${post.user_id}`)} className="font-bold text-sm text-foreground hover:underline text-left">
                      {post.user?.display_name || "User"}
                    </button>
                    <p className="text-[10px] text-muted-foreground">{timeAgo(post.created_at)}</p>
                  </div>
                  {post.user_id !== user.id && (
                    <button
                      onClick={() => startChatWith(post.user_id)}
                      className="text-xs text-primary bg-primary/10 px-3 py-1.5 rounded-full font-bold hover:bg-primary/20 transition-colors"
                    >
                      মেসেজ
                    </button>
                  )}
                </div>

                {/* Post content */}
                {post.content && (
                  <p className="text-sm text-foreground leading-relaxed mb-3 whitespace-pre-wrap">{post.content}</p>
                )}

                {/* Post image */}
                {post.image_url && (
                  <div className="mb-3 rounded-2xl overflow-hidden border border-border/30">
                    <img src={post.image_url} alt="" className="w-full max-h-80 object-cover" />
                  </div>
                )}

                {/* Post video */}
                {post.video_url && (
                  <div className="mb-3 rounded-2xl overflow-hidden border border-border/30">
                    <video src={post.video_url} controls className="w-full max-h-80" />
                  </div>
                )}

                {/* Like / Comment bar */}
                <div className="flex items-center gap-6 pt-1">
                  <motion.button
                    whileTap={{ scale: 1.3 }}
                    onClick={() => likeMutation.mutate(post.id)}
                    className="flex items-center gap-1.5 group"
                  >
                    <Heart
                      className={`w-5 h-5 transition-colors ${
                        likedPosts.has(post.id) ? "fill-[hsl(var(--pink))] text-[hsl(var(--pink))]" : "text-muted-foreground group-hover:text-[hsl(var(--pink))]"
                      }`}
                    />
                    <span className={`text-xs font-bold ${likedPosts.has(post.id) ? "text-[hsl(var(--pink))]" : "text-muted-foreground"}`}>
                      {post.likes_count || ""}
                    </span>
                  </motion.button>

                  <button onClick={() => openComments(post.id)} className="flex items-center gap-1.5 text-muted-foreground hover:text-[hsl(var(--cyan))] transition-colors">
                    <MessageCircle className="w-5 h-5" />
                    <span className="text-xs font-bold">{post.comments_count || ""}</span>
                  </button>
                </div>

                {/* Comments section */}
                <AnimatePresence>
                  {commentingPostId === post.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 pt-3 border-t border-border/30 space-y-3">
                        {loadingComments ? (
                          <p className="text-xs text-muted-foreground text-center py-2">লোড হচ্ছে...</p>
                        ) : comments.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-2">কোনো কমেন্ট নেই</p>
                        ) : (
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {comments.map((c) => (
                              <div key={c.id} className="flex gap-2">
                                <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                                  <span className="text-[10px] text-primary font-bold">
                                    {c.user?.display_name?.[0]?.toUpperCase() || "?"}
                                  </span>
                                </div>
                                <div className="bg-secondary/60 rounded-xl px-3 py-1.5 flex-1">
                                  <p className="text-xs font-bold text-foreground">{c.user?.display_name || "User"}</p>
                                  <p className="text-xs text-foreground/80">{c.content}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Comment input */}
                        <div className="flex items-center gap-2">
                          <input
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && commentText.trim() && commentMutation.mutate()}
                            placeholder="কমেন্ট করুন..."
                            className="flex-1 bg-secondary/50 text-foreground rounded-full px-4 py-2 text-xs border-none outline-none placeholder:text-muted-foreground"
                          />
                          <button
                            onClick={() => commentText.trim() && commentMutation.mutate()}
                            disabled={!commentText.trim() || commentMutation.isPending}
                            className="w-8 h-8 bg-primary rounded-full flex items-center justify-center disabled:opacity-50"
                          >
                            <Send className="w-3.5 h-3.5 text-primary-foreground" />
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
