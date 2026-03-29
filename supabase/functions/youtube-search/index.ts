import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// In-memory cache (edge function cold start resets it)
const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCached(key: string) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any) {
  // Limit cache size
  if (cache.size > 200) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { data, ts: Date.now() });
}

// Fallback Invidious instances for when API quota is exhausted
const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yewtu.be",
  "https://iv.nbonn.ch",
];

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(v => { clearTimeout(id); resolve(v); }).catch(e => { clearTimeout(id); reject(e); });
  });
}

// Official YouTube Data API v3 search
async function searchYouTubeOfficial(
  apiKey: string,
  query: string,
  pageToken?: string,
  maxResults = 25,
  order = "relevance",
  type = "video"
): Promise<{ results: any[]; nextPageToken?: string }> {
  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type,
    maxResults: String(maxResults),
    order,
    key: apiKey,
    regionCode: "BD",
    relevanceLanguage: "bn",
  });
  if (pageToken) params.set("pageToken", pageToken);

  const url = `https://www.googleapis.com/youtube/v3/search?${params}`;
  const res = await withTimeout(fetch(url), 8000);

  if (!res.ok) {
    const errBody = await res.text();
    console.error("YouTube API error:", res.status, errBody);
    throw new Error(`youtube_api_${res.status}`);
  }

  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];

  const results = items
    .filter((item: any) => item?.id?.videoId)
    .map((item: any) => ({
      videoId: item.id.videoId,
      title: item.snippet?.title || "",
      author: item.snippet?.channelTitle || "",
      channelId: item.snippet?.channelId || "",
      thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || `https://i.ytimg.com/vi/${item.id.videoId}/hqdefault.jpg`,
      publishedAt: item.snippet?.publishedAt || "",
    }));

  return { results, nextPageToken: data?.nextPageToken };
}

// Fallback: Invidious search (no API key needed)
async function searchInvidiousFallback(query: string): Promise<any[]> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=relevance&region=BD`;
      const res = await withTimeout(fetch(url), 6000);
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data)) continue;

      return data
        .filter((item: any) => item?.videoId && item?.title)
        .map((item: any) => ({
          videoId: item.videoId,
          title: item.title,
          author: item.author || "",
          channelId: item.authorId || "",
          lengthSeconds: item.lengthSeconds || 0,
          thumbnail: item.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
        }))
        .slice(0, 50);
    } catch {
      continue;
    }
  }
  return [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const query = String(url.searchParams.get("q") || "bangla new song 2025").trim().slice(0, 140);
    const pageToken = url.searchParams.get("pageToken") || undefined;
    const order = url.searchParams.get("order") || "relevance"; // relevance, viewCount, date, rating
    const maxResults = Math.min(50, Math.max(5, Number(url.searchParams.get("maxResults") || "25")));

    if (!query) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check cache
    const cacheKey = `search:${query}:${order}:${maxResults}:${pageToken || ""}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("YOUTUBE_API_KEY");
    let response: { results: any[]; nextPageToken?: string };

    if (apiKey) {
      try {
        response = await searchYouTubeOfficial(apiKey, query, pageToken, maxResults, order);
      } catch (err) {
        console.error("Official API failed, using fallback:", err);
        const fallbackResults = await searchInvidiousFallback(query);
        response = { results: fallbackResults };
      }
    } else {
      console.warn("No YOUTUBE_API_KEY, using Invidious fallback");
      const fallbackResults = await searchInvidiousFallback(query);
      response = { results: fallbackResults };
    }

    // Cache result
    if (response.results.length > 0) {
      setCache(cacheKey, response);
    }

    return new Response(JSON.stringify(response), {
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
