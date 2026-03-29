import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Cast, Loader2, Bell, Search, X, Plus, Play, Upload, Video, RefreshCcw, Maximize, ThumbsUp, ThumbsDown, Share2, MessageSquare, Send, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import goodAppLogo from "@/assets/good-app-logo.jpg";
import VerifiedBadge from "@/components/VerifiedBadge";
import {
  createLongVideoUpload,
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
  type PostComment,
} from "@/lib/feed-api";

type VideoItem = {
  id: string;
  title: string;
  video_url: string;
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
  // YouTube autoplay with sound is often force-muted by browser policy.
  // We keep autoplay off and start playback through a user tap.
  if (isYouTubeEmbed(url)) {
    params.set("autoplay", autoplay ? "1" : "0");
    params.set("mute", "0");
    params.set("rel", "0");
    params.set("modestbranding", "1");
    params.set("playsinline", "1");
    params.set("enablejsapi", "1");
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
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChip, setSelectedChip] = useState("All");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [extVideos, setExtVideos] = useState<ExternalReelVideo[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [viewCounts] = useState<Record<string, string>>({});
  const [miniPlayer, setMiniPlayer] = useState(false);
  const [showYoutubeTapToPlay, setShowYoutubeTapToPlay] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [longTitle, setLongTitle] = useState("");
  const [longVideoFile, setLongVideoFile] = useState<File | null>(null);
  const [longVideoPreview, setLongVideoPreview] = useState<string | null>(null);
  const [longVideoDuration, setLongVideoDuration] = useState<number | undefined>(undefined);
  const [channelStats, setChannelStats] = useState<{ subscriber_count: number; total_videos: number; is_subscribed: boolean } | null>(null);
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
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const playerShellRef = useRef<HTMLDivElement>(null);
  const youtubeIframeRef = useRef<HTMLIFrameElement | null>(null);
  const youtubeCommandIntervalRef = useRef<number | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

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
    setLiked(false);
    setDisliked(false);
  }, [selectedVideo?.id]);

  useEffect(() => {
    return () => {
      stopYoutubeCommandLoop();
    };
  }, [stopYoutubeCommandLoop]);

  useEffect(() => {
    if (user) markReelsSeen(user.id);
  }, [user]);

  const activeQuery = useMemo(() => {
    if (searchQuery.trim()) return searchQuery.trim();
    if (selectedChip !== "All") return selectedChip;
    return "";
  }, [searchQuery, selectedChip]);

  const loadMore = useCallback(async (reset = false) => {
    if (loadingRef.current) return;
    if (!reset && !hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    const cursor = reset ? 1 : page;
    const requestPage = normalizeExternalPage(activeQuery ? cursor : cursor + refreshTick * 5);
    try {
      let [externalResult, localResult] = await Promise.all([
        getBangladeshExternalVideos(requestPage, 30, undefined, activeQuery || undefined, "long", refreshTick + cursor * 17),
        getUploadedLongVideos(cursor, 12, activeQuery || undefined),
      ]);
      let merged = dedupeVideos([...localResult.videos, ...externalResult.videos]);

      if (!activeQuery && merged.length === 0 && requestPage !== 1) {
        [externalResult, localResult] = await Promise.all([
          getBangladeshExternalVideos(1, 30, undefined, undefined, "long", refreshTick),
          getUploadedLongVideos(cursor, 12),
        ]);
        merged = dedupeVideos([...localResult.videos, ...externalResult.videos]);
      }

      setExtVideos((prev) => {
        const base = reset ? [] : prev;
        const seen = new Set(base.map((v) => v.id));
        return dedupeVideos([...base, ...merged.filter((v) => !seen.has(v.id))]);
      });
      setHasMore(localResult.hasMore || externalResult.hasMore);
      setPage(cursor + 1);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [hasMore, page, activeQuery, refreshTick]);

  useEffect(() => {
    if (!user) return;
    setPage(1);
    setHasMore(true);
    setExtVideos([]);
    loadingRef.current = false;
    const run = async () => {
      loadingRef.current = true;
      setLoading(true);
      try {
        let externalStartPage = activeQuery ? 1 : randomExternalStartPage(refreshTick);
        let [externalResult, localResult] = await Promise.all([
          getBangladeshExternalVideos(externalStartPage, 20, undefined, activeQuery || undefined, "long", refreshTick),
          getUploadedLongVideos(1, 10, activeQuery || undefined),
        ]);
        let merged = dedupeVideos([...localResult.videos, ...externalResult.videos]);

        if (!activeQuery && merged.length === 0 && externalStartPage !== 1) {
          externalStartPage = 1;
          [externalResult, localResult] = await Promise.all([
            getBangladeshExternalVideos(1, 20, undefined, undefined, "long", refreshTick),
            getUploadedLongVideos(1, 10),
          ]);
          merged = dedupeVideos([...localResult.videos, ...externalResult.videos]);
        }

        setExtVideos(merged);
        setHasMore(localResult.hasMore || externalResult.hasMore);
        setPage(2);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    };
    run();
  }, [user, activeQuery, refreshTick]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingRef.current) loadMore();
      },
      { threshold: 0, rootMargin: "800px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadMore]);

  const allVideos = useMemo<VideoItem[]>(() => {
    return extVideos.map((v) => ({
      id: v.id,
      title: v.title,
      video_url: v.video_url,
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
      await createLongVideoUpload(user.id, videoUrl, longTitle.trim() || longVideoFile.name, longVideoDuration);
      setShowUpload(false);
      setLongVideoFile(null);
      setLongVideoPreview(null);
      setLongTitle("");
      setLongVideoDuration(undefined);
      await loadMore(true);
    } finally {
      setUploading(false);
    }
  }, [loadMore, longTitle, longVideoDuration, longVideoFile, user]);

  useEffect(() => {
    if (allVideos.length === 0) {
      setSelectedVideo(null);
      return;
    }
    setSelectedVideo((prev) => {
      if (prev && allVideos.some((v) => v.id === prev.id)) return prev;
      return null;
    });
  }, [allVideos]);

  const getViewCount = useCallback((id: string) => {
    if (!viewCounts[id]) {
      (viewCounts as any)[id] = viewCount();
    }
    return viewCounts[id];
  }, [viewCounts]);

  const handleSearch = useCallback(() => {
    const q = searchInput.trim();
    setSearchQuery(q);
    if (q) setSelectedChip("All");
    setSearchMode(false);
  }, [searchInput]);

  const handleChip = useCallback((chip: string) => {
    setSelectedChip(chip);
    setSearchQuery("");
    setSearchInput("");
  }, []);

  const playVideo = useCallback((v: VideoItem) => {
    trackVideoPreference({ title: v.title });
    setSelectedVideo(v);
    setMiniPlayer(false);
    setTimeout(() => playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, []);

  const openSearch = useCallback(() => {
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
          <div className="flex items-center gap-2 px-2 py-2">
            <button onClick={() => setSearchMode(false)} className="h-10 w-10 shrink-0 grid place-items-center">
              <ArrowLeft className="w-5 h-5" style={{ color: "#fff" }} />
            </button>
            <div className="flex-1 relative">
              <input
                ref={searchRef}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search good-app"
                className="w-full h-10 rounded-full px-4 pr-10 text-sm outline-none"
                style={{ background: "#222", color: "#fff", border: "1px solid #333" }}
              />
              {searchInput && (
                <button onClick={() => setSearchInput("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-4 h-4" style={{ color: "#aaa" }} />
                </button>
              )}
            </div>
            <button onClick={handleSearch} className="h-10 w-10 shrink-0 rounded-full grid place-items-center" style={{ background: "#222" }}>
              <Search className="w-5 h-5" style={{ color: "#fff" }} />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-1">
              <button onClick={() => { if (selectedVideo) { setSelectedVideo(null); } else { navigate("/feed"); } }} className="h-10 w-10 shrink-0 grid place-items-center">
                <ArrowLeft className="w-5 h-5" style={{ color: "#fff" }} />
              </button>
              <div className="flex items-center gap-1.5">
                <img
                  src={goodAppLogo}
                  alt="good-app logo"
                  className="h-7 w-7 object-cover rounded-sm"
                  loading="lazy"
                />
                <span className="font-bold text-[17px] tracking-tight" style={{ color: "#fff" }}>good-app</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={handleRefreshFeed} className="h-10 w-10 grid place-items-center rounded-full">
                <RefreshCcw className="w-5 h-5" style={{ color: "#fff" }} />
              </button>
              <button onClick={() => navigate(`/channel/${user.id}`)} className="h-10 w-10 grid place-items-center rounded-full overflow-hidden" title="My Channel">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <User className="w-5 h-5" style={{ color: "#fff" }} />
                )}
              </button>
              <button
                onClick={async () => {
                  const channelUrl = `${window.location.origin}/channel/${user.id}`;
                  try {
                    if (navigator.share) {
                      await navigator.share({ title: "My channel", url: channelUrl });
                    } else {
                      await navigator.clipboard.writeText(channelUrl);
                      alert("Channel link copied");
                    }
                  } catch {
                    // user cancelled share
                  }
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
      </header>

      {selectedVideo && !miniPlayer && (
        <div ref={playerRef} className="shrink-0 z-10" style={{ background: "#000" }}>
          <div ref={playerShellRef} className="w-full aspect-video relative" style={{ background: "#000" }}>
            {selectedVideo.isExternal && isEmbed(selectedVideo.video_url) ? (
              <iframe
                key={selectedVideo.id}
                src={buildExternalPlayerUrl(
                  selectedVideo.video_url,
                  false,
                )}
                title={selectedVideo.title}
                className="w-full h-full"
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope"
                allowFullScreen
                ref={(node) => {
                  youtubeIframeRef.current = node;
                }}
                onLoad={() => {
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
                key={selectedVideo.id}
                src={selectedVideo.video_url}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
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
                if (!selectedVideo.local_post_id || !user) return;
                const result = await toggleReaction(selectedVideo.local_post_id, user.id, "like");
                setLiked(result.reacted);
                setDisliked(false);
                const stats = await getLocalVideoEngagement(selectedVideo.local_post_id);
                setEngagementStats(stats);
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium"
              style={{ background: "#272727", color: liked ? "#3ea6ff" : "#f1f1f1" }}
            >
              <ThumbsUp className="w-5 h-5" />
              <span>{engagementStats?.likes_count ?? selectedVideo.likes_count ?? 0}</span>
            </button>

            <button
              onClick={async () => {
                if (!selectedVideo.local_post_id || !user) return;
                const result = await toggleReaction(selectedVideo.local_post_id, user.id, "dislike");
                setDisliked(result.reacted);
                setLiked(false);
                const stats = await getLocalVideoEngagement(selectedVideo.local_post_id);
                setEngagementStats(stats);
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
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: selectedVideo.title, url: window.location.href });
                }
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
              • {activeQuery ? `results for "${activeQuery}"` : "suggested for you"}
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
              {activeQuery ? `No results for "${activeQuery}"` : "Loading videos..."}
            </div>
          )}

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
    </div>
  );
}
