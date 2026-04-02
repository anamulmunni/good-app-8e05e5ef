import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getOrCreateConversation } from "@/lib/chat-api";
import {
  toggleReaction, getUserReactions, getPostComments, addComment,
  REACTION_EMOJIS, type Post, type PostComment
} from "@/lib/feed-api";
import { sendFriendRequest, getFriendshipStatus } from "@/lib/friend-api";
import {
  ArrowLeft, User, MessageCircle, Heart, Send, Key, Calendar,
  Globe, MoreHorizontal, Share2, ThumbsUp, UserPlus, Phone, X
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import VerifiedBadge from "@/components/VerifiedBadge";

export default function UserProfile() {
  const { userId } = useParams<{ userId: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [userReactions, setUserReactions] = useState<Record<string, string>>({});
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const [showPostMenu, setShowPostMenu] = useState<string | null>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  const targetUserId = parseInt(userId || "0");

  useEffect(() => {
    if (!authLoading && !user) navigate("/");
  }, [user, authLoading, navigate]);

  const { data: targetUser, isLoading: userLoading } = useQuery({
    queryKey: ["user-profile", targetUserId],
    queryFn: async () => {
      const { data } = await supabase.from("users").select("*").eq("id", targetUserId).single();
      return data;
    },
    enabled: targetUserId > 0,
  });

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

  const { data: friendshipStatus } = useQuery({
    queryKey: ["friendship-status", user?.id, targetUserId],
    queryFn: () => getFriendshipStatus(user!.id, targetUserId),
    enabled: !!user && targetUserId > 0 && targetUserId !== user?.id,
  });

  useEffect(() => {
    if (user && posts.length > 0) {
      getUserReactions(user.id, posts.map((p: Post) => p.id)).then(setUserReactions);
    }
  }, [user, posts]);

  const reactionMutation = useMutation({
    mutationFn: async ({ postId, type }: { postId: string; type: string }) => {
      if (!user) throw new Error("Login");
      return toggleReaction(postId, user.id, type);
    },
    onSuccess: (result, { postId, type }) => {
      if (result) {
        setUserReactions(prev => ({ ...prev, [postId]: type }));
      } else {
        setUserReactions(prev => { const n = { ...prev }; delete n[postId]; return n; });
      }
      queryClient.invalidateQueries({ queryKey: ["user-posts", targetUserId] });
      setShowReactionPicker(null);
    },
  });

  const commentMutation = useMutation({
    mutationFn: async () => {
      if (!user || !commentingPostId) throw new Error("Error");
      return addComment(commentingPostId, user.id, commentText.trim());
    },
    onMutate: async () => {
      if (!user || !commentingPostId) return;
      const optimistic: PostComment = {
        id: `temp-${Date.now()}`, post_id: commentingPostId, user_id: user.id,
        content: commentText.trim(), created_at: new Date().toISOString(),
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

  const friendRequestMutation = useMutation({
    mutationFn: () => sendFriendRequest(user!.id, targetUserId),
    onSuccess: () => {
      toast({ title: "ফ্রেন্ড রিকুয়েস্ট পাঠানো হয়েছে!" });
      queryClient.invalidateQueries({ queryKey: ["friendship-status"] });
    },
    onError: () => toast({ title: "রিকুয়েস্ট পাঠানো যায়নি", variant: "destructive" }),
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

  const sharePost = async (post: Post) => {
    const text = post.content || "দেখুন এই পোস্টটি!";
    if (navigator.share) {
      try { await navigator.share({ title: "Good App", text, url: window.location.origin }); } catch {}
    } else {
      navigator.clipboard.writeText(`${text}\n${window.location.origin}`);
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

  if (authLoading || !user) return null;

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-background">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!targetUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 dark:bg-background gap-4">
        <p className="text-gray-500">ইউজার পাওয়া যায়নি</p>
        <button onClick={() => navigate(-1)} className="text-blue-600 font-bold">ফিরে যান</button>
      </div>
    );
  }

  const isOwnProfile = targetUser.id === user.id;
  const joinDate = targetUser.created_at ? new Date(targetUser.created_at).toLocaleDateString("bn-BD", { year: "numeric", month: "long", day: "numeric" }) : "—";

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-background pb-8">
      {/* FB Lite Header */}
      <header className="sticky top-0 z-50 bg-blue-600 shadow-md">
        <div className="max-w-lg mx-auto px-3 py-2.5 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-white">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-[17px] font-bold text-white truncate">{targetUser.display_name || "User"}</h1>
        </div>
      </header>

      {/* Cover Photo + Profile */}
      <div className="bg-white dark:bg-card">
        <div className="h-[150px] bg-gradient-to-br from-blue-400 to-blue-600 overflow-hidden relative cursor-pointer"
          onClick={() => (targetUser as any).cover_url && setViewingImage((targetUser as any).cover_url)}>
          {(targetUser as any).cover_url && (
            <img src={(targetUser as any).cover_url} alt="Cover" className="w-full h-full object-cover object-center" />
          )}
        </div>
        <div className="px-4 pb-4 pt-3">
          <button onClick={() => targetUser.avatar_url && setViewingImage(targetUser.avatar_url)}
            className="w-[100px] h-[100px] rounded-full overflow-hidden border-4 border-white dark:border-card bg-gray-200 flex items-center justify-center shadow-lg -mt-14">
            {targetUser.avatar_url ? (
              <img src={targetUser.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <User className="w-12 h-12 text-gray-400" />
            )}
          </button>
          <h2 className="text-[22px] font-black text-gray-900 dark:text-foreground mt-2 inline-flex items-center gap-1.5">
            <span>{targetUser.display_name || "User"}</span>
            {targetUser.is_verified_badge && <VerifiedBadge className="h-5 w-5" />}
          </h2>
          <p className="text-[13px] text-gray-500 dark:text-muted-foreground">{targetUser.guest_id}</p>

          {/* Stats row */}
          <div className="flex items-center gap-4 mt-3 text-[13px] text-gray-500">
            <div className="flex items-center gap-1">
              <Key className="w-3.5 h-3.5 text-blue-600" />
              <span className="font-bold text-gray-900 dark:text-foreground">{targetUser.key_count || 0}</span> ভেরিফাইড
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <span>{joinDate}</span>
            </div>
          </div>

          {/* Action Buttons */}
          {!isOwnProfile ? (
            <div className="flex gap-2 mt-3">
              {friendshipStatus?.status === "accepted" ? (
                <button className="flex-1 py-2 bg-gray-200 dark:bg-secondary text-gray-700 dark:text-foreground rounded-md text-[13px] font-semibold flex items-center justify-center gap-1.5">
                  <UserPlus className="w-4 h-4" /> বন্ধু
                </button>
              ) : friendshipStatus?.status === "pending" ? (
                <button className="flex-1 py-2 bg-gray-200 dark:bg-secondary text-gray-600 rounded-md text-[13px] font-semibold">
                  রিকুয়েস্ট পাঠানো হয়েছে
                </button>
              ) : (
                <button onClick={() => friendRequestMutation.mutate()}
                  disabled={friendRequestMutation.isPending}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-md text-[13px] font-semibold flex items-center justify-center gap-1.5">
                  <UserPlus className="w-4 h-4" /> Add friend
                </button>
              )}
              <button onClick={startChat}
                className="flex-1 py-2 bg-gray-200 dark:bg-secondary text-gray-700 dark:text-foreground rounded-md text-[13px] font-semibold flex items-center justify-center gap-1.5">
                <MessageCircle className="w-4 h-4" /> Message
              </button>
            </div>
          ) : (
            <button onClick={() => navigate("/profile")}
              className="w-full mt-3 py-2 bg-gray-200 dark:bg-secondary text-gray-700 dark:text-foreground rounded-md text-[13px] font-semibold">
              প্রোফাইল এডিট করুন
            </button>
          )}
        </div>
      </div>

      {/* Posts Section - Facebook Lite News Feed Style */}
      <div className="mt-2">
        <div className="bg-white dark:bg-card px-3 py-2.5 border-b border-gray-200 dark:border-border/30">
          <h3 className="text-[15px] font-bold text-gray-900 dark:text-foreground">পোস্টসমূহ</h3>
        </div>

        {postsLoading ? (
          <div className="flex justify-center py-10 bg-white dark:bg-card">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-10 text-gray-500 bg-white dark:bg-card">
            <p className="text-sm">কোনো পোস্ট নেই</p>
          </div>
        ) : (
          <div className="space-y-2">
            {posts.map((post: Post) => {
              const myReaction = userReactions[post.id];
              return (
                <div key={post.id} className="bg-white dark:bg-card">
                  {/* Post header */}
                  <div className="flex items-center gap-2.5 px-3 pt-3 pb-1.5">
                    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                      {post.user?.avatar_url ? <img src={post.user.avatar_url} className="w-full h-full object-cover" /> :
                        <span className="text-blue-600 font-bold text-sm">{post.user?.display_name?.[0]?.toUpperCase() || "?"}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-[14px] text-gray-900 dark:text-foreground">
                        {post.user?.display_name || "User"}
                      </p>
                      <div className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-muted-foreground">
                        <span>{timeAgo(post.created_at)}</span>
                        <span>·</span>
                        <Globe className="w-3 h-3" />
                      </div>
                    </div>
                    <button onClick={() => setShowPostMenu(showPostMenu === post.id ? null : post.id)}
                      className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-secondary text-gray-500">
                      <MoreHorizontal className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Post menu */}
                  <AnimatePresence>
                    {showPostMenu === post.id && (
                      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                        className="mx-3 mb-2 bg-white dark:bg-card border border-gray-200 dark:border-border rounded-lg shadow-xl z-50 overflow-hidden">
                        {!isOwnProfile && (
                          <>
                            <button onClick={() => { startChat(); setShowPostMenu(null); }}
                              className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-secondary text-sm">
                              <MessageCircle className="w-4 h-4" /> মেসেজ পাঠান
                            </button>
                            <button onClick={() => { navigate(`/call/${post.user_id}`); setShowPostMenu(null); }}
                              className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-secondary text-sm">
                              <Phone className="w-4 h-4" /> কল করুন
                            </button>
                          </>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Post content */}
                  {post.content && (
                    <p className="text-[15px] text-gray-900 dark:text-foreground leading-relaxed px-3 pb-2 whitespace-pre-wrap">{post.content}</p>
                  )}

                  {/* Image */}
                  {post.image_url && (() => {
                    const imageUrls = post.image_url!.split(",").map(u => u.trim()).filter(Boolean);
                    return (
                      <div className={imageUrls.length === 1 ? "" : "grid grid-cols-2 gap-0.5"}>
                        {imageUrls.map((url, imgIdx) => (
                          <button key={imgIdx} onClick={() => setViewingImage(url)} className="block w-full">
                            <img src={url} alt="" className={`w-full object-cover ${imageUrls.length === 1 ? 'max-h-[500px]' : 'max-h-[250px]'}`} />
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                  )}

                  {/* Video */}
                  {post.video_url && (
                    <div className="bg-black">
                      <video src={post.video_url} controls playsInline preload="metadata" className="w-full max-h-[500px] object-contain" />
                    </div>
                  )}

                  {/* Reaction summary */}
                  {(post.likes_count > 0 || post.comments_count > 0) && (
                    <div className="px-3 py-1.5 flex items-center justify-between text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        {post.likes_count > 0 && (
                          <>
                            <span className="w-[18px] h-[18px] rounded-full bg-blue-600 flex items-center justify-center text-[10px]">👍</span>
                            <span>{post.likes_count}</span>
                          </>
                        )}
                      </div>
                      {post.comments_count > 0 && (
                        <button onClick={() => openComments(post.id)} className="hover:underline">
                          {post.comments_count} মন্তব্য
                        </button>
                      )}
                    </div>
                  )}

                  {/* Action buttons - FB Lite style */}
                  <div className="px-3 py-0.5 border-t border-gray-200 dark:border-border/20 grid grid-cols-3">
                    <div className="relative">
                      <button
                        onClick={() => reactionMutation.mutate({ postId: post.id, type: myReaction || "like" })}
                        onContextMenu={(e) => { e.preventDefault(); setShowReactionPicker(showReactionPicker === post.id ? null : post.id); }}
                        onTouchStart={() => {
                          const timer = setTimeout(() => setShowReactionPicker(showReactionPicker === post.id ? null : post.id), 500);
                          const cleanup = () => { clearTimeout(timer); document.removeEventListener("touchend", cleanup); };
                          document.addEventListener("touchend", cleanup);
                        }}
                        className={`flex items-center justify-center gap-1.5 py-2.5 w-full rounded-lg ${
                          myReaction ? "text-blue-600" : "text-gray-600 dark:text-muted-foreground"
                        }`}>
                        {myReaction ? (
                          <span className="text-lg">{REACTION_EMOJIS[myReaction]}</span>
                        ) : (
                          <ThumbsUp className="w-[18px] h-[18px]" />
                        )}
                        <span className="text-xs font-semibold">{post.likes_count > 0 ? post.likes_count : "পছন্দ"}</span>
                      </button>

                      <AnimatePresence>
                        {showReactionPicker === post.id && (
                          <motion.div initial={{ opacity: 0, scale: 0.8, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }}
                            className="absolute bottom-full left-0 mb-2 bg-white dark:bg-card border border-gray-200 dark:border-border rounded-full shadow-xl px-2 py-1.5 flex gap-0.5 z-50">
                            {Object.entries(REACTION_EMOJIS).map(([type, emoji]) => (
                              <motion.button key={type} whileHover={{ scale: 1.4 }} whileTap={{ scale: 0.9 }}
                                onClick={() => reactionMutation.mutate({ postId: post.id, type })}
                                className={`text-2xl p-1 rounded-full hover:bg-gray-100 ${myReaction === type ? "bg-blue-50" : ""}`}>
                                {emoji}
                              </motion.button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <button onClick={() => openComments(post.id)}
                      className="flex items-center justify-center gap-1.5 py-2.5 text-gray-600 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-secondary/50 rounded-lg">
                      <MessageCircle className="w-[18px] h-[18px]" />
                      <span className="text-xs font-semibold">মন্তব্য {post.comments_count > 0 ? `(${post.comments_count})` : ""}</span>
                    </button>

                    <button onClick={() => sharePost(post)}
                      className="flex items-center justify-center gap-1.5 py-2.5 text-gray-600 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-secondary/50 rounded-lg">
                      <Share2 className="w-[18px] h-[18px]" />
                      <span className="text-xs font-semibold">শেয়ার</span>
                    </button>
                  </div>

                  {/* Comments */}
                  <AnimatePresence>
                    {commentingPostId === post.id && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="px-3 pb-3 pt-1 border-t border-gray-200 dark:border-border/20 space-y-2">
                          {loadingComments ? <p className="text-xs text-gray-500 text-center py-2">লোড হচ্ছে...</p> :
                            comments.length === 0 ? <p className="text-xs text-gray-500 text-center py-2">কোনো মন্তব্য নেই</p> : (
                              <div className="space-y-2.5 max-h-72 overflow-y-auto">
                                {comments.map((c) => (
                                  <div key={c.id} className="flex gap-2">
                                    <button onClick={() => navigate(`/user/${c.user_id}`)}
                                      className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0 overflow-hidden">
                                      {c.user?.avatar_url ? <img src={c.user.avatar_url} className="w-full h-full object-cover" /> :
                                        <span className="text-[10px] text-blue-600 font-bold">{c.user?.display_name?.[0]?.toUpperCase() || "?"}</span>}
                                    </button>
                                    <div className="bg-gray-100 dark:bg-secondary rounded-2xl px-3 py-2 flex-1">
                                      <button onClick={() => navigate(`/user/${c.user_id}`)} className="text-xs font-bold text-gray-900 dark:text-foreground hover:underline block">
                                        {c.user?.display_name || "User"}
                                      </button>
                                      <p className="text-[13px] text-gray-800 dark:text-foreground/90 mt-0.5 break-words">{c.content}</p>
                                      <p className="text-[10px] text-gray-500 mt-1">{timeAgo(c.created_at)}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          <div className="flex items-center gap-2">
                            <input value={commentText} onChange={(e) => setCommentText(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && commentText.trim() && commentMutation.mutate()}
                              placeholder="মন্তব্য লিখুন..."
                              className="flex-1 bg-gray-100 dark:bg-secondary text-gray-900 dark:text-foreground rounded-full px-4 py-2 text-sm border-none outline-none placeholder:text-gray-400" />
                            <button onClick={() => commentText.trim() && commentMutation.mutate()}
                              disabled={!commentText.trim() || commentMutation.isPending}
                              className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center disabled:opacity-40">
                              <Send className="w-3.5 h-3.5 text-white" />
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
