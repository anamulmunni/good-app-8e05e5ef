import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Play, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
  watch_url?: string;
};

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return "--:--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function isEmbedUrl(url: string): boolean {
  return url.includes("dailymotion.com/embed/video") || url.includes("youtube.com/embed") || url.includes("youtu.be/");
}

export default function Reels() {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingExternal, setLoadingExternal] = useState(false);
  const [externalVideos, setExternalVideos] = useState<ExternalReelVideo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) navigate("/");
  }, [isLoading, user, navigate]);

  useEffect(() => {
    if (user) markReelsSeen(user.id);
  }, [user]);

  const { data: uploadedVideos = [], isLoading: uploadedLoading } = useQuery({
    queryKey: ["uploaded-videos"],
    queryFn: async () => {
      const { data: posts } = await (supabase.from("posts").select("id, content, video_url, user_id, created_at") as any)
        .not("video_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(60);

      if (!posts || posts.length === 0) return [] as VideoItem[];

      const userIds = [...new Set(posts.map((p: any) => p.user_id))];
      const { data: users } = await (supabase.from("users").select("id, display_name") as any).in("id", userIds);
      const userMap = new Map((users || []).map((u: any) => [u.id, u.display_name || "User"]));

      return posts.map((p: any) => ({
        id: p.id,
        title: p.content || "Uploaded video",
        video_url: p.video_url,
        creator: userMap.get(p.user_id) || "User",
        isExternal: false,
      }));
    },
    enabled: !!user,
  });

  const loadMoreExternal = useCallback(async (reset = false) => {
    if (loadingExternal) return;
    if (!reset && !hasMore) return;

    setLoadingExternal(true);
    const nextPage = reset ? 1 : page;

    try {
      const result = await getBangladeshExternalVideos(nextPage, 16, undefined, searchQuery || undefined, "long");
      setExternalVideos((prev) => {
        const base = reset ? [] : prev;
        const seen = new Set(base.map((v) => v.id));
        const merged = [...base, ...result.videos.filter((v) => !seen.has(v.id))];
        return merged;
      });
      setHasMore(result.hasMore && result.videos.length > 0);
      setPage(nextPage + 1);
    } finally {
      setLoadingExternal(false);
    }
  }, [hasMore, loadingExternal, page, searchQuery]);

  useEffect(() => {
    if (!user) return;
    setPage(1);
    setHasMore(true);
    setExternalVideos([]);
    void loadMoreExternal(true);
  }, [user, searchQuery]);

  const videos = useMemo<VideoItem[]>(() => {
    const external: VideoItem[] = externalVideos.map((v) => ({
      id: v.id,
      title: v.title,
      video_url: v.video_url,
      thumbnail_url: v.thumbnail_url,
      creator: v.creator || "Bangladesh",
      duration: v.duration,
      watch_url: v.watch_url,
      isExternal: true,
    }));

    return searchQuery.trim() ? external : [...uploadedVideos, ...external];
  }, [externalVideos, uploadedVideos, searchQuery]);

  useEffect(() => {
    if (!videos.length) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) => (prev && videos.some((v) => v.id === prev) ? prev : videos[0].id));
  }, [videos]);

  const selectedVideo = useMemo(() => videos.find((v) => v.id === selectedId) || null, [videos, selectedId]);

  const handleSearch = useCallback(() => {
    setSearchQuery(searchInput.trim());
  }, [searchInput]);

  if (isLoading || !user) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border px-3 py-2.5 flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full bg-secondary text-secondary-foreground grid place-items-center">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-base shrink-0">Videos</h1>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search Bangla videos..."
            className="flex-1 h-10 rounded-full bg-secondary text-secondary-foreground px-4 text-sm border border-border outline-none"
          />
          <button onClick={handleSearch} className="h-10 px-4 rounded-full bg-primary text-primary-foreground font-semibold text-sm flex items-center gap-1">
            <Search className="w-4 h-4" />
            Search
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-6">
        <section className="px-3 pt-3">
          <div className="w-full rounded-xl overflow-hidden bg-secondary border border-border aspect-video">
            {selectedVideo ? (
              selectedVideo.isExternal && isEmbedUrl(selectedVideo.video_url) ? (
                <iframe
                  src={selectedVideo.video_url}
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
                  className="w-full h-full object-contain bg-background"
                />
              )
            ) : (
              <div className="w-full h-full grid place-items-center text-muted-foreground text-sm">No video selected</div>
            )}
          </div>

          {selectedVideo && (
            <div className="mt-2.5">
              <h2 className="font-semibold text-sm leading-5">{selectedVideo.title}</h2>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedVideo.creator || "Unknown"} {selectedVideo.duration ? `• ${formatDuration(selectedVideo.duration)}` : ""}
              </p>
            </div>
          )}
        </section>

        <section className="px-3 mt-4 space-y-2">
          {(uploadedLoading && videos.length === 0) ? (
            <div className="py-8 flex items-center justify-center text-muted-foreground text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> লোড হচ্ছে...
            </div>
          ) : videos.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">ভিডিও পাওয়া যায়নি, অন্য কিছু সার্চ করে দেখুন।</div>
          ) : (
            videos.map((video) => (
              <button
                key={video.id}
                onClick={() => setSelectedId(video.id)}
                className={`w-full text-left rounded-xl border p-2 flex gap-2.5 transition-colors ${selectedId === video.id ? "bg-secondary border-primary" : "bg-card border-border"}`}
              >
                <div className="w-36 aspect-video rounded-lg overflow-hidden bg-secondary shrink-0 relative">
                  {video.thumbnail_url ? (
                    <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-muted-foreground">
                      <Play className="w-5 h-5" />
                    </div>
                  )}
                  {video.duration ? (
                    <span className="absolute right-1 bottom-1 text-[10px] px-1.5 py-0.5 rounded bg-background/80 text-foreground">{formatDuration(video.duration)}</span>
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold line-clamp-2 leading-5">{video.title}</p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{video.creator || "Unknown"}</p>
                  <span className="inline-block mt-2 text-[10px] px-2 py-1 rounded-full bg-secondary text-secondary-foreground border border-border">
                    {video.isExternal ? "Online" : "Uploaded"}
                  </span>
                </div>
              </button>
            ))
          )}

          {hasMore && (
            <button
              onClick={() => loadMoreExternal(false)}
              disabled={loadingExternal}
              className="w-full h-11 rounded-xl bg-secondary text-secondary-foreground border border-border font-semibold text-sm disabled:opacity-60"
            >
              {loadingExternal ? "Loading..." : "আরও ভিডিও দেখুন"}
            </button>
          )}
        </section>
      </main>
    </div>
  );
}