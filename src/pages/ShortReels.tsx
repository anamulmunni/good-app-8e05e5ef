import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Pause, Play } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

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
  } catch {}
}

// ─── YouTube IFrame API loader ───
let ytApiReady = false;
let ytApiPromise: Promise<void> | null = null;

function loadYTApi(): Promise<void> {
  if (ytApiReady) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<void>((resolve) => {
    if ((window as any).YT?.Player) {
      ytApiReady = true;
      resolve();
      return;
    }
    (window as any).onYouTubeIframeAPIReady = () => {
      ytApiReady = true;
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

const PLAYER_VARS = {
  autoplay: 0,
  controls: 0,
  modestbranding: 1,
  playsinline: 1,
  rel: 0,
  showinfo: 0,
  iv_load_policy: 3,
  fs: 0,
  disablekb: 1,
  mute: 0,
  enablejsapi: 1,
};

export default function ShortReels() {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();

  const [selectedCategory, setSelectedCategory] = useState("mixed");
  const [sessionSeed, setSessionSeed] = useState(() => buildSessionSeed());
  const [fetchBatch, setFetchBatch] = useState(0);
  const [reelQueue, setReelQueue] = useState<ReelItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showPauseIcon, setShowPauseIcon] = useState(false);
  const [playersReady, setPlayersReady] = useState(0); // count of ready players

  const touchStartY = useRef(0);
  const touchStartX = useRef(0);
  const touchStartTime = useRef(0);
  const swipeLocked = useRef(false);
  const pauseIconTimer = useRef<ReturnType<typeof setTimeout>>();

  // Dual player system: A and B alternate
  const playerA = useRef<any>(null);
  const playerB = useRef<any>(null);
  const playerAVideoId = useRef<string>("");
  const playerBVideoId = useRef<string>("");
  // 0 = playerA is active, 1 = playerB is active
  const [activePlayer, setActivePlayer] = useState<0 | 1>(0);
  const activePlayerRef = useRef<0 | 1>(0);
  const firstVideoLoaded = useRef(false);
  const [showThumbnail, setShowThumbnail] = useState(true);

  useEffect(() => {
    if (!isLoading && !user) navigate("/");
  }, [isLoading, user, navigate]);

  // ─── Initialize TWO YT Players ───
  useEffect(() => {
    let cancelled = false;
    loadYTApi().then(() => {
      if (cancelled) return;
      const YT = (window as any).YT;

      if (!playerA.current) {
        playerA.current = new YT.Player("yt-player-a", {
          width: "100%",
          height: "100%",
          playerVars: { ...PLAYER_VARS, origin: window.location.origin },
          events: {
            onReady: () => {
              if (!cancelled) setPlayersReady((p) => p + 1);
            },
            onStateChange: (event: any) => {
              if (event.data === YT.PlayerState.PLAYING && activePlayerRef.current === 0) {
                setShowThumbnail(false);
                firstVideoLoaded.current = true;
              }
              if (event.data === YT.PlayerState.ENDED && activePlayerRef.current === 0) {
                setCurrentIndex((prev) => prev + 1);
              }
            },
            onError: () => {
              if (activePlayerRef.current === 0) setCurrentIndex((prev) => prev + 1);
            },
          },
        });
      }

      if (!playerB.current) {
        playerB.current = new YT.Player("yt-player-b", {
          width: "100%",
          height: "100%",
          playerVars: { ...PLAYER_VARS, origin: window.location.origin },
          events: {
            onReady: () => {
              if (!cancelled) setPlayersReady((p) => p + 1);
            },
            onStateChange: (event: any) => {
              if (event.data === YT.PlayerState.PLAYING && activePlayerRef.current === 1) {
                setShowThumbnail(false);
                firstVideoLoaded.current = true;
              }
              if (event.data === YT.PlayerState.ENDED && activePlayerRef.current === 1) {
                setCurrentIndex((prev) => prev + 1);
              }
            },
            onError: () => {
              if (activePlayerRef.current === 1) setCurrentIndex((prev) => prev + 1);
            },
          },
        });
      }
    });
    return () => { cancelled = true; };
  }, []);

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
    setPaused(false);
    setActivePlayer(0);
    activePlayerRef.current = 0;
    setShowThumbnail(true);
    firstVideoLoaded.current = false;
    playerAVideoId.current = "";
    playerBVideoId.current = "";
    swipeLocked.current = false;
    // Stop both players
    try { playerA.current?.stopVideo(); } catch {}
    try { playerB.current?.stopVideo(); } catch {}
  }, []);

  useEffect(() => {
    if (candidates.length === 0) return;
    const recentlySeen = new Set(readSeenReels());
    setReelQueue((prev) => {
      const existingIds = new Set(prev.map((item) => item.videoId));
      const freshItems = candidates.filter((item) => !existingIds.has(item.videoId) && !recentlySeen.has(item.videoId));
      if (freshItems.length > 0) return [...prev, ...freshItems];
      if (prev.length === 0) return candidates.filter((item) => !existingIds.has(item.videoId));
      return prev;
    });
  }, [candidates]);

  const currentReel = reelQueue[currentIndex];
  const nextReel = reelQueue[currentIndex + 1];

  // ─── Core dual-player logic ───
  useEffect(() => {
    if (!currentReel?.videoId || playersReady < 2) return;

    saveSeenReel(currentReel.videoId);
    setPaused(false);

    const active = activePlayerRef.current;
    const currentPlayer = active === 0 ? playerA.current : playerB.current;
    const currentPlayerVideoId = active === 0 ? playerAVideoId : playerBVideoId;

    // Load current video into active player if needed
    if (currentPlayerVideoId.current !== currentReel.videoId) {
      currentPlayerVideoId.current = currentReel.videoId;
      setShowThumbnail(true);
      try {
        currentPlayer.loadVideoById({ videoId: currentReel.videoId, startSeconds: 0 });
      } catch {
        setTimeout(() => {
          try { currentPlayer.loadVideoById({ videoId: currentReel.videoId, startSeconds: 0 }); } catch {}
        }, 300);
      }
    } else {
      // Already loaded — just play
      try { currentPlayer.playVideo(); } catch {}
      setShowThumbnail(false);
    }

    // Pre-buffer next video into inactive player
    if (nextReel?.videoId) {
      const inactivePlayer = active === 0 ? playerB.current : playerA.current;
      const inactivePlayerVideoId = active === 0 ? playerBVideoId : playerAVideoId;

      if (inactivePlayerVideoId.current !== nextReel.videoId) {
        inactivePlayerVideoId.current = nextReel.videoId;
        try {
          // cueVideoById loads metadata + starts buffering but doesn't play
          inactivePlayer.cueVideoById({ videoId: nextReel.videoId, startSeconds: 0 });
        } catch {}
      }
    }
  }, [currentReel?.videoId, currentIndex, playersReady, nextReel?.videoId]);

  // ─── Prefetch more when near end ───
  useEffect(() => {
    if (!user || isFetching || reelQueue.length === 0) return;
    if (currentIndex < reelQueue.length - 3) return;
    setFetchBatch((prev) => prev + 1);
  }, [currentIndex, isFetching, reelQueue.length, user]);

  const togglePause = useCallback(() => {
    if (!currentReel) return;
    const currentPlayer = activePlayerRef.current === 0 ? playerA.current : playerB.current;
    if (!currentPlayer) return;

    const next = !paused;
    setPaused(next);
    try {
      if (next) currentPlayer.pauseVideo();
      else currentPlayer.playVideo();
    } catch {}

    setShowPauseIcon(true);
    clearTimeout(pauseIconTimer.current);
    pauseIconTimer.current = setTimeout(() => setShowPauseIcon(false), 800);
  }, [paused, currentReel]);

  const moveToNext = useCallback(() => {
    if (reelQueue.length === 0) return;
    setCurrentIndex((prev) => {
      const next = Math.min(prev + 1, reelQueue.length - 1);
      if (next !== prev) {
        // Swap active player — the inactive one already has the next video pre-buffered!
        const oldActive = activePlayerRef.current;
        const newActive: 0 | 1 = oldActive === 0 ? 1 : 0;
        activePlayerRef.current = newActive;
        setActivePlayer(newActive);

        // Pause old player
        const oldPlayer = oldActive === 0 ? playerA.current : playerB.current;
        try { oldPlayer?.pauseVideo(); } catch {}

        // Play new player (already buffered!)
        const newPlayer = newActive === 0 ? playerA.current : playerB.current;
        try { newPlayer?.playVideo(); } catch {}
      }
      return next;
    });
  }, [reelQueue.length]);

  const moveToPrev = useCallback(() => {
    setCurrentIndex((prev) => {
      const next = Math.max(prev - 1, 0);
      if (next !== prev) {
        // For going back, swap and load
        const oldActive = activePlayerRef.current;
        const newActive: 0 | 1 = oldActive === 0 ? 1 : 0;
        activePlayerRef.current = newActive;
        setActivePlayer(newActive);

        const oldPlayer = oldActive === 0 ? playerA.current : playerB.current;
        try { oldPlayer?.pauseVideo(); } catch {}
      }
      return next;
    });
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
    touchStartTime.current = Date.now();
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (swipeLocked.current) return;
    const deltaY = touchStartY.current - e.changedTouches[0].clientY;
    const deltaX = Math.abs(touchStartX.current - e.changedTouches[0].clientX);
    const elapsed = Date.now() - touchStartTime.current;

    if (Math.abs(deltaY) < 20 && deltaX < 20 && elapsed < 300) {
      togglePause();
      return;
    }
    if (deltaX > Math.abs(deltaY)) return;
    if (Math.abs(deltaY) < 45) return;

    swipeLocked.current = true;
    if (deltaY > 0) moveToNext();
    else moveToPrev();
    setTimeout(() => { swipeLocked.current = false; }, 320);
  }, [moveToNext, moveToPrev, togglePause]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (swipeLocked.current) return;
    if (Math.abs(e.deltaY) < 28) return;
    swipeLocked.current = true;
    if (e.deltaY > 0) moveToNext();
    else moveToPrev();
    setTimeout(() => { swipeLocked.current = false; }, 320);
  }, [moveToNext, moveToPrev]);

  if (isLoading || !user) return null;

  const showLoading = candidatesLoading && reelQueue.length === 0;
  const showEmpty = !candidatesLoading && reelQueue.length === 0;

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

      {showLoading ? (
        <div className="h-full flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-white" />
        </div>
      ) : showEmpty ? (
        <div className="h-full flex items-center justify-center text-white/60 text-sm">
          কোনো ভিডিও পাওয়া যায়নি
        </div>
      ) : (
        <div className="h-full w-full relative overflow-hidden" onWheel={handleWheel}>
          {/* Touch overlay */}
          <div
            className="absolute left-0 right-0 bottom-0 z-10"
            style={{ top: "92px", touchAction: "none" }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          />

          {/* Pause/Play icon */}
          <AnimatePresence>
            {showPauseIcon && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
              >
                <div className="w-20 h-20 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm">
                  {paused ? (
                    <Play className="w-10 h-10 text-white ml-1" fill="white" />
                  ) : (
                    <Pause className="w-10 h-10 text-white" fill="white" />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Thumbnail overlay while first video loads */}
          {currentReel && showThumbnail && (
            <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center bg-black">
              <img
                src={`https://i.ytimg.com/vi/${currentReel.videoId}/hq720.jpg`}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${currentReel.videoId}/hqdefault.jpg`;
                }}
              />
              <div className="absolute top-[38%] left-0 right-0 flex flex-col items-center justify-center pointer-events-none">
                <motion.div
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="flex flex-col items-center gap-2"
                >
                  <motion.span
                    className="text-[32px] font-black tracking-wider drop-shadow-2xl"
                    animate={{ opacity: [0.7, 1, 0.7] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    style={{
                      background: "linear-gradient(135deg, #22c55e 0%, #4ade80 30%, #86efac 50%, #4ade80 70%, #22c55e 100%)",
                      backgroundSize: "200% 200%",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    good-<span style={{
                      background: "linear-gradient(135deg, #f97316 0%, #fb923c 50%, #f97316 100%)",
                      backgroundSize: "200% 200%",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}>app</span>
                  </motion.span>
                  <Loader2 className="w-7 h-7 animate-spin text-white/70" />
                </motion.div>
              </div>
            </div>
          )}

          {/* Dual YT Players — swap visibility for instant switching */}
          <div
            className="absolute inset-0 w-full h-full"
            style={{
              pointerEvents: "none",
              opacity: activePlayer === 0 ? 1 : 0,
              zIndex: activePlayer === 0 ? 2 : 1,
            }}
          >
            <div id="yt-player-a" className="w-full h-full" />
          </div>
          <div
            className="absolute inset-0 w-full h-full"
            style={{
              pointerEvents: "none",
              opacity: activePlayer === 1 ? 1 : 0,
              zIndex: activePlayer === 1 ? 2 : 1,
            }}
          >
            <div id="yt-player-b" className="w-full h-full" />
          </div>

          {/* Bottom info */}
          {currentReel && (
            <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/60 to-transparent px-4 pb-5 pt-10 pointer-events-none">
              <p className="text-white text-sm font-semibold line-clamp-2 drop-shadow-lg">
                {currentReel.title}
              </p>
              <p className="text-white/70 text-xs mt-1">
                {currentReel.author}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
