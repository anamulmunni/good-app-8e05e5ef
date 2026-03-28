import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Cast, Loader2, Bell, Search, X, Plus, Play, Upload, Video } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import goodAppLogo from "@/assets/good-app-logo.jpg";
import {
  createLongVideoUpload,
  getBangladeshExternalVideos,
  getUploadedLongVideos,
  type ExternalReelVideo,
  markReelsSeen,
  uploadPostMedia,
} from "@/lib/feed-api";

type VideoItem = {
  id: string;
  title: string;
  video_url: string;
  thumbnail_url?: string | null;
  creator?: string | null;
  duration?: number;
  isExternal: boolean;
};

const CHIPS = [
  "All",
  "Music",
  "Bangla Song",
  "Hindi Song",
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

function buildExternalPlayerUrl(url: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}autoplay=1&quality=1080&mute=0&sharing-enable=false`;
}

function viewCount() {
  // Simulated view count for display
  const n = Math.floor(Math.random() * 500000) + 1000;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M views`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K views`;
  return `${n} views`;
}

export default function Reels() {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();

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
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [longTitle, setLongTitle] = useState("");
  const [longVideoFile, setLongVideoFile] = useState<File | null>(null);
  const [longVideoPreview, setLongVideoPreview] = useState<string | null>(null);
  const [longVideoDuration, setLongVideoDuration] = useState<number | undefined>(undefined);

  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoading && !user) navigate("/");
  }, [isLoading, user, navigate]);

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
    const p = reset ? 1 : page;
    try {
      const [externalResult, localResult] = await Promise.all([
        getBangladeshExternalVideos(p, 30, undefined, activeQuery || undefined, "long"),
        getUploadedLongVideos(p, 12, activeQuery || undefined),
      ]);
      const merged = [...localResult.videos, ...externalResult.videos];
      setExtVideos((prev) => {
        const base = reset ? [] : prev;
        const seen = new Set(base.map((v) => v.id));
        return [...base, ...merged.filter((v) => !seen.has(v.id))];
      });
      setHasMore(localResult.hasMore || externalResult.hasMore);
      setPage(p + 1);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [hasMore, page, activeQuery]);

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
        const [externalResult, localResult] = await Promise.all([
          getBangladeshExternalVideos(1, 20, undefined, activeQuery || undefined, "long"),
          getUploadedLongVideos(1, 10, activeQuery || undefined),
        ]);
        const merged = [...localResult.videos, ...externalResult.videos];
        setExtVideos(merged);
        setHasMore(localResult.hasMore || externalResult.hasMore);
        setPage(2);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    };
    run();
  }, [user, activeQuery]);

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
      if (duration <= 120) {
        URL.revokeObjectURL(objectUrl);
        alert("২ মিনিটের কম ভিডিও Short হিসেবে নিউজ ফিডে দিন। এখানে Long (২ মিনিট+) ভিডিও দিন।");
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
      return null; // Don't auto-play first video — let user choose
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
    setSelectedVideo(v);
    setTimeout(() => playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, []);

  const openSearch = useCallback(() => {
    setSearchMode(true);
    setTimeout(() => searchRef.current?.focus(), 100);
  }, []);

  if (isLoading || !user) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0f0f0f", color: "#fff" }}>
      {/* ─── YouTube-style Top Bar ─── */}
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
              <button onClick={() => navigate(-1)} className="h-10 w-10 shrink-0 grid place-items-center">
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
              <button className="h-10 w-10 grid place-items-center rounded-full">
                <Cast className="w-5 h-5" style={{ color: "#fff" }} />
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

        {/* ─── Chips ─── */}
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

      {/* ─── Main Content ─── */}
      <main className="flex-1 overflow-y-auto">
        {/* Player */}
        {selectedVideo && (
          <div ref={playerRef}>
            <div className="w-full aspect-video" style={{ background: "#000" }}>
              {selectedVideo.isExternal && isEmbed(selectedVideo.video_url) ? (
                <iframe
                  key={selectedVideo.id}
                  src={buildExternalPlayerUrl(selectedVideo.video_url)}
                  title={selectedVideo.title}
                  className="w-full h-full"
                  allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope"
                  allowFullScreen
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
            </div>
            {/* Video info below player */}
            <div className="px-3 py-3" style={{ borderBottom: "1px solid #272727" }}>
              <h2 className="font-medium text-[15px] leading-5 line-clamp-2" style={{ color: "#f1f1f1" }}>
                {selectedVideo.title}
              </h2>
              <p className="text-[12px] mt-1.5" style={{ color: "#aaa" }}>
                {selectedVideo.creator || "Unknown"} • {getViewCount(selectedVideo.id)} • {selectedVideo.duration ? fmt(selectedVideo.duration) : ""}
              </p>
            </div>
            {/* Up Next header */}
            <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: "1px solid #272727" }}>
              <span className="text-[14px] font-semibold" style={{ color: "#f1f1f1" }}>Up next</span>
              <span className="text-[12px]" style={{ color: "#aaa" }}>• suggested for you</span>
            </div>
          </div>
        )}

        {/* Video List */}
        <div className={`pb-20 ${selectedVideo ? "" : ""}`}>
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
                /* ── Compact row when a video is playing (YouTube "Up next" style) ── */
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
                /* ── Full card when no video is playing (YouTube home feed style) ── */
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

      {/* ─── Floating Create/Upload Button (YouTube-style) ─── */}
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
                  <span>Long ভিডিও সিলেক্ট করুন (2 মিনিট+)</span>
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
