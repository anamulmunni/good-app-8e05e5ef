import { supabase } from "@/integrations/supabase/client";

export type Post = {
  id: string;
  user_id: number;
  content: string | null;
  image_url: string | null;
  video_url: string | null;
  likes_count: number;
  comments_count: number;
  created_at: string | null;
  user?: { display_name: string | null; avatar_url: string | null; guest_id: string };
};

export type PostComment = {
  id: string;
  post_id: string;
  user_id: number;
  content: string;
  created_at: string | null;
  parent_comment_id?: string | null;
  likes_count?: number;
  liked_by_me?: boolean;
  replies?: PostComment[];
  user?: { display_name: string | null; avatar_url: string | null; guest_id: string };
};

export type Story = {
  id: string;
  user_id: number;
  image_url: string;
  created_at: string | null;
  expires_at: string | null;
  user?: { display_name: string | null; avatar_url: string | null; guest_id: string };
};

export type Reaction = {
  id: string;
  post_id: string;
  user_id: number;
  reaction_type: string;
  created_at: string | null;
};

export type ExternalReelVideo = {
  id: string;
  title: string;
  video_url: string;
  watch_url?: string;
  source: "dailymotion" | "good-app";
  creator?: string | null;
  thumbnail_url?: string | null;
  video_id?: string;
  duration?: number;
  category?: string;
  country?: string | null;
  created_at?: string | null;
};

export const LONG_VIDEO_MARKER = "__GOODAPP_LONG__::";

const SONG_STOP_WORDS = new Set([
  "the", "a", "an", "and", "of", "to", "for", "in", "on", "with", "by", "official", "video", "song", "music", "hd", "full",
]);

const QUERY_ALIAS_PATTERNS: Array<[RegExp, string]> = [
  [/\b(voj\s*puri|vojpuri|bhoj\s*puri|bhojpuri|ভোজপুরি)\b/g, "bhojpuri"],
  [/\b(gan|gaan|gana|গান)\b/g, "song"],
  [/\b(hd\s*song)\b/g, "song hd"],
  [/\b(hindi\s*gan)\b/g, "hindi song"],
  [/\b(bangla\s*gan)\b/g, "bangla song"],
];

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u0980-\u09ff\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeSearchQuery(searchQuery?: string): string {
  let query = normalizeForMatch(searchQuery || "");
  for (const [pattern, replacement] of QUERY_ALIAS_PATTERNS) {
    query = query.replace(pattern, replacement);
  }
  return query.replace(/\s+/g, " ").trim();
}

function getQueryWords(searchQuery?: string): string[] {
  return canonicalizeSearchQuery(searchQuery || "")
    .split(" ")
    .filter((word) => word.length >= 2 && !SONG_STOP_WORDS.has(word));
}

function hasFreshMarker(title: string): boolean {
  return /(\bnew\b|\blatest\b|202[4-9]|নতুন)/i.test(title);
}

function hasQualityMarker(title: string): boolean {
  return /(full\s*hd|1080|4k|\bhd\b)/i.test(title);
}

function isBanglaSongTitle(title: string): boolean {
  const lower = title.toLowerCase();
  const hasBanglaMarker = /(bangla|বাংলা|bengali|dhallywood|baul|nazrul|rabindra|bd song|deshi song)/i.test(lower);
  const hasSongMarker = /(song|music|audio|lyrics|গান|gaan|gan|gana|album|official)/i.test(lower);
  const hasNonMusicMarker = /(natok|drama|movie|serial|episode|cartoon|mukbang|vlog|prank|gaming|challenge)/i.test(lower);
  return hasBanglaMarker && hasSongMarker && !hasNonMusicMarker;
}

function isBanglaDefaultSuggestion(title: string, country?: string | null): boolean {
  const lower = title.toLowerCase();
  const isNonBanglaMarker = /(hindi|bollywood|punjabi|english|hollywood|tamil|telugu|korean|arabic)/i.test(lower);
  return isBanglaSongTitle(title) && !isNonBanglaMarker;
}

function getQueryCoverage(queryWords: string[], normalizedTitle: string): number {
  if (queryWords.length === 0) return 0;
  const matched = queryWords.reduce((acc, word) => acc + (normalizedTitle.includes(word) ? 1 : 0), 0);
  return matched / queryWords.length;
}

function parseLongVideoMeta(content?: string | null): { title: string; duration?: number } | null {
  if (!content || !content.startsWith(LONG_VIDEO_MARKER)) return null;
  const raw = content.slice(LONG_VIDEO_MARKER.length);
  const [durationRaw, ...titleParts] = raw.split("::");
  const duration = Number(durationRaw);
  const title = titleParts.join("::").trim() || "Long video";
  return {
    title,
    duration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
  };
}

function buildLongVideoContent(title: string, duration?: number): string {
  const safeTitle = (title || "Long video").trim();
  const safeDuration = Number.isFinite(duration) ? Math.max(0, Math.floor(duration as number)) : 0;
  return `${LONG_VIDEO_MARKER}${safeDuration}::${safeTitle}`;
}

export function isLongVideoPostContent(content?: string | null): boolean {
  return !!content && content.startsWith(LONG_VIDEO_MARKER);
}

function isMusicIntent(searchQuery?: string): boolean {
  const q = canonicalizeSearchQuery(searchQuery || "");
  return /(song|music|audio|lyrics|gan|gaan|gana|গান|nazrul|rabindra|hindi song|bangla song|album|mp3|dj mix|sad song|love song|bhojpuri)/.test(q);
}

export const REACTION_EMOJIS: Record<string, string> = {
  like: "👍",
  love: "❤️",
  haha: "😂",
  wow: "😮",
  sad: "😢",
  angry: "😡",
};

function detectExternalCategory(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("natok") || lower.includes("নাটক")) return "natok";
  if (lower.includes("song") || lower.includes("গান") || lower.includes("music")) return "music";
  if (lower.includes("funny") || lower.includes("comedy") || lower.includes("হাসি")) return "funny";
  if (lower.includes("cartoon") || lower.includes("gopal")) return "cartoon";
  if (lower.includes("viral")) return "viral";
  return "tiktok";
}

function scoreFallbackVideo(title: string, queryWords: string[], searchQuery?: string): number {
  const lower = title.toLowerCase();
  const normalizedTitle = normalizeForMatch(title);
  const normalizedQuery = canonicalizeSearchQuery(searchQuery || "");
  let score = 0;

  for (const word of queryWords) {
    if (word && normalizedTitle.includes(word)) score += 6;
  }

  if (queryWords.length >= 2 && queryWords.every((w) => normalizedTitle.includes(w))) score += 12;
  if (normalizedQuery && normalizedTitle.includes(normalizedQuery)) score += 35;
  score += Math.round(getQueryCoverage(queryWords, normalizedTitle) * 18);

  if (isMusicIntent(searchQuery)) {
    if (/(song|music|audio|lyrics|official music video|গান|mp3|album|bhojpuri)/.test(lower)) score += 12;
    if (/(natok|drama|movie|serial|episode|cartoon)/.test(lower)) score -= 16;
  }

  return score;
}

function toDailymotionEmbed(videoId?: string, fallbackUrl?: string): string {
  if (videoId) return `https://www.dailymotion.com/embed/video/${videoId}`;
  return fallbackUrl || "";
}

function buildSearchVariants(searchQuery?: string): string[] {
  const raw = (searchQuery || "").trim();
  const canonical = canonicalizeSearchQuery(raw);

  if (!canonical) {
    return [
      "bangla new song full hd 2026",
      "bangla latest song official video",
      "bangla new music video hd",
      "bangla romantic song full hd",
      "বাংলা নতুন গান hd",
    ];
  }

  const words = getQueryWords(canonical);
  const compact = words.slice(0, 4).join(" ");
  return [
    canonical,
    `${canonical} song`,
    `${canonical} official song`,
    `${canonical} music video`,
    `${canonical} lyrics`,
    compact && compact !== canonical ? compact : "",
  ]
    .filter(Boolean)
    .filter((q, idx, arr) => arr.indexOf(q) === idx);
}

async function fetchDailymotionByQuery(
  query: string,
  page: number,
  limit: number,
  sort: "relevance" | "recent" = "relevance",
  freshnessToken = 0,
) {
  const dmUrl = `https://api.dailymotion.com/videos?search=${encodeURIComponent(query)}&limit=${limit}&page=${page}&fields=id,title,thumbnail_1080_url,thumbnail_720_url,thumbnail_480_url,thumbnail_360_url,thumbnail_url,duration,owner.screenname,country&sort=${sort}&longer_than=0&_=${freshnessToken}`;
  const res = await fetch(dmUrl);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.list) ? data.list : [];
}

function normalizeExternalVideo(raw: any): ExternalReelVideo | null {
  const rawId = String(raw?.id || "");
  const cleanId = rawId.startsWith("dm-") ? rawId.replace("dm-", "") : (raw?.video_id || rawId);
  const embedUrl = toDailymotionEmbed(cleanId, raw?.embed_url || raw?.video_url);
  if (!embedUrl) return null;

  return {
    id: rawId || `dm-${cleanId}`,
    title: String(raw?.title || "বাংলা ভিডিও"),
    source: "dailymotion",
    video_url: embedUrl,
    watch_url: raw?.watch_url || (cleanId ? `https://www.dailymotion.com/video/${cleanId}` : undefined),
    creator: raw?.creator || null,
    thumbnail_url: raw?.thumbnail_url || null,
    video_id: cleanId || undefined,
    duration: Number(raw?.duration || 0) || undefined,
    category: raw?.category || detectExternalCategory(String(raw?.title || "")),
    country: raw?.country || null,
  };
}

async function fetchDailymotionFallback(
  page: number,
  rows: number,
  searchQuery?: string,
  mode: "short" | "long" = "long",
  freshnessToken = 0,
): Promise<{ videos: ExternalReelVideo[]; hasMore: boolean }> {
  const canonicalQuery = canonicalizeSearchQuery(searchQuery || "");
  const variants = buildSearchVariants(canonicalQuery);
  const shift = canonicalQuery ? 0 : Math.abs((freshnessToken || page) % Math.max(variants.length, 1));
  const orderedVariants = shift > 0
    ? [...variants.slice(shift), ...variants.slice(0, shift)]
    : variants;
  const perQueryLimit = Math.max(Math.ceil((rows * 3) / variants.length) + 10, 14);
  const sort = canonicalQuery ? "relevance" : "recent";

  const responses = await Promise.all(
    orderedVariants.map((q) => fetchDailymotionByQuery(q, page, perQueryLimit, sort, freshnessToken))
  );

  let list = responses.flat();

  if (list.length === 0 && canonicalQuery) {
    const fallbackQueries = [
      `${canonicalQuery} song`,
      `${getQueryWords(canonicalQuery).slice(0, 3).join(" ")} song`.trim(),
      `${canonicalQuery} official`,
      `${canonicalQuery} lyrics`,
    ].filter((q, idx, arr) => q.length > 3 && arr.indexOf(q) === idx);
    const fallbackResponses = await Promise.all(fallbackQueries.map((q) => fetchDailymotionByQuery(q, page, perQueryLimit, "relevance", freshnessToken)));
    list = fallbackResponses.flat();
  }

  const queryWords = getQueryWords(canonicalQuery);
  const normalizedQuery = normalizeForMatch(canonicalQuery);
  const isMusicSearch = isMusicIntent(canonicalQuery);
  const seen = new Set<string>();
  const seenTitleCreator = new Set<string>();

  const filtered = list
    .map((v: any) => {
      const duration = Number(v?.duration || 0);
      const durationOk = duration >= 3;
      if (!v?.id || !durationOk) return null;
      if (seen.has(v.id)) return null;
      seen.add(v.id);

      const title = String(v?.title || "বাংলা ভিডিও");
      const normalizedTitle = normalizeForMatch(title);
      const creator = String(v?.["owner.screenname"] || "").toLowerCase().trim();
      const titleCreatorKey = `${normalizedTitle}::${creator}`;
      if (seenTitleCreator.has(titleCreatorKey)) return null;
      seenTitleCreator.add(titleCreatorKey);
      const coverage = getQueryCoverage(queryWords, normalizedTitle);
      const hasMusicMarker = /(song|music|audio|lyrics|গান|mp3|album|official|bhojpuri)/i.test(title);
      const hasNonMusicMarker = /(natok|drama|movie|serial|episode|cartoon)/i.test(title);
      const isBanglaDefault = isBanglaDefaultSuggestion(title, v?.country);

      if (canonicalQuery) {
        const exactPhrase = normalizedQuery.length > 3 && normalizedTitle.includes(normalizedQuery);
        const allWordsMatch = queryWords.length === 0 || queryWords.every((word) => normalizedTitle.includes(word));

        if (isMusicSearch) {
          if (!exactPhrase && !allWordsMatch) return null;
          if (hasNonMusicMarker && !hasMusicMarker && !exactPhrase) return null;
        } else {
          if (!exactPhrase && !allWordsMatch) return null;
        }
      } else if (!isBanglaDefault) {
        return null;
      } else {
        if (!hasFreshMarker(title)) return null;
        if (!hasQualityMarker(title)) return null;
      }

      let score = scoreFallbackVideo(title, queryWords, canonicalQuery)
        + (duration >= 600 ? 3 : 0)
        + (duration >= 300 ? 2 : 0)
        + (duration >= 60 ? 1 : 0)
        + ((v.thumbnail_1080_url || v.thumbnail_720_url) ? 2 : 0);

      if (!canonicalQuery) {
        if (hasFreshMarker(title)) score += 12;
        if (hasQualityMarker(title)) score += 10;
      }

      if (!canonicalQuery && hasNonMusicMarker && !hasMusicMarker) {
        score -= 15;
      }

      return {
        id: `dm-${v.id}`,
        title,
        source: "dailymotion" as const,
        video_url: `https://www.dailymotion.com/embed/video/${v.id}`,
        watch_url: `https://www.dailymotion.com/video/${v.id}`,
        creator: v["owner.screenname"] || null,
        thumbnail_url: v.thumbnail_1080_url || v.thumbnail_720_url || v.thumbnail_480_url || v.thumbnail_360_url || v.thumbnail_url || null,
        video_id: v.id,
        duration,
        category: detectExternalCategory(title),
        country: String(v?.country || "").toUpperCase() || null,
        _score: score,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b._score - a._score)
    .slice(0, rows)
    .map(({ _score, ...rest }: any) => rest);

  return {
    videos: filtered,
    hasMore: responses.some((r) => r.length >= perQueryLimit) || list.length > rows,
  };
}

export async function createLongVideoUpload(userId: number, videoUrl: string, title: string, duration?: number): Promise<Post> {
  const { data, error } = await (supabase.from("posts").insert({
    user_id: userId,
    content: buildLongVideoContent(title, duration),
    video_url: videoUrl,
  } as any).select().single() as any);

  if (error) throw error;
  return data;
}

export async function getUploadedLongVideos(
  page = 1,
  rows = 10,
  searchQuery?: string,
): Promise<{ videos: ExternalReelVideo[]; hasMore: boolean }> {
  const from = Math.max(0, (page - 1) * rows);
  const to = from + rows - 1;

  let query = (supabase.from("posts").select("id,user_id,video_url,content,created_at", { count: "exact" }) as any)
    .not("video_url", "is", null)
    .like("content", `${LONG_VIDEO_MARKER}%`)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (searchQuery?.trim()) {
    query = query.ilike("content", `%${searchQuery.trim()}%`);
  }

  const { data: posts, count } = await query;
  if (!posts || posts.length === 0) return { videos: [], hasMore: false };

  const userIds = [...new Set(posts.map((p: any) => p.user_id))];
  const { data: users } = await (supabase.from("users").select("id, display_name") as any).in("id", userIds);
  const userMap: Record<number, string> = {};
  (users || []).forEach((u: any) => { userMap[u.id] = u.display_name || "Unknown"; });

  const videos: ExternalReelVideo[] = posts.map((p: any) => {
    const parsed = parseLongVideoMeta(p.content);
    return {
      id: `local-${p.id}`,
      title: parsed?.title || "Long video",
      source: "good-app",
      video_url: p.video_url,
      creator: userMap[p.user_id] || "Unknown",
      duration: parsed?.duration,
      created_at: p.created_at,
      category: "music",
      country: "BD",
    };
  });

  const strictDefaultVideos = searchQuery?.trim()
    ? videos
    : videos.filter((video) =>
      isBanglaDefaultSuggestion(video.title, video.country)
      && hasFreshMarker(video.title)
      && hasQualityMarker(video.title)
    );

  return {
    videos: strictDefaultVideos,
    hasMore: typeof count === "number" ? from + videos.length < count : videos.length === rows,
  };
}

export async function getBangladeshExternalVideos(
  page = 1,
  rows = 10,
  preferredCategories?: string[],
  searchQuery?: string,
  mode: "short" | "long" = "long",
  freshnessToken = 0,
): Promise<{ videos: ExternalReelVideo[]; hasMore: boolean; categories?: string[] }> {
  const direct = await fetchDailymotionFallback(page, rows, searchQuery, mode, freshnessToken);
  if ((searchQuery && searchQuery.trim()) || direct.videos.length > 0 || !import.meta.env.VITE_SUPABASE_URL) {
    return direct;
  }

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("rows", String(rows));
    params.set("mode", mode);
    if (preferredCategories && preferredCategories.length > 0) {
      params.set("preferred", preferredCategories.join(","));
    }
    if (searchQuery && searchQuery.trim()) {
      params.set("search", searchQuery.trim());
    }

    const res = await fetch(
      `${supabaseUrl}/functions/v1/fetch-external-videos?${params.toString()}`,
      {
        headers: {
          "Authorization": `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!res.ok) {
      console.warn("External videos API unavailable, using fallback:", res.status);
      return fetchDailymotionFallback(page, rows, searchQuery, mode, freshnessToken);
    }

    const data = await res.json();
    const normalized = Array.isArray(data.videos)
      ? data.videos.map(normalizeExternalVideo).filter(Boolean) as ExternalReelVideo[]
      : [];

    const normalizedForMode = searchQuery?.trim()
      ? normalized
      : normalized.filter((video) => isBanglaDefaultSuggestion(video.title, video.country));

    if (normalizedForMode.length === 0) {
      return direct;
    }

    return {
      videos: normalizedForMode,
      hasMore: !!data.hasMore,
      categories: data.categories,
    };
  } catch (e) {
    console.warn("External videos edge failed, using fallback:", e);
    try {
      return await fetchDailymotionFallback(page, rows, searchQuery, mode, freshnessToken);
    } catch (fallbackError) {
      console.error("External videos fallback error:", fallbackError);
      return { videos: [], hasMore: false };
    }
  }
}

// Check if user has posted at least once
export async function hasUserPosted(userId: number): Promise<boolean> {
  const { count } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return (count || 0) > 0;
}

// Get feed posts with user info
export async function getFeedPosts(limit = 30, searchQuery?: string): Promise<Post[]> {
  let query = (supabase.from("posts").select("*") as any)
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data: posts } = await query;
  if (!posts || posts.length === 0) return [];

  const userIds = [...new Set(posts.map((p: any) => p.user_id))];
  const { data: users } = await (supabase.from("users").select("id, display_name, avatar_url, guest_id") as any).in("id", userIds);

  const userMap: Record<number, any> = {};
  (users || []).forEach((u: any) => { userMap[u.id] = u; });

  let result = posts
    .filter((p: any) => !isLongVideoPostContent(p.content))
    .map((p: any) => ({ ...p, user: userMap[p.user_id] || null }));

  // Client-side search filter
  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    result = result.filter((p: Post) =>
      p.content?.toLowerCase().includes(q) ||
      p.user?.display_name?.toLowerCase().includes(q) ||
      p.user?.guest_id?.toLowerCase().includes(q)
    );
  }

  return result;
}

// Create post
export async function createPost(userId: number, content: string, imageUrl?: string, videoUrl?: string): Promise<Post> {
  const { data, error } = await (supabase.from("posts").insert({
    user_id: userId, content: content || null, image_url: imageUrl || null, video_url: videoUrl || null,
  } as any).select().single() as any);
  if (error) throw error;
  return data;
}

// Toggle reaction (replaces old toggleLike)
export async function toggleReaction(postId: string, userId: number, reactionType: string = "like"): Promise<{ reacted: boolean; type: string }> {
  // First, get ALL existing reactions by this user on this post
  const { data: existingList } = await (supabase.from("post_reactions").select("id, reaction_type") as any)
    .eq("post_id", postId).eq("user_id", userId);

  const existing = existingList && existingList.length > 0 ? existingList[0] : null;

  // Clean up any duplicate reactions (race condition fix)
  if (existingList && existingList.length > 1) {
    const idsToDelete = existingList.slice(1).map((r: any) => r.id);
    await (supabase.from("post_reactions").delete() as any).in("id", idsToDelete);
  }

  if (existing) {
    if (existing.reaction_type === reactionType) {
      await (supabase.from("post_reactions").delete() as any).eq("id", existing.id);
      return { reacted: false, type: reactionType };
    } else {
      await (supabase.from("post_reactions").delete() as any).eq("id", existing.id);
      await (supabase.from("post_reactions").insert({ post_id: postId, user_id: userId, reaction_type: reactionType } as any) as any);
      return { reacted: true, type: reactionType };
    }
  } else {
    await (supabase.from("post_reactions").insert({ post_id: postId, user_id: userId, reaction_type: reactionType } as any) as any);
    return { reacted: true, type: reactionType };
  }
}

// Also keep old toggleLike for backward compat
export async function toggleLike(postId: string, userId: number): Promise<boolean> {
  const result = await toggleReaction(postId, userId, "like");
  return result.reacted;
}

// likes_count is recalculated by feed refresh / server-side processes to keep interactions snappy

// Get user reactions for posts
export async function getUserReactions(userId: number, postIds: string[]): Promise<Record<string, string>> {
  if (postIds.length === 0) return {};
  const { data } = await (supabase.from("post_reactions").select("post_id, reaction_type") as any)
    .eq("user_id", userId).in("post_id", postIds);
  const map: Record<string, string> = {};
  (data || []).forEach((d: any) => { map[d.post_id] = d.reaction_type; });
  return map;
}

// Keep old getUserLikes for backward compat
export async function getUserLikes(userId: number, postIds: string[]): Promise<Set<string>> {
  const reactions = await getUserReactions(userId, postIds);
  return new Set(Object.keys(reactions));
}

// Get reaction counts per post
export async function getPostReactionCounts(postId: string): Promise<Record<string, number>> {
  const { data } = await (supabase.from("post_reactions").select("reaction_type") as any).eq("post_id", postId);
  const counts: Record<string, number> = {};
  (data || []).forEach((d: any) => { counts[d.reaction_type] = (counts[d.reaction_type] || 0) + 1; });
  return counts;
}

// Get comments for a post
export async function getPostComments(postId: string, currentUserId?: number): Promise<PostComment[]> {
  const { data: comments } = await (supabase.from("post_comments").select("*, parent_comment_id") as any)
    .eq("post_id", postId).order("created_at", { ascending: true });
  if (!comments || comments.length === 0) return [];

  const userIds = [...new Set(comments.map((c: any) => c.user_id))];
  const { data: users } = await (supabase.from("users").select("id, display_name, avatar_url, guest_id") as any).in("id", userIds);
  const userMap: Record<number, any> = {};
  (users || []).forEach((u: any) => { userMap[u.id] = u; });

  // Get like counts
  const commentIds = comments.map((c: any) => c.id);
  const { data: allLikes } = await (supabase.from("comment_likes").select("comment_id, user_id") as any).in("comment_id", commentIds);
  const likeCounts: Record<string, number> = {};
  const myLikes = new Set<string>();
  (allLikes || []).forEach((l: any) => {
    likeCounts[l.comment_id] = (likeCounts[l.comment_id] || 0) + 1;
    if (currentUserId && l.user_id === currentUserId) myLikes.add(l.comment_id);
  });

  const enriched = comments.map((c: any) => ({
    ...c,
    user: userMap[c.user_id] || null,
    likes_count: likeCounts[c.id] || 0,
    liked_by_me: myLikes.has(c.id),
  }));

  // Build tree: top-level + replies
  const topLevel = enriched.filter((c: any) => !c.parent_comment_id);
  const replyMap: Record<string, PostComment[]> = {};
  enriched.filter((c: any) => !!c.parent_comment_id).forEach((c: any) => {
    if (!replyMap[c.parent_comment_id]) replyMap[c.parent_comment_id] = [];
    replyMap[c.parent_comment_id].push(c);
  });
  topLevel.forEach((c: any) => { c.replies = replyMap[c.id] || []; });

  return topLevel;
}

// Add comment
export async function addComment(postId: string, userId: number, content: string, parentCommentId?: string): Promise<PostComment> {
  const insertData: any = { post_id: postId, user_id: userId, content };
  if (parentCommentId) insertData.parent_comment_id = parentCommentId;
  const { data, error } = await (supabase.from("post_comments").insert(insertData).select().single() as any);
  if (error) throw error;

  // Update comments_count
  try {
    const { count } = await (supabase.from("post_comments").select("id", { count: "exact", head: true }) as any).eq("post_id", postId);
    await (supabase.from("posts").update({ comments_count: count || 0 } as any).eq("id", postId) as any);
  } catch {}

  // Parse @mentions and create notifications
  const mentions = content.match(/@([\w\s]+?)(?=\s@|\s*$|[.,!?])/g);
  if (mentions) {
    for (const mention of mentions) {
      const name = mention.slice(1).trim();
      if (!name) continue;
      const { data: mentionedUsers } = await (supabase.from("users").select("id").ilike("display_name", name).limit(1) as any);
      const mentioned = mentionedUsers && mentionedUsers.length > 0 ? mentionedUsers[0] : null;
      if (mentioned && mentioned.id !== userId) {
        // Get sender name for notification
        const { data: senderData } = await (supabase.from("users").select("display_name").eq("id", userId).single() as any);
        const senderName = senderData?.display_name || "কেউ";
        await (supabase.from("notifications").insert({
          user_id: mentioned.id,
          from_user_id: userId,
          type: "mention",
          reference_id: postId,
          content: `${senderName} আপনাকে একটি মন্তব্যে মেন্টশন করেছে: "${content.slice(0, 80)}"`,
        } as any) as any);
      }
    }
  }

  return data;
}

// Delete comment
export async function deleteComment(commentId: string, userId: number): Promise<void> {
  const { error } = await (supabase.from("post_comments").delete() as any).eq("id", commentId).eq("user_id", userId);
  if (error) throw error;
}

// Toggle comment like
export async function toggleCommentLike(commentId: string, userId: number): Promise<boolean> {
  const { data: existing } = await (supabase.from("comment_likes").select("id") as any)
    .eq("comment_id", commentId).eq("user_id", userId).limit(1);
  if (existing && existing.length > 0) {
    await (supabase.from("comment_likes").delete() as any).eq("id", existing[0].id);
    return false;
  }
  await (supabase.from("comment_likes").insert({ comment_id: commentId, user_id: userId } as any) as any);
  return true;
}

// Get unread notification count
export async function getUnreadNotificationCount(userId: number): Promise<number> {
  const { count } = await (supabase.from("notifications").select("id", { count: "exact", head: true }) as any)
    .eq("user_id", userId).eq("is_read", false);
  return count || 0;
}

// Get notifications
export async function getNotifications(userId: number, limit = 50): Promise<any[]> {
  const { data } = await (supabase.from("notifications").select("*") as any)
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  if (!data || data.length === 0) return [];

  const fromIds = [...new Set(data.map((n: any) => n.from_user_id).filter(Boolean))];
  const userMap: Record<number, any> = {};
  if (fromIds.length > 0) {
    const { data: users } = await (supabase.from("users").select("id, display_name, avatar_url") as any).in("id", fromIds);
    (users || []).forEach((u: any) => { userMap[u.id] = u; });
  }

  return data.map((n: any) => ({ ...n, from_user: userMap[n.from_user_id] || null }));
}

// Mark notifications read
export async function markNotificationsRead(userId: number): Promise<void> {
  await (supabase.from("notifications").update({ is_read: true } as any).eq("user_id", userId).eq("is_read", false) as any);
}

// Check new reels since user last seen
export async function getNewReelsCount(userId: number): Promise<number> {
  const { data: userData } = await (supabase.from("users").select("last_reels_seen_at") as any).eq("id", userId).single();
  const lastSeen = userData?.last_reels_seen_at || "2000-01-01";
  const { count } = await (supabase.from("posts").select("id", { count: "exact", head: true }) as any)
    .not("video_url", "is", null).gt("created_at", lastSeen);
  return count || 0;
}

// Mark reels as seen
export async function markReelsSeen(userId: number): Promise<void> {
  await (supabase.from("users").update({ last_reels_seen_at: new Date().toISOString() } as any).eq("id", userId) as any);
}

// Upload post media
export async function uploadPostMedia(file: File, fileName: string): Promise<string> {
  const path = `${Date.now()}_${fileName}`;
  const { error } = await supabase.storage.from("post-media").upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from("post-media").getPublicUrl(path);
  return data.publicUrl;
}

// Stories
export async function getActiveStories(): Promise<Story[]> {
  const { data: stories } = await (supabase.from("stories").select("*") as any)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (!stories || stories.length === 0) return [];

  const userIds = [...new Set(stories.map((s: any) => s.user_id))];
  const { data: users } = await (supabase.from("users").select("id, display_name, avatar_url, guest_id") as any).in("id", userIds);
  const userMap: Record<number, any> = {};
  (users || []).forEach((u: any) => { userMap[u.id] = u; });

  return stories.map((s: any) => ({ ...s, user: userMap[s.user_id] || null }));
}

export async function createStory(userId: number, imageUrl: string, musicName?: string): Promise<Story> {
  const insertData: any = { user_id: userId, image_url: imageUrl };
  if (musicName) insertData.music_name = musicName;
  const { data, error } = await (supabase.from("stories").insert(insertData).select().single() as any);
  if (error) throw error;
  return data;
}

export async function uploadStoryMedia(file: File): Promise<string> {
  const path = `${Date.now()}_${file.name}`;
  const { error } = await supabase.storage.from("stories").upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from("stories").getPublicUrl(path);
  return data.publicUrl;
}

// Delete a post (only owner)
export async function deletePost(postId: string, userId: number): Promise<void> {
  const { error } = await (supabase.from("posts").delete() as any).eq("id", postId).eq("user_id", userId);
  if (error) throw error;
  // Clean up reactions and comments
  await (supabase.from("post_reactions").delete() as any).eq("post_id", postId);
  await (supabase.from("post_comments").delete() as any).eq("post_id", postId);
}

// Delete a story (only owner)
export async function deleteStory(storyId: string, userId: number): Promise<void> {
  const { error } = await (supabase.from("stories").delete() as any).eq("id", storyId).eq("user_id", userId);
  if (error) throw error;
}

// Search/suggest users
export async function searchFeedUsers(query: string) {
  const { data } = await (supabase.from("users").select("id, guest_id, display_name, avatar_url") as any)
    .or(`guest_id.ilike.%${query}%,display_name.ilike.%${query}%`)
    .limit(8);
  return data || [];
}

// Get suggested users (most active posters)
export async function getSuggestedUsers(currentUserId: number, limit = 5) {
  const { data: recentPosts } = await (supabase.from("posts").select("user_id") as any)
    .neq("user_id", currentUserId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!recentPosts || recentPosts.length === 0) return [];

  // Count posts per user
  const counts: Record<number, number> = {};
  recentPosts.forEach((p: any) => { counts[p.user_id] = (counts[p.user_id] || 0) + 1; });
  const topIds = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit).map(e => parseInt(e[0]));

  if (topIds.length === 0) return [];
  const { data: users } = await (supabase.from("users").select("id, guest_id, display_name, avatar_url") as any).in("id", topIds);
  return users || [];
}
