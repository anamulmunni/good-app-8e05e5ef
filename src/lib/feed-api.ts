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

// Get feed posts with user info
export async function getFeedPosts(limit = 30): Promise<Post[]> {
  const { data: posts } = await (supabase
    .from("posts")
    .select("*") as any)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!posts || posts.length === 0) return [];

  // Get user info for all posts
  const userIds = [...new Set(posts.map((p: any) => p.user_id))];
  const { data: users } = await (supabase
    .from("users")
    .select("id, display_name, avatar_url, guest_id") as any)
    .in("id", userIds);

  const userMap: Record<number, any> = {};
  (users || []).forEach((u: any) => { userMap[u.id] = u; });

  return posts.map((p: any) => ({ ...p, user: userMap[p.user_id] || null }));
}

// Create post
export async function createPost(userId: number, content: string, imageUrl?: string, videoUrl?: string): Promise<Post> {
  const { data, error } = await (supabase
    .from("posts")
    .insert({
      user_id: userId,
      content: content || null,
      image_url: imageUrl || null,
      video_url: videoUrl || null,
    } as any)
    .select()
    .single() as any);

  if (error) throw error;
  return data;
}

// Toggle like
export async function toggleLike(postId: string, userId: number): Promise<boolean> {
  // Check if already liked
  const { data: existing } = await (supabase
    .from("post_likes")
    .select("id") as any)
    .eq("post_id", postId)
    .eq("user_id", userId)
    .limit(1)
    .single();

  if (existing) {
    // Unlike
    await (supabase.from("post_likes").delete() as any).eq("id", existing.id);
    await (supabase.from("posts").update({ likes_count: (await getPostLikesCount(postId)) } as any).eq("id", postId) as any);
    return false;
  } else {
    // Like
    await (supabase.from("post_likes").insert({ post_id: postId, user_id: userId } as any) as any);
    await (supabase.from("posts").update({ likes_count: (await getPostLikesCount(postId)) } as any).eq("id", postId) as any);
    return true;
  }
}

async function getPostLikesCount(postId: string): Promise<number> {
  const { count } = await (supabase
    .from("post_likes")
    .select("id", { count: "exact", head: true }) as any)
    .eq("post_id", postId);
  return count || 0;
}

// Check if user liked a post
export async function getUserLikes(userId: number, postIds: string[]): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const { data } = await (supabase
    .from("post_likes")
    .select("post_id") as any)
    .eq("user_id", userId)
    .in("post_id", postIds);
  return new Set((data || []).map((d: any) => d.post_id));
}

// Get comments for a post
export async function getPostComments(postId: string): Promise<PostComment[]> {
  const { data: comments } = await (supabase
    .from("post_comments")
    .select("*") as any)
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (!comments || comments.length === 0) return [];

  const userIds = [...new Set(comments.map((c: any) => c.user_id))];
  const { data: users } = await (supabase
    .from("users")
    .select("id, display_name, avatar_url, guest_id") as any)
    .in("id", userIds);

  const userMap: Record<number, any> = {};
  (users || []).forEach((u: any) => { userMap[u.id] = u; });

  return comments.map((c: any) => ({ ...c, user: userMap[c.user_id] || null }));
}

// Add comment
export async function addComment(postId: string, userId: number, content: string): Promise<PostComment> {
  const { data, error } = await (supabase
    .from("post_comments")
    .insert({ post_id: postId, user_id: userId, content } as any)
    .select()
    .single() as any);

  if (error) throw error;

  // Update comments count
  const { count } = await (supabase
    .from("post_comments")
    .select("id", { count: "exact", head: true }) as any)
    .eq("post_id", postId);

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
