import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CATEGORIES = [
  { key: "funny", query: "bangla funny video" },
  { key: "cartoon", query: "bangla cartoon rupkothar golpo" },
  { key: "romantic", query: "bangla romantic song" },
  { key: "natok", query: "bangla natok" },
  { key: "viral", query: "bangladesh viral video" },
  { key: "music", query: "bangla music video" },
  { key: "comedy", query: "bangla comedy" },
  { key: "vlog", query: "dhaka vlog bangladesh" },
  { key: "tiktok", query: "bangla tiktok compilation" },
  { key: "movie", query: "bangla movie scene" },
  { key: "song", query: "বাংলা গান" },
  { key: "shortfilm", query: "bangla short film" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const rows = parseInt(url.searchParams.get("rows") || "10");
    const preferredParam = url.searchParams.get("preferred") || "";
    const preferredKeys = preferredParam.split(",").filter(Boolean);

    // Pick 3 categories to search this page
    const categoriesToSearch: typeof CATEGORIES[number][] = [];
    const numCats = 3;

    if (preferredKeys.length > 0) {
      // 2 preferred, 1 random
      for (let i = 0; i < 2; i++) {
        const key = preferredKeys[(page + i) % preferredKeys.length];
        const cat = CATEGORIES.find(c => c.key === key);
        if (cat) categoriesToSearch.push(cat);
      }
      const randomIdx = (page * 7 + 3) % CATEGORIES.length;
      categoriesToSearch.push(CATEGORIES[randomIdx]);
    } else {
      for (let i = 0; i < numCats; i++) {
        const idx = ((page - 1) * numCats + i) % CATEGORIES.length;
        categoriesToSearch.push(CATEGORIES[idx]);
      }
    }

    // Fetch from Dailymotion API in parallel
    const perCategory = Math.ceil(rows / categoriesToSearch.length) + 2;
    const fetchPromises = categoriesToSearch.map(async (cat) => {
      try {
        const dmUrl = `https://api.dailymotion.com/videos?search=${encodeURIComponent(cat.query)}&limit=${perCategory}&page=${page}&fields=id,title,thumbnail_url,duration,owner.screenname&language=bn&shorter_than=15&sort=relevance`;
        const res = await fetch(dmUrl);
        if (!res.ok) { await res.text(); return []; }
        const data = await res.json();
        return (data.list || []).map((v: any) => ({ ...v, _category: cat.key }));
      } catch {
        return [];
      }
    });

    const results = await Promise.all(fetchPromises);
    const allItems = results.flat();

    // Deduplicate
    const seen = new Set<string>();
    const videos: any[] = [];

    for (const item of allItems) {
      if (seen.has(item.id)) continue;
      if (item.duration > 900 || item.duration < 5) continue;
      seen.add(item.id);

      videos.push({
        id: `dm-${item.id}`,
        title: item.title || "বাংলা ভিডিও",
        creator: item["owner.screenname"] || null,
        source: "dailymotion",
        thumbnail_url: item.thumbnail_url,
        video_url: `https://geo.dailymotion.com/player.html?video=${item.id}&mute=false&autoplay=true&loop=true&controls=false&ui-start-screen-info=false`,
        video_id: item.id,
        duration: item.duration,
        category: item._category,
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
        hasMore: true,
        categories: CATEGORIES.map(c => c.key),
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
