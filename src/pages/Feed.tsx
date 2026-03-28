import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  getFeedPosts, createPost, toggleReaction, getUserReactions,
  getPostComments, addComment, uploadPostMedia, getActiveStories,
  createStory, uploadStoryMedia, searchFeedUsers,
  deletePost, deleteStory,
  REACTION_EMOJIS, type Post, type PostComment, type Story
} from "@/lib/feed-api";
import {
  deleteComment, toggleCommentLike, getUnreadNotificationCount,
  getNotifications, markNotificationsRead, getNewReelsCount, markReelsSeen
} from "@/lib/feed-api";
import { getOrCreateConversation, getUnreadCount } from "@/lib/chat-api";
import { getSuggestedPeople, sendFriendRequest, getReceivedRequests, acceptFriendRequest, rejectFriendRequest, getFriendRequestCount, getAllUsersWithStatus } from "@/lib/friend-api";
import { getOnlineUsers } from "@/hooks/use-online";
import {
  Heart, MessageCircle, Send, Image, X, Home, Users, Bell, Menu,
  Plus, User, Search, Phone, Share2, Loader2, MoreHorizontal, Trash2, Play, Globe, UserPlus, ChevronRight, ThumbsUp, Video, Check
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import StoryEditor from "@/components/StoryEditor";
import StoryViewer from "@/components/StoryViewer";

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
  const [activeTab, setActiveTab] = useState<"home" | "friends" | "chat" | "reels" | "notif">("home");
  const [showFriendRequests, setShowFriendRequests] = useState(false);
  const [hiddenPosts, setHiddenPosts] = useState<Set<string>>(new Set());
  const [storyEditorFile, setStoryEditorFile] = useState<File | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [page, setPage] = useState(1);
  const POSTS_PER_PAGE = 50;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const storyInputRef = useRef<HTMLInputElement>(null);
  const tapTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const sentinelRef = useRef<HTMLDivElement>(null);
  const feedVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  useEffect(() => {
    if (!isLoading && !user) navigate("/");
  }, [user, isLoading, navigate]);

  // Unlimited posts
  const { data: allPosts = [], isLoading: postsLoading } = useQuery({
    queryKey: ["feed-posts", searchQuery],
    queryFn: () => getFeedPosts(100000, searchQuery),
    enabled: !!user,
  });

  // Paginated display
  const posts = allPosts.filter(p => !hiddenPosts.has(p.id)).slice(0, page * POSTS_PER_PAGE);
  const hasMore = posts.length < allPosts.filter(p => !hiddenPosts.has(p.id)).length;

  // Infinite scroll observer
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setPage(p => p + 1);
    }, { threshold: 0.1 });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, posts.length]);

  const { data: stories = [] } = useQuery({
    queryKey: ["stories"],
    queryFn: getActiveStories,
    enabled: !!user,
  });

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["unread-count"],
    queryFn: () => getUnreadCount(user!.id),
    enabled: !!user,
    refetchInterval: 10000,
  });

  const { data: friendRequestCount = 0 } = useQuery({
    queryKey: ["friend-request-count"],
    queryFn: () => getFriendRequestCount(user!.id),
    enabled: !!user,
    refetchInterval: 15000,
  });

  const { data: notifCount = 0 } = useQuery({
    queryKey: ["notif-count", user?.id],
    queryFn: () => getUnreadNotificationCount(user!.id),
    enabled: !!user,
    refetchInterval: 10000,
  });

  const { data: newReelsCount = 0 } = useQuery({
    queryKey: ["new-reels-count", user?.id],
    queryFn: () => getNewReelsCount(user!.id),
    enabled: !!user,
    refetchInterval: 30000,
  });

  const { data: notificationsList = [] } = useQuery({
    queryKey: ["notifications-list", user?.id],
    queryFn: () => getNotifications(user!.id),
    enabled: !!user && activeTab === "notif",
  });

  const { data: mentionResults = [] } = useQuery({
    queryKey: ["mention-search", mentionQuery],
    queryFn: () => searchFeedUsers(mentionQuery),
    enabled: showMentionSuggestions && mentionQuery.length >= 2,
  });

  const { data: suggestedPeople = [] } = useQuery({
    queryKey: ["suggested-people"],
    queryFn: () => getSuggestedPeople(user!.id, 6),
    enabled: !!user,
  });

  const { data: allUsersWithStatus = [] } = useQuery({
    queryKey: ["all-users-status"],
    queryFn: () => getAllUsersWithStatus(user!.id),
    enabled: !!user && activeTab === "friends",
  });

  const { data: friendRequests = [] } = useQuery({
    queryKey: ["friend-requests"],
    queryFn: () => getReceivedRequests(user!.id),
    enabled: !!user && activeTab === "friends",
  });

  const { data: searchResults = [] } = useQuery({
    queryKey: ["feed-user-search", searchQuery],
    queryFn: () => searchFeedUsers(searchQuery),
    enabled: searchQuery.length >= 2,
  });

  useEffect(() => {
    if (user && allPosts.length > 0) {
      getUserReactions(user.id, allPosts.map(p => p.id)).then(setUserReactions);
    }
  }, [user, allPosts]);

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
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests" }, () => {
        queryClient.invalidateQueries({ queryKey: ["friend-request-count"] });
        queryClient.invalidateQueries({ queryKey: ["friend-requests"] });
        queryClient.invalidateQueries({ queryKey: ["suggested-people"] });
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
      const isSameReaction = prev === type;
      setUserReactions(r => {
        const next = { ...r };
        if (isSameReaction) delete next[postId];
        else next[postId] = type;
        return next;
      });
      setShowReactionPicker(null);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["feed-posts", searchQuery] });
    },
  });

  const commentMutation = useMutation({
    mutationFn: async ({ text }: { text: string }) => {
      if (!user || !commentingPostId) throw new Error("Error");
      return addComment(commentingPostId, user.id, text, replyingTo?.id);
    },
    onMutate: async ({ text }) => {
      if (!user || !commentingPostId) return;
      const tc: PostComment = {
        id: `temp-${Date.now()}`,
        post_id: commentingPostId,
        user_id: user.id,
        content: text, created_at: new Date().toISOString(),
        parent_comment_id: replyingTo?.id || null,
        user: { display_name: user.display_name, avatar_url: user.avatar_url, guest_id: user.guest_id },
      };
      if (replyingTo) {
        setComments(prev => prev.map(c => c.id === replyingTo.id ? { ...c, replies: [...(c.replies || []), tc] } : c));
      } else {
        setComments(prev => [...prev, tc]);
      }
      setCommentText("");
      setReplyingTo(null);
    },
    onSuccess: (_data, _vars) => {
      if (commentingPostId) loadComments(commentingPostId);
      queryClient.invalidateQueries({ queryKey: ["feed-posts", searchQuery] });
    },
    onError: () => {
      if (commentingPostId) loadComments(commentingPostId);
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => { if (!user) throw new Error("Login"); await deleteComment(commentId, user.id); },
    onSuccess: () => { if (commentingPostId) loadComments(commentingPostId); queryClient.invalidateQueries({ queryKey: ["feed-posts", searchQuery] }); },
  });

  const commentLikeMutation = useMutation({
    mutationFn: async (commentId: string) => { if (!user) throw new Error("Login"); return toggleCommentLike(commentId, user.id); },
    onMutate: async (commentId) => {
      setComments(prev => prev.map(c => {
        if (c.id === commentId) return { ...c, liked_by_me: !c.liked_by_me, likes_count: (c.likes_count || 0) + (c.liked_by_me ? -1 : 1) };
        if (c.replies) return { ...c, replies: c.replies.map(r => r.id === commentId ? { ...r, liked_by_me: !r.liked_by_me, likes_count: (r.likes_count || 0) + (r.liked_by_me ? -1 : 1) } : r) };
        return c;
      }));
    },
  });

  const handleCommentInputChange = (val: string) => {
    setCommentText(val);
    const atMatch = val.match(/@(\w{2,})$/);
    if (atMatch) { setMentionQuery(atMatch[1]); setShowMentionSuggestions(true); }
    else { setShowMentionSuggestions(false); }
  };

  const insertMention = (name: string) => {
    setCommentText(commentText.replace(/@\w*$/, `@${name} `));
    setShowMentionSuggestions(false);
  };

  const storyMutation = useMutation({
    mutationFn: async ({ file, musicName }: { file: File; musicName?: string }) => {
      if (!user) throw new Error("Login");
      const url = await uploadStoryMedia(file);
      return createStory(user.id, url, musicName);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stories"] });
      toast({ title: "স্টোরি যোগ হয়েছে! ✨" });
    },
  });

  const friendRequestMutation = useMutation({
    mutationFn: async (receiverId: number) => {
      if (!user) throw new Error("Login");
      await sendFriendRequest(user.id, receiverId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suggested-people"] });
      toast({ title: "ফ্রেন্ড রিকুয়েস্ট পাঠানো হয়েছে! ✅" });
    },
    onError: () => toast({ title: "রিকুয়েস্ট পাঠানো যায়নি", variant: "destructive" }),
  });

  const acceptRequestMutation = useMutation({
    mutationFn: async (requestId: string) => {
      await acceptFriendRequest(requestId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friend-requests"] });
      queryClient.invalidateQueries({ queryKey: ["friend-request-count"] });
      toast({ title: "ফ্রেন্ড রিকুয়েস্ট গ্রহণ করা হয়েছে! 🎉" });
    },
  });

  const rejectRequestMutation = useMutation({
    mutationFn: async (requestId: string) => {
      await rejectFriendRequest(requestId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friend-requests"] });
      queryClient.invalidateQueries({ queryKey: ["friend-request-count"] });
    },
  });

  const loadComments = async (postId: string) => {
    setLoadingComments(true);
    setComments(await getPostComments(postId, user?.id));
    setLoadingComments(false);
  };

  const openComments = (postId: string) => {
    if (commentingPostId === postId) { setCommentingPostId(null); setReplyingTo(null); return; }
    setCommentingPostId(postId);
    setReplyingTo(null);
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
    if (file) setStoryEditorFile(file);
    if (e.target) e.target.value = "";
  };

  const handleStoryPublish = (editedFile: File, musicName?: string) => {
    storyMutation.mutate({ file: editedFile, musicName });
    setStoryEditorFile(null);
  };

  const handleFeedVideoPlay = (activePostId: string) => {
    Object.entries(feedVideoRefs.current).forEach(([postId, videoEl]) => {
      if (!videoEl || postId === activePostId) return;
      if (!videoEl.paused) {
        videoEl.pause();
      }
      videoEl.muted = true;
    });

    const activeVideo = feedVideoRefs.current[activePostId];
    if (activeVideo) {
      activeVideo.muted = false;
    }
  };

  useEffect(() => {
    return () => {
      Object.values(feedVideoRefs.current).forEach((videoEl) => {
        if (videoEl && !videoEl.paused) {
          videoEl.pause();
        }
      });
      feedVideoRefs.current = {};
    };
  }, []);

  const handleImageTap = (postId: string, imageUrl: string) => {
    const now = Date.now();
    const lastTap = doubleTapTimer[postId] || 0;
    if (now - lastTap < 300) {
      clearTimeout(tapTimerRef.current[postId]);
      if (!userReactions[postId]) {
        reactionMutation.mutate({ postId, type: "love" });
      }
      setShowLoveAnimation(postId);
      setTimeout(() => setShowLoveAnimation(null), 1000);
      setDoubleTapTimer(prev => ({ ...prev, [postId]: 0 }));
    } else {
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
    if (!user) return;
    try {
      const shareContent = post.content ? `শেয়ার করেছে: "${post.content}"` : "একটি পোস্ট শেয়ার করেছে";
      await createPost(user.id, shareContent, post.image_url || undefined, post.video_url || undefined);
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
      toast({ title: "আপনার প্রোফাইলে শেয়ার করা হয়েছে! ✅" });
    } catch {
      toast({ title: "শেয়ার করা যায়নি", variant: "destructive" });
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

  const storyGroups = stories.reduce<Record<number, Story[]>>((acc, s) => {
    (acc[s.user_id] = acc[s.user_id] || []).push(s);
    return acc;
  }, {});

  if (isLoading || !user) return null;

  // Insert "People You May Know" after 3rd post
  const renderPosts = () => {
    const elements: React.ReactNode[] = [];
    posts.forEach((post, index) => {
      // Insert People You May Know after 3rd post
      if (index === 3 && suggestedPeople.length > 0) {
        elements.push(
          <div key="people-suggest" className="bg-white dark:bg-card py-3">
            <div className="px-3 pb-2 flex items-center justify-between">
              <h3 className="text-[15px] font-bold text-gray-900 dark:text-foreground">People You May Know</h3>
            </div>
            <div className="flex gap-2.5 overflow-x-auto px-3 pb-2 scrollbar-hide">
              {suggestedPeople.map((sp: any) => (
                <div key={sp.id} className="min-w-[160px] max-w-[160px] rounded-lg border border-gray-200 dark:border-border overflow-hidden bg-white dark:bg-card shrink-0 shadow-sm">
                  {/* Cover/avatar area */}
                  <div className="h-[140px] relative bg-gray-100 dark:bg-secondary">
                    {sp.cover_url ? (
                      <img src={sp.cover_url} className="w-full h-full object-cover" alt="" />
                    ) : sp.avatar_url ? (
                      <img src={sp.avatar_url} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-blue-100 to-blue-50 dark:from-primary/20 dark:to-secondary">
                        <User className="w-12 h-12 text-gray-400" />
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="p-2.5">
                    <p className="text-[13px] font-bold text-gray-900 dark:text-foreground truncate">{sp.display_name || sp.guest_id}</p>
                    <button
                      onClick={() => friendRequestMutation.mutate(sp.id)}
                      disabled={friendRequestMutation.isPending}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 bg-blue-50 dark:bg-primary/10 text-blue-600 dark:text-primary rounded-md text-[13px] font-semibold hover:bg-blue-100 dark:hover:bg-primary/20 transition-colors">
                      <UserPlus className="w-4 h-4" />
                      Add friend
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => { setActiveTab("friends"); }}
              className="mx-3 mt-1 flex items-center justify-center gap-1 text-blue-600 dark:text-primary text-[13px] font-semibold py-1.5">
              See all <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        );
      }

      const myReaction = userReactions[post.id];
      elements.push(
        <div key={post.id} className="bg-white dark:bg-card">
          {/* Post header */}
          <div className="flex items-center gap-2.5 px-3 pt-3 pb-1.5">
            <button onClick={() => navigate(`/user/${post.user_id}`)}
              className="w-10 h-10 rounded-full bg-gray-200 dark:bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
              {post.user?.avatar_url ? <img src={post.user.avatar_url} className="w-full h-full object-cover" /> :
                <span className="text-blue-600 dark:text-primary font-bold text-sm">{post.user?.display_name?.[0]?.toUpperCase() || "?"}</span>}
            </button>
            <div className="flex-1 min-w-0">
              <button onClick={() => navigate(`/user/${post.user_id}`)} className="font-bold text-[14px] text-gray-900 dark:text-foreground hover:underline block">
                {post.user?.display_name || "User"}
              </button>
              <div className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-muted-foreground">
                <span>{timeAgo(post.created_at)}</span>
                <span>·</span>
                <Globe className="w-3 h-3" />
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <div className="relative">
                <button onClick={() => setShowPostMenu(showPostMenu === post.id ? null : post.id)}
                  className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-secondary transition-colors text-gray-500 dark:text-muted-foreground">
                  <MoreHorizontal className="w-5 h-5" />
                </button>
                <AnimatePresence>
                  {showPostMenu === post.id && (
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                      className="absolute right-0 top-full mt-1 bg-white dark:bg-card border border-gray-200 dark:border-border rounded-lg shadow-xl z-50 overflow-hidden min-w-[180px]">
                      {post.user_id === user.id ? (
                        <button onClick={() => deletePostMutation.mutate(post.id)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 dark:hover:bg-destructive/10 text-sm font-medium transition-colors">
                          <Trash2 className="w-4 h-4" /> পোস্ট মুছুন
                        </button>
                      ) : (
                        <>
                          <button onClick={() => { navigate(`/user/${post.user_id}`); setShowPostMenu(null); }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-secondary text-sm transition-colors">
                            <User className="w-4 h-4" /> প্রোফাইল দেখুন
                          </button>
                          <button onClick={() => { startChatWith(post.user_id); setShowPostMenu(null); }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-secondary text-sm transition-colors">
                            <MessageCircle className="w-4 h-4" /> মেসেজ পাঠান
                          </button>
                          <button onClick={() => { navigate(`/call/${post.user_id}`); setShowPostMenu(null); }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-secondary text-sm transition-colors">
                            <Phone className="w-4 h-4" /> কল করুন
                          </button>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <button onClick={() => setHiddenPosts(prev => new Set(prev).add(post.id))}
                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-secondary transition-colors text-gray-500 dark:text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Post content - DARK TEXT for readability */}
          {post.content && (
            <p className="text-[15px] text-gray-900 dark:text-foreground leading-relaxed px-3 pb-2 whitespace-pre-wrap">{post.content}</p>
          )}

          {/* Image */}
          {post.image_url && (
            <div className="relative cursor-pointer" onClick={() => handleImageTap(post.id, post.image_url!)}>
              <img src={post.image_url} alt="" className="w-full max-h-[500px] object-cover" />
              <AnimatePresence>
                {showLoveAnimation === post.id && (
                  <motion.div initial={{ scale: 0, opacity: 1 }} animate={{ scale: 1.5, opacity: 0 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.8 }} className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-7xl">❤️</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Video - Facebook Lite style with controls */}
          {post.video_url && (
            <div className="relative bg-black">
              <video
                ref={(el) => {
                  feedVideoRefs.current[post.id] = el;
                }}
                onPlay={() => handleFeedVideoPlay(post.id)}
                onEnded={() => {
                  const videoEl = feedVideoRefs.current[post.id];
                  if (videoEl) videoEl.muted = false;
                }}
                src={post.video_url}
                controls
                playsInline
                preload="metadata"
                className="w-full max-h-[500px] object-contain" />
            </div>
          )}

          {/* Reaction summary */}
          {(post.likes_count > 0 || post.comments_count > 0) && (
            <div className="px-3 py-1.5 flex items-center justify-between text-xs text-gray-500 dark:text-muted-foreground">
              <div className="flex items-center gap-1">
                {post.likes_count > 0 && (
                  <>
                    <span className="flex items-center -space-x-0.5">
                      <span className="w-[18px] h-[18px] rounded-full bg-blue-600 flex items-center justify-center text-[10px]">👍</span>
                      {myReaction && myReaction !== "like" && (
                        <span className="w-[18px] h-[18px] rounded-full bg-red-500 flex items-center justify-center text-[10px]">{REACTION_EMOJIS[myReaction]}</span>
                      )}
                    </span>
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

          {/* Action buttons */}
          <div className="px-3 py-0.5 border-t border-gray-200 dark:border-border/20 grid grid-cols-3 relative">
            <div className="relative">
              <button
                onClick={() => reactionMutation.mutate({ postId: post.id, type: myReaction || "like" })}
                onContextMenu={(e) => { e.preventDefault(); setShowReactionPicker(showReactionPicker === post.id ? null : post.id); }}
                onTouchStart={() => {
                  const timer = setTimeout(() => setShowReactionPicker(showReactionPicker === post.id ? null : post.id), 500);
                  const cleanup = () => { clearTimeout(timer); document.removeEventListener("touchend", cleanup); };
                  document.addEventListener("touchend", cleanup);
                }}
                className={`flex items-center justify-center gap-1.5 py-2.5 w-full rounded-lg transition-colors ${
                  myReaction ? "text-blue-600 dark:text-primary" : "text-gray-600 dark:text-muted-foreground"
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
                        className={`text-2xl p-1 rounded-full hover:bg-gray-100 dark:hover:bg-secondary transition-colors ${myReaction === type ? "bg-blue-50 dark:bg-primary/20" : ""}`}
                        title={type}>
                        {emoji}
                      </motion.button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button onClick={() => openComments(post.id)}
              className="flex items-center justify-center gap-1.5 py-2.5 text-gray-600 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-secondary/50 rounded-lg transition-colors">
              <MessageCircle className="w-[18px] h-[18px]" />
              <span className="text-xs font-semibold">মন্তব্য {post.comments_count > 0 ? `(${post.comments_count})` : ""}</span>
            </button>

            <button onClick={() => sharePost(post)}
              className="flex items-center justify-center gap-1.5 py-2.5 text-gray-600 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-secondary/50 rounded-lg transition-colors">
              <Share2 className="w-[18px] h-[18px]" />
              <span className="text-xs font-semibold">শেয়ার</span>
            </button>
          </div>

          {/* Comments section */}
          <AnimatePresence>
            {commentingPostId === post.id && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="px-3 pb-3 pt-1 border-t border-gray-200 dark:border-border/20 space-y-2">
                  {loadingComments ? <p className="text-xs text-gray-500 text-center py-2">লোড হচ্ছে...</p> :
                    comments.length === 0 ? <p className="text-xs text-gray-500 text-center py-2">কোনো মন্তব্য নেই</p> : (
                      <div className="space-y-2.5 max-h-72 overflow-y-auto" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
                        {comments.map((c) => (
                          <div key={c.id} className="space-y-1.5">
                          <div className="flex gap-2">
                            <button onClick={() => navigate(`/user/${c.user_id}`)} className="w-8 h-8 rounded-full bg-gray-200 dark:bg-primary/15 flex items-center justify-center shrink-0 overflow-hidden">
                              {c.user?.avatar_url ? <img src={c.user.avatar_url} className="w-full h-full object-cover" /> :
                                <span className="text-[10px] text-blue-600 font-bold">{c.user?.display_name?.[0]?.toUpperCase() || "?"}</span>}
                            </button>
                            <div className="flex-1 min-w-0">
                            <div className="bg-gray-100 dark:bg-secondary rounded-2xl px-3 py-2.5">
                              <button onClick={() => navigate(`/user/${c.user_id}`)} className="text-[13px] font-bold text-gray-900 dark:text-foreground hover:underline block">
                                {c.user?.display_name || "User"}
                              </button>
                              <p className="text-[15px] leading-5 text-gray-900 dark:text-foreground mt-0.5 break-words whitespace-pre-wrap">{c.content}</p>
                            </div>
                            <div className="flex items-center gap-3 px-1 mt-0.5">
                              <span className="text-[11px] text-gray-500">{timeAgo(c.created_at)}</span>
                              <button onClick={() => commentLikeMutation.mutate(c.id)} className={`text-[11px] font-bold ${c.liked_by_me ? "text-blue-600" : "text-gray-500"}`}>
                                পছন্দ {(c.likes_count || 0) > 0 ? `(${c.likes_count})` : ""}
                              </button>
                              <button onClick={() => { setReplyingTo({ id: c.id, name: c.user?.display_name || "User" }); }} className="text-[11px] font-bold text-gray-500">
                                Reply
                              </button>
                              {c.user_id === user.id && (
                                <button onClick={() => deleteCommentMutation.mutate(c.id)} className="text-[11px] font-bold text-red-500">
                                  মুছুন
                                </button>
                              )}
                            </div>
                            {/* Replies */}
                            {c.replies && c.replies.length > 0 && (
                              <div className="ml-4 mt-1.5 space-y-1.5 border-l-2 border-gray-200 dark:border-border/30 pl-2">
                                {c.replies.map((r) => (
                                  <div key={r.id} className="flex gap-1.5">
                                    <button onClick={() => navigate(`/user/${r.user_id}`)} className="w-6 h-6 rounded-full bg-gray-200 dark:bg-primary/15 flex items-center justify-center shrink-0 overflow-hidden">
                                      {r.user?.avatar_url ? <img src={r.user.avatar_url} className="w-full h-full object-cover" /> :
                                        <span className="text-[8px] text-blue-600 font-bold">{r.user?.display_name?.[0]?.toUpperCase() || "?"}</span>}
                                    </button>
                                    <div className="flex-1 min-w-0">
                                      <div className="bg-gray-100 dark:bg-secondary rounded-xl px-2.5 py-1.5">
                                        <button onClick={() => navigate(`/user/${r.user_id}`)} className="text-[11px] font-bold text-gray-900 dark:text-foreground">{r.user?.display_name || "User"}</button>
                                        <p className="text-[13px] leading-4 text-gray-900 dark:text-foreground break-words">{r.content}</p>
                                      </div>
                                      <div className="flex items-center gap-3 px-1 mt-0.5">
                                        <span className="text-[10px] text-gray-500">{timeAgo(r.created_at)}</span>
                                        <button onClick={() => commentLikeMutation.mutate(r.id)} className={`text-[10px] font-bold ${r.liked_by_me ? "text-blue-600" : "text-gray-500"}`}>পছন্দ {(r.likes_count || 0) > 0 ? `(${r.likes_count})` : ""}</button>
                                        {r.user_id === user.id && <button onClick={() => deleteCommentMutation.mutate(r.id)} className="text-[10px] font-bold text-red-500">মুছুন</button>}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            </div>
                          </div>
                          </div>
                        ))}
                      </div>
                    )}
                  {/* Reply indicator */}
                  {replyingTo && (
                    <div className="flex items-center gap-2 px-1 py-1 bg-blue-50 dark:bg-primary/10 rounded-lg text-[12px]">
                      <span className="text-gray-600 dark:text-muted-foreground">↩️ {replyingTo.name}-কে রিপ্লাই</span>
                      <button onClick={() => setReplyingTo(null)} className="text-red-500 font-bold">✕</button>
                    </div>
                  )}
                  {/* Mention suggestions */}
                  {showMentionSuggestions && mentionResults.length > 0 && (
                    <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-lg max-h-32 overflow-y-auto">
                      {mentionResults.filter((u: any) => u.id !== user.id).slice(0, 5).map((u: any) => (
                        <button key={u.id} onClick={() => insertMention(u.display_name || u.guest_id)}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-secondary flex items-center gap-2 text-[13px]">
                          <div className="w-6 h-6 rounded-full bg-gray-200 overflow-hidden shrink-0">
                            {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-[9px] font-bold text-blue-600">{u.display_name?.[0] || "?"}</span>}
                          </div>
                          <span className="font-semibold text-gray-900 dark:text-foreground">{u.display_name || u.guest_id}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input value={commentText} onChange={(e) => handleCommentInputChange(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && commentText.trim() && commentMutation.mutate({ text: commentText.trim() })}
                      placeholder={replyingTo ? `${replyingTo.name}-কে রিপ্লাই...` : "মন্তব্য লিখুন... (@mention)"}
                      className="flex-1 bg-gray-100 dark:bg-secondary text-gray-900 dark:text-foreground rounded-full px-4 py-2 text-sm border-none outline-none placeholder:text-gray-400 dark:placeholder:text-muted-foreground" />
                    <button onClick={() => commentText.trim() && commentMutation.mutate({ text: commentText.trim() })}
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
    });
    return elements;
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-background pb-14">
      {/* ===== Header - "good-app" ===== */}
      <header className="sticky top-0 z-50 bg-blue-600 shadow-md">
        <div className="max-w-lg mx-auto px-3 py-2 flex items-center justify-between">
          <h1 className="text-[22px] font-bold text-white tracking-tight">good-app</h1>
          <div className="flex items-center gap-0.5">
            <button onClick={() => setShowCreatePost(true)} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
              <Plus className="w-5 h-5 text-white" />
            </button>
            <button onClick={() => setShowSearch(!showSearch)} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
              <Search className="w-5 h-5 text-white" />
            </button>
            <button onClick={() => navigate("/dashboard")} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
              <Menu className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </header>

      {/* ===== Tab Bar ===== */}
      <nav className="sticky top-[52px] z-40 bg-white dark:bg-card border-b border-gray-200 dark:border-border/30 shadow-sm">
        <div className="max-w-lg mx-auto flex items-center justify-around">
          <button onClick={() => { setActiveTab("home"); setShowFriendRequests(false); }}
            className={`flex-1 py-2.5 flex items-center justify-center border-b-[3px] relative ${activeTab === "home" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 dark:text-muted-foreground"}`}>
            <Home className="w-5 h-5" />
          </button>
          <button onClick={() => setActiveTab("friends")}
            className={`flex-1 py-2.5 flex items-center justify-center border-b-[3px] relative ${activeTab === "friends" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 dark:text-muted-foreground"}`}>
            <Users className="w-5 h-5" />
            {friendRequestCount > 0 && (
              <span className="absolute top-1 right-1/4 min-w-[18px] h-[18px] bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {friendRequestCount}
              </span>
            )}
          </button>
          <button onClick={() => navigate("/chat")}
            className="relative flex-1 py-2.5 flex items-center justify-center border-b-[3px] border-transparent text-gray-500 dark:text-muted-foreground">
            <MessageCircle className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1/4 min-w-[18px] h-[18px] bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
          <button onClick={() => { if (user) { markReelsSeen(user.id).then(() => queryClient.invalidateQueries({ queryKey: ["new-reels-count"] })); } navigate("/reels"); }}
            className="relative flex-1 py-2.5 flex items-center justify-center border-b-[3px] border-transparent text-gray-500 dark:text-muted-foreground">
            <Play className="w-5 h-5" />
            {newReelsCount > 0 && (
              <span className="absolute top-1 right-1/4 min-w-[18px] h-[18px] bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {newReelsCount > 99 ? "99+" : newReelsCount}
              </span>
            )}
          </button>
          <button onClick={() => { setActiveTab("notif"); if (user) markNotificationsRead(user.id).then(() => queryClient.invalidateQueries({ queryKey: ["notif-count"] })); }}
            className={`relative flex-1 py-2.5 flex items-center justify-center border-b-[3px] ${activeTab === "notif" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 dark:text-muted-foreground"}`}>
            <Bell className="w-5 h-5" />
            {notifCount > 0 && (
              <span className="absolute top-1 right-1/4 min-w-[18px] h-[18px] bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {notifCount > 99 ? "99+" : notifCount}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* Search overlay */}
      <AnimatePresence>
        {showSearch && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-white dark:bg-card border-b border-gray-200 dark:border-border/30 shadow-sm">
            <div className="max-w-lg mx-auto px-3 py-2.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="পোস্ট বা ইউজার খুঁজুন..."
                  className="w-full bg-gray-100 dark:bg-secondary text-gray-900 dark:text-foreground rounded-full pl-10 pr-10 py-2 text-sm border-none outline-none placeholder:text-gray-400" autoFocus />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                )}
              </div>
              {searchResults.length > 0 && (
                <div className="mt-2 space-y-1">
                  {searchResults.filter((u: any) => u.id !== user.id).slice(0, 5).map((u: any) => (
                    <button key={u.id} onClick={() => navigate(`/user/${u.id}`)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-secondary transition-colors text-left">
                      <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-primary/20 flex items-center justify-center overflow-hidden">
                        {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" /> :
                          <span className="text-sm font-bold text-blue-600">{u.display_name?.[0]?.toUpperCase() || "?"}</span>}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-foreground">{u.display_name || "User"}</p>
                        <p className="text-[11px] text-gray-500 dark:text-muted-foreground">{u.guest_id}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== Friend Requests Tab ===== */}
      {activeTab === "friends" && (
        <div className="max-w-lg mx-auto pb-4">
          {/* Friend Requests Section */}
          {friendRequests.length > 0 && (
            <div className="bg-white dark:bg-card mt-2 rounded-lg mx-1">
              <h3 className="px-3 pt-3 pb-2 text-[16px] font-bold text-gray-900 dark:text-foreground">
                ফ্রেন্ড রিকুয়েস্ট <span className="text-blue-600">({friendRequests.length})</span>
              </h3>
              <div className="space-y-1 pb-2">
                {friendRequests.map((fr) => (
                  <div key={fr.id} className="flex items-center gap-3 px-3 py-2">
                    <button onClick={() => navigate(`/user/${fr.sender_id}`)}
                      className="w-14 h-14 rounded-full bg-gray-200 dark:bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                      {fr.sender?.avatar_url ? <img src={fr.sender.avatar_url} className="w-full h-full object-cover" /> :
                        <User className="w-7 h-7 text-gray-400" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-gray-900 dark:text-foreground truncate">{fr.sender?.display_name || "User"}</p>
                      <p className="text-[11px] text-gray-500 dark:text-muted-foreground">{timeAgo(fr.created_at)}</p>
                      <div className="flex gap-2 mt-1.5">
                        <button onClick={() => acceptRequestMutation.mutate(fr.id)}
                          className="flex-1 py-1.5 bg-blue-600 text-white text-[13px] font-semibold rounded-md">Confirm</button>
                        <button onClick={() => rejectRequestMutation.mutate(fr.id)}
                          className="flex-1 py-1.5 bg-gray-200 dark:bg-secondary text-gray-700 dark:text-foreground text-[13px] font-semibold rounded-md">Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All Users - Facebook style list */}
          <div className="bg-white dark:bg-card mt-2 rounded-lg mx-1 pb-3">
            <h3 className="px-3 pt-3 pb-2 text-[16px] font-bold text-gray-900 dark:text-foreground">
              সব ইউজার ({allUsersWithStatus.filter((p: any) => !(p.friendship?.status === "pending" && p.friendship?.direction === "sent")).length})
            </h3>
            <div className="space-y-0">
              {allUsersWithStatus.filter((person: any) => {
                const fs = person.friendship;
                if (fs?.status === "pending" && fs.direction === "sent") return false;
                return true;
              }).map((person: any) => {
                const fs = person.friendship;
                const isFriend = fs?.status === "accepted";
                const isPending = fs?.status === "pending";
                return (
                  <div key={person.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-secondary/30 transition-colors">
                    <button onClick={() => navigate(`/user/${person.id}`)}
                      className="w-14 h-14 rounded-full bg-gray-200 dark:bg-primary/20 flex items-center justify-center overflow-hidden shrink-0 border-2 border-gray-100 dark:border-border">
                      {person.avatar_url ? <img src={person.avatar_url} className="w-full h-full object-cover" /> :
                        <User className="w-7 h-7 text-gray-400" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <button onClick={() => navigate(`/user/${person.id}`)} className="text-left w-full">
                        <p className="text-[14px] font-bold text-gray-900 dark:text-foreground truncate">{person.display_name || person.guest_id}</p>
                      </button>
                      <div className="mt-1.5">
                        {isFriend ? (
                          <div className="flex gap-2">
                            <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 dark:bg-secondary text-gray-600 dark:text-muted-foreground text-[12px] font-semibold rounded-md">
                              <Check className="w-3.5 h-3.5" /> বন্ধু
                            </span>
                            <button onClick={() => startChatWith(person.id)}
                              className="px-3 py-1.5 bg-blue-50 dark:bg-primary/10 text-blue-600 dark:text-primary text-[12px] font-semibold rounded-md">
                              মেসেজ
                            </button>
                          </div>
                        ) : isPending ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 dark:bg-secondary text-gray-500 text-[12px] font-semibold rounded-md">
                            {fs.direction === "sent" ? "রিকুয়েস্ট পাঠানো হয়েছে" : "রিকুয়েস্ট এসেছে"}
                          </span>
                        ) : (
                          <button onClick={() => friendRequestMutation.mutate(person.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-[12px] font-semibold rounded-md hover:bg-blue-700 transition-colors">
                            <UserPlus className="w-3.5 h-3.5" /> Add friend
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {allUsersWithStatus.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-6">কোনো ইউজার পাওয়া যায়নি</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== HOME TAB Content ===== */}
      {activeTab === "home" && (
        <>
          {/* "What's on your mind?" bar */}
          {!showSearch && (
            <div className="bg-white dark:bg-card border-b border-gray-200 dark:border-border/30">
              <div className="max-w-lg mx-auto px-3 py-2.5 flex items-center gap-3">
                <button onClick={() => navigate("/profile")} className="w-10 h-10 rounded-full bg-gray-200 dark:bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                  {user.avatar_url ? <img src={user.avatar_url} className="w-full h-full object-cover" /> : <User className="w-5 h-5 text-gray-400" />}
                </button>
                <button onClick={() => setShowCreatePost(true)}
                  className="flex-1 bg-gray-100 dark:bg-secondary rounded-full px-4 py-2.5 text-left">
                  <span className="text-sm text-gray-400 dark:text-muted-foreground">কি মনে হচ্ছে?</span>
                </button>
                <button onClick={() => { setShowCreatePost(true); setTimeout(() => fileInputRef.current?.click(), 300); }}
                  className="flex flex-col items-center gap-0.5 px-2">
                  <Image className="w-5 h-5 text-green-600" />
                  <span className="text-[10px] text-gray-500 font-medium">Photo</span>
                </button>
              </div>
            </div>
          )}

          {/* Stories - always show create story even if no stories */}
          {!showSearch && (
            <div className="bg-white dark:bg-card border-b border-gray-200 dark:border-border/30">
              <div className="max-w-lg mx-auto px-3 py-3">
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  <button onClick={() => storyInputRef.current?.click()}
                    className="relative min-w-[110px] h-[170px] rounded-xl overflow-hidden bg-gray-100 dark:bg-secondary border border-gray-200 dark:border-border flex flex-col shrink-0">
                    <div className="flex-1 bg-gradient-to-b from-blue-100 to-gray-100 dark:from-secondary dark:to-card flex items-center justify-center">
                      <Image className="w-8 h-8 text-blue-400" />
                    </div>
                    <div className="relative flex items-center justify-center py-4">
                      <div className="absolute -top-4 w-8 h-8 rounded-full bg-blue-600 border-[3px] border-white dark:border-card flex items-center justify-center">
                        {storyMutation.isPending ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Plus className="w-4 h-4 text-white" />}
                      </div>
                      <span className="text-[11px] font-semibold text-gray-900 dark:text-foreground mt-1">Create story</span>
                    </div>
                  </button>
                  <input ref={storyInputRef} type="file" accept="image/*" className="hidden" onChange={handleStorySelect} />

                  {Object.entries(storyGroups).map(([uid, userStories]) => {
                    const storyUser = userStories[0].user;
                    return (
                      <button key={uid} onClick={() => setViewingStory(userStories[0])}
                        className="relative min-w-[110px] h-[170px] rounded-xl overflow-hidden shrink-0">
                        <img src={userStories[0].image_url} className="w-full h-full object-cover" alt="" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
                        {userStories.length > 1 && (
                          <span className="absolute top-2 left-2 min-w-[20px] h-[20px] bg-blue-600 text-white text-[10px] font-bold rounded-md flex items-center justify-center px-1">
                            {userStories.length}
                          </span>
                        )}
                        <div className="absolute top-2 left-2 w-9 h-9 rounded-full p-[2px] bg-blue-600">
                          <div className="w-full h-full rounded-full overflow-hidden bg-white">
                            {storyUser?.avatar_url ? <img src={storyUser.avatar_url} className="w-full h-full object-cover" /> :
                              <div className="w-full h-full flex items-center justify-center bg-gray-100">
                                <span className="text-xs font-bold text-blue-600">{storyUser?.display_name?.[0]?.toUpperCase() || "?"}</span>
                              </div>}
                          </div>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 p-2">
                          <p className="text-white text-xs font-bold drop-shadow-lg">
                            {parseInt(uid) === user.id ? "Your story" : storyUser?.display_name || "User"}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Posts */}
          <div className="max-w-lg mx-auto">
            {postsLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              </div>
            ) : posts.length === 0 ? (
              <div className="flex flex-col items-center py-20 text-gray-500 bg-white dark:bg-card mt-2 rounded-lg mx-3">
                <MessageCircle className="w-12 h-12 text-gray-300 mb-3" />
                <p className="font-bold text-gray-700 dark:text-foreground">{searchQuery ? "কিছু পাওয়া যায়নি" : "কোনো পোস্ট নেই"}</p>
                <p className="text-sm mt-1">{searchQuery ? "অন্য কিছু খুঁজুন" : "প্রথম পোস্ট করুন! ✨"}</p>
              </div>
            ) : (
              <div className="space-y-2 mt-2">
                {renderPosts()}
                {/* Infinite scroll sentinel */}
                {hasMore && (
                  <div ref={sentinelRef} className="flex justify-center py-4">
                    <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Notification tab */}
      {activeTab === "notif" && (
        <div className="max-w-lg mx-auto mt-2 px-2">
          <div className="bg-white dark:bg-card rounded-lg">
            <h3 className="px-4 pt-3 pb-2 text-[16px] font-bold text-gray-900 dark:text-foreground">নোটিফিকেশন</h3>
            {notificationsList.length === 0 ? (
              <div className="p-6 text-center">
                <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">কোনো নোটিফিকেশন নেই</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-border/20">
                {notificationsList.map((n: any) => (
                  <button key={n.id} onClick={() => { if (n.reference_id) { setActiveTab("home"); openComments(n.reference_id); } }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-secondary/30 transition-colors ${!n.is_read ? "bg-blue-50/60 dark:bg-primary/5" : ""}`}>
                    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                      {n.from_user?.avatar_url ? <img src={n.from_user.avatar_url} className="w-full h-full object-cover" /> :
                        <User className="w-5 h-5 text-gray-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-gray-900 dark:text-foreground">
                        <span className="font-bold">{n.from_user?.display_name || "কেউ"}</span>
                        {n.type === "mention" && " আপনাকে মেন্টশন করেছে"}
                        {n.type === "like" && " আপনার পোস্টে লাইক দিয়েছে"}
                        {n.type === "comment" && " আপনার পোস্টে মন্তব্য করেছে"}
                      </p>
                      {n.content && <p className="text-[12px] text-gray-500 dark:text-muted-foreground truncate mt-0.5">"{n.content}"</p>}
                      <p className="text-[11px] text-gray-400 dark:text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.is_read && <div className="w-3 h-3 rounded-full bg-blue-600 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Story viewer */}
      <AnimatePresence>
        {viewingStory && (
          <StoryViewer
            story={viewingStory}
            userId={user.id}
            onClose={() => setViewingStory(null)}
            onDelete={(id) => deleteStoryMutation.mutate(id)}
            onMessage={(uid) => { setViewingStory(null); startChatWith(uid); }}
            onCall={(uid) => { setViewingStory(null); navigate(`/call/${uid}`); }}
            onProfile={(uid) => { setViewingStory(null); navigate(`/user/${uid}`); }}
            timeAgo={timeAgo}
          />
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
            <motion.img src={viewingImage} alt="" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }} className="max-w-full max-h-full object-contain p-4" onClick={(e) => e.stopPropagation()} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Post Modal */}
      <AnimatePresence>
        {showCreatePost && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-white dark:bg-background">
            <div className="max-w-lg mx-auto">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-border/30">
                <button onClick={() => { setShowCreatePost(false); setPostImageFile(null); setPostImagePreview(null); setPostVideoFile(null); setPostVideoPreview(null); setPostContent(""); }}>
                  <X className="w-6 h-6 text-gray-500" />
                </button>
                <h2 className="font-bold text-base text-gray-900 dark:text-foreground">পোস্ট তৈরি করুন</h2>
                <button onClick={() => createPostMutation.mutate()}
                  disabled={createPostMutation.isPending || (!postContent.trim() && !postImageFile && !postVideoFile)}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded-md text-sm font-bold disabled:opacity-40">
                  {createPostMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "পোস্ট"}
                </button>
              </div>

              <div className="px-4 pt-3">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-primary/20 flex items-center justify-center overflow-hidden">
                    {user.avatar_url ? <img src={user.avatar_url} className="w-full h-full object-cover" /> : <User className="w-5 h-5 text-gray-400" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-foreground">{user.display_name || "User"}</p>
                    <div className="flex items-center gap-1 text-gray-500 text-[11px]">
                      <Globe className="w-3 h-3" /> সবাই
                    </div>
                  </div>
                </div>
                <textarea value={postContent} onChange={(e) => setPostContent(e.target.value)}
                  placeholder="কি মনে হচ্ছে?"
                  className="w-full bg-transparent text-gray-900 dark:text-foreground text-base resize-none border-none outline-none placeholder:text-gray-400 min-h-[120px]" autoFocus />
              </div>

              {postImagePreview && (
                <div className="px-4 mt-2 relative">
                  <img src={postImagePreview} className="w-full rounded-lg max-h-60 object-cover" />
                  <button onClick={() => { setPostImageFile(null); setPostImagePreview(null); }}
                    className="absolute top-2 right-6 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center">
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              )}

              {postVideoPreview && (
                <div className="px-4 mt-2 relative">
                  <video src={postVideoPreview} className="w-full rounded-lg max-h-60" controls />
                  <button onClick={() => { setPostVideoFile(null); setPostVideoPreview(null); }}
                    className="absolute top-2 right-6 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center">
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              )}

              <div className="mt-4 px-4 flex items-center gap-4 border-t border-gray-200 dark:border-border/30 pt-3">
                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 text-green-600">
                  <Image className="w-5 h-5" /><span className="text-sm font-medium">ছবি</span>
                </button>
                <button onClick={() => videoInputRef.current?.click()} className="flex items-center gap-2 text-red-500">
                  <Video className="w-5 h-5" /><span className="text-sm font-medium">ভিডিও</span>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoSelect} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Story Editor */}
      <AnimatePresence>
        {storyEditorFile && (
          <StoryEditor
            imageFile={storyEditorFile}
            onClose={() => setStoryEditorFile(null)}
            onPublish={handleStoryPublish}
            isPending={storyMutation.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
