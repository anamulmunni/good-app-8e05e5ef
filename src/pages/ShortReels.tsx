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
  const touchStartY = useRef(0);
  const touchStartX = useRef(0);
  const canSwipe = useRef(true);
  const seenVideoIds = useRef(new Set<string>());

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
    staleTime: 5 * 60 * 1000,
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

  // Build initial queue from candidates - avoid duplicates
  useEffect(() => {
    if (candidates.length === 0) return;
    seenVideoIds.current.clear();
    const unique = shuffle(candidates).filter((c) => {
      if (seenVideoIds.current.has(c.videoId)) return false;
      seenVideoIds.current.add(c.videoId);
      return true;
    });
    setReelQueue(unique);
    setCurrentIndex(0);
  }, [candidates]);

  // Append more unique reels when near the end
  const appendMore = useCallback(() => {
    if (candidates.length === 0) return;
    // If all candidates are seen, allow repeats but re-shuffle
    const unseen = candidates.filter((c) => !seenVideoIds.current.has(c.videoId));
    const pool = unseen.length > 3 ? unseen : candidates;
    const next = shuffle(pool).slice(0, 20);
    next.forEach((c) => seenVideoIds.current.add(c.videoId));
    setReelQueue((prev) => [...prev, ...next]);
  }, [candidates]);

  useEffect(() => {
    if (currentIndex >= reelQueue.length - 4 && reelQueue.length > 0) {
      appendMore();
    }
  }, [currentIndex, reelQueue.length, appendMore]);

  // Touch swipe handling
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!canSwipe.current) return;
    const deltaY = touchStartY.current - e.changedTouches[0].clientY;
    const deltaX = Math.abs(touchStartX.current - e.changedTouches[0].clientX);

    // Ignore horizontal swipes
    if (deltaX > Math.abs(deltaY)) return;

    const threshold = 40;
    if (Math.abs(deltaY) < threshold) return;

    canSwipe.current = false;
    if (deltaY > 0) {
      setCurrentIndex((prev) => Math.min(prev + 1, reelQueue.length - 1));
    } else {
      setCurrentIndex((prev) => Math.max(prev - 1, 0));
    }
    setTimeout(() => { canSwipe.current = true; }, 350);
  }, [reelQueue.length]);

  // Mouse wheel for desktop
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!canSwipe.current) return;
    if (Math.abs(e.deltaY) < 30) return;
    canSwipe.current = false;
    if (e.deltaY > 0) {
      setCurrentIndex((prev) => Math.min(prev + 1, reelQueue.length - 1));
    } else {
      setCurrentIndex((prev) => Math.max(prev - 1, 0));
    }
    setTimeout(() => { canSwipe.current = true; }, 400);
  }, [reelQueue.length]);

  // Build YouTube embed URL
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
      {/* Header - above touch overlay */}
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
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all ${
                selectedCategory === cat.id
                  ? "bg-white text-black"
                  : "bg-white/15 text-white/80"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {candidatesLoading ? (
        <div className="h-full flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-white" />
        </div>
      ) : reelQueue.length === 0 ? (
        <div className="h-full flex items-center justify-center text-white/60 text-sm">
          কোনো ভিডিও পাওয়া যায়নি
        </div>
      ) : (
        <div
          className="h-full w-full relative overflow-hidden"
          onWheel={handleWheel}
        >
          {/* Touch overlay - starts below header (top ~90px) */}
          <div
            className="absolute left-0 right-0 bottom-0 z-10"
            style={{ top: "90px", touchAction: "none" }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          />

          {/* Render current ± 1 for smooth transitions */}
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

                {/* Info overlay at bottom */}
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
