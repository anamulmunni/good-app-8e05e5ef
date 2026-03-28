import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CATEGORIES = [
  { key: "funny", query: "bangla funny video short" },
  { key: "cartoon", query: "bangla cartoon gopal bhar short" },
  { key: "romantic", query: "bangla romantic video short" },
  { key: "natok", query: "bangla natok clip short" },
  { key: "viral", query: "bangladesh viral video short" },
  { key: "music", query: "bangla music video" },
  { key: "comedy", query: "bangla comedy short video" },
  { key: "tiktok", query: "bangla tiktok viral" },
  { key: "song", query: "bangla gan short" },
  { key: "gopal", query: "gopal bhar bangla cartoon short" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const rows = parseInt(url.searchParams.get("rows") || "10");
    const searchQuery = url.searchParams.get("search") || "";
    const preferredParam = url.searchParams.get("preferred") || "";
    const preferredKeys = preferredParam.split(",").filter(Boolean);

    let queries: string[] = [];

    if (searchQuery.trim()) {
      // User searched — use their query, add "short" and "bangla" variants
      const q = searchQuery.trim();
      queries = [
        `${q} short`,
        `${q} bangla short`,
        q,
      ];
    } else if (preferredKeys.length > 0) {
      for (let i = 0; i < 2; i++) {
        const key = preferredKeys[(page + i) % preferredKeys.length];
        const cat = CATEGORIES.find(c => c.key === key);
        if (cat) queries.push(cat.query);
      }
      const randomIdx = (page * 7 + 3) % CATEGORIES.length;
      queries.push(CATEGORIES[randomIdx].query);
    } else {
      for (let i = 0; i < 3; i++) {
        const idx = ((page - 1) * 3 + i) % CATEGORIES.length;
        queries.push(CATEGORIES[idx].query);
      }
    }

    const perQuery = Math.ceil(rows / queries.length) + 5;

    const fetchPromises = queries.map(async (q) => {
      try {
        // shorter_than=1 = under 1 minute for TikTok-style short videos
        // Also try shorter_than=2 (under 2 min) for slightly more results
        const dmUrl = `https://api.dailymotion.com/videos?search=${encodeURIComponent(q)}&limit=${perQuery}&page=${page}&fields=id,title,thumbnail_url,duration,owner.screenname,embed_url&shorter_than=2&sort=relevance&language=bn`;
        const res = await fetch(dmUrl);
        if (!res.ok) { await res.text(); return []; }
        const data = await res.json();
        return (data.list || []).map((v: any) => {
          let cat = "";
          const title = String(v.title || "").toLowerCase();
          if (title.includes("cartoon") || title.includes("gopal") || title.includes("rupkotha")) cat = "cartoon";
          else if (title.includes("funny") || title.includes("comedy") || title.includes("হাসি")) cat = "funny";
          else if (title.includes("romantic") || title.includes("love")) cat = "romantic";
          else if (title.includes("natok") || title.includes("নাটক")) cat = "natok";
          else if (title.includes("song") || title.includes("গান") || title.includes("gan")) cat = "song";
          else if (title.includes("tiktok")) cat = "tiktok";
          else cat = "viral";
          return { ...v, _category: cat };
        });
      } catch {
        return [];
      }
    });

    const results = await Promise.all(fetchPromises);
    const allItems = results.flat();

    const seen = new Set<string>();
    const videos: any[] = [];

    for (const item of allItems) {
      if (seen.has(item.id)) continue;
      // Only allow SHORT videos: max 120 seconds (2 minutes), min 3 seconds
      if (item.duration > 120 || item.duration < 3) continue;
      seen.add(item.id);

      videos.push({
        id: `dm-${item.id}`,
        title: item.title || "বাংলা ভিডিও",
        creator: item["owner.screenname"] || null,
        source: "dailymotion",
        thumbnail_url: item.thumbnail_url,
        video_url: `https://geo.dailymotion.com/player.html?video=${item.id}&autoplay=true&mute=true&loop=true&controls=false&ui-start-screen-info=false&ui-logo=false&sharing-enable=false`,
        video_id: item.id,
        duration: item.duration,
        category: item._category,
      });

      if (videos.length >= rows) break;
    }

    // Shuffle unless search
    if (!searchQuery.trim()) {
      for (let i = videos.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [videos[i], videos[j]] = [videos[j], videos[i]];
      }
    }

    return new Response(
      JSON.stringify({ videos, hasMore: true, categories: CATEGORIES.map(c => c.key) }),
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
