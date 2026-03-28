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

export const REACTION_EMOJIS: Record<string, string> = {
  like: "👍",
  love: "❤️",
  haha: "😂",
  wow: "😮",
  sad: "😢",
  angry: "😡",
};

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

  let result = posts.map((p: any) => ({ ...p, user: userMap[p.user_id] || null }));

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

async function updatePostLikesCount(postId: string) {
  const { count } = await (supabase.from("post_reactions").select("id", { count: "exact", head: true }) as any).eq("post_id", postId);
  await (supabase.from("posts").update({ likes_count: count || 0 } as any).eq("id", postId) as any);
}

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
export async function getPostComments(postId: string): Promise<PostComment[]> {
  const { data: comments } = await (supabase.from("post_comments").select("*") as any)
    .eq("post_id", postId).order("created_at", { ascending: true });
  if (!comments || comments.length === 0) return [];

  const userIds = [...new Set(comments.map((c: any) => c.user_id))];
  const { data: users } = await (supabase.from("users").select("id, display_name, avatar_url, guest_id") as any).in("id", userIds);
  const userMap: Record<number, any> = {};
  (users || []).forEach((u: any) => { userMap[u.id] = u; });

  return comments.map((c: any) => ({ ...c, user: userMap[c.user_id] || null }));
}

// Add comment
export async function addComment(postId: string, userId: number, content: string): Promise<PostComment> {
  const { data, error } = await (supabase.from("post_comments").insert({ post_id: postId, user_id: userId, content } as any).select().single() as any);
  if (error) throw error;
  const { count } = await (supabase.from("post_comments").select("id", { count: "exact", head: true }) as any).eq("post_id", postId);
  await (supabase.from("posts").update({ comments_count: count || 0 } as any).eq("id", postId) as any);
  return data;
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
