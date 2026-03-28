import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Cast, Loader2, Bell, Search, X, Plus, Play } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getBangladeshExternalVideos, type ExternalReelVideo, markReelsSeen } from "@/lib/feed-api";

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
  "Bangla Natok",
  "Bangla Song",
  "Hindi Song",
  "Live",
  "Comedy",
  "Cartoon",
  "Gaming",
  "Movie",
  "Drama",
  "Trending",
  "Recently uploaded",
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

  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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
      const result = await getBangladeshExternalVideos(p, 30, undefined, activeQuery || undefined, "long");
      setExtVideos((prev) => {
        const base = reset ? [] : prev;
        const seen = new Set(base.map((v) => v.id));
        return [...base, ...result.videos.filter((v) => !seen.has(v.id))];
      });
      setHasMore(result.hasMore && result.videos.length > 0);
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
        const result = await getBangladeshExternalVideos(1, 20, undefined, activeQuery || undefined, "long");
        setExtVideos(result.videos);
        setHasMore(result.hasMore && result.videos.length > 0);
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
      isExternal: true,
    }));
  }, [extVideos]);

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
              {/* YouTube-style red logo */}
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-5 rounded-[4px] grid place-items-center" style={{ background: "#ff0000" }}>
                  <Play className="w-3.5 h-3.5 fill-white" style={{ color: "#fff" }} />
                </div>
                <span className="font-bold text-[18px] tracking-tight" style={{ color: "#fff" }}>good-app</span>
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
                  src={`${selectedVideo.video_url}?autoplay=1`}
                  title={selectedVideo.title}
                  className="w-full h-full"
                  allow="autoplay; fullscreen; picture-in-picture"
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
          </div>
        )}

        {/* Video List */}
        <div className="pb-20">
          {allVideos.length === 0 && !loading && (
            <div className="py-20 text-center text-sm" style={{ color: "#aaa" }}>
              {activeQuery ? `No results for "${activeQuery}"` : "Loading videos..."}
            </div>
          )}

          {allVideos.map((video) => (
            <button
              key={video.id}
              onClick={() => playVideo(video)}
              className="w-full text-left"
            >
              {/* Thumbnail — full width, no rounded corners, YouTube style */}
              <div className="w-full aspect-video relative" style={{ background: "#1a1a1a" }}>
                {video.thumbnail_url ? (
                  <img src={video.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full grid place-items-center" style={{ color: "#555" }}>
                    <Play className="w-12 h-12" />
                  </div>
                )}
                {video.duration ? (
                  <span
                    className="absolute right-1 bottom-1 text-[11px] font-medium px-1 py-0.5 rounded"
                    style={{ background: "rgba(0,0,0,0.8)", color: "#fff" }}
                  >
                    {fmt(video.duration)}
                  </span>
                ) : null}
                {/* Now playing indicator */}
                {selectedVideo?.id === video.id && (
                  <div className="absolute inset-0 grid place-items-center" style={{ background: "rgba(255,0,0,0.15)" }}>
                    <span
                      className="text-[11px] font-bold px-2.5 py-1 rounded"
                      style={{ background: "#ff0000", color: "#fff" }}
                    >
                      ▶ NOW PLAYING
                    </span>
                  </div>
                )}
              </div>
              {/* Info row — channel avatar + title + meta */}
              <div className="flex gap-3 px-3 py-3">
                <div
                  className="w-9 h-9 rounded-full grid place-items-center shrink-0 text-xs font-bold"
                  style={{ background: "#272727", color: "#aaa" }}
                >
                  {(video.creator || "?")[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium line-clamp-2 leading-[20px]" style={{ color: "#f1f1f1" }}>
                    {video.title}
                  </p>
                  <p className="text-[12px] mt-0.5 line-clamp-1" style={{ color: "#aaa" }}>
                    {video.creator || "Unknown"} • {getViewCount(video.id)}{video.duration ? ` • ${fmt(video.duration)}` : ""}
                  </p>
                </div>
              </div>
            </button>
          ))}

          <div ref={sentinelRef} className="h-12 flex items-center justify-center">
            {loading && <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#aaa" }} />}
          </div>
        </div>
      </main>

      {/* ─── Floating Create/Upload Button (YouTube-style) ─── */}
      <button
        onClick={() => navigate("/feed")}
        className="fixed bottom-6 right-4 z-30 w-14 h-14 rounded-full shadow-lg grid place-items-center"
        style={{ background: "#ff0000" }}
      >
        <Plus className="w-7 h-7" style={{ color: "#fff" }} />
      </button>
    </div>
  );
}
