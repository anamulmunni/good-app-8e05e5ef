import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INVIDIOUS_INSTANCES = [
  "https://inv.tux.pizza",
  "https://invidious.nerdvpn.de",
  "https://iv.ggtyler.dev",
  "https://invidious.privacyredirect.com",
  "https://invidious.jing.rocks",
  "https://vid.puffyan.us",
  "https://invidious.lunar.icu",
];

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.projectsegfau.lt",
];

async function searchInvidious(query: string, page: number): Promise<any[]> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&page=${page}&type=video&sort_by=relevance&region=BD`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map((item: any) => ({
          videoId: item.videoId,
          title: item.title,
          author: item.author,
          lengthSeconds: item.lengthSeconds,
          thumbnail: item.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
        }));
      }
    } catch { continue; }
  }
  return [];
}

async function searchPiped(query: string): Promise<any[]> {
  for (const instance of PIPED_INSTANCES) {
    try {
      const url = `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data?.items) && data.items.length > 0) {
        return data.items
          .filter((item: any) => item.type === "stream")
          .map((item: any) => ({
            videoId: item.url?.replace("/watch?v=", ""),
            title: item.title,
            author: item.uploaderName,
            lengthSeconds: item.duration,
            thumbnail: item.thumbnail || `https://i.ytimg.com/vi/${item.url?.replace("/watch?v=", "")}/hqdefault.jpg`,
          }));
      }
    } catch { continue; }
  }
  return [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const query = url.searchParams.get("q") || "bangla new song 2025";
    const page = parseInt(url.searchParams.get("page") || "1");

    // Try Invidious first, then Piped
    let results = await searchInvidious(query, page);
    if (results.length === 0) {
      results = await searchPiped(query);
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("youtube-search error:", e);
    return new Response(JSON.stringify({ results: [], error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
