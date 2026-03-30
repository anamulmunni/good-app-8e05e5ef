import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const streamCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 30 * 60 * 1000;

const KEY_COOLDOWN = 60 * 60 * 1000;
const exhaustedKeys = new Map<string, number>();
const invalidKeys = new Map<string, string>();
let cachedApiKeys: string[] = [];
let apiKeysFetchedAt = 0;
const API_KEYS_CACHE_TTL = 5 * 60 * 1000;
const YT_KEY_REGEX = /^AIza[0-9A-Za-z_-]{20,}$/;

const FALLBACK_SHORTS = [
  { videoId: "BddP6PYo2gs", title: "Mon Majhi Re", author: "Arijit Singh" },
  { videoId: "hT_nvWreIhg", title: "Counting Stars", author: "OneRepublic" },
  { videoId: "60ItHLz5WEA", title: "Faded", author: "Alan Walker" },
  { videoId: "PT2_F-1esPk", title: "The Nights", author: "Avicii" },
  { videoId: "YQHsXMglC9A", title: "Hello", author: "Adele" },
  { videoId: "AtKZKl7Bgu0", title: "Manike Mage Hithe", author: "Yohani" },
  { videoId: "bo_efYhYU2A", title: "Tum Hi Ho", author: "Arijit Singh" },
  { videoId: "nfs8NYg7yQM", title: "Perfect", author: "Ed Sheeran" },
  { videoId: "koJlIGDImiU", title: "Radioactive", author: "Imagine Dragons" },
  { videoId: "CevxZvSJLk8", title: "Roar", author: "Katy Perry" },
];

const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yewtu.be",
  "https://iv.nboeck.de",
  "https://invidious.protokoll-departed.de",
  "https://invidious.privacyredirect.com",
];

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.projectsegfau.lt",
  "https://pipedapi.in.projectsegfau.lt",
];

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

function parseApiKeys(raw: string): string[] {
  return Array.from(new Set(
    raw.split(/[\s,]+/).map((k) => k.trim()).filter((k) => YT_KEY_REGEX.test(k)),
  ));
}

async function getAllApiKeys(): Promise<string[]> {
  if (Date.now() - apiKeysFetchedAt < API_KEYS_CACHE_TTL && cachedApiKeys.length > 0) {
    return cachedApiKeys;
  }
  const keys: string[] = [];
  const envKey = Deno.env.get("YOUTUBE_API_KEY")?.trim();
  if (envKey && YT_KEY_REGEX.test(envKey)) keys.push(envKey);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseUrl && serviceKey) {
      const sb = createClient(supabaseUrl, serviceKey);
      const { data } = await sb.from("settings").select("value").eq("key", "youtube_api_keys").maybeSingle();
      const dbKeys = parseApiKeys(data?.value || "");
      for (const key of dbKeys) {
        if (!keys.includes(key)) keys.push(key);
      }
    }
  } catch (e) {
    console.log("shorts DB key fetch failed:", String(e));
  }

  cachedApiKeys = keys;
  apiKeysFetchedAt = Date.now();
  return keys;
}

function getAvailableKey(keys: string[]): string | null {
  const now = Date.now();
  for (const key of keys) {
    if (invalidKeys.has(key)) continue;
    const exhaustedAt = exhaustedKeys.get(key);
    if (!exhaustedAt || now - exhaustedAt > KEY_COOLDOWN) {
      exhaustedKeys.delete(key);
      return key;
    }
  }
  return null;
}

function getFallbackShorts(maxResults = 30): any[] {
  const shuffled = [...FALLBACK_SHORTS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, maxResults).map((item) => ({
    videoId: item.videoId, title: item.title, author: item.author,
    thumbnail: `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
  }));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(v => { clearTimeout(id); resolve(v); }).catch(e => { clearTimeout(id); reject(e); });
  });
}

// ── Piped search for shorts ─────────────────────────────────────────────
async function searchShortsViaPiped(query: string, maxResults = 30): Promise<any[]> {
  for (const instance of PIPED_INSTANCES) {
    try {
      const url = `${instance}/search?q=${encodeURIComponent(query + " #shorts")}&filter=videos`;
      const res = await withTimeout(fetch(url), 7000);
      if (!res.ok) { await res.text().catch(() => {}); continue; }
      const data = await res.json();
      const items = Array.isArray(data?.items) ? data.items : [];

      const results = items
        .filter((item: any) => item?.url && item?.title && (item?.duration || 0) <= 180)
        .slice(0, maxResults)
        .map((item: any) => {
          const videoId = item.url?.replace("/watch?v=", "") || "";
          return {
            videoId, title: item.title || "", author: item.uploaderName || "",
            thumbnail: item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          };
        })
        .filter((r: any) => r.videoId);

      if (results.length > 0) {
        console.log(`Piped shorts: ${results.length} results from ${instance}`);
        return results;
      }
    } catch { continue; }
  }
  return [];
}

// ── YouTube HTML scraping for shorts ─────────────────────────────────────
async function searchShortsViaHTML(query: string, maxResults = 30): Promise<any[]> {
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query + " #shorts")}&sp=EgIYAQ%3D%3D`;
    const res = await withTimeout(fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "bn-BD,bn;q=0.9,en;q=0.8",
      },
    }), 10000);
    if (!res.ok) { await res.text().catch(() => {}); return []; }
    const html = await res.text();

    const match = html.match(/var\s+ytInitialData\s*=\s*({.+?});\s*<\/script>/s)
      || html.match(/ytInitialData\s*=\s*({.+?});\s*/s);
    if (!match) return [];

    const data = JSON.parse(match[1]);
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
      ?.sectionListRenderer?.contents || [];

    const results: any[] = [];
    for (const section of contents) {
      const items = section?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        const vr = item?.videoRenderer;
        if (!vr?.videoId) continue;
        results.push({
          videoId: vr.videoId,
          title: vr.title?.runs?.[0]?.text || "",
          author: vr.ownerText?.runs?.[0]?.text || "",
          thumbnail: `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`,
        });
        if (results.length >= maxResults) break;
      }
      if (results.length >= maxResults) break;
    }

    if (results.length > 0) console.log(`YouTube HTML shorts: ${results.length} results`);
    return results;
  } catch (e) {
    console.log("YouTube HTML shorts scraping failed:", String(e));
    return [];
  }
}

// ── Invidious search for shorts ─────────────────────────────────────────
async function searchShortsFallback(query: string): Promise<any[]> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=relevance&region=BD`;
      const res = await withTimeout(fetch(url), 6000);
      if (!res.ok) { await res.text().catch(() => {}); continue; }
      const data = await res.json();
      if (!Array.isArray(data)) continue;

      return data
        .filter((item: any) => item?.videoId && item?.title && (item?.lengthSeconds || 0) <= 180)
        .map((item: any) => ({
          videoId: item.videoId, title: item.title, author: item.author || "",
          thumbnail: item.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
        }))
        .slice(0, 30);
    } catch { continue; }
  }
  return [];
}

// YouTube API search for shorts
async function searchShortsWithRotation(keys: string[], query: string, maxResults = 20): Promise<any[]> {
  const params = new URLSearchParams({
    part: "snippet", q: query, type: "video", videoDuration: "short",
    maxResults: String(maxResults), order: "relevance", regionCode: "BD", relevanceLanguage: "bn",
  });
  const baseUrl = `https://www.googleapis.com/youtube/v3/search?${params}`;

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const apiKey = getAvailableKey(keys);
    if (!apiKey) break;

    try {
      const res = await withTimeout(fetch(`${baseUrl}&key=${apiKey}`), 8000);
      if (!res.ok) {
        const errBody = await res.text();
        const errLower = errBody.toLowerCase();
        if (res.status === 403 && errLower.includes("quotaexceeded")) {
          exhaustedKeys.set(apiKey, Date.now());
          continue;
        }
        if (res.status === 400 || (res.status === 403 && (errLower.includes("apikey") || errLower.includes("accessnotconfigured")))) {
          invalidKeys.set(apiKey, "invalid_or_restricted_key");
          continue;
        }
        continue;
      }
      const data = await res.json();
      return (data?.items || [])
        .filter((item: any) => item?.id?.videoId)
        .map((item: any) => ({
          videoId: item.id.videoId, title: item.snippet?.title || "",
          author: item.snippet?.channelTitle || "",
          thumbnail: item.snippet?.thumbnails?.high?.url || `https://i.ytimg.com/vi/${item.id.videoId}/hqdefault.jpg`,
        }));
    } catch { continue; }
  }
  return [];
}

// Get direct stream URL
async function getStreamUrl(videoId: string): Promise<string | null> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const url = `${instance}/api/v1/videos/${videoId}`;
      const res = await withTimeout(fetch(url), 5000);
      if (!res.ok) { await res.text().catch(() => {}); continue; }
      const data = await res.json();
      const formats = data?.formatStreams || [];
      const combined = formats.find((f: any) =>
        f.container === "mp4" && f.qualityLabel && (f.qualityLabel.includes("360") || f.qualityLabel.includes("720"))
      ) || formats[0];
      if (combined?.url) return combined.url;
      const adaptiveFormats = data?.adaptiveFormats || [];
      const videoStream = adaptiveFormats.find((f: any) =>
        f.type?.startsWith("video/mp4") && f.qualityLabel?.includes("360")
      );
      if (videoStream?.url) return videoStream.url;
    } catch { continue; }
  }

  for (const instance of PIPED_INSTANCES) {
    try {
      const url = `${instance}/streams/${videoId}`;
      const res = await withTimeout(fetch(url), 5000);
      if (!res.ok) { await res.text().catch(() => {}); continue; }
      const data = await res.json();
      const videoStreams = data?.videoStreams || [];
      const stream = videoStreams.find((s: any) =>
        s.mimeType?.includes("video/mp4") && s.quality?.includes("360")
      ) || videoStreams.find((s: any) => s.mimeType?.includes("video/mp4"));
      if (stream?.url) return stream.url;
    } catch { continue; }
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "search";

    if (action === "search") {
      const query = String(url.searchParams.get("q") || "bangla short video 2025").trim().slice(0, 140);
      const category = url.searchParams.get("category") || "mixed";
      const cacheKey = `shorts:${query}:${category}`;
      const cached = getCached(cacheKey);
      if (cached) {
        return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const apiKeys = await getAllApiKeys();
      let results: any[] = [];
      const queries = getSearchQueries(category, query);

      if (apiKeys.length > 0) {
        try {
          const searchPromises = queries.map((q) => searchShortsWithRotation(apiKeys, q, 15));
          const allResults = await Promise.all(searchPromises);
          results = allResults.flat();
        } catch {
          // YouTube API failed
        }
      }

      // If YouTube API returned nothing, try Piped then Invidious
      if (results.length === 0) {
        console.log("YouTube API returned 0 shorts, trying Piped...");
        for (const q of queries.slice(0, 2)) {
          const pipedResults = await searchShortsViaPiped(q, 20);
          results.push(...pipedResults);
          if (results.length >= 20) break;
        }
      }

      if (results.length === 0) {
        console.log("Piped returned 0, trying Invidious...");
        results = await searchShortsFallback(query);
      }

      if (results.length === 0) {
        results = getFallbackShorts(100);
      }

      // Dedupe
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

    if (action === "stream") {
      const videoId = String(url.searchParams.get("videoId") || "").trim();
      if (!videoId) {
        return new Response(JSON.stringify({ error: "missing_videoId" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const cacheKey = `stream:${videoId}`;
      const cached = getCached(cacheKey);
      if (cached) {
        return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const streamUrl = await getStreamUrl(videoId);
      const response = { videoId, streamUrl };
      if (streamUrl) setCache(cacheKey, response);
      return new Response(JSON.stringify(response), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "invalid_action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("youtube-shorts error:", e);
    return new Response(JSON.stringify({ results: [], error: "failed" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getSearchQueries(category: string, userQuery: string): string[] {
  const categoryQueries: Record<string, string[]> = {
    mixed: ["bangla short video 2025", "bangla gojol short 2025", "bangla funny video short", "tiktok viral bangla", "bangla slowed reverb short", "bhojpuri dance short"],
    gajal: ["bangla gojol short 2025", "islamic gojol bangla kalarab", "bangla islamic short video", "নাতে রাসুল short"],
    slowed_reverb: ["bangla slowed reverb 2025", "hindi slowed reverb aesthetic", "lofi bangla song short"],
    funny: ["bangla funny video 2025", "bangla comedy short", "tiktok funny bangla"],
    dance: ["bhojpuri dance video short", "bangla dance tiktok", "hindi dance short video"],
    nature: ["nature short video aesthetic", "beautiful nature shorts 4k", "sunset aesthetic short"],
  };

  if (userQuery && userQuery !== "bangla short video 2025") {
    return [userQuery, ...(categoryQueries[category] || categoryQueries.mixed).slice(0, 2)];
  }
  return categoryQueries[category] || categoryQueries.mixed;
}
