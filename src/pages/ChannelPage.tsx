import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import VerifiedBadge from "@/components/VerifiedBadge";
import {
  getChannelStats,
  toggleChannelSubscription,
  LONG_VIDEO_MARKER,
  type ChannelStats,
  type ExternalReelVideo,
} from "@/lib/feed-api";
import { ArrowLeft, Bell, BellOff, Play, User, Video, Loader2, Search, X, Share2, Copy, Check } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

async function shareOrCopy(title: string, url: string) {
  // Try native share first
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch (e: any) {
      if (e?.name === "AbortError") return; // user cancelled
    }
  }
  // Fallback: copy to clipboard
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied!", { description: url });
  } catch {
    // Final fallback: prompt
    const input = document.createElement("textarea");
    input.value = url;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
    toast.success("Link copied!", { description: url });
  }
}

function parseLongVideoMeta(content?: string | null): { title: string; duration?: number } | null {
  if (!content || !content.startsWith(LONG_VIDEO_MARKER)) return null;
  const raw = content.slice(LONG_VIDEO_MARKER.length);
  const [durationRaw, ...titleParts] = raw.split("::");
  const duration = Number(durationRaw);
  const title = titleParts.join("::").trim() || "Long video";
  return { title, duration: Number.isFinite(duration) && duration > 0 ? duration : undefined };
}

function fmt(sec?: number) {
  if (!sec || sec <= 0) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

type ChannelVideo = {
  id: string;
  post_id: string;
  title: string;
  video_url: string;
  thumbnail_url?: string | null;
  duration?: number;
  likes_count: number;
  comments_count: number;
  created_at: string | null;
};

export default function ChannelPage() {
  const { userId } = useParams<{ userId: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const channelUserId = parseInt(userId || "0");

  const [subscribeLoading, setSubscribeLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/");
  }, [authLoading, user, navigate]);

  // Channel owner info
  const { data: channelOwner, isLoading: ownerLoading } = useQuery({
    queryKey: ["channel-owner", channelUserId],
    queryFn: async () => {
      const { data } = await supabase.from("users").select("*").eq("id", channelUserId).single();
      return data;
    },
    enabled: channelUserId > 0,
  });

  // Channel stats
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ["channel-stats", channelUserId, user?.id],
    queryFn: () => getChannelStats(channelUserId, user?.id),
    enabled: channelUserId > 0 && !!user,
  });

  // Channel videos
  const { data: videos = [], isLoading: videosLoading } = useQuery({
    queryKey: ["channel-videos", channelUserId],
    queryFn: async () => {
      const { data: posts } = await (supabase.from("posts").select("*") as any)
        // selecting all fields including image_url for thumbnail
        .eq("user_id", channelUserId)
        .not("video_url", "is", null)
        .like("content", `${LONG_VIDEO_MARKER}%`)
        .order("created_at", { ascending: false });

      if (!posts) return [];

      return posts.map((p: any) => {
        const parsed = parseLongVideoMeta(p.content);
        return {
          id: `local-${p.id}`,
          post_id: p.id,
          title: parsed?.title || "Video",
          video_url: p.video_url,
          thumbnail_url: p.image_url || null,
          duration: parsed?.duration,
          likes_count: Number(p.likes_count || 0),
          comments_count: Number(p.comments_count || 0),
          created_at: p.created_at,
        } as ChannelVideo;
      });
    },
    enabled: channelUserId > 0,
  });

  const handleSubscribe = useCallback(async () => {
    if (!user || !channelUserId || channelUserId === user.id) return;
    setSubscribeLoading(true);
    try {
      await toggleChannelSubscription(user.id, channelUserId);
      refetchStats();
    } finally {
      setSubscribeLoading(false);
    }
  }, [user, channelUserId, refetchStats]);

  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  };

  if (authLoading || !user) return null;

  if (ownerLoading) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center" style={{ background: "#0f0f0f" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#aaa" }} />
      </div>
    );
  }

  if (!channelOwner) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4" style={{ background: "#0f0f0f", color: "#fff" }}>
        <p style={{ color: "#aaa" }}>Channel not found</p>
        <button onClick={() => navigate(-1)} className="px-4 py-2 rounded-full text-sm font-semibold" style={{ background: "#272727", color: "#fff" }}>
          Go Back
        </button>
      </div>
    );
  }

  const isOwnChannel = channelOwner.id === user.id;
  const joinDate = channelOwner.created_at
    ? new Date(channelOwner.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short" })
    : "";

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0f0f0f", color: "#fff" }}>
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center gap-2 px-3 py-2" style={{ background: "#0f0f0f", borderBottom: "1px solid #272727" }}>
        <button onClick={() => navigate(-1)} className="h-10 w-10 shrink-0 grid place-items-center">
          <ArrowLeft className="w-5 h-5" style={{ color: "#fff" }} />
        </button>
        <h1 className="text-[16px] font-bold truncate" style={{ color: "#f1f1f1" }}>
          {channelOwner.display_name || channelOwner.guest_id}
        </h1>
      </header>

      {/* Channel Banner & Info */}
      <div className="overflow-y-auto flex-1">
        {/* Banner */}
        <div className="h-[100px] w-full" style={{ background: "linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)" }}>
          {(channelOwner as any).cover_url && (
            <img src={(channelOwner as any).cover_url} alt="" className="w-full h-full object-cover" />
          )}
        </div>

        {/* Channel Info */}
        <div className="px-4 py-4">
          <div className="flex items-start gap-3">
            {/* Avatar */}
            <div className="w-[72px] h-[72px] rounded-full overflow-hidden shrink-0 -mt-9 border-2" style={{ background: "#272727", borderColor: "#0f0f0f" }}>
              {channelOwner.avatar_url ? (
                <img src={channelOwner.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full grid place-items-center">
                  <User className="w-8 h-8" style={{ color: "#aaa" }} />
                </div>
              )}
            </div>

            {/* Name + stats */}
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-center gap-1.5">
                <h2 className="text-[18px] font-bold truncate" style={{ color: "#f1f1f1" }}>
                  {channelOwner.display_name || channelOwner.guest_id}
                </h2>
                {channelOwner.is_verified_badge && <VerifiedBadge className="h-4 w-4" />}
              </div>
              <p className="text-[12px] mt-0.5" style={{ color: "#aaa" }}>
                @{channelOwner.guest_id}
              </p>
              <p className="text-[12px] mt-0.5" style={{ color: "#aaa" }}>
                {formatCount(stats?.subscriber_count || 0)} subscribers • {stats?.total_videos || 0} videos
                {joinDate && ` • Joined ${joinDate}`}
              </p>
            </div>
          </div>

          {/* Subscribe button */}
          {!isOwnChannel && (
            <div className="mt-3">
              <button
                onClick={handleSubscribe}
                disabled={subscribeLoading}
                className="w-full py-2.5 rounded-full text-[14px] font-semibold transition-colors"
                style={stats?.is_subscribed
                  ? { background: "#272727", color: "#f1f1f1" }
                  : { background: "#ff0000", color: "#fff" }
                }
              >
                {subscribeLoading ? "..." : stats?.is_subscribed ? "Subscribed" : "Subscribe"}
              </button>
            </div>
          )}

          {isOwnChannel && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => navigate("/reels?upload=1")}
                className="flex-1 py-2.5 rounded-full text-[13px] font-semibold flex items-center justify-center gap-1.5"
                style={{ background: "#272727", color: "#f1f1f1" }}
              >
                <Video className="w-4 h-4" /> Upload Video
              </button>
              <button
                onClick={() => {
                  const channelUrl = `${window.location.origin}/channel/${channelUserId}`;
                  shareOrCopy(`${channelOwner.display_name || channelOwner.guest_id} - good-app`, channelUrl);
                }}
                className="flex-1 py-2.5 rounded-full text-[13px] font-semibold"
                style={{ background: "#272727", color: "#f1f1f1" }}
              >
                Share Channel
              </button>
            </div>
          )}

          {!isOwnChannel && (
            <div className="mt-2 flex justify-end">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const channelUrl = `${window.location.origin}/channel/${channelUserId}`;
                  shareOrCopy(`${channelOwner.display_name || channelOwner.guest_id} - good-app`, channelUrl);
                }}
                className="px-3 py-1.5 rounded-full text-[12px] font-medium flex items-center gap-1"
                style={{ background: "#272727", color: "#aaa" }}
              >
                <Share2 className="w-3.5 h-3.5" /> Share
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex px-4 gap-6" style={{ borderBottom: "1px solid #272727" }}>
          <button className="py-3 text-[13px] font-semibold" style={{ color: "#fff", borderBottom: "2px solid #fff" }}>
            Videos
          </button>
        </div>

        {/* Videos Grid */}
        <div className="px-0 pb-20">
          {videosLoading ? (
            <div className="py-16 grid place-items-center">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#aaa" }} />
            </div>
          ) : videos.length === 0 ? (
            <div className="py-16 text-center">
              <Video className="w-12 h-12 mx-auto mb-3" style={{ color: "#555" }} />
              <p className="text-[14px]" style={{ color: "#aaa" }}>
                {isOwnChannel ? "You haven't uploaded any videos yet" : "This channel has no videos"}
              </p>
              {isOwnChannel && (
                <button
                  onClick={() => navigate("/reels")}
                  className="mt-3 px-5 py-2 rounded-full text-[13px] font-semibold"
                  style={{ background: "#ff0000", color: "#fff" }}
                >
                  Upload your first video
                </button>
              )}
            </div>
          ) : (
            <div>
              {videos.map((video) => (
                <div
                  key={video.id}
                  onClick={() => navigate(`/watch/${video.post_id}`)}
                  className="w-full text-left cursor-pointer"
                >
                  {/* Thumbnail - use video poster or placeholder */}
                  <div className="w-full aspect-video relative" style={{ background: "#1a1a1a" }}>
                    {video.thumbnail_url ? (
                      <img src={video.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <video
                        src={video.video_url}
                        preload="metadata"
                        className="w-full h-full object-cover pointer-events-none"
                      />
                    )}
                    {video.duration ? (
                      <span className="absolute right-1 bottom-1 text-[11px] font-medium px-1 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.8)", color: "#fff" }}>
                        {fmt(video.duration)}
                      </span>
                    ) : null}
                    <div className="absolute inset-0 grid place-items-center">
                      <div className="w-12 h-12 rounded-full grid place-items-center" style={{ background: "rgba(0,0,0,0.6)" }}>
                        <Play className="w-6 h-6 ml-0.5" style={{ color: "#fff" }} />
                      </div>
                    </div>
                  </div>

                  {/* Video info */}
                  <div className="flex gap-3 px-3 py-3">
                    <div className="w-9 h-9 rounded-full overflow-hidden shrink-0" style={{ background: "#272727" }}>
                      {channelOwner.avatar_url ? (
                        <img src={channelOwner.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-xs font-bold" style={{ color: "#aaa" }}>
                          {(channelOwner.display_name || "?")[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium line-clamp-2 leading-[20px]" style={{ color: "#f1f1f1" }}>
                        {video.title}
                      </p>
                      <p className="text-[12px] mt-0.5" style={{ color: "#aaa" }}>
                        {channelOwner.display_name || channelOwner.guest_id}
                        {channelOwner.is_verified_badge && " ✓"}
                        {" • "}
                        {video.likes_count > 0 && `${video.likes_count} likes • `}
                        {video.comments_count > 0 && `${video.comments_count} comments • `}
                        {timeAgo(video.created_at)}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const videoUrl = `${window.location.origin}/watch/${video.post_id}`;
                          shareOrCopy(video.title, videoUrl);
                        }}
                        className="flex items-center gap-1 mt-1 text-[11px] font-medium"
                        style={{ color: "#3ea6ff" }}
                      >
                        <Share2 className="w-3 h-3" /> Share video link
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
