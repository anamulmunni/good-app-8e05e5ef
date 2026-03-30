import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Scrape TikTok trending/search page for video IDs
async function fetchTikTokVideoIds(query: string): Promise<Array<{ videoId: string; caption: string; author: string }>> {
  const results: Array<{ videoId: string; caption: string; author: string }> = [];

  try {
    // Method 1: TikTok's internal API for search (no auth needed)
    const searchUrl = `https://www.tiktok.com/api/search/general/full/?keyword=${encodeURIComponent(query)}&offset=0&search_source=normal_search&web_search_code=%7B%22tiktok%22%3A%7B%22client_params_x%22%3A%7B%22search_engine%22%3A%7B%22ies_mt_user_live_video_card_use_498%22%3A1%7D%7D%7D%7D`;
    
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Referer": "https://www.tiktok.com/",
        "Accept": "application/json",
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.data) {
        for (const item of data.data) {
          if (item?.item?.id) {
            results.push({
              videoId: item.item.id,
              caption: item.item?.desc || query,
              author: item.item?.author?.nickname || "TikTok",
            });
          }
        }
      }
    }
  } catch (e) {
    console.log("TikTok search API failed:", e);
  }

  // Method 2: Scrape TikTok tag/discover page
  if (results.length === 0) {
    try {
      const tagUrl = `https://www.tiktok.com/tag/${encodeURIComponent(query)}`;
      const res = await fetch(tagUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
          "Accept": "text/html",
        },
      });

      if (res.ok) {
        const html = await res.text();
        // Extract video IDs from the HTML - they appear as /video/XXXX patterns
        const videoIdMatches = html.matchAll(/\/video\/(\d{15,})/g);
        const seen = new Set<string>();
        for (const match of videoIdMatches) {
          if (!seen.has(match[1])) {
            seen.add(match[1]);
            results.push({
              videoId: match[1],
              caption: query,
              author: "TikTok BD",
            });
          }
          if (results.length >= 30) break;
        }
      }
    } catch (e) {
      console.log("TikTok tag scrape failed:", e);
    }
  }

  // Method 3: Try discover page
  if (results.length === 0) {
    try {
      const discoverUrl = `https://www.tiktok.com/discover/${encodeURIComponent(query)}`;
      const res = await fetch(discoverUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
          "Accept": "text/html",
        },
      });

      if (res.ok) {
        const html = await res.text();
        const videoIdMatches = html.matchAll(/\/video\/(\d{15,})/g);
        const seen = new Set<string>();
        for (const match of videoIdMatches) {
          if (!seen.has(match[1])) {
            seen.add(match[1]);
            results.push({
              videoId: match[1],
              caption: query,
              author: "TikTok BD",
            });
          }
          if (results.length >= 30) break;
        }
      }
    } catch (e) {
      console.log("TikTok discover scrape failed:", e);
    }
  }

  return results;
}

const SEARCH_QUERIES: Record<string, string[]> = {
  mixed: ["bangladesh viral", "bangla tiktok", "bd trending", "bangladeshi viral video", "bangla funny", "dhaka viral"],
  gajal: ["islamic bangla", "bangla gojol", "bangla naat", "islamic tiktok bangladesh", "quran recitation bangla"],
  funny: ["bangla funny video", "bangladeshi comedy", "bangla hasir video", "bd funny tiktok", "bangla comedy"],
  dance: ["bangla dance", "bangladeshi dance", "bd dance challenge", "bangla dance tiktok"],
  nature: ["bangladesh nature", "sundarbans", "cox bazar", "sylhet nature", "bangladesh beautiful"],
  music: ["bangla song", "bangla music", "slowed reverb bangla", "bengali song tiktok"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "fetch";
    const category = url.searchParams.get("category") || "mixed";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (action === "fetch") {
      // Return existing videos from DB
      let query = supabase
        .from("tiktok_videos")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(100);

      if (category !== "mixed") {
        query = query.eq("category", category);
      }

      const { data: existingVideos } = await query;

      return new Response(JSON.stringify({ results: existingVideos || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "refresh") {
      // Fetch new videos from TikTok and save to DB
      const queries = SEARCH_QUERIES[category] || SEARCH_QUERIES.mixed;
      const randomQuery = queries[Math.floor(Math.random() * queries.length)];

      const newVideos = await fetchTikTokVideoIds(randomQuery);

      if (newVideos.length > 0) {
        // Get existing video IDs to avoid duplicates
        const { data: existing } = await supabase
          .from("tiktok_videos")
          .select("video_id");
        const existingIds = new Set((existing || []).map((v: any) => v.video_id));

        const toInsert = newVideos
          .filter((v) => !existingIds.has(v.videoId))
          .map((v) => ({
            video_url: `https://www.tiktok.com/@user/video/${v.videoId}`,
            video_id: v.videoId,
            caption: v.caption,
            added_by: v.author,
            category: category,
            is_active: true,
          }));

        if (toInsert.length > 0) {
          await supabase.from("tiktok_videos").insert(toInsert);
        }

        return new Response(
          JSON.stringify({ added: toInsert.length, total: newVideos.length }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ added: 0, message: "No new videos found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("TikTok feed error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
