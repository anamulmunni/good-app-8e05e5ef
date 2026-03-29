import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Cache for short video streams
const streamCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 min

function getCached(key: string) {
  const entry = streamCache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  streamCache.delete(key);
  return null;
}

function setCache(key: string, data: any) {
  if (streamCache.size > 500) {
    const oldest = streamCache.keys().next().value;
    if (oldest) streamCache.delete(oldest);
  }
  streamCache.set(key, { data, ts: Date.now() });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(v => { clearTimeout(id); resolve(v); }).catch(e => { clearTimeout(id); reject(e); });
  });
}

const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yewtu.be",
  "https://iv.nbonn.ch",
  "https://invidious.protokoll-departed.de",
];

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.projectsegfau.lt",
];

// Get direct stream URL for a video via Invidious
async function getStreamUrl(videoId: string): Promise<string | null> {
  // Try Invidious first
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const url = `${instance}/api/v1/videos/${videoId}`;
      const res = await withTimeout(fetch(url), 5000);
      if (!res.ok) { await res.text(); continue; }
      const data = await res.json();

      // Prefer adaptive formats (audio+video combined), lower quality for shorts
      const formats = data?.formatStreams || [];
      const adaptiveFormats = data?.adaptiveFormats || [];

      // Find a good combined stream (360p or 720p)
      const combined = formats.find((f: any) =>
        f.container === "mp4" && f.qualityLabel && (f.qualityLabel.includes("360") || f.qualityLabel.includes("720"))
      ) || formats[0];

      if (combined?.url) return combined.url;

      // Fallback to adaptive
      const videoStream = adaptiveFormats.find((f: any) =>
        f.type?.startsWith("video/mp4") && f.qualityLabel?.includes("360")
      );
      if (videoStream?.url) return videoStream.url;
    } catch {
      continue;
    }
  }

  // Try Piped
  for (const instance of PIPED_INSTANCES) {
    try {
      const url = `${instance}/streams/${videoId}`;
      const res = await withTimeout(fetch(url), 5000);
      if (!res.ok) { await res.text(); continue; }
      const data = await res.json();

      const videoStreams = data?.videoStreams || [];
      const stream = videoStreams.find((s: any) =>
        s.mimeType?.includes("video/mp4") && s.quality?.includes("360")
      ) || videoStreams.find((s: any) => s.mimeType?.includes("video/mp4"));

      if (stream?.url) return stream.url;
    } catch {
      continue;
    }
  }

  return null;
}

// Search for shorts using YouTube Data API v3
async function searchShorts(apiKey: string, query: string, maxResults = 20): Promise<any[]> {
  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    videoDuration: "short", // Under 4 minutes
    maxResults: String(maxResults),
    order: "relevance",
    key: apiKey,
    regionCode: "BD",
    relevanceLanguage: "bn",
  });

  const url = `https://www.googleapis.com/youtube/v3/search?${params}`;
  const res = await withTimeout(fetch(url), 8000);

  if (!res.ok) {
    const errBody = await res.text();
    console.error("YouTube Shorts API error:", res.status, errBody);
    return [];
  }

  const data = await res.json();
  return (data?.items || [])
    .filter((item: any) => item?.id?.videoId)
    .map((item: any) => ({
      videoId: item.id.videoId,
      title: item.snippet?.title || "",
      author: item.snippet?.channelTitle || "",
      thumbnail: item.snippet?.thumbnails?.high?.url || `https://i.ytimg.com/vi/${item.id.videoId}/hqdefault.jpg`,
    }));
}

// Fallback search using Invidious
async function searchShortsFallback(query: string): Promise<any[]> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=relevance&region=BD`;
      const res = await withTimeout(fetch(url), 6000);
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data)) continue;

      return data
        .filter((item: any) => item?.videoId && item?.title && (item?.lengthSeconds || 0) <= 180)
        .map((item: any) => ({
          videoId: item.videoId,
          title: item.title,
          author: item.author || "",
          thumbnail: item.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
        }))
        .slice(0, 30);
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
    const action = url.searchParams.get("action") || "search";

    // ACTION 1: Search for shorts
    if (action === "search") {
      const query = String(url.searchParams.get("q") || "bangla short video 2025").trim().slice(0, 140);
      const category = url.searchParams.get("category") || "mixed";

      const cacheKey = `shorts:${query}:${category}`;
      const cached = getCached(cacheKey);
      if (cached) {
        return new Response(JSON.stringify(cached), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const apiKey = Deno.env.get("YOUTUBE_API_KEY");
      let results: any[] = [];

      // Search multiple queries for variety
      const queries = getSearchQueries(category, query);

      if (apiKey) {
        try {
          const searchPromises = queries.map(q => searchShorts(apiKey, q, 15));
          const allResults = await Promise.all(searchPromises);
          results = allResults.flat();
        } catch {
          results = await searchShortsFallback(query);
        }
      } else {
        results = await searchShortsFallback(query);
      }

      // Dedupe by videoId
      const seen = new Set<string>();
      results = results.filter(r => {
        if (seen.has(r.videoId)) return false;
        seen.add(r.videoId);
        return true;
      });

      // Shuffle
      for (let i = results.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [results[i], results[j]] = [results[j], results[i]];
      }

      const response = { results: results.slice(0, 100) };
      if (results.length > 0) setCache(cacheKey, response);

      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION 2: Get stream URL for a specific video
    if (action === "stream") {
      const videoId = String(url.searchParams.get("videoId") || "").trim();
      if (!videoId) {
        return new Response(JSON.stringify({ error: "missing_videoId" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cacheKey = `stream:${videoId}`;
      const cached = getCached(cacheKey);
      if (cached) {
        return new Response(JSON.stringify(cached), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const streamUrl = await getStreamUrl(videoId);
      const response = { videoId, streamUrl };

      if (streamUrl) setCache(cacheKey, response);

      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "invalid_action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("youtube-shorts error:", e);
    return new Response(JSON.stringify({ results: [], error: "failed" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getSearchQueries(category: string, userQuery: string): string[] {
  const categoryQueries: Record<string, string[]> = {
    mixed: [
      "bangla short video 2025",
      "bangla gojol short 2025",
      "bangla funny video short",
      "tiktok viral bangla",
      "bangla slowed reverb short",
      "bhojpuri dance short",
    ],
    gajal: [
      "bangla gojol short 2025",
      "islamic gojol bangla kalarab",
      "bangla islamic short video",
      "নাতে রাসুল short",
    ],
    slowed_reverb: [
      "bangla slowed reverb 2025",
      "hindi slowed reverb aesthetic",
      "lofi bangla song short",
    ],
    funny: [
      "bangla funny video 2025",
      "bangla comedy short",
      "tiktok funny bangla",
    ],
    dance: [
      "bhojpuri dance video short",
      "bangla dance tiktok",
      "hindi dance short video",
    ],
    nature: [
      "nature short video aesthetic",
      "beautiful nature shorts 4k",
      "sunset aesthetic short",
    ],
  };

  if (userQuery && userQuery !== "bangla short video 2025") {
    return [userQuery, ...(categoryQueries[category] || categoryQueries.mixed).slice(0, 2)];
  }

  return categoryQueries[category] || categoryQueries.mixed;
}
