import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getUser } from "@/lib/api";
import { sendCallSignal, cleanupCallSignals, playRingtone, attachRemoteAudio, rtcConfig, showCallNotification, sendCallMessage } from "@/lib/call-api";
import { Phone, PhoneOff, Mic, MicOff, User, ArrowLeft, Volume2, Video, VideoOff, CameraIcon } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

type CallState = "idle" | "calling" | "ringing" | "connected" | "ended";

export default function CallPage() {
  const { userId } = useParams<{ userId: string }>();
  const [searchParams] = useSearchParams();
  const isVideoCall = searchParams.get("video") === "1";
  const autoStart = searchParams.get("auto") === "1";
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [callState, setCallState] = useState<CallState>("idle");
  const [targetUser, setTargetUser] = useState<any>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [cameraOn, setCameraOn] = useState(isVideoCall);
  const [callDuration, setCallDuration] = useState(0);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const ringtoneRef = useRef<{ stop: () => void } | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const durationTimerRef = useRef<any>(null);
  const noAnswerTimerRef = useRef<number | null>(null);
  const callStateRef = useRef<CallState>("idle");
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescriptionSetRef = useRef(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const autoStartedRef = useRef(false);
  const targetUserId = parseInt(userId || "0");

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  // Load target user
  useEffect(() => {
    if (targetUserId > 0) {
      getUser(targetUserId).then(u => {
        if (u) setTargetUser(u);
        else { toast({ title: "ইউজার পাওয়া যায়নি", variant: "destructive" }); navigate(-1); }
      });
    }
  }, [targetUserId]);

  // Auto-start call
  useEffect(() => {
    if (autoStart && !autoStartedRef.current && user && targetUser && callState === "idle") {
      autoStartedRef.current = true;
      startCall();
    }
  }, [autoStart, user, targetUser, callState]);

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
          case "call-ringing":
            if (["calling", "ringing"].includes(callStateRef.current)) {
              setCallState("ringing");
            }
            break;
          case "call-busy":
            stopRingtone();
            endCall(false);
            toast({ title: "ইউজার এখন ব্যস্ত" });
            break;
          case "call-accepted":
            stopRingtone();
            if (noAnswerTimerRef.current) { clearTimeout(noAnswerTimerRef.current); noAnswerTimerRef.current = null; }
            if (callStateRef.current !== "connected") { setCallState("connected"); startDurationTimer(); }
            break;
          case "call-rejected":
          case "call-ended":
            if (signal.signal_type === "call-rejected" && user) {
              sendCallMessage(user.id, targetUserId, "rejected", undefined, isVideoCall);
            }
            endCall(false);
            toast({ title: signal.signal_type === "call-rejected" ? "কল রিজেক্ট করা হয়েছে" : "কল শেষ" });
            break;
          case "answer":
            if (peerRef.current && signal.signal_data) {
              try {
                await peerRef.current.setRemoteDescription(new RTCSessionDescription(signal.signal_data));
                remoteDescriptionSetRef.current = true;
                for (const candidate of pendingIceCandidatesRef.current) {
                  try { await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
                }
                pendingIceCandidatesRef.current = [];
                stopRingtone();
                if (noAnswerTimerRef.current) { clearTimeout(noAnswerTimerRef.current); noAnswerTimerRef.current = null; }
                if (callStateRef.current !== "connected") { setCallState("connected"); startDurationTimer(); }
              } catch (e) { console.error("Error setting remote desc:", e); }
            }
            break;
          case "ice-candidate":
            if (signal.signal_data) {
              if (peerRef.current && remoteDescriptionSetRef.current) {
                try { await peerRef.current.addIceCandidate(new RTCIceCandidate(signal.signal_data)); } catch {}
              } else {
                pendingIceCandidatesRef.current.push(signal.signal_data);
              }
            }
            break;
          case "call-request":
            if (["calling", "ringing"].includes(callStateRef.current)) {
              if (user.id < targetUserId && signal.signal_data?.offer) {
                stopRingtone();
                if (noAnswerTimerRef.current) { clearTimeout(noAnswerTimerRef.current); noAnswerTimerRef.current = null; }
                if (peerRef.current) { peerRef.current.close(); peerRef.current = null; }
                pendingIceCandidatesRef.current = [];
                remoteDescriptionSetRef.current = false;
                try {
                  const stream = localStreamRef.current || await getMediaStream();
                  localStreamRef.current = stream;
                  attachLocalVideo(stream);
                  const pc = createPeerConnection(stream);
                  await pc.setRemoteDescription(new RTCSessionDescription(signal.signal_data.offer));
                  remoteDescriptionSetRef.current = true;
                  for (const candidate of pendingIceCandidatesRef.current) {
                    try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
                  }
                  pendingIceCandidatesRef.current = [];
                  const answer = await pc.createAnswer();
                  await pc.setLocalDescription(answer);
                  await sendCallSignal(user.id, targetUserId, "answer", answer);
                  await sendCallSignal(user.id, targetUserId, "call-accepted");
                  setCallState("connected");
                  startDurationTimer();
                } catch (e) { console.error("Glare resolution failed:", e); endCall(true); }
              }
            } else if (callStateRef.current === "connected") {
              sendCallSignal(user.id, targetUserId, "call-busy").catch(() => {});
            }
            break;
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, targetUserId]);

  const getMediaStream = async () => {
    const constraints: MediaStreamConstraints = {
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    };
    if (cameraOn || isVideoCall) {
      constraints.video = { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } };
    }
    return navigator.mediaDevices.getUserMedia(constraints);
  };

  const attachLocalVideo = (stream: MediaStream) => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.play().catch(() => {});
    }
  };

  const createPeerConnection = (stream: MediaStream): RTCPeerConnection => {
    const pc = new RTCPeerConnection(rtcConfig);
    peerRef.current = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.ontrack = (event) => {
      const remoteStream = event.streams?.[0] || new MediaStream([event.track]);
      // Check if there's video
      const hasVideo = remoteStream.getVideoTracks().length > 0;
      if (hasVideo && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.play().catch(() => {});
      }
      remoteAudioRef.current = attachRemoteAudio(remoteStream);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        stopRingtone();
        if (noAnswerTimerRef.current) { clearTimeout(noAnswerTimerRef.current); noAnswerTimerRef.current = null; }
        if (callStateRef.current !== "connected") { setCallState("connected"); startDurationTimer(); }
      }
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        endCall(false);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && user) {
        sendCallSignal(user.id, targetUserId, "ice-candidate", event.candidate.toJSON());
      }
    };

    return pc;
  };

  const startDurationTimer = () => {
    clearInterval(durationTimerRef.current);
    setCallDuration(0);
    durationTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const stopRingtone = () => { ringtoneRef.current?.stop(); ringtoneRef.current = null; };

  const clearRemoteAudio = () => {
    if (remoteAudioRef.current) { remoteAudioRef.current.pause(); remoteAudioRef.current.remove(); remoteAudioRef.current = null; }
    document.querySelectorAll(".call-remote-audio").forEach((el) => el.remove());
  };

  const startCall = async () => {
    if (!user || !targetUserId) return;
    try {
      const stream = await getMediaStream();
      localStreamRef.current = stream;
      setIsMuted(false);
      attachLocalVideo(stream);

      const pc = createPeerConnection(stream);
      pendingIceCandidatesRef.current = [];
      remoteDescriptionSetRef.current = false;

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await cleanupCallSignals(user.id, targetUserId);
      await sendCallSignal(user.id, targetUserId, "call-request", { offer });

      setCallState("calling");
      ringtoneRef.current = playRingtone("outgoing");

      noAnswerTimerRef.current = window.setTimeout(() => {
        if (["calling", "ringing"].includes(callStateRef.current)) {
          // Send missed call message
          if (user) sendCallMessage(user.id, targetUserId, "missed", undefined, isVideoCall);
          endCall(true);
          toast({ title: "কোনো উত্তর নেই" });
        }
      }, 30000);
    } catch {
      toast({ title: "মাইক্রোফোন/ক্যামেরা access দিন", variant: "destructive" });
    }
  };

  const endCall = useCallback((sendSignal = true) => {
    stopRingtone();
    if (noAnswerTimerRef.current) { clearTimeout(noAnswerTimerRef.current); noAnswerTimerRef.current = null; }
    const finalDuration = callDuration;
    const wasConnected = callStateRef.current === "connected";
    clearInterval(durationTimerRef.current);
    clearRemoteAudio();
    pendingIceCandidatesRef.current = [];
    remoteDescriptionSetRef.current = false;
    if (peerRef.current) { peerRef.current.close(); peerRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
    if (sendSignal && user && targetUserId) { sendCallSignal(user.id, targetUserId, "call-ended"); }
    // Send call duration or missed call message
    if (user && targetUserId && wasConnected && finalDuration > 0) {
      sendCallMessage(user.id, targetUserId, "completed", finalDuration, isVideoCall);
    }
    setCallState("ended");
    setIsMuted(false);
    setTimeout(() => navigate(-1), 1500);
  }, [user, targetUserId, navigate, callDuration, isVideoCall]);

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) { audioTrack.enabled = !audioTrack.enabled; setIsMuted(!audioTrack.enabled); }
    }
  };

  const toggleSpeaker = () => {
    setIsSpeaker(!isSpeaker);
    const audioEls = document.querySelectorAll<HTMLAudioElement>(".call-remote-audio");
    audioEls.forEach(el => {
      if ((el as any).setSinkId) {
        (el as any).setSinkId(isSpeaker ? "" : "default").catch(() => {});
      }
    });
  };

  const toggleCamera = async () => {
    if (!localStreamRef.current) return;
    const videoTracks = localStreamRef.current.getVideoTracks();
    if (videoTracks.length > 0) {
      // Turn off
      videoTracks.forEach(t => { t.stop(); localStreamRef.current?.removeTrack(t); });
      setCameraOn(false);
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
    } else {
      // Turn on
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } });
        const newTrack = newStream.getVideoTracks()[0];
        localStreamRef.current.addTrack(newTrack);
        if (peerRef.current) {
          const sender = peerRef.current.getSenders().find(s => s.track?.kind === "video");
          if (sender) { await sender.replaceTrack(newTrack); } else { peerRef.current.addTrack(newTrack, localStreamRef.current); }
        }
        setCameraOn(true);
        attachLocalVideo(localStreamRef.current);
      } catch { toast({ title: "ক্যামেরা ব্যবহার করা যাচ্ছে না", variant: "destructive" }); }
    }
  };

  const switchCamera = async () => {
    if (!localStreamRef.current) return;
    const currentTrack = localStreamRef.current.getVideoTracks()[0];
    if (!currentTrack) return;
    const currentFacing = currentTrack.getSettings().facingMode;
    const newFacing = currentFacing === "user" ? "environment" : "user";
    currentTrack.stop();
    localStreamRef.current.removeTrack(currentTrack);
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: newFacing, width: { ideal: 640 }, height: { ideal: 480 } } });
      const newTrack = newStream.getVideoTracks()[0];
      localStreamRef.current.addTrack(newTrack);
      if (peerRef.current) {
        const sender = peerRef.current.getSenders().find(s => s.track?.kind === "video" || !s.track);
        if (sender) await sender.replaceTrack(newTrack);
      }
      attachLocalVideo(localStreamRef.current);
    } catch { toast({ title: "ক্যামেরা পরিবর্তন করা যায়নি", variant: "destructive" }); }
  };

  useEffect(() => {
    return () => {
      stopRingtone();
      if (noAnswerTimerRef.current) clearTimeout(noAnswerTimerRef.current);
      clearInterval(durationTimerRef.current);
      clearRemoteAudio();
      pendingIceCandidatesRef.current = [];
      remoteDescriptionSetRef.current = false;
      if (peerRef.current) peerRef.current.close();
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  if (authLoading || !user) return null;

  const hasVideo = cameraOn || isVideoCall;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex flex-col relative overflow-hidden">
      {/* Remote Video (fullscreen background) */}
      {hasVideo && callState === "connected" && (
        <video ref={remoteVideoRef} autoPlay playsInline muted={false}
          className="absolute inset-0 w-full h-full object-cover z-0" />
      )}

      {/* Local Video (small pip) */}
      {cameraOn && callState !== "idle" && callState !== "ended" && (
        <div className="absolute top-16 right-4 w-28 h-40 rounded-2xl overflow-hidden z-30 shadow-2xl border-2 border-white/20">
          <video ref={localVideoRef} autoPlay playsInline muted
            className="w-full h-full object-cover mirror" style={{ transform: "scaleX(-1)" }} />
        </div>
      )}

      {/* Overlay for non-video or not-connected */}
      <div className={`flex-1 flex flex-col relative z-10 ${hasVideo && callState === "connected" ? "" : ""}`}>
        {/* Header */}
        <div className="px-4 pt-4">
          <button onClick={() => callState === "idle" ? navigate(-1) : endCall()} className="text-white/70 hover:text-white">
            <ArrowLeft size={24} />
          </button>
        </div>

        {/* Call UI */}
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
          {/* Avatar - hide when video connected */}
          {!(hasVideo && callState === "connected") && (
            <>
              <motion.div
                animate={callState === "calling" ? { scale: [1, 1.1, 1] } : {}}
                transition={{ repeat: Infinity, duration: 2 }}
                className="relative"
              >
                <div className={`w-28 h-28 rounded-full flex items-center justify-center overflow-hidden border-4 ${
                  callState === "connected" ? "border-green-500" : callState === "calling" ? "border-blue-500" : "border-gray-600"
                }`}>
                  {targetUser?.avatar_url ? (
                    <img src={targetUser.avatar_url} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-600/40 to-purple-600/30 flex items-center justify-center">
                      <User className="w-14 h-14 text-white/50" />
                    </div>
                  )}
                </div>
                {callState === "calling" && (
                  <motion.div animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="absolute inset-0 rounded-full border-2 border-blue-500" />
                )}
              </motion.div>

              <div className="text-center">
                <h2 className="text-2xl font-black text-white">{targetUser?.display_name || "User"}</h2>
                <p className="text-sm text-white/60 mt-1">
                  {callState === "idle" && (isVideoCall ? "ভিডিও কল করুন" : "কল করতে ট্যাপ করুন")}
                  {callState === "calling" && "Calling..."}
                  {callState === "ringing" && "Ringing ☎️"}
                  {callState === "connected" && formatDuration(callDuration)}
                  {callState === "ended" && "কল শেষ"}
                </p>
              </div>
            </>
          )}

          {/* Duration overlay on video call */}
          {hasVideo && callState === "connected" && (
            <div className="absolute top-20 left-0 right-0 text-center">
              <p className="text-white font-bold text-lg drop-shadow-lg">{targetUser?.display_name}</p>
              <p className="text-white/80 text-sm">{formatDuration(callDuration)}</p>
            </div>
          )}

          {/* Controls */}
          <div className="w-full max-w-xs">
            {callState === "idle" ? (
              <div className="flex justify-center gap-6">
                <motion.button whileTap={{ scale: 0.9 }} onClick={startCall}
                  className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center shadow-xl shadow-green-500/30">
                  {isVideoCall ? <Video className="w-8 h-8 text-white" /> : <Phone className="w-8 h-8 text-white" />}
                </motion.button>
              </div>
            ) : callState === "ended" ? null : (
              <div className="flex items-center justify-around bg-black/60 backdrop-blur-md rounded-full px-4 py-3">
                {/* Camera toggle */}
                <motion.button whileTap={{ scale: 0.9 }} onClick={toggleCamera}
                  className={`w-14 h-14 rounded-full flex flex-col items-center justify-center gap-0.5 transition-colors ${
                    cameraOn ? "bg-white/20 text-white" : "bg-white/10 text-white/50"
                  }`}>
                  {cameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                  <span className="text-[8px] font-medium">Camera</span>
                </motion.button>

                {/* Mute */}
                <motion.button whileTap={{ scale: 0.9 }} onClick={toggleMute}
                  className={`w-14 h-14 rounded-full flex flex-col items-center justify-center gap-0.5 transition-colors ${
                    isMuted ? "bg-red-500/30 text-red-400" : "bg-white/20 text-white"
                  }`}>
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  <span className="text-[8px] font-medium">{isMuted ? "Unmute" : "Mute"}</span>
                </motion.button>

                {/* End Call */}
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => endCall()}
                  className="w-16 h-16 rounded-full bg-red-600 flex flex-col items-center justify-center gap-0.5 shadow-xl shadow-red-600/30">
                  <PhoneOff className="w-6 h-6 text-white" />
                  <span className="text-[7px] text-white font-medium">End</span>
                </motion.button>

                {/* Speaker */}
                <motion.button whileTap={{ scale: 0.9 }} onClick={toggleSpeaker}
                  className={`w-14 h-14 rounded-full flex flex-col items-center justify-center gap-0.5 transition-colors ${
                    isSpeaker ? "bg-blue-500/30 text-blue-400" : "bg-white/20 text-white"
                  }`}>
                  <Volume2 className="w-5 h-5" />
                  <span className="text-[8px] font-medium">Speaker</span>
                </motion.button>

                {/* Switch camera */}
                {cameraOn && (
                  <motion.button whileTap={{ scale: 0.9 }} onClick={switchCamera}
                    className="w-14 h-14 rounded-full bg-white/20 text-white flex flex-col items-center justify-center gap-0.5">
                    <CameraIcon className="w-5 h-5" />
                    <span className="text-[8px] font-medium">Flip</span>
                  </motion.button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
