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
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const isScrolling = useRef(false);

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

  // Build queue from candidates
  useEffect(() => {
    if (candidates.length === 0) return;
    const next = shuffle(candidates).slice(0, 50);
    setReelQueue(next);
    setCurrentIndex(0);
  }, [candidates]);

  // Append more when near end
  const appendMore = useCallback(() => {
    if (candidates.length === 0) return;
    setReelQueue((prev) => [...prev, ...shuffle(candidates).slice(0, 30)]);
  }, [candidates]);

  useEffect(() => {
    if (currentIndex >= reelQueue.length - 5 && reelQueue.length > 0) {
      appendMore();
    }
  }, [currentIndex, reelQueue.length, appendMore]);

  // Scroll by one reel at a time - touch handling
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    isScrolling.current = false;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (isScrolling.current) return;
    const deltaY = touchStartY.current - e.changedTouches[0].clientY;
    const threshold = 50;

    if (Math.abs(deltaY) > threshold) {
      isScrolling.current = true;
      if (deltaY > 0) {
        // Swipe up - next
        setCurrentIndex((prev) => Math.min(prev + 1, reelQueue.length - 1));
      } else {
        // Swipe down - previous
        setCurrentIndex((prev) => Math.max(prev - 1, 0));
      }
      setTimeout(() => { isScrolling.current = false; }, 400);
    }
  }, [reelQueue.length]);

  // Build YouTube embed URL with autoplay + sound
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

  const currentReel = reelQueue[currentIndex];

  return (
    <div className="fixed inset-0 z-50 bg-black text-white">
      {/* Header */}
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
          ref={containerRef}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="h-full w-full relative overflow-hidden"
        >
          {/* Render current, previous and next for smooth transitions */}
          {reelQueue.map((item, index) => {
            const offset = index - currentIndex;
            // Only render current ± 1
            if (Math.abs(offset) > 1) return null;

            const isActive = index === currentIndex;

            return (
              <div
                key={`${item.videoId}-${index}`}
                className="absolute inset-0 w-full h-full transition-transform duration-300 ease-out"
                style={{
                  transform: `translateY(${offset * 100}%)`,
                }}
              >
                {/* YouTube Embed - fullscreen, no controls */}
                <iframe
                  src={buildEmbedUrl(item.videoId, isActive)}
                  className="w-full h-full border-0"
                  allow="autoplay; encrypted-media; accelerometer; gyroscope"
                  allowFullScreen={false}
                  loading={isActive ? "eager" : "lazy"}
                  style={{ pointerEvents: isActive ? "auto" : "none" }}
                />

                {/* Minimal info overlay at bottom */}
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
