import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getUser } from "@/lib/api";
import { sendCallSignal, playRingtone, attachRemoteAudio, rtcConfig } from "@/lib/call-api";
import { Phone, PhoneOff, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function IncomingCallHandler() {
  const { user } = useAuth();
  const [incomingCall, setIncomingCall] = useState<{
    callerId: number;
    callerName: string;
    callerAvatar: string | null;
    offer: RTCSessionDescriptionInit;
  } | null>(null);
  const ringtoneRef = useRef<{ stop: () => void } | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [callActive, setCallActive] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const durationTimerRef = useRef<any>(null);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`incoming-calls-${user.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "call_signals",
        filter: `receiver_id=eq.${user.id}`,
      }, async (payload: any) => {
        const signal = payload.new;

        if (signal.signal_type === "call-request" && !callActive && !incomingCall) {
          const caller = await getUser(signal.caller_id);
          if (caller) {
            setIncomingCall({
              callerId: signal.caller_id,
              callerName: caller.display_name || "User",
              callerAvatar: caller.avatar_url,
              offer: signal.signal_data?.offer,
            });
            ringtoneRef.current = playRingtone();
          }
        }

        if (signal.signal_type === "call-ended") {
          endCall(false);
        }

        if (signal.signal_type === "ice-candidate" && peerRef.current && signal.signal_data) {
          try { await peerRef.current.addIceCandidate(new RTCIceCandidate(signal.signal_data)); } catch {}
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, callActive, incomingCall]);

  const acceptCall = async () => {
    if (!user || !incomingCall) return;
    ringtoneRef.current?.stop();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection(rtcConfig);
      peerRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        document.querySelectorAll('.call-remote-audio').forEach(el => el.remove());
        const audio = document.createElement("audio");
        audio.className = "call-remote-audio";
        audio.autoplay = true;
        audio.volume = 1.0;
        (audio as any).playsInline = true;
        audio.setAttribute("playsinline", "true");
        audio.srcObject = event.streams[0];
        document.body.appendChild(audio);
        const playPromise = audio.play();
        if (playPromise) {
          playPromise.catch(() => {
            const handler = () => { audio.play().catch(() => {}); document.removeEventListener("click", handler); };
            document.addEventListener("click", handler);
          });
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && user) {
          sendCallSignal(user.id, incomingCall.callerId, "ice-candidate", event.candidate.toJSON());
        }
      };

      if (incomingCall.offer) {
        await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendCallSignal(user.id, incomingCall.callerId, "answer", answer);
      }

      await sendCallSignal(user.id, incomingCall.callerId, "call-accepted");
      setCallActive(true);
      setCallDuration(0);
      durationTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } catch {
      endCall(true);
    }
  };

  const rejectCall = () => {
    if (user && incomingCall) {
      sendCallSignal(user.id, incomingCall.callerId, "call-rejected");
    }
    ringtoneRef.current?.stop();
    ringtoneRef.current = null;
    setIncomingCall(null);
  };

  const endCall = (sendSignal = true) => {
    ringtoneRef.current?.stop();
    ringtoneRef.current = null;
    clearInterval(durationTimerRef.current);
    document.querySelectorAll('.call-remote-audio').forEach(el => el.remove());
    if (peerRef.current) { peerRef.current.close(); peerRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
    if (sendSignal && user && incomingCall) sendCallSignal(user.id, incomingCall.callerId, "call-ended");
    setCallActive(false);
    setIncomingCall(null);
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const t = localStreamRef.current.getAudioTracks()[0];
      if (t) { t.enabled = !t.enabled; setIsMuted(!t.enabled); }
    }
  };

  const formatDuration = (secs: number) => `${Math.floor(secs / 60).toString().padStart(2, "0")}:${(secs % 60).toString().padStart(2, "0")}`;

  if (!incomingCall) return null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[300] bg-background/95 backdrop-blur-xl flex flex-col items-center justify-center gap-8 p-6">

        {/* Caller info */}
        <motion.div animate={!callActive ? { scale: [1, 1.05, 1] } : {}} transition={{ repeat: Infinity, duration: 2 }}
          className="relative">
          <div className={`w-28 h-28 rounded-full flex items-center justify-center overflow-hidden border-4 ${callActive ? "border-[hsl(var(--emerald))]" : "border-primary"}`}>
            {incomingCall.callerAvatar ? <img src={incomingCall.callerAvatar} className="w-full h-full object-cover" /> :
              <div className="w-full h-full bg-gradient-to-br from-primary/30 to-[hsl(var(--cyan))]/20 flex items-center justify-center">
                <User className="w-14 h-14 text-primary/50" />
              </div>}
          </div>
          {!callActive && (
            <motion.div animate={{ scale: [1, 1.6], opacity: [0.4, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}
              className="absolute inset-0 rounded-full border-2 border-primary" />
          )}
        </motion.div>

        <div className="text-center">
          <h2 className="text-2xl font-black">{incomingCall.callerName}</h2>
          <p className="text-muted-foreground mt-1">
            {callActive ? formatDuration(callDuration) : "ইনকামিং কল..."}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-8">
          {!callActive ? (
            <>
              <motion.button whileTap={{ scale: 0.9 }} onClick={rejectCall}
                className="w-16 h-16 rounded-full bg-destructive flex items-center justify-center shadow-xl shadow-destructive/30">
                <PhoneOff className="w-7 h-7 text-destructive-foreground" />
              </motion.button>
              <motion.button whileTap={{ scale: 0.9 }} onClick={acceptCall}
                className="w-16 h-16 rounded-full bg-[hsl(var(--emerald))] flex items-center justify-center shadow-xl shadow-[hsl(var(--emerald))]/30"
                animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 1 }}>
                <Phone className="w-7 h-7 text-foreground" />
              </motion.button>
            </>
          ) : (
            <>
              <motion.button whileTap={{ scale: 0.9 }} onClick={toggleMute}
                className={`w-14 h-14 rounded-full flex items-center justify-center ${isMuted ? "bg-destructive/20 text-destructive" : "bg-secondary text-foreground"}`}>
                {isMuted ? <span className="text-xs font-bold">🔇</span> : <span className="text-xs font-bold">🔊</span>}
              </motion.button>
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => endCall()}
                className="w-16 h-16 rounded-full bg-destructive flex items-center justify-center shadow-xl">
                <PhoneOff className="w-7 h-7 text-destructive-foreground" />
              </motion.button>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
