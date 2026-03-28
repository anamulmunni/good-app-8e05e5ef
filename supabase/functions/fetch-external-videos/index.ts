import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MIN_DURATION_SECONDS = 4;
const MAX_DURATION_SECONDS = 70;
const MAX_ASPECT_RATIO = 0.82;
const SHORT_HINTS = ["tiktok", "tik tok", "short", "reels", "viral", "bangla"];
const BD_HINTS = ["bangladesh", "বাংলাদেশ", "bd", "dhaka", "chittagong", "sylhet"];
const NON_BD_PENALTY_HINTS = ["india", "indian", "hindi", "kolkata", "tollywood"];

const CATEGORIES = [
  { key: "tiktok", query: "bangladesh tiktok short vertical" },
  { key: "funny", query: "bangladesh funny short vertical video" },
  { key: "cartoon", query: "bangla cartoon gopal bhar short" },
  { key: "romantic", query: "bangladesh romantic short tiktok" },
  { key: "natok", query: "bangladesh natok short clip" },
  { key: "viral", query: "bangladesh viral short video" },
  { key: "music", query: "bangladesh trending bangla song short" },
  { key: "comedy", query: "bangladesh comedy short vertical" },
  { key: "song", query: "bangladesh bangla gan short vertical" },
  { key: "gopal", query: "bangladesh gopal bhar bangla cartoon short" },
];

function normalizeSearch(input: string) {
  return input.replace(/\s+/g, " ").trim().toLowerCase();
}

function buildSearchQueries(search: string): string[] {
  const q = normalizeSearch(search);
  return [
    `${q} bangladesh tiktok short`,
    `${q} bangladesh viral short`,
    `${q} bangla short vertical`,
    `${q} reels short`,
    q,
  ];
}

function scoreTitle(title: string, keywords: string[]) {
  const lower = title.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (!kw) continue;
    if (lower.includes(kw)) score += 3;
  }
  for (const hint of SHORT_HINTS) {
    if (lower.includes(hint)) score += 1;
  }
  for (const hint of BD_HINTS) {
    if (lower.includes(hint)) score += 2;
  }
  for (const hint of NON_BD_PENALTY_HINTS) {
    if (lower.includes(hint)) score -= 3;
  }
  return score;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const rows = Math.min(20, Math.max(6, parseInt(url.searchParams.get("rows") || "10")));
    const searchQuery = url.searchParams.get("search") || "";
    const preferredParam = url.searchParams.get("preferred") || "";
    const preferredKeys = preferredParam.split(",").filter(Boolean);
    const searchKeywords = normalizeSearch(searchQuery).split(" ").filter((k) => k.length >= 2);

    let queries: string[] = [];

    if (searchQuery.trim()) {
      queries = buildSearchQueries(searchQuery);
    } else if (preferredKeys.length > 0) {
      for (let i = 0; i < 2; i++) {
        const key = preferredKeys[(page + i) % preferredKeys.length];
        const cat = CATEGORIES.find(c => c.key === key);
        if (cat) queries.push(cat.query);
      }
      const randomIdx = (page * 5 + 1) % CATEGORIES.length;
      queries.push(CATEGORIES[randomIdx].query);
    } else {
      for (let i = 0; i < 3; i++) {
        const idx = ((page - 1) * 3 + i) % CATEGORIES.length;
        queries.push(CATEGORIES[idx].query);
      }
    }

    const perQuery = Math.max(8, Math.ceil(rows / queries.length) + 8);

    const fetchPromises = queries.map(async (q) => {
      try {
        const dmUrl = `https://api.dailymotion.com/videos?search=${encodeURIComponent(q)}&limit=${perQuery}&page=${page}&fields=id,title,thumbnail_720_url,thumbnail_url,duration,aspect_ratio,owner.screenname,tags,country&sort=relevance&language=bn`;
        const res = await fetch(dmUrl);
        if (!res.ok) { await res.text(); return []; }
        const data = await res.json();

        const enriched = await Promise.all((data.list || []).map(async (v: any) => {
          try {
            if (!v?.id) return null;
            const metadataRes = await fetch(`https://www.dailymotion.com/player/metadata/video/${v.id}`);
            if (!metadataRes.ok) return null;
            const metadata = await metadataRes.json();
            const stream = metadata?.qualities?.auto?.find((x: any) => typeof x?.url === "string")?.url;
            if (!stream) return null;

            const duration = Number(v.duration || metadata?.duration || 0);
            const aspectRatio = Number(v.aspect_ratio || metadata?.aspect_ratio || 0);
            const country = String(v.country || metadata?.country || "").toUpperCase();

            let cat = "";
            const title = String(v.title || "").toLowerCase();
            const tags = Array.isArray(v.tags) ? v.tags.join(" ").toLowerCase() : "";
            if (title.includes("cartoon") || title.includes("gopal") || title.includes("rupkotha")) cat = "cartoon";
            else if (title.includes("funny") || title.includes("comedy") || title.includes("হাসি")) cat = "funny";
            else if (title.includes("romantic") || title.includes("love")) cat = "romantic";
            else if (title.includes("natok") || title.includes("নাটক")) cat = "natok";
            else if (title.includes("song") || title.includes("গান") || title.includes("gan")) cat = "song";
            else if (title.includes("tiktok") || tags.includes("tiktok") || title.includes("short")) cat = "tiktok";
            else cat = "viral";

            const shortHint = SHORT_HINTS.some((h) => title.includes(h) || tags.includes(h));
            const aspectOk = aspectRatio > 0 && aspectRatio <= MAX_ASPECT_RATIO;
            const durationOk = duration >= MIN_DURATION_SECONDS && duration <= MAX_DURATION_SECONDS;
            if (!durationOk || (!aspectOk && !shortHint)) return null;

            const score = scoreTitle(String(v.title || ""), searchKeywords)
              + (aspectOk ? 3 : 0)
              + (duration <= 40 ? 2 : 0)
              + (shortHint ? 2 : 0)
              + (country === "BD" ? 6 : 0)
              + (country === "IN" ? -4 : 0);

            return {
              id: v.id,
              title: v.title,
              creator: v["owner.screenname"] || null,
              thumbnail_url: v.thumbnail_720_url || v.thumbnail_url || null,
              duration,
              category: cat,
              stream_url: stream,
              country,
              score,
            };
          } catch {
            return null;
          }
        }));

        return enriched.filter(Boolean).map((v: any) => {
          let cat = "";
          const title = String(v.title || "").toLowerCase();
          if (title.includes("cartoon") || title.includes("gopal") || title.includes("rupkotha")) cat = "cartoon";
          else if (title.includes("funny") || title.includes("comedy") || title.includes("হাসি")) cat = "funny";
          else if (title.includes("romantic") || title.includes("love")) cat = "romantic";
          else if (title.includes("natok") || title.includes("নাটক")) cat = "natok";
          else if (title.includes("song") || title.includes("গান") || title.includes("gan")) cat = "song";
          else if (title.includes("tiktok") || title.includes("short")) cat = "tiktok";
          else cat = "viral";
          return { ...v, _category: v.category || cat };
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
      if (!item.stream_url) continue;
      if (item.duration > MAX_DURATION_SECONDS || item.duration < MIN_DURATION_SECONDS) continue;
      seen.add(item.id);

      videos.push({
        id: `dm-${item.id}`,
        title: item.title || "বাংলা ভিডিও",
        creator: item["owner.screenname"] || null,
        source: "dailymotion",
        thumbnail_url: item.thumbnail_url,
        video_url: item.stream_url,
        video_id: item.id,
        duration: item.duration,
        category: item._category,
        score: item.score || 0,
        country: item.country || null,
      });
    }

    videos.sort((a, b) => (b.score - a.score) || (a.duration - b.duration));
    const selected = videos.slice(0, rows).map(({ score, ...v }) => v);

    return new Response(
      JSON.stringify({ videos: selected, hasMore: selected.length >= Math.min(rows, 6), categories: CATEGORIES.map(c => c.key) }),
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
