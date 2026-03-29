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
  user?: { display_name: string | null; avatar_url: string | null; guest_id: string; is_verified_badge?: boolean };
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
  user?: { display_name: string | null; avatar_url: string | null; guest_id: string; is_verified_badge?: boolean };
};

export type Story = {
  id: string;
  user_id: number;
  image_url: string;
  created_at: string | null;
  expires_at: string | null;
  user?: { display_name: string | null; avatar_url: string | null; guest_id: string; is_verified_badge?: boolean };
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
  source: "dailymotion" | "youtube" | "good-app";
  creator?: string | null;
  thumbnail_url?: string | null;
  video_id?: string;
  duration?: number;
  category?: string;
  country?: string | null;
  created_at?: string | null;
  local_post_id?: string;
  uploader_user_id?: number | null;
  uploader_guest_id?: string | null;
  uploader_avatar_url?: string | null;
  uploader_is_verified_badge?: boolean;
  likes_count?: number;
  comments_count?: number;
};

export type ChannelStats = {
  subscriber_count: number;
  total_videos: number;
  is_subscribed: boolean;
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

function hasVeryFreshMarker(title: string): boolean {
  return /(202[5-9]|\b2026\b|\b2027\b|\bnew release\b|\bjust released\b|\btoday\b|সদ্য|এইমাত্র|নতুন)/i.test(title);
}

function hasQualityMarker(title: string): boolean {
  return /(full\s*hd|1080|4k|\bhd\b)/i.test(title);
}

function hasStrongQualityMarker(title: string): boolean {
  return /(1080p|full\s*hd|4k|2160p|hq|high\s*quality|hd\s*video)/i.test(title);
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
  const fromBangladesh = String(country || "").toUpperCase() === "BD";
  const hasBanglaMarker = /(bangla|বাংলা|bengali|dhallywood|baul|nazrul|rabindra|bd song|deshi song)/i.test(lower);
  const hasSongMarker = /(song|music|audio|lyrics|গান|gaan|gan|gana|album|official)/i.test(lower);
  const hasNonBanglaMarker = /(hindi|bollywood|punjabi|english|hollywood|tamil|telugu|korean|arabic)/i.test(lower);
  const hasNonMusicMarker = /(natok|drama|movie|serial|episode|cartoon|mukbang|vlog|prank|gaming|challenge)/i.test(lower);
  return (fromBangladesh || hasBanglaMarker) && hasSongMarker && !hasNonBanglaMarker && !hasNonMusicMarker;
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

function buildStrictQueryRegex(searchQuery: string): RegExp {
  const escaped = canonicalizeSearchQuery(searchQuery)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  return new RegExp(escaped, "i");
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
  // Kept for backward compatibility with existing local data
  if (videoId) return `https://www.dailymotion.com/embed/video/${videoId}`;
  return fallbackUrl || "";
}

const VIDEO_PREF_KEY = "goodapp-video-pref-v1";

function inferCategoryFromTitle(title?: string): string {
  const value = (title || "").toLowerCase();
  if (/(romantic|love|valobasha|ভালোবাসা)/i.test(value)) return "romantic";
  if (/(sad|breakup|virah|কষ্ট)/i.test(value)) return "sad";
  if (/(slowed|reverb)/i.test(value)) return "slowed";
  if (/(live|concert|stage)/i.test(value)) return "live";
  if (/(natok|drama|movie|serial|episode)/i.test(value)) return "natok";
  if (/(comedy|funny|হাসি)/i.test(value)) return "comedy";
  if (/(song|music|audio|lyrics|গান|gaan|gan|album|official)/i.test(value)) return "music";
  return "general";
}

function readVideoPreferences(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(VIDEO_PREF_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, number>;
  } catch {
    return {};
  }
}

function topPreferredCategories(limit = 3): string[] {
  const prefs = readVideoPreferences();
  return Object.entries(prefs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

function scorePreferredCategory(title: string, category?: string): number {
  const preferred = topPreferredCategories(3);
  if (preferred.length === 0) return 0;
  const inferred = (category || inferCategoryFromTitle(title)).toLowerCase();
  if (preferred.includes(inferred)) return 14;
  const lower = title.toLowerCase();
  if (preferred.some((item) => lower.includes(item))) return 8;
  return 0;
}

function dedupeExternalVideos(items: ExternalReelVideo[]): ExternalReelVideo[] {
  const seenId = new Set<string>();
  const seenTitleCreator = new Set<string>();
  return items.filter((video) => {
    if (seenId.has(video.id)) return false;
    seenId.add(video.id);
    const titleKey = normalizeForMatch(video.title || "");
    const creatorKey = normalizeForMatch(video.creator || "");
    const key = `${titleKey}::${creatorKey}`;
    if (!titleKey) return true;
    if (seenTitleCreator.has(key)) return false;
    seenTitleCreator.add(key);
    return true;
  });
}

function seededShuffle<T>(items: T[], seed = 0): T[] {
  const arr = [...items];
  let s = Math.abs(seed) + 1;
  for (let i = arr.length - 1; i > 0; i -= 1) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function diversifyByCreator(videos: ExternalReelVideo[], maxPerCreator = 2): ExternalReelVideo[] {
  const counter = new Map<string, number>();
  return videos.filter((video) => {
    const creator = normalizeForMatch(video.creator || "unknown");
    const count = counter.get(creator) || 0;
    if (count >= maxPerCreator) return false;
    counter.set(creator, count + 1);
    return true;
  });
}

const VIDEO_RECENT_KEY = "goodapp-video-recent-v1";

function readRecentVideoIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(VIDEO_RECENT_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function writeRecentVideoIds(newIds: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const existing = Array.from(readRecentVideoIds());
    const merged = Array.from(new Set([...newIds, ...existing])).slice(0, 1000);
    window.localStorage.setItem(VIDEO_RECENT_KEY, JSON.stringify(merged));
  } catch {
    // no-op
  }
}

export function trackVideoPreference(input: { title?: string; category?: string | null }): void {
  if (typeof window === "undefined") return;
  try {
    const prefs = readVideoPreferences();
    const key = (input.category || inferCategoryFromTitle(input.title)).toLowerCase();
    if (!key) return;

    const next: Record<string, number> = {};
    for (const [k, value] of Object.entries(prefs)) {
      next[k] = Math.max(0, Math.round(value * 0.95));
    }
    next[key] = (next[key] || 0) + 10;

    window.localStorage.setItem(VIDEO_PREF_KEY, JSON.stringify(next));
  } catch {
    // no-op
  }
}

// ── YouTube search via Edge Function proxy ──────────────────────────────

export async function fetchYouTubeSuggestions(query: string): Promise<string[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !query.trim()) return [];

  try {
    const params = new URLSearchParams({ action: "suggest", q: query.trim() });
    const url = `${supabaseUrl}/functions/v1/youtube-search?${params}`;
    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.suggestions) ? data.suggestions : [];
  } catch {
    return [];
  }
}

async function fetchYouTubeViaEdge(query: string, action = "search", order = "relevance", maxResults = 25): Promise<any[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl) return [];

  try {
    const params = new URLSearchParams({ maxResults: String(maxResults), order });
    if (action === "trending") {
      params.set("action", "trending");
    } else if (query) {
      params.set("q", query);
    }
    const url = `${supabaseUrl}/functions/v1/youtube-search?${params}`;
    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(9500),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.results) ? data.results : [];
  } catch {
    return [];
  }
}

function youtubeResultToExternal(item: any): ExternalReelVideo | null {
  const videoId = item?.videoId;
  if (!videoId) return null;
  const duration = Number(item?.lengthSeconds || 0) || undefined;

  const title = String(item?.title || "YouTube Video");
  const category = inferCategoryFromTitle(title);

  return {
    id: `yt-${videoId}`,
    title,
    source: "youtube",
    video_url: `https://www.youtube.com/embed/${videoId}`,
    watch_url: `https://www.youtube.com/watch?v=${videoId}`,
    creator: item?.author || null,
    thumbnail_url: item?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    video_id: videoId,
    duration,
    category,
    country: "BD",
  };
}

// Fallback YouTube videos removed - using only live YouTube API

async function fetchYouTubeVideos(
  searchQuery?: string,
  rows = 30,
  order = "relevance",
): Promise<{ videos: ExternalReelVideo[]; hasMore: boolean }> {
  try {
    const trimmed = (searchQuery || "").trim();
    let raw: any[];

    if (trimmed) {
      // User searched something - use search API
      raw = await fetchYouTubeViaEdge(trimmed, "search", order, rows);
    } else {
      // No query - fetch trending videos
      raw = await fetchYouTubeViaEdge("", "trending", "relevance", rows);
    }

    const videos = raw
      .map(youtubeResultToExternal)
      .filter(Boolean) as ExternalReelVideo[];

    if (videos.length > 0) {
      return { videos: videos.slice(0, rows), hasMore: videos.length >= rows };
    }

    // If trending returned nothing, try a default search
    if (!trimmed) {
      const fallbackRaw = await fetchYouTubeViaEdge("bangla new song 2026", "search", "viewCount", rows);
      const fallbackVideos = fallbackRaw.map(youtubeResultToExternal).filter(Boolean) as ExternalReelVideo[];
      return { videos: fallbackVideos.slice(0, rows), hasMore: false };
    }

    return { videos: [], hasMore: false };
  } catch {
    return { videos: [], hasMore: false };
  }
}

// Dailymotion removed - YouTube only via edge function


export async function createLongVideoUpload(userId: number, videoUrl: string, title: string, duration?: number): Promise<Post> {
  return createLongVideoUploadWithThumbnail(userId, videoUrl, title, duration);
}

export async function createLongVideoUploadWithThumbnail(userId: number, videoUrl: string, title: string, duration?: number, thumbnailUrl?: string): Promise<Post> {
  const insertData: any = {
    user_id: userId,
    content: buildLongVideoContent(title, duration),
    video_url: videoUrl,
  };
  if (thumbnailUrl) insertData.image_url = thumbnailUrl;
  const { data, error } = await (supabase.from("posts").insert(insertData).select().single() as any);

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

  let query = (supabase.from("posts").select("id,user_id,video_url,content,created_at,likes_count,comments_count,image_url", { count: "exact" }) as any)
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
  const { data: users } = await (supabase.from("users").select("id, display_name, guest_id, avatar_url, is_verified_badge") as any).in("id", userIds);
  const userMap: Record<number, any> = {};
  (users || []).forEach((u: any) => { userMap[u.id] = u; });

  const videos: ExternalReelVideo[] = posts.map((p: any) => {
    const parsed = parseLongVideoMeta(p.content);
    const owner = userMap[p.user_id];
    return {
      id: `local-${p.id}`,
      title: parsed?.title || "Long video",
      source: "good-app",
      video_url: p.video_url,
      creator: owner?.display_name || owner?.guest_id || "Unknown",
      duration: parsed?.duration,
      created_at: p.created_at,
      category: "music",
      country: "BD",
      local_post_id: p.id,
      uploader_user_id: p.user_id,
      uploader_guest_id: owner?.guest_id || null,
      uploader_avatar_url: owner?.avatar_url || null,
      uploader_is_verified_badge: Boolean(owner?.is_verified_badge),
      likes_count: Number(p.likes_count || 0),
      comments_count: Number(p.comments_count || 0),
      thumbnail_url: p.image_url || null,
    };
  });

  const strictDefaultVideos = searchQuery?.trim()
    ? videos
    : videos.filter((video) => isBanglaDefaultSuggestion(video.title, video.country));

  const safeDefaultVideos = searchQuery?.trim()
    ? strictDefaultVideos
    : (strictDefaultVideos.length > 0 ? strictDefaultVideos : videos);

  return {
    videos: safeDefaultVideos,
    hasMore: typeof count === "number" ? from + videos.length < count : videos.length === rows,
  };
}

export async function getUploadedLongVideoByPostId(postId: string): Promise<ExternalReelVideo | null> {
  const { data: post } = await (supabase.from("posts").select("id,user_id,video_url,content,created_at,likes_count,comments_count,image_url") as any)
    .eq("id", postId)
    .not("video_url", "is", null)
    .like("content", `${LONG_VIDEO_MARKER}%`)
    .single();

  if (!post) return null;

  const { data: owner } = await (supabase.from("users").select("id, display_name, guest_id, avatar_url, is_verified_badge") as any)
    .eq("id", post.user_id)
    .single();

  const parsed = parseLongVideoMeta(post.content);

  return {
    id: `local-${post.id}`,
    title: parsed?.title || "Long video",
    source: "good-app",
    video_url: post.video_url,
    creator: owner?.display_name || owner?.guest_id || "Unknown",
    duration: parsed?.duration,
    created_at: post.created_at,
    category: "music",
    country: "BD",
    local_post_id: post.id,
    uploader_user_id: post.user_id,
    uploader_guest_id: owner?.guest_id || null,
    uploader_avatar_url: owner?.avatar_url || null,
    uploader_is_verified_badge: Boolean(owner?.is_verified_badge),
    likes_count: Number(post.likes_count || 0),
    comments_count: Number(post.comments_count || 0),
    thumbnail_url: post.image_url || null,
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
  const trimmedQuery = searchQuery?.trim();

  // Use YouTube only - with viewCount order for trending feel when no query
  const order = trimmedQuery ? "relevance" : "viewCount";
  const ytResult = await fetchYouTubeVideos(trimmedQuery, Math.max(rows, 30), order);

  let videos = ytResult.videos;

  // Avoid repeating recently shown videos
  const recentIds = readRecentVideoIds();
  const recentArray = Array.from(recentIds);
  const hardBlock = new Set(recentArray.slice(0, 220));

  if (!trimmedQuery) {
    const unseen = videos.filter((v) => !hardBlock.has(v.id));
    if (unseen.length >= Math.min(rows, 5)) {
      videos = unseen;
    }
  }

  const finalVideos = videos.slice(0, rows);
  writeRecentVideoIds(finalVideos.map((v) => v.id));

  return {
    videos: finalVideos,
    hasMore: ytResult.hasMore,
  };
}

export async function getChannelStats(channelUserId: number, currentUserId?: number): Promise<ChannelStats> {
  const [{ count: subscriberCount }, { count: totalVideos }] = await Promise.all([
    (supabase.from("channel_subscriptions").select("id", { count: "exact", head: true }) as any)
      .eq("channel_user_id", channelUserId),
    (supabase.from("posts").select("id", { count: "exact", head: true }) as any)
      .eq("user_id", channelUserId)
      .like("content", `${LONG_VIDEO_MARKER}%`),
  ]);

  let isSubscribed = false;
  if (currentUserId && currentUserId !== channelUserId) {
    const { data } = await (supabase.from("channel_subscriptions").select("id") as any)
      .eq("subscriber_user_id", currentUserId)
      .eq("channel_user_id", channelUserId)
      .limit(1);
    isSubscribed = !!(data && data.length > 0);
  }

  return {
    subscriber_count: subscriberCount || 0,
    total_videos: totalVideos || 0,
    is_subscribed: isSubscribed,
  };
}

export async function toggleChannelSubscription(subscriberUserId: number, channelUserId: number): Promise<boolean> {
  if (subscriberUserId === channelUserId) return false;

  const { data: existing } = await (supabase.from("channel_subscriptions").select("id") as any)
    .eq("subscriber_user_id", subscriberUserId)
    .eq("channel_user_id", channelUserId)
    .limit(1);

  if (existing && existing.length > 0) {
    await (supabase.from("channel_subscriptions").delete() as any)
      .eq("subscriber_user_id", subscriberUserId)
      .eq("channel_user_id", channelUserId);
    return false;
  }

  await (supabase.from("channel_subscriptions").insert({
    subscriber_user_id: subscriberUserId,
    channel_user_id: channelUserId,
  } as any) as any);

  return true;
}

export async function getLocalVideoEngagement(postId: string): Promise<{ likes_count: number; comments_count: number }> {
  const { data } = await (supabase.from("posts").select("likes_count, comments_count") as any)
    .eq("id", postId)
    .single();

  return {
    likes_count: Number(data?.likes_count || 0),
    comments_count: Number(data?.comments_count || 0),
  };
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
  const { data: users } = await (supabase.from("users").select("id, display_name, avatar_url, guest_id, is_verified_badge") as any).in("id", userIds);

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

  let reacted = false;

  if (existing) {
    if (existing.reaction_type === reactionType) {
      await (supabase.from("post_reactions").delete() as any).eq("id", existing.id);
      reacted = false;
    } else {
      await (supabase.from("post_reactions").delete() as any).eq("id", existing.id);
      await (supabase.from("post_reactions").insert({ post_id: postId, user_id: userId, reaction_type: reactionType } as any) as any);
      reacted = true;
    }
  } else {
    await (supabase.from("post_reactions").insert({ post_id: postId, user_id: userId, reaction_type: reactionType } as any) as any);
    reacted = true;
  }

  try {
    const { count } = await (supabase.from("post_reactions").select("id", { count: "exact", head: true }) as any)
      .eq("post_id", postId);
    await (supabase.from("posts").update({ likes_count: count || 0 } as any).eq("id", postId) as any);
  } catch {
    // no-op
  }

  return { reacted, type: reactionType };
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
  const { data: users } = await (supabase.from("users").select("id, display_name, avatar_url, guest_id, is_verified_badge") as any).in("id", userIds);
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
    const { data: users } = await (supabase.from("users").select("id, display_name, avatar_url, is_verified_badge") as any).in("id", fromIds);
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
  const { data: users } = await (supabase.from("users").select("id, display_name, avatar_url, guest_id, is_verified_badge") as any).in("id", userIds);
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
  const { data } = await (supabase.from("users").select("id, guest_id, display_name, avatar_url, is_verified_badge") as any)
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
  const { data: users } = await (supabase.from("users").select("id, guest_id, display_name, avatar_url, is_verified_badge") as any).in("id", topIds);
  return users || [];
}
