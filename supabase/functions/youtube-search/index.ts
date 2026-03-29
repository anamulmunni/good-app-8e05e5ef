import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yewtu.be",
  "https://iv.nbonn.ch",
  "https://invidious.protokoll-departed.de",
  "https://invidious.privacydev.net",
  "https://inv.us.projectsegfau.lt",
];

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.projectsegfau.lt",
  "https://pipedapi.in.projectsegfau.lt",
  "https://pipedapi.us.projectsegfau.lt",
];

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`timeout_${ms}`)), ms);
    promise
      .then((value) => {
        clearTimeout(id);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(id);
        reject(error);
      });
  });
}

function normalizePage(page: number, maxPage = 6): number {
  const safe = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  return ((safe - 1) % Math.max(1, maxPage)) + 1;
}

function normalizeVideo(item: any): any | null {
  const videoId = String(item?.videoId || "").trim();
  if (!videoId) return null;

  const title = String(item?.title || "").trim();
  if (!title) return null;

  const duration = Number(item?.lengthSeconds || 180);
  if (!Number.isFinite(duration) || duration < 30) return null;

  return {
    videoId,
    title,
    author: item?.author ? String(item.author) : null,
    lengthSeconds: duration,
    thumbnail: item?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

async function tryInvidiousInstance(instance: string, query: string, page: number): Promise<any[]> {
  const queryPage = normalizePage(page, 7);
  const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&page=${queryPage}&type=video&sort_by=relevance&region=BD`;
  const res = await withTimeout(fetch(url), 6000);
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data
    .map((item: any) => normalizeVideo({
      videoId: item?.videoId,
      title: item?.title,
      author: item?.author,
      lengthSeconds: item?.lengthSeconds,
      thumbnail: item?.videoThumbnails?.[0]?.url,
    }))
    .filter(Boolean);
}

async function searchInvidious(query: string, page: number): Promise<any[]> {
  const calls = INVIDIOUS_INSTANCES.map((instance) =>
    tryInvidiousInstance(instance, query, page).catch(() => [])
  );

  const settled = await Promise.allSettled(calls);
  return settled
    .filter((result): result is PromiseFulfilledResult<any[]> => result.status === "fulfilled")
    .flatMap((result) => result.value)
    .slice(0, 80);
}

async function tryPipedInstance(instance: string, query: string): Promise<any[]> {
  const url = `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`;
  const res = await withTimeout(fetch(url), 3200);
  if (!res.ok) return [];

  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];

  return items
    .filter((item: any) => item?.type === "stream")
    .map((item: any) => {
      const videoId = String(item?.url || "").replace("/watch?v=", "");
      return normalizeVideo({
        videoId,
        title: item?.title,
        author: item?.uploaderName,
        lengthSeconds: item?.duration,
        thumbnail: item?.thumbnail,
      });
    })
    .filter(Boolean);
}

async function searchPiped(query: string): Promise<any[]> {
  const calls = PIPED_INSTANCES.map((instance) =>
    tryPipedInstance(instance, query).catch(() => [])
  );

  const settled = await Promise.allSettled(calls);
  return settled
    .filter((result): result is PromiseFulfilledResult<any[]> => result.status === "fulfilled")
    .flatMap((result) => result.value)
    .slice(0, 80);
}

async function searchNoKeyApi(query: string): Promise<any[]> {
  try {
    const url = `https://yt.lemnoslife.com/noKey/search?part=snippet&type=video&maxResults=50&q=${encodeURIComponent(query)}`;
    const res = await withTimeout(fetch(url), 3800);
    if (!res.ok) return [];
    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];

    return items
      .map((item: any) => normalizeVideo({
        videoId: item?.id?.videoId,
        title: item?.snippet?.title,
        author: item?.snippet?.channelTitle,
        lengthSeconds: 180,
        thumbnail: item?.snippet?.thumbnails?.high?.url || item?.snippet?.thumbnails?.default?.url,
      }))
      .filter(Boolean)
      .slice(0, 80);
  } catch {
    return [];
  }
}

function dedupeVideos(items: any[]): any[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = String(item?.videoId || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function seededShuffle<T>(items: T[], seed = 0): T[] {
  const arr = [...items];
  let s = Math.abs(seed) + 1;
  for (let i = arr.length - 1; i > 0; i -= 1) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const query = String(url.searchParams.get("q") || "bangla new song 2025").trim().slice(0, 140);
    const pageRaw = Number(url.searchParams.get("page") || "1");
    const seedRaw = Number(url.searchParams.get("seed") || "0");
    const page = Number.isFinite(pageRaw) ? Math.max(1, Math.min(120, Math.floor(pageRaw))) : 1;
    const seed = Number.isFinite(seedRaw) ? seedRaw : 0;
    const normalizedPage = normalizePage(page, 7);

    if (!query) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [invidiousResults, pipedResults, noKeyResults] = await Promise.all([
      searchInvidious(query, normalizedPage),
      searchPiped(query),
      searchNoKeyApi(query),
    ]);

    let merged = dedupeVideos([...invidiousResults, ...pipedResults, ...noKeyResults]);

    if (merged.length === 0 && normalizedPage !== 1) {
      const [retryInvidious, retryPiped, retryNoKey] = await Promise.all([
        searchInvidious(query, 1),
        searchPiped(query),
        searchNoKeyApi(query),
      ]);
      merged = dedupeVideos([...retryInvidious, ...retryPiped, ...retryNoKey]);
    }

    if (merged.length === 0 && query !== "bangla new song 2025") {
      const [fallbackInvidious, fallbackPiped, fallbackNoKey] = await Promise.all([
        searchInvidious("bangla new song 2025", 1),
        searchPiped("bangla new song 2025"),
        searchNoKeyApi("bangla new song 2025"),
      ]);
      merged = dedupeVideos([...fallbackInvidious, ...fallbackPiped, ...fallbackNoKey]);
    }

    const shuffled = seededShuffle(merged, seed + normalizedPage * 29).slice(0, 120);

    return new Response(JSON.stringify({ results: shuffled }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("youtube-search error:", e);
    return new Response(JSON.stringify({ results: [], error: "search_failed" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
