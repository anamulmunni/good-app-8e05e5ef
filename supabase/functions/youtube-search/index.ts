import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL_TRENDING = 30 * 60 * 1000; // 30 min for trending (save quota)
const CACHE_TTL_SEARCH = 15 * 60 * 1000; // 15 min for search results
let quotaExhausted = false;
let quotaExhaustedAt = 0;
const QUOTA_COOLDOWN = 60 * 60 * 1000; // 1 hour cooldown after quota error

function getCached(key: string, ttl: number) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < ttl) return entry.data;
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

// Fallback popular Bangladesh video IDs (curated, no API needed)
const FALLBACK_VIDEOS = [
  { videoId: "JGwWNGJdvx8", title: "Shape of You - Ed Sheeran", author: "Ed Sheeran" },
  { videoId: "RgKAFK5djSk", title: "See You Again ft. Charlie Puth", author: "Wiz Khalifa" },
  { videoId: "fRh_vgS2dFE", title: "Sorry - Justin Bieber", author: "Justin Bieber" },
  { videoId: "OPf0YbXqDm0", title: "Uptown Funk - Mark Ronson ft. Bruno Mars", author: "Mark Ronson" },
  { videoId: "CevxZvSJLk8", title: "Roar - Katy Perry", author: "Katy Perry" },
  { videoId: "YQHsXMglC9A", title: "Hello - Adele", author: "Adele" },
  { videoId: "hT_nvWreIhg", title: "Counting Stars - OneRepublic", author: "OneRepublic" },
  { videoId: "pRpeEdMmmQ0", title: "Shake It Off - Taylor Swift", author: "Taylor Swift" },
  { videoId: "kJQP7kiw5Fk", title: "Despacito - Luis Fonsi ft. Daddy Yankee", author: "Luis Fonsi" },
  { videoId: "nfs8NYg7yQM", title: "Perfect - Ed Sheeran", author: "Ed Sheeran" },
  { videoId: "60ItHLz5WEA", title: "Alan Walker - Faded", author: "Alan Walker" },
  { videoId: "lp-EO5I60KA", title: "Tera Ban Jaunga", author: "Akhil Sachdeva" },
  { videoId: "bo_efYhYU2A", title: "Tum Hi Ho - Aashiqui 2", author: "Arijit Singh" },
  { videoId: "AtKZKl7Bgu0", title: "Manike Mage Hithe", author: "Yohani" },
  { videoId: "vGJTaP6anOU", title: "Tomake Chai - Gangster", author: "Arijit Singh" },
  { videoId: "BddP6PYo2gs", title: "Mon Majhi Re", author: "Arijit Singh" },
  { videoId: "hoNb6HuNmU0", title: "Tumi Amar Emoni Ekjon", author: "Bangla Song" },
  { videoId: "KgmeRfCQIRo", title: "O Maahi - Dunki", author: "Arijit Singh" },
  { videoId: "koJlIGDImiU", title: "Radioactive - Imagine Dragons", author: "Imagine Dragons" },
  { videoId: "PT2_F-1esPk", title: "The Nights - Avicii", author: "Avicii" },
];

function getFallbackVideos(maxResults = 25): { results: any[] } {
  // Shuffle fallbacks
  const shuffled = [...FALLBACK_VIDEOS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return {
    results: shuffled.slice(0, maxResults).map(v => ({
      videoId: v.videoId,
      title: v.title,
      author: v.author,
      channelId: "",
      thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
      publishedAt: "",
    })),
  };
}

function isQuotaAvailable(): boolean {
  if (!quotaExhausted) return true;
  if (Date.now() - quotaExhaustedAt > QUOTA_COOLDOWN) {
    quotaExhausted = false;
    return true;
  }
  return false;
}

function markQuotaExhausted() {
  quotaExhausted = true;
  quotaExhaustedAt = Date.now();
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
  if (!isQuotaAvailable()) return getFallbackVideos(maxResults);

  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type,
    maxResults: String(maxResults),
    order,
    key: apiKey,
    regionCode: "BD",
    relevanceLanguage: "bn",
    videoDuration: "medium",
  });
  if (pageToken) params.set("pageToken", pageToken);

  const url = `https://www.googleapis.com/youtube/v3/search?${params}`;
  const res = await withTimeout(fetch(url), 8000);

  if (!res.ok) {
    const errBody = await res.text();
    console.error("YouTube API error:", res.status, errBody);
    if (res.status === 403 && errBody.includes("quotaExceeded")) {
      markQuotaExhausted();
      return getFallbackVideos(maxResults);
    }
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
async function getTrendingVideos(
  apiKey: string,
  maxResults = 25,
  categoryId?: string,
): Promise<{ results: any[] }> {
  if (!isQuotaAvailable()) return getFallbackVideos(maxResults);

  const categories = categoryId ? [categoryId] : ["10", "24", "1", "22"];
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
      if (!res.ok) {
        if (res.status === 403) {
          const errBody = await res.text();
          if (errBody.includes("quotaExceeded")) {
            markQuotaExhausted();
            return getFallbackVideos(maxResults);
          }
        }
        continue;
      }

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
        }));

      allResults.push(...results);
    } catch {
      continue;
    }
  }

  // Shuffle results for variety
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

  const result = { results: deduped.slice(0, maxResults) };
  return result.results.length > 0 ? result : getFallbackVideos(maxResults);
}

// YouTube Suggest API (free, no quota)
async function getYouTubeSuggestions(query: string): Promise<string[]> {
  if (!query.trim()) return [];
  try {
    const params = new URLSearchParams({
      client: "youtube",
      ds: "yt",
      q: query,
      hl: "bn",
      gl: "BD",
    });
    const url = `https://suggestqueries.google.com/complete/search?${params}&callback=`;
    const res = await withTimeout(fetch(url), 4000);
    if (!res.ok) return [];
    const text = await res.text();
    // Parse JSONP response
    const jsonStr = text.replace(/^[^[]*/, "").replace(/[^]]*$/, "");
    if (!jsonStr) return [];
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed) && Array.isArray(parsed[1])) {
      return parsed[1].map((item: any) => (Array.isArray(item) ? item[0] : String(item))).filter(Boolean).slice(0, 10);
    }
    return [];
  } catch {
    return [];
  }
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

    // ACTION: Suggestions (free, no API key needed)
    if (action === "suggest") {
      const cacheKey = `suggest:${query}`;
      const cached = getCached(cacheKey, 60 * 60 * 1000); // 1 hour cache
      if (cached) {
        return new Response(JSON.stringify(cached), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const suggestions = await getYouTubeSuggestions(query);
      const response = { suggestions };
      if (suggestions.length > 0) setCache(cacheKey, response);
      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!apiKey) {
      const fallback = getFallbackVideos(maxResults);
      return new Response(JSON.stringify(fallback), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: Trending videos
    if (action === "trending") {
      const categoryId = url.searchParams.get("categoryId") || undefined;
      const cacheKey = `trending:${categoryId || "all"}:${maxResults}`;
      const cached = getCached(cacheKey, CACHE_TTL_TRENDING);
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
      const cacheKey = `trending:default:${maxResults}`;
      const cached = getCached(cacheKey, CACHE_TTL_TRENDING);
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
    const cached = getCached(cacheKey, CACHE_TTL_SEARCH);
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
    const fallback = getFallbackVideos(25);
    return new Response(JSON.stringify(fallback), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
