import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";

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
  mixed: "bangla tiktok viral video 2025",
  gajal: "bangla gojol tiktok 2025",
  funny: "bangla funny tiktok 2025",
  dance: "bangla dance tiktok viral 2025",
  nature: "nature aesthetic tiktok short",
  music: "bangla song tiktok viral 2025",
};

const SEEN_REELS_KEY = "goodapp-short-reels-seen-v2";
const MAX_SEEN_REELS = 500;

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildSessionSeed() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readSeenReels(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SEEN_REELS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function saveSeenReel(videoId: string) {
  if (typeof window === "undefined" || !videoId) return;
  try {
    const existing = readSeenReels();
    const next = [videoId, ...existing.filter((item) => item !== videoId)].slice(0, MAX_SEEN_REELS);
    window.localStorage.setItem(SEEN_REELS_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

export default function ShortReels() {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();

  const [selectedCategory, setSelectedCategory] = useState("mixed");
  const [sessionSeed, setSessionSeed] = useState(() => buildSessionSeed());
  const [fetchBatch, setFetchBatch] = useState(0);
  const [reelQueue, setReelQueue] = useState<ReelItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartY = useRef(0);
  const touchStartX = useRef(0);
  const swipeLocked = useRef(false);

  useEffect(() => {
    if (!isLoading && !user) navigate("/");
  }, [isLoading, user, navigate]);

  const baseFnUrl = useMemo(() => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    return `https://${projectId}.supabase.co/functions/v1/youtube-shorts`;
  }, []);

  const { data: candidates = [], isLoading: candidatesLoading, isFetching } = useQuery({
    queryKey: ["youtube-reels-candidates", selectedCategory, sessionSeed, fetchBatch],
    enabled: !!user,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const query = CATEGORY_QUERY[selectedCategory] || CATEGORY_QUERY.mixed;
      const params = new URLSearchParams({
        action: "search",
        q: query,
        category: selectedCategory,
        seed: `${sessionSeed}-${fetchBatch}`,
      });
      const res = await fetch(`${baseFnUrl}?${params.toString()}`);
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

  const handleCategoryChange = useCallback((categoryId: string) => {
    setSelectedCategory(categoryId);
    setSessionSeed(buildSessionSeed());
    setFetchBatch(0);
    setReelQueue([]);
    setCurrentIndex(0);
    swipeLocked.current = false;
  }, []);

  useEffect(() => {
    if (candidates.length === 0) return;

    const recentlySeen = new Set(readSeenReels());
    setReelQueue((prev) => {
      const existingIds = new Set(prev.map((item) => item.videoId));
      const freshItems = candidates.filter((item) => !existingIds.has(item.videoId) && !recentlySeen.has(item.videoId));

      if (freshItems.length > 0) {
        return [...prev, ...freshItems];
      }

      if (prev.length === 0) {
        return candidates.filter((item) => !existingIds.has(item.videoId));
      }

      return prev;
    });
  }, [candidates]);

  const currentReel = reelQueue[currentIndex];

  useEffect(() => {
    if (!currentReel?.videoId) return;
    saveSeenReel(currentReel.videoId);
  }, [currentReel?.videoId]);

  useEffect(() => {
    if (!user || isFetching || reelQueue.length === 0) return;
    if (currentIndex < reelQueue.length - 3) return;
    setFetchBatch((prev) => prev + 1);
  }, [currentIndex, isFetching, reelQueue.length, user]);

  const moveToNext = useCallback(() => {
    setCurrentIndex((prev) => Math.min(prev + 1, reelQueue.length - 1));
  }, [reelQueue.length]);

  const moveToPrev = useCallback(() => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (swipeLocked.current) return;

    const deltaY = touchStartY.current - e.changedTouches[0].clientY;
    const deltaX = Math.abs(touchStartX.current - e.changedTouches[0].clientX);

    if (deltaX > Math.abs(deltaY)) return;
    if (Math.abs(deltaY) < 45) return;

    swipeLocked.current = true;
    if (deltaY > 0) moveToNext();
    else moveToPrev();

    window.setTimeout(() => {
      swipeLocked.current = false;
    }, 320);
  }, [moveToNext, moveToPrev]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (swipeLocked.current) return;
    if (Math.abs(e.deltaY) < 28) return;

    swipeLocked.current = true;
    if (e.deltaY > 0) moveToNext();
    else moveToPrev();

    window.setTimeout(() => {
      swipeLocked.current = false;
    }, 320);
  }, [moveToNext, moveToPrev]);

  const buildEmbedUrl = useCallback((videoId: string, autoplay: boolean) => {
    const params = new URLSearchParams({
      autoplay: autoplay ? "1" : "0",
      mute: "0",
      loop: "1",
      playlist: videoId,
      controls: "0",
      modestbranding: "1",
      playsinline: "1",
      rel: "0",
      showinfo: "0",
      iv_load_policy: "3",
      fs: "0",
      disablekb: "1",
      enablejsapi: "1",
    });
    if (typeof window !== "undefined") {
      params.set("origin", window.location.origin);
    }
    return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
  }, []);

  if (isLoading || !user) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black text-white">
      <div className="absolute top-0 left-0 right-0 z-30 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center justify-between px-3 py-2">
          <button onClick={() => navigate("/feed")} className="w-10 h-10 grid place-items-center text-white">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="font-black text-lg bg-gradient-to-r from-green-400 to-orange-400 bg-clip-text text-transparent">
            Reels
          </h1>
          <div className="w-10 h-10" />
        </div>

        <div className="flex gap-2 px-3 pb-2 overflow-x-auto scrollbar-hide">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategoryChange(cat.id)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all ${
                selectedCategory === cat.id ? "bg-white text-black" : "bg-white/15 text-white/80"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {candidatesLoading && reelQueue.length === 0 ? (
        <div className="h-full flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-white" />
        </div>
      ) : reelQueue.length === 0 ? (
        <div className="h-full flex items-center justify-center text-white/60 text-sm">
          কোনো ভিডিও পাওয়া যায়নি
        </div>
      ) : (
        <div className="h-full w-full relative overflow-hidden" onWheel={handleWheel}>
          <div
            className="absolute left-0 right-0 bottom-0 z-10"
            style={{ top: "92px", touchAction: "none" }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          />

          {reelQueue.map((item, index) => {
            const offset = index - currentIndex;
            if (Math.abs(offset) > 1) return null;

            const isActive = index === currentIndex;

            return (
              <div
                key={`${item.videoId}-${index}`}
                className="absolute inset-0 w-full h-full transition-transform duration-300 ease-out"
                style={{ transform: `translateY(${offset * 100}%)` }}
              >
                <iframe
                  src={buildEmbedUrl(item.videoId, isActive)}
                  className="w-full h-full border-0"
                  allow="autoplay; encrypted-media; accelerometer; gyroscope"
                  allowFullScreen={false}
                  loading={isActive ? "eager" : "lazy"}
                  style={{ pointerEvents: "none" }}
                />

                <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/60 to-transparent px-4 pb-5 pt-10 pointer-events-none">
                  <p className="text-white text-sm font-semibold line-clamp-2 drop-shadow-lg">
                    {item.title}
                  </p>
                  <p className="text-white/70 text-xs mt-1">
                    {item.author}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
