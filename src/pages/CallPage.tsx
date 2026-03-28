import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getUser } from "@/lib/api";
import { sendCallSignal, cleanupCallSignals, playRingtone, attachRemoteAudio, rtcConfig } from "@/lib/call-api";
import { Phone, PhoneOff, Mic, MicOff, User, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

type CallState = "idle" | "calling" | "ringing" | "connected" | "ended";

export default function CallPage() {
  const { userId } = useParams<{ userId: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [callState, setCallState] = useState<CallState>("idle");
  const [targetUser, setTargetUser] = useState<any>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const ringtoneRef = useRef<{ stop: () => void } | null>(null);
  const durationTimerRef = useRef<any>(null);
  const targetUserId = parseInt(userId || "0");

  // Load target user
  useEffect(() => {
    if (targetUserId > 0) {
      getUser(targetUserId).then(u => {
        if (u) setTargetUser(u);
        else { toast({ title: "ইউজার পাওয়া যায়নি", variant: "destructive" }); navigate(-1); }
      });
    }
  }, [targetUserId]);

  // Listen for call signals
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`call-signals-${user.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "call_signals",
        filter: `receiver_id=eq.${user.id}`,
      }, async (payload: any) => {
        const signal = payload.new;
        if (signal.caller_id !== targetUserId) return;

        switch (signal.signal_type) {
          case "call-accepted":
            ringtoneRef.current?.stop();
            setCallState("connected");
            startDurationTimer();
            break;
          case "call-rejected":
          case "call-ended":
            endCall(false);
            toast({ title: signal.signal_type === "call-rejected" ? "কল রিজেক্ট করা হয়েছে" : "কল শেষ" });
            break;
          case "answer":
            if (peerRef.current && signal.signal_data) {
              try {
                await peerRef.current.setRemoteDescription(new RTCSessionDescription(signal.signal_data));
              } catch (e) { console.error("Error setting remote desc:", e); }
            }
            break;
          case "ice-candidate":
            if (peerRef.current && signal.signal_data) {
              try {
                await peerRef.current.addIceCandidate(new RTCIceCandidate(signal.signal_data));
              } catch (e) { console.error("Error adding ICE:", e); }
            }
            break;
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, targetUserId]);

  const startDurationTimer = () => {
    setCallDuration(0);
    durationTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const startCall = async () => {
    if (!user || !targetUserId) return;

    try {
      // Get audio stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      // Create peer connection
      const pc = new RTCPeerConnection(rtcConfig);
      peerRef.current = pc;

      // Add audio tracks
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Handle remote audio - create persistent audio element
      pc.ontrack = (event) => {
        // Remove any existing call audio elements
        document.querySelectorAll('.call-remote-audio').forEach(el => el.remove());
        const audio = document.createElement("audio");
        audio.className = "call-remote-audio";
        audio.autoplay = true;
        audio.volume = 1.0;
        (audio as any).playsInline = true;
        audio.setAttribute("playsinline", "true");
        audio.srcObject = event.streams[0];
        document.body.appendChild(audio);
        // Force play with user interaction context
        const playPromise = audio.play();
        if (playPromise) {
          playPromise.catch(() => {
            // Retry play on user interaction
            const handler = () => { audio.play().catch(() => {}); document.removeEventListener("click", handler); };
            document.addEventListener("click", handler);
          });
        }
      };

      // ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendCallSignal(user.id, targetUserId, "ice-candidate", event.candidate.toJSON());
        }
      };

      // Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Send call request
      await cleanupCallSignals(user.id, targetUserId);
      await sendCallSignal(user.id, targetUserId, "call-request", { offer: offer });

      setCallState("calling");
      ringtoneRef.current = playRingtone();

      // Auto-end after 30 seconds if no answer
      setTimeout(() => {
        if (callState === "calling") {
          endCall(true);
          toast({ title: "কোনো উত্তর নেই" });
        }
      }, 30000);

    } catch (err) {
      toast({ title: "মাইক্রোফোন access দিন", variant: "destructive" });
    }
  };

  const endCall = useCallback((sendSignal = true) => {
    ringtoneRef.current?.stop();
    ringtoneRef.current = null;
    clearInterval(durationTimerRef.current);

    // Clean up remote audio elements
    document.querySelectorAll('.call-remote-audio').forEach(el => el.remove());

    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }

    if (sendSignal && user && targetUserId) {
      sendCallSignal(user.id, targetUserId, "call-ended");
    }

    setCallState("ended");
    setTimeout(() => navigate(-1), 1500);
  }, [user, targetUserId, navigate]);

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  useEffect(() => {
    return () => {
      ringtoneRef.current?.stop();
      clearInterval(durationTimerRef.current);
      document.querySelectorAll('.call-remote-audio').forEach(el => el.remove());
      if (peerRef.current) peerRef.current.close();
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-card flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4">
        <button onClick={() => callState === "idle" ? navigate(-1) : endCall()} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft size={24} />
        </button>
      </div>

      {/* Call UI */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6">
        {/* Avatar */}
        <motion.div
          animate={callState === "calling" ? { scale: [1, 1.1, 1] } : {}}
          transition={{ repeat: Infinity, duration: 2 }}
          className="relative"
        >
          <div className={`w-32 h-32 rounded-full flex items-center justify-center overflow-hidden border-4 ${
            callState === "connected" ? "border-[hsl(var(--emerald))]" : callState === "calling" ? "border-primary" : "border-border"
          }`}>
            {targetUser?.avatar_url ? (
              <img src={targetUser.avatar_url} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary/30 to-[hsl(var(--cyan))]/20 flex items-center justify-center">
                <User className="w-16 h-16 text-primary/50" />
              </div>
            )}
          </div>

          {callState === "calling" && (
            <motion.div animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="absolute inset-0 rounded-full border-2 border-primary" />
          )}

          {callState === "connected" && (
            <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-[hsl(var(--emerald))] rounded-full flex items-center justify-center border-4 border-background">
              <Phone className="w-4 h-4 text-foreground" />
            </div>
          )}
        </motion.div>

        {/* Name & Status */}
        <div className="text-center">
          <h2 className="text-2xl font-black text-foreground">{targetUser?.display_name || "User"}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {callState === "idle" && "কল করতে নিচে ট্যাপ করুন"}
            {callState === "calling" && "কল হচ্ছে..."}
            {callState === "ringing" && "রিং হচ্ছে..."}
            {callState === "connected" && formatDuration(callDuration)}
            {callState === "ended" && "কল শেষ"}
          </p>
        </div>

        {/* Call controls */}
        <div className="flex items-center gap-6">
          {callState === "connected" && (
            <motion.button whileTap={{ scale: 0.9 }} onClick={toggleMute}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                isMuted ? "bg-destructive/20 text-destructive" : "bg-secondary text-foreground"
              }`}>
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </motion.button>
          )}

          {callState === "idle" ? (
            <motion.button whileTap={{ scale: 0.9 }} onClick={startCall}
              className="w-20 h-20 rounded-full bg-[hsl(var(--emerald))] flex items-center justify-center shadow-xl shadow-[hsl(var(--emerald))]/30">
              <Phone className="w-8 h-8 text-foreground" />
            </motion.button>
          ) : callState !== "ended" ? (
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => endCall()}
              className="w-20 h-20 rounded-full bg-destructive flex items-center justify-center shadow-xl shadow-destructive/30">
              <PhoneOff className="w-8 h-8 text-destructive-foreground" />
            </motion.button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
