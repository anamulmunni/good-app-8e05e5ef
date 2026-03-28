import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getUser } from "@/lib/api";
import { sendCallSignal, playRingtone, attachRemoteAudio, rtcConfig, showCallNotification } from "@/lib/call-api";
import { Phone, PhoneOff, User } from "lucide-react";
import { motion } from "framer-motion";

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
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const incomingCallRef = useRef(incomingCall);
  const callActiveRef = useRef(callActive);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescriptionSetRef = useRef(false);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  useEffect(() => {
    callActiveRef.current = callActive;
  }, [callActive]);

  const stopRingtone = () => {
    ringtoneRef.current?.stop();
    ringtoneRef.current = null;
  };

  const notifyIncomingCall = (callerName: string) => {
    if (document.visibilityState === "visible") return;

    if ("vibrate" in navigator) {
      navigator.vibrate([350, 180, 350]);
    }

    if ("Notification" in window && Notification.permission === "granted") {
      const notification = new Notification(`${callerName} is calling`, {
        body: "Open the app to receive the call",
        tag: "incoming-call",
        icon: "/icon-192.png",
      });
      notification.onclick = () => window.focus();
    }
  };

  const clearRemoteAudio = () => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.remove();
      remoteAudioRef.current = null;
    }
    document.querySelectorAll(".call-remote-audio").forEach((el) => el.remove());
  };

  const endCall = (sendSignal = true) => {
    stopRingtone();
    clearInterval(durationTimerRef.current);
    clearRemoteAudio();

    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    const currentIncomingCall = incomingCallRef.current;
    if (sendSignal && user && currentIncomingCall) {
      sendCallSignal(user.id, currentIncomingCall.callerId, "call-ended");
    }

    setCallActive(false);
    setIsMuted(false);
    setIncomingCall(null);
  };

  useEffect(() => {
    if (!user) return;

    // Register SW background polling for calls/messages
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
      navigator.serviceWorker.controller.postMessage({
        type: "REGISTER_POLL",
        supabaseUrl,
        supabaseKey,
        userId: user.id,
      });
    }

    const handleIncomingCallRequest = async (signal: any) => {
      const inCallRoute = window.location.pathname.startsWith("/call/");
      const isBusy = callActiveRef.current || !!incomingCallRef.current || inCallRoute;

      if (isBusy) {
        sendCallSignal(user.id, signal.caller_id, "call-busy").catch(() => {});
        return;
      }

      pendingIceCandidatesRef.current = [];
      remoteDescriptionSetRef.current = false;
      const caller = await getUser(signal.caller_id);
      if (!caller) return;

      stopRingtone();
      setIncomingCall({
        callerId: signal.caller_id,
        callerName: caller.display_name || "User",
        callerAvatar: caller.avatar_url,
        offer: signal.signal_data?.offer,
      });

      sendCallSignal(user!.id, signal.caller_id, "call-ringing").catch(() => {});
      showCallNotification(
        `${caller.display_name || "User"} calling...`,
        "Tap to open and receive the call",
        "incoming-call",
        "/"
      );
      if ("vibrate" in navigator) navigator.vibrate([350, 180, 350, 180, 350]);
      ringtoneRef.current = playRingtone("incoming");
    };

    const recoverPendingIncomingCall = async () => {
      if (document.visibilityState === "hidden") return;
      if (callActiveRef.current || incomingCallRef.current) return;

      const { data } = await (supabase.from("call_signals") as any)
        .select("caller_id, signal_type, signal_data, created_at")
        .eq("receiver_id", user.id)
        .in("signal_type", ["call-request", "call-ended", "call-rejected", "call-busy"])
        .order("created_at", { ascending: false })
        .limit(30);

      if (!data?.length) return;

      const latestByCaller = new Map<number, any>();
      for (const row of data) {
        if (!latestByCaller.has(row.caller_id)) {
          latestByCaller.set(row.caller_id, row);
        }
      }

      const pending = Array.from(latestByCaller.values()).find((row: any) => {
        if (row.signal_type !== "call-request") return false;
        if (!row.created_at) return true;
        const ageMs = Date.now() - new Date(row.created_at).getTime();
        return ageMs >= 0 && ageMs <= 35000;
      });

      if (pending) {
        await handleIncomingCallRequest(pending);
      }
    };

    const channel = supabase
      .channel(`incoming-calls-${user.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "call_signals",
        filter: `receiver_id=eq.${user.id}`,
      }, async (payload: any) => {
        const signal = payload.new;
        const activeCall = incomingCallRef.current;
        const isSameCaller = !!activeCall && activeCall.callerId === signal.caller_id;

        if (signal.signal_type === "call-request") {
          await handleIncomingCallRequest(signal);
        }

        if (["call-ended", "call-busy"].includes(signal.signal_type) && isSameCaller) {
          endCall(false);
        }

        if (signal.signal_type === "ice-candidate" && signal.signal_data && isSameCaller) {
          if (peerRef.current && remoteDescriptionSetRef.current) {
            try { await peerRef.current.addIceCandidate(new RTCIceCandidate(signal.signal_data)); } catch {}
          } else {
            pendingIceCandidatesRef.current.push(signal.signal_data);
          }
        }
      })
      .subscribe();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        recoverPendingIncomingCall().catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onVisibilityChange);
    recoverPendingIncomingCall().catch(() => {});

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onVisibilityChange);
      stopRingtone();
      clearRemoteAudio();
      clearInterval(durationTimerRef.current);
      if (peerRef.current) {
        peerRef.current.close();
        peerRef.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
    };
  }, [user]);

  const acceptCall = async () => {
    if (!user || !incomingCall) return;
    stopRingtone();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection(rtcConfig);
      peerRef.current = pc;
      pendingIceCandidatesRef.current = [];
      remoteDescriptionSetRef.current = false;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        const remoteStream = event.streams?.[0] || new MediaStream([event.track]);
        remoteAudioRef.current = attachRemoteAudio(remoteStream);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          stopRingtone();
        }

        if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
          endCall(false);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && user) {
          sendCallSignal(user.id, incomingCall.callerId, "ice-candidate", event.candidate.toJSON());
        }
      };

      if (incomingCall.offer) {
        await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
        remoteDescriptionSetRef.current = true;

        if (pendingIceCandidatesRef.current.length > 0) {
          for (const candidate of pendingIceCandidatesRef.current) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch {
              // no-op
            }
          }
          pendingIceCandidatesRef.current = [];
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendCallSignal(user.id, incomingCall.callerId, "answer", answer);
      }

      await sendCallSignal(user.id, incomingCall.callerId, "call-accepted");
      setCallActive(true);
      setIsMuted(false);
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
    stopRingtone();
    pendingIceCandidatesRef.current = [];
    remoteDescriptionSetRef.current = false;
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] bg-background/95 backdrop-blur-xl flex flex-col items-center justify-center gap-8 p-6"
    >

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
  );
}
