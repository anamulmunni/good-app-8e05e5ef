import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Volume2 } from "lucide-react";

type ReelItem = {
  videoId: string;
  title: string;
  author: string;
  thumbnail: string;
};

const CATEGORIES = [
  { id: "mixed", label: "🔥 সব" },
  { id: "gajal", label: "🕌 গজল" },
  { id: "funny", label: "😂 ফানি" },
  { id: "dance", label: "💃 ড্যান্স" },
  { id: "nature", label: "🌿 প্রকৃতি" },
  { id: "music", label: "🎵 মিউজিক" },
] as const;

const CATEGORY_QUERY: Record<string, string> = {
  mixed: "bangla short video 2025",
  gajal: "bangla gojol short 2025",
  funny: "bangla funny video short",
  dance: "bangla dance tiktok short",
  nature: "nature short video aesthetic",
  music: "bangla song short video",
};

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function ShortReels() {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();

  const [selectedCategory, setSelectedCategory] = useState("mixed");
  const [reelQueue, setReelQueue] = useState<ReelItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [showAudioHint, setShowAudioHint] = useState(true);
  const [streamUrlById, setStreamUrlById] = useState<Record<string, string | null | undefined>>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});
  const loadingStreamIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isLoading && !user) navigate("/");
  }, [isLoading, user, navigate]);

  const baseFnUrl = useMemo(() => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    return `https://${projectId}.supabase.co/functions/v1/youtube-shorts`;
  }, []);

  const { data: candidates = [], isLoading: candidatesLoading } = useQuery({
    queryKey: ["youtube-reels-candidates", selectedCategory],
    enabled: !!user,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const query = CATEGORY_QUERY[selectedCategory] || CATEGORY_QUERY.mixed;
      const res = await fetch(`${baseFnUrl}?action=search&q=${encodeURIComponent(query)}&category=${selectedCategory}`);
      if (!res.ok) throw new Error("failed to fetch shorts list");
      const data = await res.json();
      const items = Array.isArray(data?.results) ? data.results : [];
      return items
        .filter((item: any) => item?.videoId)
        .map((item: any) => ({
          videoId: item.videoId,
          title: item.title || "YouTube Short",
          author: item.author || "Creator",
          thumbnail: item.thumbnail || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
        })) as ReelItem[];
    },
  });

  useEffect(() => {
    const next = shuffle(candidates).slice(0, 60);
    setReelQueue(next);
    setCurrentIndex(0);
    setStreamUrlById({});
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [candidates]);

  const appendMore = useCallback(() => {
    if (candidates.length === 0) return;
    setReelQueue((prev) => [...prev, ...shuffle(candidates).slice(0, 40)]);
  }, [candidates]);

  const resolveStreamUrl = useCallback(async (videoId: string) => {
    if (streamUrlById[videoId] !== undefined) return;
    if (loadingStreamIdsRef.current.has(videoId)) return;

    loadingStreamIdsRef.current.add(videoId);
    try {
      const res = await fetch(`${baseFnUrl}?action=stream&videoId=${encodeURIComponent(videoId)}`);
      if (!res.ok) {
        setStreamUrlById((prev) => ({ ...prev, [videoId]: null }));
        return;
      }
      const data = await res.json();
      const streamUrl = typeof data?.streamUrl === "string" && data.streamUrl ? data.streamUrl : null;
      setStreamUrlById((prev) => ({ ...prev, [videoId]: streamUrl }));
    } catch {
      setStreamUrlById((prev) => ({ ...prev, [videoId]: null }));
    } finally {
      loadingStreamIdsRef.current.delete(videoId);
    }
  }, [baseFnUrl, streamUrlById]);

  useEffect(() => {
    const indexes = [currentIndex - 1, currentIndex, currentIndex + 1, currentIndex + 2].filter((i) => i >= 0 && i < reelQueue.length);
    indexes.forEach((index) => {
      const item = reelQueue[index];
      if (item) resolveStreamUrl(item.videoId);
    });

    if (currentIndex >= reelQueue.length - 3) appendMore();
  }, [appendMore, currentIndex, reelQueue, resolveStreamUrl]);

  const goToNext = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const nextIndex = currentIndex + 1;
    const h = container.clientHeight || window.innerHeight;
    container.scrollTo({ top: nextIndex * h, behavior: "smooth" });
    setCurrentIndex(nextIndex);
  }, [currentIndex]);

  useEffect(() => {
    Object.entries(videoRefs.current).forEach(([idx, el]) => {
      if (!el) return;
      const isCurrent = Number(idx) === currentIndex;
      if (!isCurrent) {
        el.pause();
        return;
      }

      el.muted = !audioUnlocked;
      el.volume = audioUnlocked ? 1 : 0;
      el.play().catch(() => {});
    });
  }, [audioUnlocked, currentIndex, streamUrlById]);

  // Auto skip unavailable stream entries silently
  useEffect(() => {
    const current = reelQueue[currentIndex];
    if (!current) return;
    if (streamUrlById[current.videoId] === null) {
      const timer = window.setTimeout(() => goToNext(), 250);
      return () => window.clearTimeout(timer);
    }
  }, [currentIndex, goToNext, reelQueue, streamUrlById]);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const h = container.clientHeight || 1;
    const index = Math.max(0, Math.round(container.scrollTop / h));
    if (index !== currentIndex) setCurrentIndex(index);
  }, [currentIndex]);

  const unlockAudio = useCallback(() => {
    if (!audioUnlocked) {
      setAudioUnlocked(true);
      setShowAudioHint(false);
    }
  }, [audioUnlocked]);

  if (isLoading || !user) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-background text-foreground"
      onTouchStartCapture={unlockAudio}
      onClickCapture={unlockAudio}
    >
      <div className="absolute top-0 left-0 right-0 z-30 bg-gradient-to-b from-background/90 to-transparent">
        <div className="flex items-center justify-between px-3 py-2">
          <button onClick={() => navigate("/feed")} className="w-10 h-10 grid place-items-center text-foreground">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="font-black text-lg bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Reels
          </h1>
          <div className="w-10 h-10" />
        </div>

        <div className="flex gap-2 px-3 pb-2 overflow-x-auto scrollbar-hide">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all ${
                selectedCategory === cat.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {candidatesLoading ? (
        <div className="h-full flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-foreground" />
        </div>
      ) : reelQueue.length === 0 ? (
        <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
          কোনো ভিডিও পাওয়া যায়নি
        </div>
      ) : (
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto snap-y snap-mandatory scrollbar-hide"
        >
          {reelQueue.map((item, index) => {
            const streamUrl = streamUrlById[item.videoId];
            const isActive = index === currentIndex;

            return (
              <div key={`${item.videoId}-${index}`} className="h-full w-full relative snap-start bg-background">
                {streamUrl ? (
                  <video
                    ref={(el) => {
                      videoRefs.current[index] = el;
                    }}
                    src={streamUrl}
                    className="w-full h-full object-cover"
                    playsInline
                    autoPlay={isActive}
                    muted={!audioUnlocked}
                    preload={Math.abs(index - currentIndex) <= 1 ? "auto" : "metadata"}
                    controls={false}
                    onEnded={() => {
                      if (isActive) goToNext();
                    }}
                    onError={() => {
                      setStreamUrlById((prev) => ({ ...prev, [item.videoId]: null }));
                    }}
                  />
                ) : (
                  <div className="absolute inset-0 bg-background">
                    <img
                      src={item.thumbnail}
                      alt="reel thumbnail"
                      className="absolute inset-0 w-full h-full object-cover opacity-40"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-foreground" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAudioHint && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-40 rounded-full bg-card/90 border border-border px-4 py-2 flex items-center gap-2 text-sm text-card-foreground animate-fade-in">
          <Volume2 className="w-4 h-4" />
          একবার ট্যাপ করুন, এরপর sound auto চলবে
        </div>
      )}
    </div>
  );
}
