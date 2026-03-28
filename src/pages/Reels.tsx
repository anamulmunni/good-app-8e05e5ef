import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Play, Search, X } from "lucide-react";
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
  "সব",
  "All",
  "Bangla Natok",
  "Bangla Song",
  "Funny Video",
  "Cartoon",
  "Bangla Movie",
  "Music Video",
  "Trending",
  "Comedy",
  "Drama",
  "Hindi Song",
  "Gaming",
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

function isEmbed(url: string) {
  return url.includes("/embed/");
}

export default function Reels() {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChip, setSelectedChip] = useState("সব");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [extVideos, setExtVideos] = useState<ExternalReelVideo[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);

  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoading && !user) navigate("/");
  }, [isLoading, user, navigate]);

  useEffect(() => {
    if (user) markReelsSeen(user.id);
  }, [user]);

  const activeQuery = useMemo(() => {
    if (searchQuery.trim()) return searchQuery.trim();
    if (selectedChip !== "সব" && selectedChip !== "All") return selectedChip;
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
        const adjusted = result.videos;
        setExtVideos(adjusted);
        setHasMore(result.hasMore && adjusted.length > 0);
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
      return allVideos[0];
    });
  }, [allVideos]);

  const handleSearch = useCallback(() => {
    const q = searchInput.trim();
    setSearchQuery(q);
    if (q) setSelectedChip("সব");
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

  if (isLoading || !user) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-10 bg-card border-b border-border">
        <div className="flex items-center gap-2 px-3 py-2">
          <button onClick={() => navigate(-1)} className="h-9 w-9 shrink-0 rounded-full bg-secondary grid place-items-center">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-extrabold text-base text-primary shrink-0">good-app</span>
          <div className="flex-1 flex items-center gap-1.5 min-w-0">
            <div className="flex-1 relative">
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search any video/song..."
                className="w-full h-9 rounded-full bg-secondary px-4 pr-9 text-sm border border-border outline-none placeholder:text-muted-foreground"
              />
              {searchInput && (
                <button onClick={() => { setSearchInput(""); setSearchQuery(""); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button onClick={handleSearch} className="h-9 w-9 shrink-0 rounded-full bg-primary grid place-items-center">
              <Search className="w-4 h-4 text-primary-foreground" />
            </button>
          </div>
        </div>
        <div className="flex gap-2 px-3 pb-2 overflow-x-auto scrollbar-hide">
          {CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => handleChip(chip)}
              className={`shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                selectedChip === chip
                  ? "bg-foreground text-background border-foreground"
                  : "bg-secondary text-secondary-foreground border-border"
              }`}
            >
              {chip}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {selectedVideo && (
          <div ref={playerRef}>
            <div className="w-full aspect-video bg-black">
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
            <div className="px-3 py-2.5 border-b border-border">
              <h2 className="font-semibold text-sm leading-5 line-clamp-2">{selectedVideo.title}</h2>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedVideo.creator || ""}{selectedVideo.duration ? ` • ${fmt(selectedVideo.duration)}` : ""}
              </p>
            </div>
          </div>
        )}

        <div className="px-2 py-2 space-y-3">
          {allVideos.length === 0 && !loading && (
            <div className="py-16 text-center text-muted-foreground text-sm">
              {activeQuery ? `"${activeQuery}" — কিছু পাইনি, অন্যভাবে সার্চ করুন` : "ভিডিও লোড হচ্ছে..."}
            </div>
          )}

          {allVideos.map((video) => (
            <button key={video.id} onClick={() => playVideo(video)} className="w-full text-left">
              <div className={`w-full aspect-video rounded-xl overflow-hidden bg-secondary relative border ${selectedVideo?.id === video.id ? "border-primary" : "border-border"}`}>
                {video.thumbnail_url ? (
                  <img src={video.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-muted-foreground"><Play className="w-10 h-10" /></div>
                )}
                {video.duration ? (
                  <span className="absolute right-1.5 bottom-1.5 text-[11px] font-medium px-1.5 py-0.5 rounded bg-background/85 text-foreground">{fmt(video.duration)}</span>
                ) : null}
                {selectedVideo?.id === video.id && (
                  <div className="absolute inset-0 bg-primary/20 grid place-items-center">
                    <span className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-1 rounded">Playing Now</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2.5 mt-2 px-1">
                <div className="w-9 h-9 rounded-full bg-secondary grid place-items-center shrink-0 text-xs font-bold text-muted-foreground">
                  {(video.creator || "?")[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold line-clamp-2 leading-[18px]">{video.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                    {video.creator || "Unknown"}{video.duration ? ` • ${fmt(video.duration)}` : ""}
                  </p>
                </div>
              </div>
            </button>
          ))}

          <div ref={sentinelRef} className="h-12 flex items-center justify-center">
            {loading && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
          </div>

          {hasMore && !loading && (
            <button
              onClick={() => loadMore(false)}
              className="w-full h-10 rounded-lg bg-secondary text-secondary-foreground border border-border text-sm font-semibold"
            >
              আরও ভিডিও দেখুন
            </button>
          )}
        </div>
      </main>
    </div>
  );
}