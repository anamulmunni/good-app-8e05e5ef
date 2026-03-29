import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 min cache for more variety

function getCached(key: string) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any) {
  if (cache.size > 200) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { data, ts: Date.now() });
}

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
    videoDuration: "medium", // Exclude shorts (< 4min) - only medium (4-20min) and long videos
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

// Trending/Most Popular videos via YouTube Data API
// Uses multiple category IDs and shuffles for variety
async function getTrendingVideos(
  apiKey: string,
  maxResults = 25,
  categoryId?: string,
): Promise<{ results: any[] }> {
  // If no specific category, fetch from multiple categories for variety
  const categories = categoryId ? [categoryId] : ["10", "24", "1", "22"]; // Music, Entertainment, Film, People
  const perCategory = categoryId ? maxResults : Math.ceil(maxResults / categories.length) + 5;
  
  const allResults: any[] = [];

  for (const catId of categories) {
    const params = new URLSearchParams({
      part: "snippet,contentDetails",
      chart: "mostPopular",
      regionCode: "BD",
      maxResults: String(perCategory),
      key: apiKey,
      videoCategoryId: catId,
    });

    const url = `https://www.googleapis.com/youtube/v3/videos?${params}`;
    try {
      const res = await withTimeout(fetch(url), 8000);
      if (!res.ok) continue;

      const data = await res.json();
      const items = Array.isArray(data?.items) ? data.items : [];

      const results = items
        .filter((item: any) => item?.id)
        .map((item: any) => ({
          videoId: item.id,
          title: item.snippet?.title || "",
          author: item.snippet?.channelTitle || "",
          channelId: item.snippet?.channelId || "",
          thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
          publishedAt: item.snippet?.publishedAt || "",
          viewCount: item.statistics?.viewCount || "0",
        }));

      allResults.push(...results);
    } catch {
      continue;
    }
  }

  // Shuffle results for variety on each load
  for (let i = allResults.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allResults[i], allResults[j]] = [allResults[j], allResults[i]];
  }

  // Dedupe by videoId
  const seen = new Set<string>();
  const deduped = allResults.filter(r => {
    if (seen.has(r.videoId)) return false;
    seen.add(r.videoId);
    return true;
  });

  return { results: deduped.slice(0, maxResults) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "search";
    const query = String(url.searchParams.get("q") || "").trim().slice(0, 140);
    const pageToken = url.searchParams.get("pageToken") || undefined;
    const order = url.searchParams.get("order") || "relevance";
    const maxResults = Math.min(50, Math.max(5, Number(url.searchParams.get("maxResults") || "25")));

    const apiKey = Deno.env.get("YOUTUBE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ results: [], error: "no_api_key" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: Trending videos
    if (action === "trending") {
      const categoryId = url.searchParams.get("categoryId") || undefined;
      const cacheKey = `trending:${categoryId || "all"}:${maxResults}`;
      const cached = getCached(cacheKey);
      if (cached) {
        return new Response(JSON.stringify(cached), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const response = await getTrendingVideos(apiKey, maxResults, categoryId);
      if (response.results.length > 0) setCache(cacheKey, response);

      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: Search
    if (!query) {
      // Default: return trending
      const cacheKey = `trending:default:${maxResults}`;
      const cached = getCached(cacheKey);
      if (cached) {
        return new Response(JSON.stringify(cached), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const response = await getTrendingVideos(apiKey, maxResults);
      if (response.results.length > 0) setCache(cacheKey, response);

      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cacheKey = `search:${query}:${order}:${maxResults}:${pageToken || ""}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await searchYouTubeOfficial(apiKey, query, pageToken, maxResults, order);
    if (response.results.length > 0) setCache(cacheKey, response);

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
