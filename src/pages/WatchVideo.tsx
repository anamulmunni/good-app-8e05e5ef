import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

/** Redirect /watch/:postId → /reels?play=:postId */
export default function WatchVideo() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (postId) {
      navigate(`/reels?play=${postId}`, { replace: true });
    } else {
      navigate("/reels", { replace: true });
    }
  }, [postId, navigate]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center" style={{ background: "#0f0f0f", color: "#fff" }}>
      <p className="text-sm" style={{ color: "#aaa" }}>Loading video...</p>
    </div>
  );
}