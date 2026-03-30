import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Cast, Loader2, Bell, Search, X, Plus, Play, Upload, Video, RefreshCcw, Maximize, ThumbsUp, ThumbsDown, Share2, MessageSquare, Send, User, Image as ImageIcon, Copy, ExternalLink, Mic, Clock, History, Home } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import goodAppLogo from "@/assets/good-app-logo.jpg";
import VerifiedBadge from "@/components/VerifiedBadge";
import {
  createLongVideoUpload,
  createLongVideoUploadWithThumbnail,
  getBangladeshExternalVideos,
  getChannelStats,
  getLocalVideoEngagement,
  getUploadedLongVideos,
  getUploadedLongVideoByPostId,
  toggleChannelSubscription,
  trackVideoPreference,
  type ExternalReelVideo,
  markReelsSeen,
  uploadPostMedia,
  getPostComments,
  addComment,
  toggleReaction,
  getUserReactions,
  type PostComment,
  fetchYouTubeSuggestions,
} from "@/lib/feed-api";

type VideoItem = {
  id: string;
  title: string;
  video_url: string;
  watch_url?: string;
  thumbnail_url?: string | null;
  creator?: string | null;
  duration?: number;
  isExternal: boolean;
  uploader_user_id?: number | null;
  uploader_guest_id?: string | null;
  uploader_avatar_url?: string | null;
  uploader_is_verified_badge?: boolean;
  local_post_id?: string;
  likes_count?: number;
  comments_count?: number;
};

const CHIPS = [
  "All",
  "New Bangla",
  "Bangla Song",
  "Bangla Hits",
  "Slowed Reverb",
  "Live",
  "Romantic",
  "Comedy",
  "Sad Song",
  "Gaming",
  "Trending",
  "Bangla Natok",
  "Movie",
];

function fmt(sec?: number) {
  if (!sec || sec <= 0) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function normalizeTitleKey(value: string): string {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0980-\u09ff\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeVideos(items: ExternalReelVideo[]): ExternalReelVideo[] {
  const seenId = new Set<string>();
  const seenTitleCreator = new Set<string>();
  return items.filter((video) => {
    if (seenId.has(video.id)) return false;
    seenId.add(video.id);
    const key = `${normalizeTitleKey(video.title)}::${normalizeTitleKey(video.creator || "")}`;
    if (!key || key === "::") return true;
    if (seenTitleCreator.has(key)) return false;
    seenTitleCreator.add(key);
    return true;
  });
}

function mapExternalVideoToVideoItem(v: ExternalReelVideo): VideoItem {
  return {
    id: v.id,
    title: v.title,
    video_url: v.video_url,
    watch_url: v.watch_url,
    thumbnail_url: v.thumbnail_url,
    creator: v.creator || "",
    duration: v.duration,
    isExternal: v.source !== "good-app",
    uploader_user_id: v.uploader_user_id,
    uploader_guest_id: v.uploader_guest_id,
    uploader_avatar_url: v.uploader_avatar_url,
    uploader_is_verified_badge: v.uploader_is_verified_badge,
    local_post_id: v.local_post_id,
    likes_count: v.likes_count,
    comments_count: v.comments_count,
  };
}

function timeAgo(sec?: number) {
  if (!sec) return "";
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 2592000) return `${Math.floor(sec / 86400)}d ago`;
  return `${Math.floor(sec / 2592000)}mo ago`;
}

function isEmbed(url: string) {
  return url.includes("/embed/");
}

function isYouTubeEmbed(url: string) {
  return url.includes("youtube.com/embed/");
}

// ── Search History ──────────────────────────────────────────────────────
const SEARCH_HISTORY_KEY = "goodapp-search-history-v1";
const MAX_SEARCH_HISTORY = 15;

function readSearchHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s: any) => typeof s === "string" && s.trim()) : [];
  } catch { return []; }
}

function saveSearchHistory(query: string): void {
  if (typeof window === "undefined" || !query.trim()) return;
  try {
    const existing = readSearchHistory();
    const deduped = [query.trim(), ...existing.filter(s => s.toLowerCase() !== query.trim().toLowerCase())].slice(0, MAX_SEARCH_HISTORY);
    window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(deduped));
  } catch {}
}

function removeSearchHistoryItem(query: string): void {
  if (typeof window === "undefined") return;
  try {
    const existing = readSearchHistory();
    window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(existing.filter(s => s.toLowerCase() !== query.toLowerCase())));
  } catch {}
}

// ── Watch History ──────────────────────────────────────────────────────
const WATCH_HISTORY_KEY = "goodapp-watch-history-v1";
const MAX_WATCH_HISTORY = 30;

type WatchHistoryItem = {
  id: string;
  title: string;
  thumbnail_url?: string | null;
  creator?: string | null;
  video_url: string;
  duration?: number;
  isExternal: boolean;
  watchedAt: number;
  uploader_user_id?: number | null;
  uploader_guest_id?: string | null;
  uploader_avatar_url?: string | null;
  uploader_is_verified_badge?: boolean;
  local_post_id?: string;
  watch_url?: string;
  likes_count?: number;
  comments_count?: number;
};

function readWatchHistory(): WatchHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WATCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveToWatchHistory(video: VideoItem): void {
  if (typeof window === "undefined") return;
  try {
    const existing = readWatchHistory();
    const item: WatchHistoryItem = {
      id: video.id,
      title: video.title,
      thumbnail_url: video.thumbnail_url,
      creator: video.creator,
      video_url: video.video_url,
      duration: video.duration,
      isExternal: video.isExternal,
      watchedAt: Date.now(),
      uploader_user_id: video.uploader_user_id,
      uploader_guest_id: video.uploader_guest_id,
      uploader_avatar_url: video.uploader_avatar_url,
      uploader_is_verified_badge: video.uploader_is_verified_badge,
      local_post_id: video.local_post_id,
      watch_url: video.watch_url,
      likes_count: video.likes_count,
      comments_count: video.comments_count,
    };
    const deduped = [item, ...existing.filter(h => h.id !== video.id)].slice(0, MAX_WATCH_HISTORY);
    window.localStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(deduped));
  } catch {}
}

const EXTERNAL_PAGE_WINDOW = 8;

function normalizeExternalPage(raw: number): number {
  const safe = Math.max(1, Math.floor(raw || 1));
  return ((safe - 1) % EXTERNAL_PAGE_WINDOW) + 1;
}

function randomExternalStartPage(seed = 0): number {
  return (Math.abs((Date.now() + seed * 997) % EXTERNAL_PAGE_WINDOW) || 0) + 1;
}

function buildExternalPlayerUrl(url: string, autoplay = false) {
  const params = new URLSearchParams();
  if (isYouTubeEmbed(url)) {
    params.set("autoplay", autoplay ? "1" : "0");
    params.set("mute", "0");
    params.set("rel", "0");
    params.set("modestbranding", "1");
    params.set("playsinline", "1");
    params.set("enablejsapi", "1");
    params.set("controls", "1");
    params.set("showinfo", "0");
    params.set("iv_load_policy", "3");
    if (typeof window !== "undefined") {
      params.set("origin", window.location.origin);
    }
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}${params.toString()}`;
  }
  // Dailymotion embeds
  params.set("autoplay", autoplay ? "1" : "0");
  params.set("quality", "1080");
  params.set("mute", "0");
  params.set("sharing-enable", "false");
  params.set("ui-start-screen-info", "false");
  params.set("start", "0");
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${params.toString()}`;
}

function viewCount() {
  const n = Math.floor(Math.random() * 500000) + 1000;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M views`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K views`;
  return `${n} views`;
}

export default function Reels() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isLoading } = useAuth();
  const playParam = searchParams.get("play");
  const uploadParam = searchParams.get("upload");

  const [searchMode, setSearchMode] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [voiceListening, setVoiceListening] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [ytSuggestions, setYtSuggestions] = useState<string[]>([]);
  const suggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [watchHistory, setWatchHistory] = useState<WatchHistoryItem[]>([]);
  const [selectedChip, setSelectedChip] = useState("All");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [extVideos, setExtVideos] = useState<ExternalReelVideo[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [viewCounts] = useState<Record<string, string>>({});
  const [miniPlayer, setMiniPlayer] = useState(false);
  const [showYoutubeTapToPlay, setShowYoutubeTapToPlay] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [showUpload, setShowUpload] = useState(uploadParam === "1");
  const [uploading, setUploading] = useState(false);
  const [longTitle, setLongTitle] = useState("");
  const [longVideoFile, setLongVideoFile] = useState<File | null>(null);
  const [longVideoPreview, setLongVideoPreview] = useState<string | null>(null);
  const [longVideoDuration, setLongVideoDuration] = useState<number | undefined>(undefined);
  const [longThumbnailFile, setLongThumbnailFile] = useState<File | null>(null);
  const [longThumbnailPreview, setLongThumbnailPreview] = useState<string | null>(null);
  const [channelStats, setChannelStats] = useState<{ subscriber_count: number; total_videos: number; is_subscribed: boolean } | null>(null);
  const [showHistorySheet, setShowHistorySheet] = useState(false);
  const [channelLoading, setChannelLoading] = useState(false);
  const [subscribeLoading, setSubscribeLoading] = useState(false);
  const [engagementStats, setEngagementStats] = useState<{ likes_count: number; comments_count: number } | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [externalReactions, setExternalReactions] = useState<Record<string, { reaction: "like" | "dislike" | null; likes: number }>>({});
  const [playerLoading, setPlayerLoading] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [playerReloadToken, setPlayerReloadToken] = useState(0);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const playerShellRef = useRef<HTMLDivElement>(null);
  const youtubeIframeRef = useRef<HTMLIFrameElement | null>(null);
  const youtubeCommandIntervalRef = useRef<number | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const playParamHandledRef = useRef(false);

  const stopYoutubeCommandLoop = useCallback(() => {
    if (youtubeCommandIntervalRef.current !== null) {
      window.clearInterval(youtubeCommandIntervalRef.current);
      youtubeCommandIntervalRef.current = null;
    }
  }, []);

  const postYoutubeCommand = useCallback((func: string, args: unknown[] = []) => {
    const frameWindow = youtubeIframeRef.current?.contentWindow;
    if (!frameWindow) return;
    frameWindow.postMessage(JSON.stringify({ event: "command", func, args }), "*");
  }, []);

  const kickYoutubeSoundPlayback = useCallback((includePlay = true) => {
    postYoutubeCommand("unMute");
    postYoutubeCommand("setVolume", [100]);
    if (includePlay) postYoutubeCommand("playVideo");

    stopYoutubeCommandLoop();
    let tries = 0;
    youtubeCommandIntervalRef.current = window.setInterval(() => {
      postYoutubeCommand("unMute");
      postYoutubeCommand("setVolume", [100]);
      if (includePlay) postYoutubeCommand("playVideo");
      tries += 1;
      if (tries >= 18) {
        stopYoutubeCommandLoop();
      }
    }, 180);
  }, [postYoutubeCommand, stopYoutubeCommandLoop]);

  const playYoutubeWithSound = useCallback(() => {
    setShowYoutubeTapToPlay(false);
    kickYoutubeSoundPlayback(true);
    window.setTimeout(() => kickYoutubeSoundPlayback(true), 80);
    window.setTimeout(() => kickYoutubeSoundPlayback(true), 260);
  }, [kickYoutubeSoundPlayback]);

  useEffect(() => {
    if (!isLoading && !user) navigate("/");
  }, [isLoading, user, navigate]);

  // Handle ?play=postId to auto-play a specific video
  useEffect(() => {
    if (!playParam || !user || playParamHandledRef.current) return;
    playParamHandledRef.current = true;

    (async () => {
      try {
        const video = await getUploadedLongVideoByPostId(playParam);
        if (video) {
          const mapped: VideoItem = {
            id: video.id,
            title: video.title,
            video_url: video.video_url,
            watch_url: video.watch_url,
            thumbnail_url: video.thumbnail_url,
            creator: video.creator || "",
            duration: video.duration,
            isExternal: video.source !== "good-app",
            uploader_user_id: video.uploader_user_id,
            uploader_guest_id: video.uploader_guest_id,
            uploader_avatar_url: video.uploader_avatar_url,
            uploader_is_verified_badge: video.uploader_is_verified_badge,
            local_post_id: video.local_post_id,
            likes_count: video.likes_count,
            comments_count: video.comments_count,
          };
          setSelectedVideo(mapped);
          setMiniPlayer(false);
        }
      } catch {}
    })();
  }, [playParam, user]);

  useEffect(() => {
    const isYoutubeSelected = Boolean(selectedVideo?.isExternal && isYouTubeEmbed(selectedVideo.video_url));
    setShowYoutubeTapToPlay(isYoutubeSelected);
    stopYoutubeCommandLoop();
  }, [selectedVideo, stopYoutubeCommandLoop]);

  useEffect(() => {
    const channelUserId = selectedVideo?.uploader_user_id;
    if (!channelUserId || !user) {
      setChannelStats(null);
      return;
    }

    setChannelLoading(true);
    getChannelStats(channelUserId, user.id)
      .then(setChannelStats)
      .finally(() => setChannelLoading(false));
  }, [selectedVideo?.uploader_user_id, user]);

  useEffect(() => {
    const postId = selectedVideo?.local_post_id;
    if (!postId) {
      setEngagementStats(null);
      return;
    }

    getLocalVideoEngagement(postId).then(setEngagementStats);
  }, [selectedVideo?.local_post_id]);

  useEffect(() => {
    if (!selectedVideo) {
      setLiked(false);
      setDisliked(false);
      return;
    }

    const ext = externalReactions[selectedVideo.id];
    if (ext) {
      setLiked(ext.reaction === "like");
      setDisliked(ext.reaction === "dislike");
    } else {
      setLiked(false);
      setDisliked(false);
    }
  }, [selectedVideo?.id, externalReactions]);

  useEffect(() => {
    if (!selectedVideo) {
      setPlayerLoading(false);
      setPlayerError(null);
      return;
    }

    setPlayerLoading(true);
    setPlayerError(null);

    const timeoutId = window.setTimeout(() => {
      setPlayerLoading((prev) => {
        if (prev) {
          setPlayerError("ভিডিও লোড হতে দেরি হচ্ছে");
          return false;
        }
        return prev;
      });
    }, 30000);

    return () => window.clearTimeout(timeoutId);
  }, [selectedVideo?.id, playerReloadToken]);

  useEffect(() => {
    return () => {
      stopYoutubeCommandLoop();
    };
  }, [stopYoutubeCommandLoop]);

  useEffect(() => {
    if (user) markReelsSeen(user.id);
    setWatchHistory(readWatchHistory());
    setSearchHistory(readSearchHistory());
  }, [user]);

  const activeQuery = useMemo(() => {
    if (searchQuery.trim()) return searchQuery.trim();
    if (selectedChip !== "All") return selectedChip;
    return "";
  }, [searchQuery, selectedChip]);

  const loadMore = useCallback(async (reset = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    const cursor = reset ? 1 : page;
    // If no nextPageToken, pass undefined so feed-api uses rotating queries
    const currentPageToken = reset ? undefined : nextPageToken;
    try {
      let [externalResult, localResult] = await Promise.all([
        getBangladeshExternalVideos(cursor, 30, undefined, activeQuery || undefined, "long", refreshTick + cursor * 17, currentPageToken),
        getUploadedLongVideos(cursor, 12, activeQuery || undefined),
      ]);
      // Interleave local videos randomly into external results
      let merged = dedupeVideos([...externalResult.videos]);
      const localVideos = dedupeVideos(localResult.videos);
      // Spread local videos randomly throughout
      for (const lv of localVideos) {
        const pos = Math.floor(Math.random() * (merged.length + 1));
        merged.splice(pos, 0, lv);
      }

      if (!activeQuery && merged.length === 0 && cursor !== 1) {
        [externalResult, localResult] = await Promise.all([
          getBangladeshExternalVideos(1, 30, undefined, undefined, "long", refreshTick + Date.now() % 1000),
          getUploadedLongVideos(cursor, 12),
        ]);
        merged = dedupeVideos([...externalResult.videos]);
        for (const lv of dedupeVideos(localResult.videos)) {
          const pos = Math.floor(Math.random() * (merged.length + 1));
          merged.splice(pos, 0, lv);
        }
      }

      setExtVideos((prev) => {
        const base = reset ? [] : prev;
        const seen = new Set(base.map((v) => v.id));
        return dedupeVideos([...base, ...merged.filter((v) => !seen.has(v.id))]);
      });
      // Always keep hasMore true for unlimited scroll
      setHasMore(true);
      setNextPageToken(externalResult.nextPageToken);
      setPage(cursor + 1);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [page, activeQuery, refreshTick, nextPageToken]);

  useEffect(() => {
    if (!user) return;
    setPage(1);
    setHasMore(true);
    setExtVideos([]);
    setNextPageToken(undefined);
    loadingRef.current = false;
    const freshSeed = Date.now();
    const run = async () => {
      loadingRef.current = true;
      setLoading(true);
      try {
        let [externalResult, localResult] = await Promise.all([
          getBangladeshExternalVideos(randomExternalStartPage(freshSeed), 20, undefined, activeQuery || undefined, "long", freshSeed),
          getUploadedLongVideos(1, 10, activeQuery || undefined),
        ]);
        // Interleave local videos randomly
        let merged = dedupeVideos([...externalResult.videos]);
        for (const lv of dedupeVideos(localResult.videos)) {
          const pos = Math.floor(Math.random() * (merged.length + 1));
          merged.splice(pos, 0, lv);
        }

        if (!activeQuery && merged.length === 0) {
          [externalResult, localResult] = await Promise.all([
            getBangladeshExternalVideos(1, 20, undefined, undefined, "long", freshSeed),
            getUploadedLongVideos(1, 10),
          ]);
          merged = dedupeVideos([...externalResult.videos]);
          for (const lv of dedupeVideos(localResult.videos)) {
            const pos = Math.floor(Math.random() * (merged.length + 1));
            merged.splice(pos, 0, lv);
          }
        }

        setExtVideos(merged);
        setHasMore(localResult.hasMore || externalResult.hasMore);
        setNextPageToken(externalResult.nextPageToken);
        setPage(2);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    };
    run();
  }, [user, activeQuery, refreshTick]);

  // Infinite scroll observer
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingRef.current) loadMore();
      },
      { threshold: 0, rootMargin: "800px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  // Auto-refresh: prepend fresh videos every 90 seconds (but DON'T reset the list)
  useEffect(() => {
    if (!user) return;
    const interval = window.setInterval(async () => {
      // Silently fetch new videos and prepend without clearing current list
      try {
        const [externalResult] = await Promise.all([
          getBangladeshExternalVideos(randomExternalStartPage(Date.now()), 15, undefined, activeQuery || undefined, "long", Date.now()),
        ]);
        const fresh = dedupeVideos(externalResult.videos);
        if (fresh.length > 0) {
          setExtVideos((prev) => {
            const seen = new Set(prev.map((v) => v.id));
            const newOnes = fresh.filter((v) => !seen.has(v.id));
            return newOnes.length > 0 ? [...newOnes, ...prev] : prev;
          });
        }
      } catch {}
    }, 90_000);
    return () => window.clearInterval(interval);
  }, [user, activeQuery]);

  const allVideos = useMemo<VideoItem[]>(() => {
    return extVideos.map((v) => ({
      id: v.id,
      title: v.title,
      video_url: v.video_url,
      watch_url: v.watch_url,
      thumbnail_url: v.thumbnail_url,
      creator: v.creator || "",
      duration: v.duration,
      isExternal: v.source !== "good-app",
      uploader_user_id: v.uploader_user_id,
      uploader_guest_id: v.uploader_guest_id,
      uploader_avatar_url: v.uploader_avatar_url,
      uploader_is_verified_badge: v.uploader_is_verified_badge,
      local_post_id: v.local_post_id,
      likes_count: v.likes_count,
      comments_count: v.comments_count,
    }));
  }, [extVideos]);

  const handleLongVideoSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    video.preload = "metadata";
    video.src = objectUrl;
    video.onloadedmetadata = () => {
      const duration = Math.floor(video.duration || 0);
      if (duration > 3600) {
        URL.revokeObjectURL(objectUrl);
        alert("সর্বোচ্চ ১ ঘণ্টার ভিডিও আপলোড করা যাবে।");
        return;
      }
      setLongVideoFile(file);
      setLongVideoPreview(objectUrl);
      setLongVideoDuration(duration);
      if (!longTitle.trim()) {
        setLongTitle(file.name.replace(/\.[^/.]+$/, ""));
      }
    };
  }, [longTitle]);

  const submitLongVideo = useCallback(async () => {
    if (!user || !longVideoFile) return;
    try {
      setUploading(true);
      const videoUrl = await uploadPostMedia(longVideoFile, longVideoFile.name);
      let thumbnailUrl: string | undefined;
      if (longThumbnailFile) {
        thumbnailUrl = await uploadPostMedia(longThumbnailFile, `thumb_${longThumbnailFile.name}`);
      }
      await createLongVideoUploadWithThumbnail(user.id, videoUrl, longTitle.trim() || longVideoFile.name, longVideoDuration, thumbnailUrl);
      setShowUpload(false);
      setLongVideoFile(null);
      setLongVideoPreview(null);
      setLongTitle("");
      setLongVideoDuration(undefined);
      setLongThumbnailFile(null);
      setLongThumbnailPreview(null);
      await loadMore(true);
    } finally {
      setUploading(false);
    }
  }, [loadMore, longTitle, longVideoDuration, longVideoFile, longThumbnailFile, user]);

  // Only clear selectedVideo if the video list becomes empty, never auto-clear a playing video
  useEffect(() => {
    if (allVideos.length === 0 && !loading) {
      setSelectedVideo(null);
    }
  }, [allVideos.length, loading]);

  const getViewCount = useCallback((id: string) => {
    if (!viewCounts[id]) {
      (viewCounts as any)[id] = viewCount();
    }
    return viewCounts[id];
  }, [viewCounts]);

  const handleSearch = useCallback(() => {
    const q = searchInput.trim();
    setSearchQuery(q);
    if (q) {
      setSelectedChip("All");
      saveSearchHistory(q);
      setSearchHistory(readSearchHistory());
    }
    setSearchMode(false);
    // Scroll to top after search
    setTimeout(() => mainRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 100);
  }, [searchInput]);

  const handleChip = useCallback((chip: string) => {
    setSelectedChip(chip);
    setSearchQuery("");
    setSearchInput("");
    setTimeout(() => mainRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 100);
  }, []);

  const playVideo = useCallback((v: VideoItem) => {
    trackVideoPreference({ title: v.title });
    saveToWatchHistory(v);
    setWatchHistory(readWatchHistory());
    setSelectedVideo(v);
    setMiniPlayer(false);
    setTimeout(() => {
      playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, 50);
  }, []);

  const openSearch = useCallback(() => {
    setSearchHistory(readSearchHistory());
    setSearchMode(true);
    setTimeout(() => searchRef.current?.focus(), 100);
  }, []);

  const handleRefreshFeed = useCallback(() => {
    setSelectedVideo(null);
    setMiniPlayer(false);
    loadingRef.current = false;
    setPage(1);
    setHasMore(true);
    setExtVideos([]);
    setRefreshTick((prev) => prev + 1);
    mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const requestFullscreen = useCallback(async () => {
    const shell = playerShellRef.current;
    if (!shell) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        try { await (screen.orientation as any).unlock?.(); } catch {}
        return;
      }

      if (shell.requestFullscreen) {
        await shell.requestFullscreen();
        try { await (screen.orientation as any).lock?.("landscape"); } catch {}
        
        // Listen for fullscreen exit to unlock orientation
        const onFullscreenChange = () => {
          if (!document.fullscreenElement) {
            try { (screen.orientation as any).unlock?.(); } catch {}
            document.removeEventListener("fullscreenchange", onFullscreenChange);
          }
        };
        document.addEventListener("fullscreenchange", onFullscreenChange);
        return;
      }

      const videoElement = shell.querySelector("video") as HTMLVideoElement | null;
      const webkitVideo = videoElement as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
      if (webkitVideo?.webkitEnterFullscreen) {
        webkitVideo.webkitEnterFullscreen();
      }
    } catch (error) {
      console.warn("Fullscreen request failed", error);
    }
  }, []);

  const handleSubscribe = useCallback(async () => {
    if (!user || !selectedVideo?.uploader_user_id || selectedVideo.uploader_user_id === user.id) return;
    setSubscribeLoading(true);
    try {
      await toggleChannelSubscription(user.id, selectedVideo.uploader_user_id);
      const stats = await getChannelStats(selectedVideo.uploader_user_id, user.id);
      setChannelStats(stats);
    } finally {
      setSubscribeLoading(false);
    }
  }, [selectedVideo?.uploader_user_id, user]);

  if (isLoading || !user) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0f0f0f", color: "#fff" }}>
      <header className="sticky top-0 z-20" style={{ background: "#0f0f0f" }}>
        {searchMode ? (
          <>
          <div className="flex items-center gap-2 px-2 py-2">
            <button onClick={() => setSearchMode(false)} className="h-10 w-10 shrink-0 grid place-items-center">
              <ArrowLeft className="w-5 h-5" style={{ color: "#fff" }} />
            </button>
            <div className="flex-1 relative">
              <input
                ref={searchRef}
                value={searchInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchInput(val);
                  // Fetch YouTube suggestions with debounce
                  if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
                  if (val.trim().length >= 2) {
                    suggestTimerRef.current = setTimeout(async () => {
                      const suggestions = await fetchYouTubeSuggestions(val.trim());
                      setYtSuggestions(suggestions);
                    }, 300);
                  } else {
                    setYtSuggestions([]);
                  }
                }}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search good-app"
                className="w-full h-10 rounded-full px-4 pr-20 text-sm outline-none"
                style={{ background: "#222", color: "#fff", border: "1px solid #333" }}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {searchInput && (
                  <button onClick={() => setSearchInput("")}>
                    <X className="w-4 h-4" style={{ color: "#aaa" }} />
                  </button>
                )}
                <button
                  onClick={() => {
                    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
                      alert("আপনার ব্রাউজার ভয়েস সার্চ সাপোর্ট করে না");
                      return;
                    }
                    setVoiceListening(true);
                    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
                    const recognition = new SpeechRecognition();
                    recognition.lang = 'bn-BD';
                    recognition.continuous = false;
                    recognition.interimResults = false;
                    recognition.onresult = (event: any) => {
                      const transcript = event.results[0][0].transcript;
                      setSearchInput(transcript);
                      setVoiceListening(false);
                      setTimeout(() => handleSearch(), 300);
                    };
                    recognition.onerror = () => {
                      setVoiceListening(false);
                      setSearchInput("");
                    };
                    recognition.onend = () => {
                      setVoiceListening(false);
                    };
                    recognition.start();
                  }}
                  className="w-8 h-8 rounded-full grid place-items-center"
                  style={{ background: "#333" }}
                  title="🎤 ক্লিক করে বাংলায় বলুন"
                >
                  <Mic className="w-4 h-4" style={{ color: "#ff4444" }} />
                </button>
              </div>
            </div>
            <button onClick={handleSearch} className="h-10 w-10 shrink-0 rounded-full grid place-items-center" style={{ background: "#222" }}>
              <Search className="w-5 h-5" style={{ color: "#fff" }} />
            </button>
          </div>
          {/* Search suggestions - filter as user types */}
          {(() => {
            const q = searchInput.trim().toLowerCase();
            // Show YouTube suggestions when typing, history when empty
            const suggestions = q && ytSuggestions.length > 0
              ? ytSuggestions.filter(s => s.toLowerCase() !== q)
              : q
                ? searchHistory.filter(s => s.toLowerCase().includes(q) && s.toLowerCase() !== q)
                : searchHistory;
            if (suggestions.length === 0) return null;
            return (
              <div className="px-2 pb-2 space-y-0.5" style={{ maxHeight: "60vh", overflowY: "auto" }}>
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-[13px] font-medium" style={{ color: "#aaa" }}>{q ? "সাজেশন" : "সার্চ হিস্ট্রি"}</span>
                  {!q && (
                    <button
                      onClick={() => {
                        window.localStorage.removeItem(SEARCH_HISTORY_KEY);
                        setSearchHistory([]);
                      }}
                      className="text-[11px] px-2 py-1 rounded"
                      style={{ color: "#3ea6ff" }}
                    >
                      Clear all
                    </button>
                  )}
                </div>
                {suggestions.map((item, idx) => (
                  <div key={`${item}-${idx}`} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: "#1a1a1a" }}>
                    {q ? <Search className="w-4 h-4 shrink-0" style={{ color: "#717171" }} /> : <History className="w-4 h-4 shrink-0" style={{ color: "#717171" }} />}
                    <button
                      className="flex-1 text-left text-[14px] truncate"
                      style={{ color: "#f1f1f1" }}
                      onClick={() => {
                        setSearchInput(item);
                        setSearchQuery(item);
                        setSelectedChip("All");
                        setSearchMode(false);
                        saveSearchHistory(item);
                        setYtSuggestions([]);
                        setTimeout(() => mainRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 100);
                      }}
                    >
                      {item}
                    </button>
                    {!q && (
                      <button
                        onClick={() => {
                          removeSearchHistoryItem(item);
                          setSearchHistory(readSearchHistory());
                        }}
                        className="shrink-0"
                      >
                        <X className="w-3.5 h-3.5" style={{ color: "#717171" }} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
          </>
        ) : (
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-1">
              <button onClick={() => navigate("/dashboard")} className="h-10 w-10 shrink-0 grid place-items-center" title="হোমে ফিরে যান">
                <Home className="w-5 h-5" style={{ color: "#fff" }} />
              </button>
              {selectedVideo && (
                <button onClick={() => { setSelectedVideo(null); setMiniPlayer(false); }} className="h-8 w-8 shrink-0 grid place-items-center rounded-full ml-[-4px]" style={{ background: "#272727" }} title="ভিডিও বন্ধ করুন">
                  <X className="w-4 h-4" style={{ color: "#fff" }} />
                </button>
              )}
              <div className="flex items-center gap-1.5">
                <img
                  src={goodAppLogo}
                  alt="good-app logo"
                  className="h-7 w-7 object-cover rounded-sm shadow-lg"
                  loading="lazy"
                />
                <span className="font-black text-[18px] tracking-tight" style={{ background: "linear-gradient(90deg, #fff, #e3f0ff, #ffd600)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>good-app</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={handleRefreshFeed} className="h-10 w-10 grid place-items-center rounded-full">
                <RefreshCcw className="w-5 h-5" style={{ color: "#fff" }} />
              </button>
              <button onClick={() => { setShowHistorySheet(true); setWatchHistory(readWatchHistory()); }} className="h-10 w-10 grid place-items-center rounded-full overflow-hidden" title="My Channel & History">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <User className="w-5 h-5" style={{ color: "#fff" }} />
                )}
              </button>
              <button
                onClick={async () => {
                  const channelUrl = `${window.location.origin}/channel/${user.id}`;
                  if (navigator.share) {
                    try { await navigator.share({ title: "My channel", url: channelUrl }); return; } catch (e: any) { if (e?.name === "AbortError") return; }
                  }
                  try { await navigator.clipboard.writeText(channelUrl); } catch {
                    const ta = document.createElement("textarea"); ta.value = channelUrl; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
                  }
                  alert("Channel link copied: " + channelUrl);
                }}
                className="h-10 w-10 grid place-items-center rounded-full"
                title="Share my channel"
              >
                <Share2 className="w-5 h-5" style={{ color: "#fff" }} />
              </button>
              <button className="h-10 w-10 grid place-items-center rounded-full relative">
                <Bell className="w-5 h-5" style={{ color: "#fff" }} />
              </button>
              <button onClick={openSearch} className="h-10 w-10 grid place-items-center rounded-full">
                <Search className="w-5 h-5" style={{ color: "#fff" }} />
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2 px-3 pb-2 overflow-x-auto scrollbar-hide">
          {CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => handleChip(chip)}
              className="shrink-0 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors"
              style={
                selectedChip === chip
                  ? { background: "#fff", color: "#0f0f0f" }
                  : { background: "#272727", color: "#f1f1f1" }
              }
            >
              {chip}
            </button>
          ))}
        </div>

        <div className="px-3 pb-2 text-[12px] text-muted-foreground">
          {searchQuery.trim()
            ? `Showing search results for "${searchQuery.trim()}"`
            : "Showing suggested new Bangla HD songs"}
        </div>
      </header>

      {selectedVideo && !miniPlayer && (
        <div ref={playerRef} className="shrink-0 z-10" style={{ background: "#000" }}>
          <div ref={playerShellRef} className="w-full aspect-video relative overflow-hidden" style={{ background: "#000" }}>
            {/* Hide YouTube logo with good-app branding */}
            {selectedVideo.isExternal && isYouTubeEmbed(selectedVideo.video_url) && (
              <div className="absolute bottom-[26px] right-0 w-[200px] h-[36px] z-[6] pointer-events-none flex items-center justify-end pr-[6px] overflow-hidden" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.9) 10%)" }}>
                <span className="text-[20px] font-black tracking-wider" style={{
                  background: "linear-gradient(135deg, #22c55e 0%, #4ade80 30%, #86efac 50%, #4ade80 70%, #22c55e 100%)",
                  backgroundSize: "200% 200%",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  animation: "shimmer-text 3s ease-in-out infinite",
                  textShadow: "none",
                  letterSpacing: "0.5px",
                }}>
                  good-<span style={{
                    background: "linear-gradient(135deg, #f97316 0%, #fb923c 50%, #f97316 100%)",
                    backgroundSize: "200% 200%",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    animation: "shimmer-text 3s ease-in-out infinite 0.5s",
                  }}>app</span>
                </span>
              </div>
            )}
            {selectedVideo.isExternal && isEmbed(selectedVideo.video_url) ? (
              <iframe
                key={`${selectedVideo.id}-${playerReloadToken}`}
                src={buildExternalPlayerUrl(
                  selectedVideo.video_url,
                  false,
                )}
                title={selectedVideo.title}
                className="w-full h-full"
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope"
                allowFullScreen
                onError={() => {
                  setPlayerLoading(false);
                  setPlayerError("ভিডিও লোড করা যায়নি");
                }}
                ref={(node) => {
                  youtubeIframeRef.current = node;
                }}
                onLoad={() => {
                  setPlayerLoading(false);
                  setPlayerError(null);
                  if (selectedVideo.isExternal && isYouTubeEmbed(selectedVideo.video_url)) {
                    window.setTimeout(() => {
                      postYoutubeCommand("unMute");
                      postYoutubeCommand("setVolume", [100]);
                    }, 80);
                  }
                }}
              />
            ) : (
              <video
                key={`${selectedVideo.id}-${playerReloadToken}`}
                src={selectedVideo.video_url}
                controls
                autoPlay
                playsInline
                preload="metadata"
                onLoadedData={() => {
                  setPlayerLoading(false);
                  setPlayerError(null);
                }}
                onCanPlay={() => {
                  setPlayerLoading(false);
                  setPlayerError(null);
                }}
                onError={() => {
                  setPlayerLoading(false);
                  setPlayerError("ভিডিও প্লে করা যায়নি");
                }}
                className="w-full h-full object-contain"
              />
            )}
            {playerLoading && (
              <div className="absolute inset-0 z-20 grid place-items-center" style={{ background: "#000" }}>
                {selectedVideo.thumbnail_url && (
                  <img src={selectedVideo.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40 blur-sm" />
                )}
                <div className="absolute top-0 left-0 right-0 h-1 overflow-hidden">
                  <div className="h-full bg-red-600 animate-pulse" style={{ width: "60%", animation: "loading-bar 1.5s ease-in-out infinite" }} />
                </div>
                <div className="flex flex-col items-center gap-2 z-10">
                  <Loader2 className="h-8 w-8 animate-spin text-white" />
                  <span className="text-sm text-white/80">ভিডিও লোড হচ্ছে...</span>
                </div>
              </div>
            )}
            {playerError && !playerLoading && (
              <div className="absolute inset-0 z-20 grid place-items-center bg-background/75 px-4">
                <div className="w-full max-w-xs rounded-lg border border-border bg-card p-4 text-card-foreground">
                  <p className="text-sm mb-1">{playerError}</p>
                  <p className="text-xs text-muted-foreground mb-3">ইন্টারনেট সংযোগ চেক করুন এবং আবার চেষ্টা করুন</p>
                  <button
                    type="button"
                    onClick={() => {
                      setPlayerError(null);
                      setPlayerLoading(true);
                      setPlayerReloadToken((prev) => prev + 1);
                    }}
                    className="h-10 w-full rounded-md bg-primary text-primary-foreground text-sm font-semibold"
                  >
                    🔄 আবার চেষ্টা করুন
                  </button>
                </div>
              </div>
            )}
            {selectedVideo.isExternal && isYouTubeEmbed(selectedVideo.video_url) && showYoutubeTapToPlay && (
              <button
                type="button"
                onClick={playYoutubeWithSound}
                className="absolute inset-0 z-20 grid place-items-center"
                style={{ background: "rgba(0,0,0,0.55)" }}
              >
                <span
                  className="px-5 py-2.5 rounded-full text-sm font-semibold"
                  style={{ background: "rgba(0,0,0,0.78)", color: "#fff", border: "1px solid rgba(255,255,255,0.35)" }}
                >
                  Tap to play with sound
                </span>
              </button>
            )}
            <button
              onClick={requestFullscreen}
              className="absolute bottom-2 right-2 w-9 h-9 rounded-full grid place-items-center z-10"
              style={{ background: "rgba(0,0,0,0.7)" }}
            >
              <Maximize className="w-4 h-4" style={{ color: "#fff" }} />
            </button>
          </div>
          <button
            onClick={() => setMiniPlayer(true)}
            className="w-full flex items-center justify-center py-1.5"
            style={{ background: "#0f0f0f" }}
          >
            <div className="w-10 h-1 rounded-full" style={{ background: "#555" }} />
          </button>
          <div className="px-3 py-3" style={{ background: "#0f0f0f" }}>
            <h2 className="font-medium text-[15px] leading-5 line-clamp-2" style={{ color: "#f1f1f1" }}>
              {selectedVideo.title}
            </h2>
            <p className="text-[12px] mt-1" style={{ color: "#aaa" }}>
              {getViewCount(selectedVideo.id)} • {selectedVideo.duration ? fmt(selectedVideo.duration) : ""}
            </p>
          </div>

          {/* YouTube-style action buttons */}
          <div className="flex items-center gap-1 px-2 py-2 overflow-x-auto scrollbar-hide" style={{ background: "#0f0f0f", borderBottom: "1px solid #272727" }}>
            <button
              onClick={async () => {
                if (liked) {
                  setLiked(false);
                  if (selectedVideo.local_post_id && user) {
                    toggleReaction(selectedVideo.local_post_id, user.id, "like").catch(() => {});
                    getLocalVideoEngagement(selectedVideo.local_post_id).then(setEngagementStats);
                  } else {
                    setExternalReactions(prev => {
                      const cur = prev[selectedVideo.id] || { reaction: null, likes: 0 };
                      return { ...prev, [selectedVideo.id]: { reaction: null, likes: Math.max(0, cur.likes - 1) } };
                    });
                  }
                } else {
                  setLiked(true);
                  setDisliked(false);
                  if (selectedVideo.local_post_id && user) {
                    toggleReaction(selectedVideo.local_post_id, user.id, "like").catch(() => {});
                    getLocalVideoEngagement(selectedVideo.local_post_id).then(setEngagementStats);
                  } else {
                    setExternalReactions(prev => {
                      const cur = prev[selectedVideo.id] || { reaction: null, likes: selectedVideo.likes_count || 0 };
                      const nextLikes = cur.reaction === "like" ? cur.likes : cur.likes + 1;
                      return { ...prev, [selectedVideo.id]: { reaction: "like", likes: nextLikes } };
                    });
                  }
                }
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium"
              style={{ background: "#272727", color: liked ? "#3ea6ff" : "#f1f1f1" }}
            >
              <ThumbsUp className="w-5 h-5" />
              <span>{engagementStats?.likes_count ?? externalReactions[selectedVideo.id]?.likes ?? selectedVideo.likes_count ?? 0}</span>
            </button>

            <button
              onClick={() => {
                if (disliked) {
                  setDisliked(false);
                  if (!selectedVideo.local_post_id) {
                    setExternalReactions(prev => {
                      const cur = prev[selectedVideo.id] || { reaction: null, likes: selectedVideo.likes_count || 0 };
                      return { ...prev, [selectedVideo.id]: { reaction: null, likes: cur.likes } };
                    });
                  }
                } else {
                  setDisliked(true);
                  setLiked(false);
                  if (selectedVideo.local_post_id && user) {
                    toggleReaction(selectedVideo.local_post_id, user.id, "dislike").catch(() => {});
                    getLocalVideoEngagement(selectedVideo.local_post_id).then(setEngagementStats);
                  } else {
                    setExternalReactions(prev => {
                      const cur = prev[selectedVideo.id] || { reaction: null, likes: selectedVideo.likes_count || 0 };
                      const nextLikes = cur.reaction === "like" ? Math.max(0, cur.likes - 1) : cur.likes;
                      return { ...prev, [selectedVideo.id]: { reaction: "dislike", likes: nextLikes } };
                    });
                  }
                }
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium"
              style={{ background: "#272727", color: disliked ? "#3ea6ff" : "#f1f1f1" }}
            >
              <ThumbsDown className="w-5 h-5" />
              <span>Dislike</span>
            </button>

            <button
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium"
              style={{ background: "#272727", color: "#f1f1f1" }}
              onClick={async () => {
                const shareUrl = selectedVideo.isExternal
                  ? selectedVideo.watch_url || selectedVideo.video_url
                  : `${window.location.origin}/watch/${selectedVideo.local_post_id || selectedVideo.id}`;
                if (navigator.share) {
                  try {
                    await navigator.share({ title: selectedVideo.title, url: shareUrl });
                    return;
                  } catch (e: any) {
                    if (e?.name === "AbortError") return;
                  }
                }
                try {
                  await navigator.clipboard.writeText(shareUrl);
                } catch {
                  const ta = document.createElement("textarea");
                  ta.value = shareUrl;
                  ta.style.position = "fixed";
                  ta.style.opacity = "0";
                  document.body.appendChild(ta);
                  ta.select();
                  document.execCommand("copy");
                  document.body.removeChild(ta);
                }
                alert("Link copied: " + shareUrl);
              }}
            >
              <Share2 className="w-5 h-5" />
              <span>Share</span>
            </button>

            <button
              onClick={async () => {
                setShowComments(true);
                if (selectedVideo.local_post_id) {
                  setCommentsLoading(true);
                  const c = await getPostComments(selectedVideo.local_post_id, user?.id);
                  setComments(c);
                  setCommentsLoading(false);
                }
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium"
              style={{ background: "#272727", color: "#f1f1f1" }}
            >
              <MessageSquare className="w-5 h-5" />
              <span>{engagementStats?.comments_count ?? selectedVideo.comments_count ?? 0}</span>
            </button>
          </div>

          {/* Channel info */}
          <div className="px-3 py-3 flex items-center justify-between gap-2" style={{ background: "#0f0f0f", borderBottom: "1px solid #272727" }}>
            <button
              type="button"
              onClick={() => selectedVideo.uploader_user_id && navigate(`/channel/${selectedVideo.uploader_user_id}`)}
              className="flex items-center gap-2.5 min-w-0"
              disabled={!selectedVideo.uploader_user_id}
            >
              <div className="w-9 h-9 rounded-full overflow-hidden" style={{ background: "#272727" }}>
                {selectedVideo.uploader_avatar_url ? (
                  <img src={selectedVideo.uploader_avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-xs font-bold" style={{ color: "#aaa" }}>
                    {(selectedVideo.creator || "?")[0]?.toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 text-left">
                <p className="text-[13px] font-semibold truncate flex items-center gap-1" style={{ color: "#f1f1f1" }}>
                  <span>{selectedVideo.creator || selectedVideo.uploader_guest_id || "Unknown"}</span>
                  {selectedVideo.uploader_is_verified_badge && <VerifiedBadge className="h-3.5 w-3.5" />}
                </p>
                <p className="text-[11px]" style={{ color: "#aaa" }}>
                  {channelLoading ? "..." : `${channelStats?.subscriber_count || 0} subscribers`}
                </p>
              </div>
            </button>
            {selectedVideo.uploader_user_id && selectedVideo.uploader_user_id !== user.id && (
              <button
                onClick={handleSubscribe}
                disabled={subscribeLoading}
                className="px-4 py-2 rounded-full text-[13px] font-semibold"
                style={channelStats?.is_subscribed ? { background: "#272727", color: "#f1f1f1" } : { background: "#fff", color: "#0f0f0f" }}
              >
                {subscribeLoading ? "..." : channelStats?.is_subscribed ? "Subscribed" : "Subscribe"}
              </button>
            )}
          </div>

          <div className="px-3 py-2 flex items-center gap-2" style={{ background: "#0f0f0f", borderBottom: "1px solid #272727" }}>
            <span className="text-[14px] font-semibold" style={{ color: "#f1f1f1" }}>Up next</span>
            <span className="text-[12px]" style={{ color: "#aaa" }}>
              • {searchQuery.trim() ? `search results for "${searchQuery.trim()}"` : "suggested new Bangla HD songs"}
            </span>
          </div>
        </div>
      )}

      {/* YouTube-style Comment Bottom Sheet */}
      <AnimatePresence>
        {showComments && selectedVideo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100]"
            style={{ background: "rgba(0,0,0,0.6)" }}
            onClick={() => setShowComments(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 rounded-t-2xl flex flex-col"
              style={{ background: "#212121", maxHeight: "70vh" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #383838" }}>
                <h3 className="text-[16px] font-bold" style={{ color: "#f1f1f1" }}>Comments</h3>
                <button onClick={() => setShowComments(false)} className="w-9 h-9 rounded-full grid place-items-center" style={{ background: "#383838" }}>
                  <X className="w-5 h-5" style={{ color: "#f1f1f1" }} />
                </button>
              </div>

              {/* Sort tabs */}
              <div className="flex gap-2 px-4 py-2" style={{ borderBottom: "1px solid #383838" }}>
                <button className="px-3 py-1.5 rounded-lg text-[13px] font-medium" style={{ background: "#f1f1f1", color: "#0f0f0f" }}>Top</button>
                <button className="px-3 py-1.5 rounded-lg text-[13px] font-medium" style={{ background: "#383838", color: "#f1f1f1" }}>Newest</button>
              </div>

              {/* Comments list */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                {commentsLoading ? (
                  <div className="py-8 flex justify-center">
                    <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#aaa" }} />
                  </div>
                ) : comments.length === 0 ? (
                  <div className="py-8 text-center">
                    <MessageSquare className="w-10 h-10 mx-auto mb-2" style={{ color: "#555" }} />
                    <p className="text-[14px]" style={{ color: "#aaa" }}>No comments yet</p>
                    <p className="text-[12px]" style={{ color: "#717171" }}>Be the first to comment</p>
                  </div>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="flex gap-3">
                      <div className="w-8 h-8 rounded-full shrink-0 overflow-hidden" style={{ background: "#383838" }}>
                        {c.user?.avatar_url ? (
                          <img src={c.user.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full grid place-items-center text-[11px] font-bold" style={{ color: "#aaa" }}>
                            {(c.user?.display_name || "?")[0]?.toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] flex items-center gap-1" style={{ color: "#aaa" }}>
                          <span className="font-medium">@{c.user?.display_name || c.user?.guest_id || "User"}</span>
                          {c.user?.is_verified_badge && <VerifiedBadge className="h-3 w-3" />}
                          <span>•</span>
                          <span>{c.created_at ? new Date(c.created_at).toLocaleDateString() : ""}</span>
                        </p>
                        <p className="text-[13px] mt-0.5 leading-[18px]" style={{ color: "#f1f1f1" }}>{c.content}</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <button className="flex items-center gap-1 text-[12px]" style={{ color: "#aaa" }}>
                            <ThumbsUp className="w-4 h-4" />
                            <span>{c.likes_count || 0}</span>
                          </button>
                          <button className="flex items-center gap-1 text-[12px]" style={{ color: "#aaa" }}>
                            <ThumbsDown className="w-4 h-4" />
                          </button>
                          <button className="flex items-center gap-1 text-[12px]" style={{ color: "#aaa" }}>
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Reply</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Comment input */}
              <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: "1px solid #383838", background: "#212121" }}>
                <div className="w-8 h-8 rounded-full shrink-0 overflow-hidden" style={{ background: "#383838" }}>
                  {user?.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-[11px] font-bold" style={{ color: "#aaa" }}>
                      {(user?.display_name || "?")[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 h-9 rounded-full px-4 text-[13px] outline-none"
                  style={{ background: "#383838", color: "#f1f1f1", border: "none" }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && commentText.trim()) {
                      e.preventDefault();
                      (async () => {
                        if (!selectedVideo.local_post_id || !user) return;
                        setCommentSending(true);
                        await addComment(selectedVideo.local_post_id, user.id, commentText.trim());
                        setCommentText("");
                        const c = await getPostComments(selectedVideo.local_post_id, user.id);
                        setComments(c);
                        const stats = await getLocalVideoEngagement(selectedVideo.local_post_id);
                        setEngagementStats(stats);
                        setCommentSending(false);
                      })();
                    }
                  }}
                />
                <button
                  disabled={!commentText.trim() || commentSending}
                  onClick={async () => {
                    if (!selectedVideo.local_post_id || !user || !commentText.trim()) return;
                    setCommentSending(true);
                    await addComment(selectedVideo.local_post_id, user.id, commentText.trim());
                    setCommentText("");
                    const c = await getPostComments(selectedVideo.local_post_id, user.id);
                    setComments(c);
                    const stats = await getLocalVideoEngagement(selectedVideo.local_post_id);
                    setEngagementStats(stats);
                    setCommentSending(false);
                  }}
                  className="w-9 h-9 rounded-full grid place-items-center"
                  style={{ background: commentText.trim() ? "#3ea6ff" : "#383838" }}
                >
                  {commentSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#fff" }} />
                  ) : (
                    <Send className="w-4 h-4" style={{ color: commentText.trim() ? "#0f0f0f" : "#717171" }} />
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile & Watch History Bottom Sheet */}
      <AnimatePresence>
        {showHistorySheet && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100]"
            style={{ background: "rgba(0,0,0,0.6)" }}
            onClick={() => setShowHistorySheet(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 rounded-t-2xl flex flex-col"
              style={{ background: "#212121", maxHeight: "80vh" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Handle bar */}
              <div className="flex justify-center py-2">
                <div className="w-10 h-1 rounded-full" style={{ background: "#555" }} />
              </div>

              {/* Profile section */}
              <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid #383838" }}>
                <div className="w-12 h-12 rounded-full overflow-hidden" style={{ background: "#383838" }}>
                  {user?.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-lg font-bold" style={{ color: "#aaa" }}>
                      {(user?.display_name || "?")[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold truncate" style={{ color: "#f1f1f1" }}>{user?.display_name || user?.guest_id}</p>
                  <button
                    onClick={() => { setShowHistorySheet(false); navigate(`/channel/${user.id}`); }}
                    className="text-[13px] mt-0.5"
                    style={{ color: "#3ea6ff" }}
                  >
                    View your channel
                  </button>
                </div>
              </div>

              {/* Watch History */}
              <div className="px-4 py-3" style={{ borderBottom: "1px solid #383838" }}>
                <div className="flex items-center gap-2 mb-3">
                  <History className="w-4.5 h-4.5" style={{ color: "#aaa" }} />
                  <span className="text-[15px] font-semibold" style={{ color: "#f1f1f1" }}>সম্প্রতি দেখা হয়েছে</span>
                </div>
                {watchHistory.length === 0 ? (
                  <p className="text-[13px] py-4 text-center" style={{ color: "#717171" }}>কোনো ভিডিও দেখা হয়নি</p>
                ) : (
                  <div className="space-y-2 max-h-[45vh] overflow-y-auto">
                    {watchHistory.slice(0, 20).map((h) => (
                      <button
                        key={h.id}
                        onClick={() => {
                          setShowHistorySheet(false);
                          playVideo({
                            id: h.id,
                            title: h.title,
                            video_url: h.video_url,
                            watch_url: h.watch_url,
                            thumbnail_url: h.thumbnail_url,
                            creator: h.creator,
                            duration: h.duration,
                            isExternal: h.isExternal,
                            uploader_user_id: h.uploader_user_id,
                            uploader_guest_id: h.uploader_guest_id,
                            uploader_avatar_url: h.uploader_avatar_url,
                            uploader_is_verified_badge: h.uploader_is_verified_badge,
                            local_post_id: h.local_post_id,
                            likes_count: h.likes_count,
                            comments_count: h.comments_count,
                          });
                        }}
                        className="flex gap-3 w-full text-left"
                      >
                        <div className="w-[120px] h-[68px] shrink-0 rounded-lg overflow-hidden relative" style={{ background: "#1a1a1a" }}>
                          {h.thumbnail_url ? (
                            <img src={h.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className="w-full h-full grid place-items-center"><Play className="w-5 h-5" style={{ color: "#555" }} /></div>
                          )}
                          {h.duration ? (
                            <span className="absolute right-1 bottom-1 text-[9px] font-medium px-1 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.8)", color: "#fff" }}>
                              {fmt(h.duration)}
                            </span>
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1 py-0.5">
                          <p className="text-[13px] font-medium line-clamp-2 leading-[17px]" style={{ color: "#f1f1f1" }}>{h.title}</p>
                          <p className="text-[11px] mt-1 truncate" style={{ color: "#aaa" }}>{h.creator || "Unknown"}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Close button */}
              <div className="px-4 py-3">
                <button
                  onClick={() => setShowHistorySheet(false)}
                  className="w-full py-2.5 rounded-full text-[14px] font-medium"
                  style={{ background: "#383838", color: "#f1f1f1" }}
                >
                  বন্ধ করুন
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedVideo && miniPlayer && (
        <div
          className="fixed bottom-20 right-3 w-[180px] rounded-lg overflow-hidden shadow-2xl cursor-pointer z-50"
          style={{ background: "#000" }}
          onClick={() => setMiniPlayer(false)}
        >
          <div className="w-full aspect-video">
            {selectedVideo.isExternal && isEmbed(selectedVideo.video_url) ? (
              <iframe
                key={`mini-${selectedVideo.id}`}
                src={buildExternalPlayerUrl(selectedVideo.video_url, false)}
                title={selectedVideo.title}
                className="w-full h-full pointer-events-none"
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                allowFullScreen
              />
            ) : (
              <video
                key={`mini-${selectedVideo.id}`}
                src={selectedVideo.video_url}
                autoPlay
                playsInline
                className="w-full h-full object-contain pointer-events-none"
              />
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setSelectedVideo(null); setMiniPlayer(false); }}
            className="absolute top-1 right-1 w-6 h-6 rounded-full grid place-items-center"
            style={{ background: "rgba(0,0,0,0.7)" }}
          >
            <X className="w-3.5 h-3.5" style={{ color: "#fff" }} />
          </button>
        </div>
      )}

      <main ref={mainRef} className="flex-1 overflow-y-auto">
        <div className="pb-20">
          {allVideos.length === 0 && loading && (
            <div className="space-y-4 px-3 py-3">
              {[1,2,3].map(i => (
                <div key={i} className="animate-pulse">
                  <div className="w-full aspect-video rounded-xl" style={{ background: "#272727" }} />
                  <div className="flex gap-3 mt-3">
                    <div className="w-9 h-9 rounded-full shrink-0" style={{ background: "#272727" }} />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 rounded" style={{ background: "#272727", width: "80%" }} />
                      <div className="h-3 rounded" style={{ background: "#272727", width: "50%" }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {allVideos.length === 0 && !loading && (
            <div className="py-20 text-center text-sm" style={{ color: "#aaa" }}>
              {searchQuery.trim() ? `No search results for "${searchQuery.trim()}"` : "নতুন বাংলা HD গান লোড হচ্ছে..."}
            </div>
          )}

          {/* Watch history removed from here - now in profile sheet */}

          {allVideos.filter((v) => v.id !== selectedVideo?.id).map((video) => (
            <button
              key={video.id}
              onClick={() => playVideo(video)}
              className="w-full text-left"
            >
              {selectedVideo ? (
                <div className="flex gap-2.5 px-3 py-2">
                  <div className="w-[168px] h-[94px] shrink-0 rounded-lg overflow-hidden relative" style={{ background: "#1a1a1a" }}>
                    {video.thumbnail_url ? (
                      <img src={video.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full grid place-items-center" style={{ color: "#555" }}>
                        <Play className="w-8 h-8" />
                      </div>
                    )}
                    {video.duration ? (
                      <span className="absolute right-1 bottom-1 text-[10px] font-medium px-1 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.8)", color: "#fff" }}>
                        {fmt(video.duration)}
                      </span>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 py-0.5">
                    <p className="text-[13px] font-medium line-clamp-2 leading-[18px]" style={{ color: "#f1f1f1" }}>{video.title}</p>
                    <p className="text-[11px] mt-1 line-clamp-1" style={{ color: "#aaa" }}>{video.creator || "Unknown"}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "#aaa" }}>{getViewCount(video.id)}</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-full aspect-video relative" style={{ background: "#1a1a1a" }}>
                    {video.thumbnail_url ? (
                      <img src={video.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full grid place-items-center" style={{ color: "#555" }}>
                        <Play className="w-12 h-12" />
                      </div>
                    )}
                    {video.duration ? (
                      <span className="absolute right-1 bottom-1 text-[11px] font-medium px-1 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.8)", color: "#fff" }}>
                        {fmt(video.duration)}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex gap-3 px-3 py-3">
                    <div className="w-9 h-9 rounded-full grid place-items-center shrink-0 text-xs font-bold" style={{ background: "#272727", color: "#aaa" }}>
                      {(video.creator || "?")[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium line-clamp-2 leading-[20px]" style={{ color: "#f1f1f1" }}>{video.title}</p>
                      <p className="text-[12px] mt-0.5 line-clamp-1" style={{ color: "#aaa" }}>
                        {video.creator || "Unknown"} • {getViewCount(video.id)}{video.duration ? ` • ${fmt(video.duration)}` : ""}
                      </p>
                      {!video.isExternal && (
                        <p className="text-[11px] mt-0.5 text-primary">good-app upload</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </button>
          ))}

          <div ref={sentinelRef} className="h-12 flex items-center justify-center">
            {loading && <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#aaa" }} />}
          </div>
        </div>
      </main>

      <button
        onClick={() => setShowUpload(true)}
        className="fixed bottom-6 right-4 z-30 w-14 h-14 rounded-full shadow-lg grid place-items-center"
        style={{ background: "#ff0000" }}
      >
        <Plus className="w-7 h-7" style={{ color: "#fff" }} />
      </button>

      {showUpload && (
        <div className="fixed inset-0 z-40 bg-background/95 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card text-card-foreground p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Upload Long Video</h3>
              <button onClick={() => setShowUpload(false)} className="h-8 w-8 grid place-items-center rounded-full hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            <input
              value={longTitle}
              onChange={(e) => setLongTitle(e.target.value)}
              placeholder="ভিডিও টাইটেল"
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm outline-none"
            />

            {/* Thumbnail upload */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">থাম্বনেইল (ঐচ্ছিক)</p>
              {longThumbnailPreview ? (
                <div className="relative w-full aspect-video rounded-md overflow-hidden border border-border">
                  <img src={longThumbnailPreview} alt="Thumbnail" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => { setLongThumbnailFile(null); setLongThumbnailPreview(null); }}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-background/80 grid place-items-center"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => thumbnailInputRef.current?.click()}
                  className="w-full h-16 border border-dashed border-border rounded-md grid place-items-center text-muted-foreground"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <ImageIcon className="w-4 h-4" />
                    <span>থাম্বনেইল ছবি সিলেক্ট করুন</span>
                  </div>
                </button>
              )}
              <input
                ref={thumbnailInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setLongThumbnailFile(file);
                  setLongThumbnailPreview(URL.createObjectURL(file));
                }}
              />
            </div>

            {longVideoPreview ? (
              <video src={longVideoPreview} controls className="w-full rounded-md max-h-56" />
            ) : (
              <button
                onClick={() => uploadInputRef.current?.click()}
                className="w-full h-28 border border-dashed border-border rounded-md grid place-items-center text-muted-foreground"
              >
                <div className="flex flex-col items-center gap-2 text-sm">
                  <Video className="w-5 h-5" />
                  <span>Long ভিডিও সিলেক্ট করুন (সর্বোচ্চ ১ ঘণ্টা)</span>
                </div>
              </button>
            )}

            <input
              ref={uploadInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleLongVideoSelect}
            />

            <button
              onClick={submitLongVideo}
              disabled={!longVideoFile || uploading}
              className="w-full h-10 rounded-md bg-primary text-primary-foreground disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Upload to good-app Video
            </button>
          </div>
        </div>
      )}

      {/* Full-screen voice listening overlay */}
      <AnimatePresence>
        {voiceListening && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex flex-col items-center justify-center"
            style={{ background: "rgba(0,0,0,0.92)" }}
            onClick={() => setVoiceListening(false)}
          >
            <motion.div
              initial={{ scale: 0.5 }}
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              className="w-28 h-28 rounded-full flex items-center justify-center mb-6"
              style={{ background: "linear-gradient(135deg, #ff4444, #ff6b6b)", boxShadow: "0 0 60px rgba(255,68,68,0.5)" }}
            >
              <Mic className="w-14 h-14 text-white" />
            </motion.div>
            <p className="text-white text-xl font-bold mb-2">🎤 শুনছি...</p>
            <p className="text-white/60 text-sm">বাংলায় বলুন কী সার্চ করতে চান</p>
            <button
              onClick={() => setVoiceListening(false)}
              className="mt-8 px-6 py-2 rounded-full text-sm font-medium"
              style={{ background: "#333", color: "#fff" }}
            >
              বাতিল করুন
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
