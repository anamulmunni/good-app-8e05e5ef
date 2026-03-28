import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Bangla video categories for variety
const CATEGORIES = [
  "বাংলা funny video",
  "বাংলা cartoon",
  "বাংলা romantic video",
  "bangla natok",
  "বাংলাদেশ viral video",
  "bangla music video",
  "বাংলা short film",
  "bangla comedy",
  "dhaka vlog",
  "বাংলা tiktok compilation",
  "bangla movie scene",
  "বাংলা গান",
];

// Multiple Piped API instances for reliability
const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.in.projectsegfau.lt",
];

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return res;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

async function searchPiped(query: string, instance: string): Promise<any[]> {
  try {
    const url = `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`;
    const res = await fetchWithTimeout(url, 8000);
    if (!res.ok) { await res.text(); return []; }
    const data = await res.json();
    return Array.isArray(data?.items) ? data.items : [];
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
    const page = parseInt(url.searchParams.get("page") || "1");
    const rows = parseInt(url.searchParams.get("rows") || "10");
    // Client can send preferred categories (comma-separated indices)
    const preferredParam = url.searchParams.get("preferred") || "";
    const preferredIndices = preferredParam
      .split(",")
      .map(Number)
      .filter((n) => !isNaN(n) && n >= 0 && n < CATEGORIES.length);

    // Pick categories: weight preferred ones more heavily
    const categoriesToSearch: string[] = [];
    const numCategories = Math.min(3, rows);

    if (preferredIndices.length > 0) {
      // 60% preferred, 40% random
      const numPreferred = Math.ceil(numCategories * 0.6);
      const numRandom = numCategories - numPreferred;

      for (let i = 0; i < numPreferred; i++) {
        const idx = preferredIndices[(page * i) % preferredIndices.length];
        categoriesToSearch.push(CATEGORIES[idx]);
      }
      for (let i = 0; i < numRandom; i++) {
        const idx = (page * 3 + i * 7) % CATEGORIES.length;
        categoriesToSearch.push(CATEGORIES[idx]);
      }
    } else {
      // Rotate through categories based on page
      for (let i = 0; i < numCategories; i++) {
        const idx = ((page - 1) * numCategories + i) % CATEGORIES.length;
        categoriesToSearch.push(CATEGORIES[idx]);
      }
    }

    // Try Piped instances in order
    let allItems: any[] = [];
    let usedInstance = "";

    for (const instance of PIPED_INSTANCES) {
      if (allItems.length >= rows) break;

      const searchPromises = categoriesToSearch.map((cat) => searchPiped(cat, instance));
      const results = await Promise.allSettled(searchPromises);

      for (const r of results) {
        if (r.status === "fulfilled") {
          allItems.push(...r.value);
        }
      }

      if (allItems.length > 0) {
        usedInstance = instance;
        break;
      }
    }

    // Deduplicate by videoId and filter
    const seen = new Set<string>();
    const videos: any[] = [];

    for (const item of allItems) {
      if (!item?.url || item.type !== "stream") continue;

      // Extract video ID from /watch?v=xxx
      const match = item.url.match(/[?&]v=([^&]+)/);
      const videoId = match?.[1];
      if (!videoId || seen.has(videoId)) continue;

      // Filter: max 15 minutes (900 seconds), skip very short (<10s)
      const duration = item.duration || 0;
      if (duration > 900 || duration < 10) continue;

      seen.add(videoId);

      // Determine category index for personalization tracking
      let categoryIndex = -1;
      const title = String(item.title || "").toLowerCase();
      for (let ci = 0; ci < CATEGORIES.length; ci++) {
        const catWords = CATEGORIES[ci].toLowerCase().split(/\s+/);
        if (catWords.some((w: string) => title.includes(w))) {
          categoryIndex = ci;
          break;
        }
      }

      videos.push({
        id: `yt-${videoId}`,
        title: item.title || "বাংলা ভিডিও",
        creator: item.uploaderName || item.uploaderUrl?.replace("/channel/", "") || null,
        source: "youtube",
        thumbnail_url: item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        // YouTube embed URL for iframe playback
        video_url: `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0&loop=1&controls=0&playsinline=1&rel=0&modestbranding=1&showinfo=0`,
        video_id: videoId,
        duration,
        category_index: categoryIndex,
      });

      if (videos.length >= rows) break;
    }

    // Shuffle for variety
    for (let i = videos.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [videos[i], videos[j]] = [videos[j], videos[i]];
    }

    return new Response(
      JSON.stringify({
        videos,
        hasMore: true, // Always true since YouTube has unlimited content
        categories: CATEGORIES,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ videos: [], hasMore: false, error: String(err) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
