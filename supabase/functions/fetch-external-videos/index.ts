import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ARCHIVE_BD_QUERY = "(title:(Bangladesh OR Bangla OR Dhaka) OR description:(Bangladesh OR Bangla OR Dhaka)) AND mediatype:(movies)";
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".m4v", ".mov"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const rows = parseInt(url.searchParams.get("rows") || "8");

    const params = new URLSearchParams();
    params.set("q", ARCHIVE_BD_QUERY);
    params.append("fl[]", "identifier");
    params.append("fl[]", "title");
    params.append("fl[]", "creator");
    params.set("rows", String(rows));
    params.set("page", String(page));
    params.set("output", "json");

    const searchRes = await fetch(`https://archive.org/advancedsearch.php?${params.toString()}`);
    if (!searchRes.ok) {
      return new Response(JSON.stringify({ videos: [], hasMore: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const searchJson = await searchRes.json();
    const docs = Array.isArray(searchJson?.response?.docs) ? searchJson.response.docs : [];
    const numFound = Number(searchJson?.response?.numFound || 0);

    const videos: any[] = [];

    // Process docs in parallel with timeout
    const results = await Promise.allSettled(
      docs.map(async (doc: any) => {
        const identifier = String(doc?.identifier || "").trim();
        if (!identifier) return null;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        try {
          const metaRes = await fetch(
            `https://archive.org/metadata/${encodeURIComponent(identifier)}`,
            { signal: controller.signal }
          );
          clearTimeout(timeout);
          if (!metaRes.ok) return null;

          const meta = await metaRes.json();
          const files = Array.isArray(meta?.files) ? meta.files : [];
          const videoFile = files.find((f: any) => {
            const name = String(f?.name || "").toLowerCase();
            return VIDEO_EXTENSIONS.some((ext) => name.endsWith(ext));
          });
          if (!videoFile?.name) return null;

          const title = String(doc?.title || meta?.metadata?.title || "Bangla Video").trim();
          const creator = String(doc?.creator || meta?.metadata?.creator || "").trim() || null;

          const encodedPath = videoFile.name.split("/").map((p: string) => encodeURIComponent(p)).join("/");

          return {
            id: `ext-${identifier}`,
            title,
            creator,
            source: "internet_archive",
            thumbnail_url: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
            video_url: `https://archive.org/download/${encodeURIComponent(identifier)}/${encodedPath}`,
          };
        } catch {
          clearTimeout(timeout);
          return null;
        }
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        videos.push(r.value);
      }
    }

    return new Response(
      JSON.stringify({ videos, hasMore: page * rows < numFound }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ videos: [], hasMore: false, error: String(err) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
