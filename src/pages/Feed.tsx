import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
import { playUiSound } from "@/lib/ui-sounds";
import VerifiedBadge from "@/components/VerifiedBadge";

export default function Feed() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showCreatePost, setShowCreatePost] = useState(false);
  const [postContent, setPostContent] = useState("");
  const [postImageFiles, setPostImageFiles] = useState<File[]>([]);
  const [postImagePreviews, setPostImagePreviews] = useState<string[]>([]);
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
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [mentionQuery, setMentionQuery] = useState("");
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [page, setPage] = useState(0);
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [newPostsAvailable, setNewPostsAvailable] = useState(false);
  const POSTS_PER_PAGE = 20;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const storyInputRef = useRef<HTMLInputElement>(null);
  const tapTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const sentinelRef = useRef<HTMLDivElement>(null);
  const feedVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  useEffect(() => {
    if (!isLoading && !user) navigate("/");
  }, [user, isLoading, navigate]);

  // Initial + paginated fetch
  const { isLoading: postsLoading } = useQuery({
    queryKey: ["feed-posts", searchQuery, page],
    queryFn: async () => {
      const newPosts = await getFeedPosts(POSTS_PER_PAGE, searchQuery, page * POSTS_PER_PAGE);
      if (newPosts.length < POSTS_PER_PAGE) setHasMore(false);
      else setHasMore(true);
      if (page === 0) {
        setAllPosts(newPosts);
      } else {
        setAllPosts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const unique = newPosts.filter(p => !existingIds.has(p.id));
          return [...prev, ...unique];
        });
      }
      return newPosts;
    },
    enabled: !!user,
    staleTime: 20000,
  });

  // Reset page when search changes
  useEffect(() => { setPage(0); setAllPosts([]); setHasMore(true); }, [searchQuery]);

  const posts = allPosts.filter(p => !hiddenPosts.has(p.id) && !p.video_url);

  // Infinite scroll observer
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || postsLoading) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setPage(p => p + 1);
    }, { threshold: 0.1 });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, postsLoading, posts.length]);

  const { data: stories = [] } = useQuery({
    queryKey: ["stories"],
    queryFn: getActiveStories,
    enabled: !!user,
  });

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["unread-count"],
    queryFn: () => getUnreadCount(user!.id),
    enabled: !!user,
  });

  const { data: friendRequestCount = 0 } = useQuery({
    queryKey: ["friend-request-count"],
    queryFn: () => getFriendRequestCount(user!.id),
    enabled: !!user,
  });

  const { data: notifCount = 0 } = useQuery({
    queryKey: ["notif-count", user?.id],
    queryFn: () => getUnreadNotificationCount(user!.id),
    enabled: !!user,
  });

  const { data: newReelsCount = 0 } = useQuery({
    queryKey: ["new-reels-count", user?.id],
    queryFn: () => getNewReelsCount(user!.id),
    enabled: !!user,
    refetchInterval: 60000,
  });

  const { data: notificationsList = [] } = useQuery({
    queryKey: ["notifications-list", user?.id],
    queryFn: () => getNotifications(user!.id),
    enabled: !!user && activeTab === "notif",
  });

  const { data: mentionResults = [] } = useQuery({
    queryKey: ["mention-search", mentionQuery],
    queryFn: () => searchFeedUsers(mentionQuery),
    enabled: showMentionSuggestions && mentionQuery.length >= 1,
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

  // Only load reactions for currently visible posts (not all 1000)
  useEffect(() => {
    if (user && posts.length > 0) {
      const visibleIds = posts.map(p => p.id);
      getUserReactions(user.id, visibleIds).then(setUserReactions);
    }
  }, [user, posts.length]);

  useEffect(() => {
    const channel = supabase.channel("feed-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, () => {
        setNewPostsAvailable(true);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, () => {
        queryClient.invalidateQueries({ queryKey: ["stories"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => {
        queryClient.invalidateQueries({ queryKey: ["notif-count"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient, user?.id]);

  const createPostMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Login required");
      let imageUrl: string | undefined;
      let videoUrl: string | undefined;
      if (postImageFiles.length > 0) {
        const urls: string[] = [];
        for (const file of postImageFiles) {
          urls.push(await uploadPostMedia(file, file.name));
        }
        imageUrl = urls.join(",");
      }
      if (postVideoFile) videoUrl = await uploadPostMedia(postVideoFile, postVideoFile.name);
      return createPost(user.id, postContent, imageUrl, videoUrl);
    },
    onSuccess: () => {
      setPostContent(""); setPostImageFiles([]); setPostImagePreviews([]);
      setPostVideoFile(null); setPostVideoPreview(null); setShowCreatePost(false);
      setPage(0); setAllPosts([]); setHasMore(true);
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
      if (!isSameReaction) {
        playUiSound("like");
      }
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
    const atMatch = val.match(/@([^\s@]*)$/);
    if (atMatch && atMatch[1].length >= 1) { setMentionQuery(atMatch[1]); setShowMentionSuggestions(true); }
    else if (val.endsWith("@")) { setMentionQuery(""); setShowMentionSuggestions(true); }
    else { setShowMentionSuggestions(false); }
  };

  const insertMention = (name: string) => {
    setCommentText(commentText.replace(/@[^\s@]*$/, `@${name} `));
    setShowMentionSuggestions(false);
  };

  const storyMutation = useMutation({
    mutationFn: async ({ files, musicName }: { files: File[]; musicName?: string }) => {
      if (!user) throw new Error("Login");
      for (const file of files) {
        const url = await uploadStoryMedia(file);
        await createStory(user.id, url, musicName);
      }
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
    setCommentText("");
    setShowMentionSuggestions(false);
    loadComments(postId);
  };

  const commentingPost = useMemo(
    () => allPosts.find((p) => p.id === commentingPostId) || null,
    [allPosts, commentingPostId],
  );

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newFiles = Array.from(files);
    setPostImageFiles(prev => [...prev, ...newFiles]);
    newFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => setPostImagePreviews(prev => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    });
    // Reset input so same file can be selected again
    e.target.value = "";
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      if (video.duration > 120) {
        toast({ title: "নিউজ ফিডে সর্বোচ্চ ২ মিনিটের ভিডিও আপলোড করা যাবে", variant: "destructive" });
        return;
      }
      setPostVideoFile(file);
      setPostVideoPreview(video.src);
    };
  };

  const handleStorySelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (files.length === 1) {
      setStoryEditorFile(files[0]);
    } else {
      // Multi-file: upload all directly (max 5)
      const fileArr = Array.from(files).slice(0, 5);
      storyMutation.mutate({ files: fileArr });
    }
    if (e.target) e.target.value = "";
  };

  const handleStoryPublish = (editedFile: File, musicName?: string) => {
    storyMutation.mutate({ files: [editedFile], musicName });
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

  // Group stories by user, own stories first, newest uploaders first
  const storyGroups = stories.reduce<Record<number, Story[]>>((acc, s) => {
    (acc[s.user_id] = acc[s.user_id] || []).push(s);
    return acc;
  }, {});
  const sortedStoryEntries = Object.entries(storyGroups).sort(([aId, aStories], [bId, bStories]) => {
    // Own stories always first
    if (parseInt(aId) === user?.id) return -1;
    if (parseInt(bId) === user?.id) return 1;
    // Then by most recent story
    const aTime = new Date(aStories[0].created_at || 0).getTime();
    const bTime = new Date(bStories[0].created_at || 0).getTime();
    return bTime - aTime;
  });

  if (isLoading || !user) return null;

  // Render @mention text with blue clickable names
  const renderMentionText = (text: string) => {
    const parts = text.split(/(@[\w\s]+?)(?=\s@|\s*$|[.,!?])/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        const name = part.slice(1).trim();
        return (
          <button
            key={i}
            onClick={async (e) => {
              e.stopPropagation();
              const { data: users } = await (supabase.from("users").select("id").ilike("display_name", name).limit(1) as any);
              if (users && users.length > 0) navigate(`/user/${users[0].id}`);
            }}
            className="text-blue-600 dark:text-primary font-bold hover:underline inline"
          >
            @{name}
          </button>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  const NameWithBadge = ({ name, isVerified, className = "" }: { name: string; isVerified?: boolean; className?: string }) => (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span>{name}</span>
      {isVerified && <VerifiedBadge className="h-3.5 w-3.5" />}
    </span>
  );

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
                  <button onClick={() => navigate(`/user/${sp.id}`)} className="h-[140px] w-full relative bg-gray-100 dark:bg-secondary block">
                    {sp.cover_url ? (
                      <img src={sp.cover_url} className="w-full h-full object-cover" alt="" />
                    ) : sp.avatar_url ? (
                      <img src={sp.avatar_url} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-blue-100 to-blue-50 dark:from-primary/20 dark:to-secondary">
                        <User className="w-12 h-12 text-gray-400" />
                      </div>
                    )}
                  </button>
                  {/* Info */}
                  <div className="p-2.5">
                    <button onClick={() => navigate(`/user/${sp.id}`)} className="w-full text-left">
                      <p className="text-[13px] font-bold text-gray-900 dark:text-foreground truncate">{sp.display_name || sp.guest_id}</p>
                    </button>
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
              <button onClick={() => navigate(`/user/${post.user_id}`)} className="font-bold text-[15px] text-gray-900 dark:text-foreground hover:underline block">
                <NameWithBadge name={post.user?.display_name || "User"} isVerified={post.user?.is_verified_badge} />
              </button>
              <div className="flex items-center gap-1 text-[12px] text-gray-500 dark:text-muted-foreground">
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

          {/* Post content */}
          {post.content && (
            <p className="text-[16px] text-gray-900 dark:text-foreground leading-relaxed px-3 pb-2 whitespace-pre-wrap">{renderMentionText(post.content)}</p>
          )}

          {/* Image */}
          {post.image_url && (() => {
            const imageUrls = post.image_url!.split(",").map(u => u.trim()).filter(Boolean);
            return (
              <div className={imageUrls.length === 1 ? "" : "grid grid-cols-2 gap-0.5"}>
                {imageUrls.map((url, imgIdx) => (
                  <div key={imgIdx} className="relative cursor-pointer" onClick={() => handleImageTap(post.id, url)}>
                    <img src={url} alt="" className={`w-full object-cover ${imageUrls.length === 1 ? 'max-h-[500px]' : 'max-h-[250px]'}`} />
                    <AnimatePresence>
                      {showLoveAnimation === post.id && imgIdx === 0 && (
                        <motion.div initial={{ scale: 0, opacity: 1 }} animate={{ scale: 1.5, opacity: 0 }} exit={{ opacity: 0 }}
                          transition={{ duration: 0.8 }} className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="text-7xl">❤️</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Video */}
          {post.video_url && (
            <div className="relative bg-black">
              <video
                ref={(el) => { feedVideoRefs.current[post.id] = el; }}
                onPlay={() => handleFeedVideoPlay(post.id)}
                src={post.video_url}
                controls playsInline preload="metadata"
                className="w-full max-h-[500px] object-contain" />
            </div>
          )}

          {/* Reaction summary - Facebook style */}
          <div className="px-3 py-2 flex items-center justify-between text-[13px] text-gray-500 dark:text-muted-foreground">
            <div className="flex items-center gap-1">
              <span className="flex items-center -space-x-0.5">
                <span className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[11px]">👍</span>
                {myReaction && myReaction !== "like" && (
                  <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-[11px]">{REACTION_EMOJIS[myReaction]}</span>
                )}
              </span>
              <span className="text-[13px]">{post.likes_count || 0}</span>
            </div>
            {post.comments_count > 0 ? (
              <button onClick={() => openComments(post.id)} className="hover:underline text-[13px]">
                {post.comments_count} মন্তব্য
              </button>
            ) : (
              <span className="text-[13px]">0 মন্তব্য</span>
            )}
          </div>

          {/* Facebook-style Action buttons */}
          <div
            className="px-1 py-1 border-t border-gray-200 dark:border-border/20 grid grid-cols-3 relative select-none"
            style={{ WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" }}
          >
            <div className="relative">
              <button
                onClick={() => reactionMutation.mutate({ postId: post.id, type: myReaction || "like" })}
                onContextMenu={(e) => { e.preventDefault(); setShowReactionPicker(showReactionPicker === post.id ? null : post.id); }}
                onTouchStart={() => {
                  const timer = setTimeout(() => setShowReactionPicker(showReactionPicker === post.id ? null : post.id), 500);
                  const cleanup = () => { clearTimeout(timer); document.removeEventListener("touchend", cleanup); };
                  document.addEventListener("touchend", cleanup);
                }}
                className={`flex items-center justify-center gap-2 py-2.5 w-full rounded-lg transition-colors select-none ${
                  myReaction ? "text-blue-600 dark:text-primary" : "text-gray-600 dark:text-muted-foreground"
                }`}>
                {myReaction ? (
                  <span className="text-xl">{REACTION_EMOJIS[myReaction]}</span>
                ) : (
                  <ThumbsUp className="w-5 h-5" />
                )}
                <span className="text-[13px] font-semibold select-none">{myReaction ? (myReaction === "like" ? "পছন্দ" : REACTION_EMOJIS[myReaction]) : "পছন্দ"}</span>
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
              className="flex items-center justify-center gap-2 py-2.5 text-gray-600 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-secondary/50 rounded-lg transition-colors select-none"
              onContextMenu={(e) => e.preventDefault()}>
              <MessageCircle className="w-5 h-5" />
              <span className="text-[13px] font-semibold select-none">মন্তব্য</span>
            </button>

            <button onClick={() => sharePost(post)}
              className="flex items-center justify-center gap-2 py-2.5 text-gray-600 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-secondary/50 rounded-lg transition-colors select-none"
              onContextMenu={(e) => e.preventDefault()}>
              <Share2 className="w-5 h-5" />
              <span className="text-[13px] font-semibold select-none">শেয়ার</span>
            </button>
          </div>
        </div>
      );
    });
    return elements;
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-background pb-14">
      {/* ===== Header - "good-app" Premium ===== */}
      <header className="sticky top-0 z-50 shadow-lg" style={{ background: "linear-gradient(135deg, #1877F2, #0d47a1, #1565c0)" }}>
        <div className="max-w-lg mx-auto px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-[24px] font-black text-white tracking-tight" style={{ fontFamily: "'Inter', system-ui", textShadow: "0 2px 8px rgba(0,0,0,0.3)", letterSpacing: "-0.02em" }}>
              <span style={{ background: "linear-gradient(90deg, #fff, #e3f0ff, #fff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundSize: "200% auto", animation: "shimmer-text 3s ease-in-out infinite" }}>good</span>
              <span style={{ color: "#ffd600", textShadow: "0 0 12px rgba(255,214,0,0.5)" }}>-app</span>
            </h1>
          </div>
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

      {/* ===== Facebook-style Tab Bar ===== */}
      <nav className="sticky top-[52px] z-40 bg-white dark:bg-card border-b border-gray-200 dark:border-border/40">
        <div className="max-w-lg mx-auto flex items-center justify-around h-[44px]">
          <button
            onClick={() => { setActiveTab("home"); setShowFriendRequests(false); }}
            className={`relative flex-1 h-full flex items-center justify-center border-b-[3px] transition-colors ${
              activeTab === "home" ? "border-blue-600 text-blue-600 dark:border-primary dark:text-primary" : "border-transparent text-gray-500 dark:text-muted-foreground"
            }`}
          >
            <Home className="w-6 h-6" />
            {newPostsAvailable && activeTab !== "home" && (
              <span className="absolute top-1 right-[calc(50%-18px)] w-2.5 h-2.5 bg-red-500 rounded-full" />
            )}
          </button>

          <button
            onClick={() => setActiveTab("friends")}
            className={`relative flex-1 h-full flex items-center justify-center border-b-[3px] transition-colors ${
              activeTab === "friends" ? "border-blue-600 text-blue-600 dark:border-primary dark:text-primary" : "border-transparent text-gray-500 dark:text-muted-foreground"
            }`}
          >
            <Users className="w-6 h-6" />
            {friendRequestCount > 0 && (
              <span className="absolute top-0.5 right-[calc(50%-20px)] min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {friendRequestCount > 99 ? "99+" : friendRequestCount}
              </span>
            )}
          </button>

          <button
            onClick={() => navigate("/chat")}
            className="relative flex-1 h-full flex items-center justify-center border-b-[3px] border-transparent text-gray-500 dark:text-muted-foreground"
          >
            <MessageCircle className="w-6 h-6" />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-[calc(50%-20px)] min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          <button
            onClick={() => navigate("/short-reels")}
            className="relative flex-1 h-full flex items-center justify-center border-b-[3px] border-transparent text-gray-500 dark:text-muted-foreground"
          >
            <Video className="w-6 h-6" />
          </button>

          <button
            onClick={() => { if (user) { markReelsSeen(user.id).then(() => queryClient.invalidateQueries({ queryKey: ["new-reels-count"] })); } navigate("/reels"); }}
            className="relative flex-1 h-full flex items-center justify-center border-b-[3px] border-transparent text-gray-500 dark:text-muted-foreground"
          >
            <Play className="w-6 h-6" />
            {newReelsCount > 0 && (
              <span className="absolute top-0.5 right-[calc(50%-20px)] min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {newReelsCount > 99 ? "99+" : newReelsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab("notif"); if (user) markNotificationsRead(user.id).then(() => queryClient.invalidateQueries({ queryKey: ["notif-count"] })); }}
            className={`relative flex-1 h-full flex items-center justify-center border-b-[3px] transition-colors ${
              activeTab === "notif" ? "border-blue-600 text-blue-600 dark:border-primary dark:text-primary" : "border-transparent text-gray-500 dark:text-muted-foreground"
            }`}
          >
            <Bell className="w-6 h-6" />
            {notifCount > 0 && (
              <span className="absolute top-0.5 right-[calc(50%-20px)] min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {notifCount > 99 ? "99+" : notifCount}
              </span>
            )}
          </button>

          <button
            onClick={() => navigate("/dashboard")}
            className="relative flex-1 h-full flex items-center justify-center border-b-[3px] border-transparent text-gray-500 dark:text-muted-foreground"
          >
            <Menu className="w-6 h-6" />
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
                        <p className="text-sm font-semibold text-gray-900 dark:text-foreground">
                          <NameWithBadge name={u.display_name || "User"} isVerified={u.is_verified_badge} />
                        </p>
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
                      <p className="text-[14px] font-bold text-gray-900 dark:text-foreground truncate">
                        <NameWithBadge name={fr.sender?.display_name || "User"} isVerified={fr.sender?.is_verified_badge} />
                      </p>
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
                        <p className="text-[14px] font-bold text-gray-900 dark:text-foreground truncate">
                          <NameWithBadge name={person.display_name || person.guest_id} isVerified={person.is_verified_badge} />
                        </p>
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
                  <span className="text-[10px] text-gray-500 font-medium">ছবি</span>
                </button>
                <button onClick={() => { setShowCreatePost(true); setTimeout(() => videoInputRef.current?.click(), 300); }}
                  className="flex flex-col items-center gap-0.5 px-2">
                  <Video className="w-5 h-5 text-red-500" />
                  <span className="text-[10px] text-gray-500 font-medium">ভিডিও</span>
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
                  <input ref={storyInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleStorySelect} />

                  {sortedStoryEntries.map(([uid, userStories]) => {
                    const storyUser = userStories[0].user;
                    return (
                      <button key={uid} onClick={() => setViewingStory(userStories[0])}
                        className="relative min-w-[110px] h-[170px] rounded-xl overflow-hidden shrink-0">
                        <img src={userStories[0].image_url} className="w-full h-full object-cover" alt="" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
                        {/* Story count badge in blue */}
                        <span className="absolute top-2 right-2 min-w-[20px] h-[20px] bg-blue-600 text-white text-[10px] font-bold rounded-md flex items-center justify-center px-1">
                          {userStories.length}
                        </span>
                        <div className="absolute top-2 left-2 w-9 h-9 rounded-full p-[2px] bg-blue-600">
                          <div className="w-full h-full rounded-full overflow-hidden bg-white">
                            {storyUser?.avatar_url ? <img src={storyUser.avatar_url} className="w-full h-full object-cover" /> :
                              <div className="w-full h-full flex items-center justify-center bg-gray-100">
                                <span className="text-xs font-bold text-blue-600">{storyUser?.display_name?.[0]?.toUpperCase() || "?"}</span>
                              </div>}
                          </div>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 p-2">
                          <p className="text-white text-xs font-bold drop-shadow-lg inline-flex items-center gap-1">
                            <span>{parseInt(uid) === user.id ? "Your story" : storyUser?.display_name || "User"}</span>
                            {storyUser?.is_verified_badge && <VerifiedBadge className="h-3 w-3" />}
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
                  <div key={n.id} className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-secondary/30 transition-colors ${!n.is_read ? "bg-blue-50/60 dark:bg-primary/5" : ""}`}>
                    <button onClick={() => n.from_user_id && navigate(`/user/${n.from_user_id}`)}
                      className="w-10 h-10 rounded-full bg-gray-200 dark:bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                      {n.from_user?.avatar_url ? <img src={n.from_user.avatar_url} className="w-full h-full object-cover" /> :
                        <User className="w-5 h-5 text-gray-400" />}
                    </button>
                    <button onClick={() => { if (n.reference_id) { setActiveTab("home"); openComments(n.reference_id); } }}
                      className="flex-1 min-w-0 text-left">
                      <p className="text-[13px] text-gray-900 dark:text-foreground">
                        <span className="font-bold text-blue-600 dark:text-primary cursor-pointer inline-flex items-center gap-1" onClick={(e) => { e.stopPropagation(); if (n.from_user_id) navigate(`/user/${n.from_user_id}`); }}>
                          <span>{n.from_user?.display_name || "কেউ"}</span>
                          {n.from_user?.is_verified_badge && <VerifiedBadge className="h-3 w-3" />}
                        </span>
                        {n.type === "mention" && " আপনাকে মেন্টশন করেছে"}
                        {n.type === "like" && " আপনার পোস্টে লাইক দিয়েছে"}
                        {n.type === "comment" && " আপনার পোস্টে মন্তব্য করেছে"}
                        {n.type === "reply" && " আপনার মন্তব্যে রিপ্লাই দিয়েছে"}
                      </p>
                      {n.content && <p className="text-[12px] text-gray-500 dark:text-muted-foreground truncate mt-0.5">"{n.content}"</p>}
                      <p className="text-[11px] text-gray-400 dark:text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</p>
                    </button>
                    {!n.is_read && <div className="w-3 h-3 rounded-full bg-red-600 shrink-0" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== Facebook-style Comment Bottom Sheet ===== */}
      <AnimatePresence>
        {commentingPostId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] bg-black/50" onClick={() => { setCommentingPostId(null); setReplyingTo(null); }}>
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 400 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-0 left-0 right-0 bg-white dark:bg-card rounded-t-2xl max-h-[85vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-border/30">
                <h3 className="text-[17px] font-bold text-gray-900 dark:text-foreground">মন্তব্য</h3>
                <button onClick={() => { setCommentingPostId(null); setReplyingTo(null); }}
                  className="w-8 h-8 rounded-full bg-gray-100 dark:bg-secondary flex items-center justify-center">
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              {/* Comments list */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                {commentingPost && (
                  <div className="rounded-2xl border border-gray-200 dark:border-border/30 p-3 bg-white dark:bg-card">
                    <div className="flex items-center gap-2 mb-2">
                      <button onClick={() => navigate(`/user/${commentingPost.user_id}`)} className="text-[13px] font-bold text-gray-900 dark:text-foreground hover:underline">
                        <NameWithBadge name={commentingPost.user?.display_name || "User"} isVerified={commentingPost.user?.is_verified_badge} />
                      </button>
                      <span className="text-[11px] text-gray-500">{timeAgo(commentingPost.created_at)}</span>
                    </div>
                    {commentingPost.content && (
                      <p className="text-[14px] text-gray-900 dark:text-foreground whitespace-pre-wrap break-words">{renderMentionText(commentingPost.content)}</p>
                    )}
                    {commentingPost.image_url && (() => {
                      const urls = commentingPost.image_url!.split(",").map(u => u.trim()).filter(Boolean);
                      return (
                        <div className={urls.length === 1 ? "mt-2" : "mt-2 grid grid-cols-2 gap-1"}>
                          {urls.map((url, i) => (
                            <img key={i} src={url} alt="" className="rounded-xl w-full max-h-[220px] object-cover" />
                          ))}
                        </div>
                      );
                    })()}
                    {commentingPost.video_url && (
                      <video src={commentingPost.video_url} controls className="mt-2 rounded-xl w-full max-h-[220px] object-cover" />
                    )}
                  </div>
                )}

                {loadingComments ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-blue-600 animate-spin" /></div>
                ) : comments.length === 0 ? (
                  <div className="text-center py-10">
                    <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-[15px] text-gray-500">এখনো কোনো মন্তব্য নেই</p>
                    <p className="text-[13px] text-gray-400 mt-1">প্রথম মন্তব্য করুন!</p>
                  </div>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="space-y-2">
                      <div className="flex gap-2.5">
                        <button onClick={() => navigate(`/user/${c.user_id}`)}
                          className="w-9 h-9 rounded-full bg-gray-200 dark:bg-primary/15 flex items-center justify-center shrink-0 overflow-hidden">
                          {c.user?.avatar_url ? <img src={c.user.avatar_url} className="w-full h-full object-cover" /> :
                            <span className="text-[11px] text-blue-600 font-bold">{c.user?.display_name?.[0]?.toUpperCase() || "?"}</span>}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="bg-gray-100 dark:bg-secondary rounded-2xl px-3 py-2.5">
                            <button onClick={() => navigate(`/user/${c.user_id}`)}
                              className="text-[14px] font-bold text-gray-900 dark:text-foreground hover:underline block">
                              <NameWithBadge name={c.user?.display_name || "User"} isVerified={c.user?.is_verified_badge} />
                            </button>
                            <p className="text-[15px] leading-relaxed text-gray-900 dark:text-foreground mt-0.5 break-words whitespace-pre-wrap">
                              {renderMentionText(c.content)}
                            </p>
                          </div>
                          <div className="flex items-center gap-4 px-1 mt-1">
                            <span className="text-[12px] text-gray-500">{timeAgo(c.created_at)}</span>
                            <button onClick={() => commentLikeMutation.mutate(c.id)}
                              className={`text-[12px] font-bold ${c.liked_by_me ? "text-blue-600" : "text-gray-500"}`}>
                              পছন্দ {(c.likes_count || 0) > 0 ? `(${c.likes_count})` : ""}
                            </button>
                            <button onClick={() => setReplyingTo({ id: c.id, name: c.user?.display_name || "User" })}
                              className="text-[12px] font-bold text-gray-500">Reply</button>
                            {c.user_id === user.id && (
                              <button onClick={() => deleteCommentMutation.mutate(c.id)} className="text-[12px] font-bold text-red-500">মুছুন</button>
                            )}
                          </div>
                          {/* Replies - collapsed by default like Facebook */}
                          {c.replies && c.replies.length > 0 && (
                            <div className="ml-5 mt-1.5">
                              {!expandedReplies.has(c.id) ? (
                                <button
                                  onClick={() => setExpandedReplies(prev => new Set(prev).add(c.id))}
                                  className="flex items-center gap-1.5 text-[13px] font-bold text-gray-600 dark:text-muted-foreground hover:text-blue-600 dark:hover:text-primary py-1"
                                >
                                  <span className="w-6 h-0 border-t-2 border-gray-300 dark:border-border/50" />
                                  {c.replies.length === 1 ? "১টি রিপ্লাই দেখুন" : `${c.replies.length}টি রিপ্লাই দেখুন`}
                                </button>
                              ) : (
                                <>
                                  <button
                                    onClick={() => setExpandedReplies(prev => { const s = new Set(prev); s.delete(c.id); return s; })}
                                    className="flex items-center gap-1.5 text-[13px] font-bold text-gray-600 dark:text-muted-foreground hover:text-blue-600 dark:hover:text-primary py-1 mb-1.5"
                                  >
                                    <span className="w-6 h-0 border-t-2 border-gray-300 dark:border-border/50" />
                                    রিপ্লাই লুকান
                                  </button>
                                  <div className="space-y-2 border-l-2 border-gray-200 dark:border-border/30 pl-3">
                                    {c.replies.map((r) => (
                                      <div key={r.id} className="flex gap-2">
                                        <button onClick={() => navigate(`/user/${r.user_id}`)}
                                          className="w-7 h-7 rounded-full bg-gray-200 dark:bg-primary/15 flex items-center justify-center shrink-0 overflow-hidden">
                                          {r.user?.avatar_url ? <img src={r.user.avatar_url} className="w-full h-full object-cover" /> :
                                            <span className="text-[9px] text-blue-600 font-bold">{r.user?.display_name?.[0]?.toUpperCase() || "?"}</span>}
                                        </button>
                                        <div className="flex-1 min-w-0">
                                          <div className="bg-gray-100 dark:bg-secondary rounded-xl px-2.5 py-2">
                                            <button onClick={() => navigate(`/user/${r.user_id}`)}
                                              className="text-[13px] font-bold text-gray-900 dark:text-foreground">
                                              <NameWithBadge name={r.user?.display_name || "User"} isVerified={r.user?.is_verified_badge} />
                                            </button>
                                            <p className="text-[14px] leading-relaxed text-gray-900 dark:text-foreground break-words">
                                              {renderMentionText(r.content)}
                                            </p>
                                          </div>
                                          <div className="flex items-center gap-3 px-1 mt-0.5">
                                            <span className="text-[11px] text-gray-500">{timeAgo(r.created_at)}</span>
                                            <button onClick={() => commentLikeMutation.mutate(r.id)}
                                              className={`text-[11px] font-bold ${r.liked_by_me ? "text-blue-600" : "text-gray-500"}`}>
                                              পছন্দ {(r.likes_count || 0) > 0 ? `(${r.likes_count})` : ""}
                                            </button>
                                            <button onClick={() => setReplyingTo({ id: c.id, name: r.user?.display_name || "User" })}
                                              className="text-[11px] font-bold text-gray-500">Reply</button>
                                            {r.user_id === user.id && <button onClick={() => deleteCommentMutation.mutate(r.id)} className="text-[11px] font-bold text-red-500">মুছুন</button>}
                                          </div>
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
                    </div>
                  ))
                )}
              </div>

              {/* Bottom input area */}
              <div className="border-t border-gray-200 dark:border-border/30 px-4 py-3 bg-white dark:bg-card">
                {replyingTo && (
                  <div className="flex items-center gap-2 mb-2 px-1 py-1.5 bg-blue-50 dark:bg-primary/10 rounded-lg text-[13px]">
                    <span className="text-gray-600 dark:text-muted-foreground">↩️ {replyingTo.name}-কে রিপ্লাই</span>
                    <button onClick={() => setReplyingTo(null)} className="text-red-500 font-bold ml-auto">✕</button>
                  </div>
                )}
                {/* Mention suggestions */}
                {showMentionSuggestions && mentionResults.length > 0 && (
                  <div className="mb-2 bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-lg max-h-40 overflow-y-auto">
                    {mentionResults.filter((u: any) => u.id !== user.id).slice(0, 6).map((u: any) => (
                      <button key={u.id} onClick={() => insertMention(u.display_name || u.guest_id)}
                        className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-secondary flex items-center gap-2.5 text-[14px]">
                        <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden shrink-0">
                          {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" /> :
                            <span className="w-full h-full flex items-center justify-center text-[10px] font-bold text-blue-600">{u.display_name?.[0] || "?"}</span>}
                        </div>
                        <span className="font-semibold text-gray-900 dark:text-foreground">{u.display_name || u.guest_id}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden shrink-0">
                    {user.avatar_url ? <img src={user.avatar_url} className="w-full h-full object-cover" /> :
                      <User className="w-4 h-4 text-gray-400 m-auto mt-2" />}
                  </div>
                  <input value={commentText} onChange={(e) => handleCommentInputChange(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && commentText.trim() && commentMutation.mutate({ text: commentText.trim() })}
                    placeholder={replyingTo ? `${replyingTo.name}-কে রিপ্লাই...` : "মন্তব্য লিখুন... (@mention)"}
                    className="flex-1 bg-gray-100 dark:bg-secondary text-gray-900 dark:text-foreground rounded-full px-4 py-2.5 text-[15px] border-none outline-none placeholder:text-gray-400 dark:placeholder:text-muted-foreground"
                    autoFocus />
                  <button onClick={() => commentText.trim() && commentMutation.mutate({ text: commentText.trim() })}
                    disabled={!commentText.trim() || commentMutation.isPending}
                    className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center disabled:opacity-40 shrink-0">
                    <Send className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Story viewer */}
      <AnimatePresence>
        {viewingStory && (
          <StoryViewer
            story={viewingStory}
            allStories={storyGroups[viewingStory.user_id] || [viewingStory]}
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
                <button onClick={() => { setShowCreatePost(false); setPostImageFiles([]); setPostImagePreviews([]); setPostVideoFile(null); setPostVideoPreview(null); setPostContent(""); }}>
                  <X className="w-6 h-6 text-gray-500" />
                </button>
                <h2 className="font-bold text-base text-gray-900 dark:text-foreground">পোস্ট তৈরি করুন</h2>
                <button onClick={() => createPostMutation.mutate()}
                  disabled={createPostMutation.isPending || (!postContent.trim() && postImageFiles.length === 0 && !postVideoFile)}
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

              {postImagePreviews.length > 0 && (
                <div className="px-4 mt-2 grid gap-2" style={{ gridTemplateColumns: postImagePreviews.length === 1 ? '1fr' : 'repeat(2, 1fr)' }}>
                  {postImagePreviews.map((preview, idx) => (
                    <div key={idx} className="relative">
                      <img src={preview} className="w-full rounded-lg max-h-60 object-cover" />
                      <button onClick={() => {
                        setPostImageFiles(prev => prev.filter((_, i) => i !== idx));
                        setPostImagePreviews(prev => prev.filter((_, i) => i !== idx));
                      }}
                        className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center">
                        <X className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  ))}
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
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} />
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
