import React, { useEffect, useRef, useState } from 'react';
import { 
  Phone, 
  PhoneOff, 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  ShieldCheck, 
  Maximize2, 
  Minimize2, 
  Lock, 
  User, 
  Volume2, 
  VolumeX 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User as UserType, ChatRoom } from '../types.js';

interface CallModalProps {
  isOpen: boolean;
  isVideoCall: boolean;
  roomName: string;
  roomType: 'channel' | 'direct' | 'group' | null;
  activeRoom: ChatRoom | undefined;
  currentUser: UserType | null;
  allUsers: UserType[];
  onClose: () => void;
}

export default function CallModal({
  isOpen,
  isVideoCall,
  roomName,
  roomType,
  activeRoom,
  currentUser,
  allUsers,
  onClose
}: CallModalProps) {
  // Call States: 'connecting' | 'ringing' | 'connected' | 'disconnected'
  const [callState, setCallState] = useState<'connecting' | 'ringing' | 'connected' | 'disconnected'>('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(!isVideoCall);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [secondsElapsed, setSecondsElapsed] = useState(0);

  // Audio nodes and stream refs
  const localStreamRef = useRef<MediaStream | null>(null);
  const videoElemRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ringIntervalRef = useRef<any>(null);
  const progressIntervalRef = useRef<any>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  // Call security fingerprint (simulated E2EE verification code)
  const [securityFingerprint, setSecurityFingerprint] = useState('');

  // Generate safe security fingerprint on open
  useEffect(() => {
    if (isOpen) {
      const parts = [
        Math.floor(100 + Math.random() * 900),
        Math.floor(100 + Math.random() * 900),
        Math.floor(100 + Math.random() * 900)
      ];
      setSecurityFingerprint(parts.join(' - '));
      setCallState('connecting');
      setSecondsElapsed(0);
      setIsMuted(false);
      setIsCameraOff(!isVideoCall);
    }
  }, [isOpen, isVideoCall]);

  // Audio effects synthesizer using native Web Audio API
  const startAudioContext = () => {
    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtxRef.current = new AudioContextClass();
      }
    }
  };

  const playBeepTone = (freq1: number, freq2: number, duration: number) => {
    try {
      startAudioContext();
      const ctx = audioCtxRef.current;
      if (!ctx || ctx.state === 'suspended') return;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.frequency.value = freq1;
      osc2.frequency.value = freq2;

      // Soft envelope to avoid heavy clicks
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.05);
      gainNode.gain.setValueAtTime(0.08, ctx.currentTime + duration - 0.05);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start();
      osc2.start();

      osc1.stop(ctx.currentTime + duration);
      osc2.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn("Web Audio API failed to synthesize tone:", e);
    }
  };

  const playIncomingRingMelody = () => {
    // Standard double rings every 3 seconds
    playBeepTone(440, 480, 0.4);
    setTimeout(() => {
      playBeepTone(440, 480, 0.4);
    }, 600);
  };

  const playSpecialChime = (ascending: boolean) => {
    try {
      startAudioContext();
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const now = ctx.currentTime;
      const notes = ascending ? [523.25, 659.25, 783.99, 1046.50] : [1046.50, 783.99, 659.25, 261.63];
      notes.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.frequency.value = freq;
        gainNode.gain.setValueAtTime(0, now + index * 0.08);
        gainNode.gain.linearRampToValueAtTime(0.06, now + index * 0.08 + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.08 + 0.2);
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        osc.start(now + index * 0.08);
        osc.stop(now + index * 0.08 + 0.25);
      });
    } catch {}
  };

  // Setup streaming camera and audio
  useEffect(() => {
    if (!isOpen) return;

    // Start with ring melody repeating
    startAudioContext();
    
    // Play dial tone immediately
    playBeepTone(350, 440, 0.8);

    // Enter ringing state after dial tone completes
    const connectingTimer = setTimeout(() => {
      setCallState('ringing');
      playIncomingRingMelody();
      ringIntervalRef.current = setInterval(() => {
        playIncomingRingMelody();
      }, 3000);
    }, 1200);

    // Auto-accept call by the secure bot peer after 4 seconds
    const ringingTimer = setTimeout(() => {
      if (ringIntervalRef.current) clearInterval(ringIntervalRef.current);
      setCallState('connected');
      playSpecialChime(true); // Connected success chime
    }, 4500);

    // Request client camera/mic
    const requestMedia = async () => {
      try {
        const constraints = {
          video: isVideoCall ? { width: 640, height: 480, facingMode: 'user' } : false,
          audio: true
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;

        // Try binding video
        if (videoElemRef.current) {
          videoElemRef.current.srcObject = stream;
          videoElemRef.current.play().catch(err => console.log('video autoplay blocked', err));
        }

        // Setup oscilloscope canvas
        if (canvasRef.current) {
          startOscilloscope(stream);
        }
      } catch (err) {
        console.warn("Media capture denied or unsupported. Falling back to crypto initials avatar.", err);
      }
    };

    requestMedia();

    return () => {
      clearTimeout(connectingTimer);
      clearTimeout(ringingTimer);
      if (ringIntervalRef.current) clearInterval(ringIntervalRef.current);
      stopMedia();
    };
  }, [isOpen, isVideoCall]);

  // Handle call timer count
  useEffect(() => {
    if (callState === 'connected') {
      progressIntervalRef.current = setInterval(() => {
        setSecondsElapsed(prev => prev + 1);
      }, 1000);
    } else {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    }
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [callState]);

  // Microphone state monitoring dynamically halts stream tracks
  useEffect(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });
    }
  }, [isMuted]);

  // Camera stream track toggle
  useEffect(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !isCameraOff;
      });
    }
  }, [isCameraOff]);

  const startOscilloscope = (stream: MediaStream) => {
    try {
      const audioClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioClass) return;
      
      const audioCtx = audioCtxRef.current || new audioClass();
      audioCtxRef.current = audioCtx;
      
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const canvasCtx = canvas.getContext('2d');
      if (!canvasCtx) return;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        if (!canvasRef.current) return;
        animationFrameIdRef.current = requestAnimationFrame(draw);

        analyser.getByteTimeDomainData(dataArray);

        canvasCtx.fillStyle = 'rgba(15, 23, 42, 0.45)'; // Sleek transparent slate
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

        canvasCtx.lineWidth = 2.5;
        canvasCtx.strokeStyle = '#6264A7'; // Teams purple
        canvasCtx.beginPath();

        const sliceWidth = canvas.width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * canvas.height) / 2;

          if (i === 0) {
            canvasCtx.moveTo(x, y);
          } else {
            canvasCtx.lineTo(x, y);
          }

          x += sliceWidth;
        }

        canvasCtx.lineTo(canvas.width, canvas.height / 2);
        canvasCtx.stroke();
      };

      draw();
    } catch (e) {
      console.warn("Scope fail:", e);
    }
  };

  const stopMedia = () => {
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (videoElemRef.current) {
      videoElemRef.current.srcObject = null;
    }
  };

  const handleEndCall = () => {
    if (ringIntervalRef.current) clearInterval(ringIntervalRef.current);
    setCallState('disconnected');
    playSpecialChime(false); // Disconnect chime
    stopMedia();
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  const formatTime = (secs: number) => {
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  };

  // Pick suitable caller details
  const initials = roomName ? roomName.slice(0, 2).toUpperCase() : 'CO';

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[9999] bg-[#0c0d14]/90 backdrop-blur-md flex items-center justify-center p-4 selection:bg-[#6264A7] selection:text-white"
        id="call-overlay"
      >
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className={`w-full max-w-4xl bg-[#11121d] border border-slate-800 rounded-2xl overflow-hidden flex flex-col shadow-2xl relative ${
            isFullscreen ? 'fixed inset-0 max-w-none h-screen rounded-none border-0' : 'h-[550px]'
          }`}
          id="call-card"
        >
          {/* Header Bar */}
          <div className="h-14 bg-[#141524] border-b border-slate-800 px-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <div className="flex items-center gap-1.5 text-xs text-slate-400 select-none">
                <span className="font-bold uppercase tracking-wider text-[#6264A7]">Secure Line</span>
                <span>•</span>
                <span className="font-mono text-[10px] bg-slate-800 text-slate-350 px-2 py-0.5 rounded border border-slate-700 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-emerald-400" /> AES-GCM-256 E2EE
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Mode"}
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Main Visual Display */}
          <div className="flex-1 bg-[#090a0f] p-6 relative flex flex-col md:flex-row gap-6 items-center justify-center min-h-0 overflow-y-auto">
            
            {/* Connecting/Ringing Overlay details */}
            {(callState === 'connecting' || callState === 'ringing') && (
              <div className="absolute inset-0 z-55 bg-[#090a0f] flex flex-col items-center justify-center text-center p-6 bg-radial from-[#121323] to-[#090a0f]">
                <div className="relative mb-6">
                  <div className="w-24 h-24 rounded-full bg-indigo-500/10 border border-[#6264A7]/50 flex items-center justify-center animate-pulse">
                    <Phone className="w-10 h-10 text-[#6264A7] animate-bounce" />
                  </div>
                  <div className="absolute inset-0 rounded-full border border-[#6264A7] animate-ping opacity-25" />
                </div>

                <div className="text-xl font-bold text-slate-100 tracking-tight mb-2">
                  {callState === 'connecting' ? 'Initiating Secure Tunnel...' : 'Ringing Secure Node...'}
                </div>
                <div className="text-base text-[#6264A7] font-semibold mb-6">
                  {roomName}
                </div>
                
                {/* Fingerprint key code */}
                <div className="bg-[#121320] border border-[#6264A7]/30 text-[#6264A7] px-4 py-3 rounded-lg text-xs font-mono max-w-sm">
                  <div className="font-sans text-[10px] uppercase font-bold tracking-widest text-[#6264A7]/70 mb-1">
                    Verifying Identity Signatures
                  </div>
                  <div>Fingerprint: {securityFingerprint}</div>
                </div>
              </div>
            )}

            {/* Disconnected Notification Overlay */}
            {callState === 'disconnected' && (
              <div className="absolute inset-0 z-50 bg-[#090a0f] flex flex-col items-center justify-center text-center p-6">
                <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-4">
                  <PhoneOff className="w-7 h-7 text-red-500" />
                </div>
                <div className="text-lg font-bold text-slate-100 mb-1">Secure Line Disconnected</div>
                <div className="text-xs text-slate-400">Handshake terminated safely. Cleared symmetric buffer keys.</div>
              </div>
            )}

            {/* Visual Stream Panes (connected state) */}
            {callState === 'connected' && (
              <div className="w-full h-full flex flex-col md:flex-row gap-6 relative min-h-0">
                
                {/* Local Client Stream Video (or initial placeholder) */}
                <div className="flex-1 bg-[#121322] border border-slate-800 rounded-xl overflow-hidden relative flex flex-col items-center justify-center group shadow-md min-h-[160px] md:min-h-0">
                  
                  {isCameraOff ? (
                    <div className="flex flex-col items-center justify-center text-center">
                      <div className="w-20 h-20 rounded-full bg-[#6264A7]/10 border border-[#6264A7]/30 flex items-center justify-center text-xl font-bold text-[#6264A7] mb-3 select-none shadow-inner">
                        {currentUser?.name?.slice(0, 2).toUpperCase() || 'ME'}
                      </div>
                      <span className="text-xs text-slate-300 font-bold tracking-wide">
                        {currentUser?.name || 'Local Participant'}
                      </span>
                      <span className="text-[10px] text-slate-500 mt-1 font-mono">
                        (Your camera is off)
                      </span>
                    </div>
                  ) : (
                    <video 
                      ref={videoElemRef} 
                      className="w-full h-full object-cover rounded-xl"
                      muted
                      playsInline
                    />
                  )}

                  {/* Top-Right Label Overlay */}
                  <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-xs text-[10px] font-bold text-slate-200 px-2.5 py-1 rounded-md border border-slate-700/60 flex items-center gap-1.5">
                    <User className="w-3 h-3 text-[#6264A7]" /> Me (Secure Client)
                  </div>

                  {/* Real-time speech oscilloscope inside the local box */}
                  <div className="absolute bottom-3 right-3 left-3 h-10 bg-slate-950/70 border border-slate-800 rounded-lg overflow-hidden flex items-center justify-between px-3">
                    <span className="text-[10px] text-slate-400 font-semibold truncate max-w-[120px]">
                      {isMuted ? 'Muted' : 'Mic Stream'}
                    </span>
                    <div className="w-32 h-6 overflow-hidden rounded bg-[#090a0f] border border-slate-800/80">
                      {isMuted ? (
                        <div className="w-full h-full flex items-center justify-center text-[9px] text-red-500 font-mono">
                          MUTED TRACK
                        </div>
                      ) : (
                        <canvas ref={canvasRef} width={128} height={24} className="w-full h-full" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Remote Peer/Channel Active Stream Visualization */}
                <div className="flex-1 bg-[#121322] border border-slate-800 rounded-xl overflow-hidden relative flex flex-col items-center justify-center group shadow-md min-h-[160px] md:min-h-0">
                  
                  {/* Since other peer is remote robot or company partner, we simulate a stunning network visualizer block */}
                  <div className="flex flex-col items-center justify-center text-center p-4">
                    <div className="relative mb-4">
                      
                      {/* Pulse active animated circles */}
                      <div className="absolute -inset-2.5 rounded-full border border-indigo-400/20 animate-ping" />
                      <div className="absolute -inset-5 rounded-full border border-emerald-400/10 animate-pulse" />
                      
                      <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center text-xl font-bold text-emerald-400 select-none shadow-md">
                        {initials}
                      </div>
                    </div>

                    <span className="text-xs text-slate-200 font-bold tracking-wide flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      {roomName}
                    </span>

                    <span className="text-[10.5px] text-slate-400 mt-2 max-w-[240px] text-center leading-normal">
                      Symmetric E2EE cluster connection established. Synchronizing session media frame buffers.
                    </span>

                    {/* Fun moving waveform mockup */}
                    <div className="flex items-end gap-1 h-6 mt-4">
                      {[1, 2, 3, 4, 5, 4, 3, 2, 1, 3, 5, 6, 4, 2, 4, 5, 3, 1].map((val, i) => (
                        <motion.div 
                          key={i}
                          animate={{ height: isSpeakerMuted ? 2 : [val * 3, val * 4, val * 3] }}
                          transition={{ repeat: Infinity, duration: 0.5 + Math.random() * 0.4, ease: "easeInOut" }}
                          className="w-1 bg-[#6264A7] rounded-xs"
                          style={{ height: val * 3 }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Top-Right Label Overlay */}
                  <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-xs text-[10px] font-bold text-slate-200 px-2.5 py-1 rounded-md border border-slate-700/60 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> E2EE Handshake Verified
                  </div>

                  {/* Timer display */}
                  <div className="absolute bottom-3 right-3 bg-slate-950/80 border border-slate-800 text-[10px] font-mono text-emerald-400 font-bold px-2 px-3 py-1.5 rounded-lg flex items-center gap-2 select-none shadow-lg">
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>SECURE: {formatTime(secondsElapsed)}</span>
                  </div>
                </div>

              </div>
            )}

          </div>

          {/* Controls Dock */}
          <div className="h-24 bg-[#141524] border-t border-slate-800 px-6 flex items-center justify-between shrink-0">
            
            {/* Show Fingerprint Verification in bottom corner on large screens */}
            <div className="hidden md:flex flex-col text-left gap-0.5">
              <span className="text-[9.5px] text-slate-500 font-bold tracking-widest uppercase">E2EE Handshake fingerprint</span>
              <span className="text-xs text-[#6264A7] font-mono font-bold tracking-tighter select-all">{securityFingerprint || 'PENDING...'}</span>
            </div>

            {/* Central Controls Dock Buttons */}
            <div className="flex items-center gap-4.5 mx-auto">
              {/* Mic Track Toggle */}
              <button
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                  isMuted 
                    ? 'bg-red-500/20 text-red-500 border border-red-500/40 hover:bg-red-500/30' 
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                }`}
                title={isMuted ? "Unmute Mic" : "Mute Mic"}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              {/* Video Camera Toggle */}
              <button
                type="button"
                onClick={() => setIsCameraOff(!isCameraOff)}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                  isCameraOff 
                    ? 'bg-red-500/20 text-red-500 border border-red-500/40 hover:bg-red-500/30' 
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                }`}
                title={isCameraOff ? "Turn Video On" : "Turn Video Off"}
              >
                {isCameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </button>

              {/* Speaker Output Volume Toggle */}
              <button
                type="button"
                onClick={() => setIsSpeakerMuted(!isSpeakerMuted)}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                  isSpeakerMuted 
                    ? 'bg-red-500/20 text-red-500 border border-red-500/40 hover:bg-red-500/30' 
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                }`}
                title={isSpeakerMuted ? "Unmute Speaker" : "Mute Speaker"}
              >
                {isSpeakerMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>

              {/* BIG RED HANGUP BUTTON */}
              <button
                type="button"
                onClick={handleEndCall}
                className="w-14 h-14 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-700 active:scale-95 transition-all shadow-lg hover:shadow-red-900/30 font-bold border-2 border-red-500/20 ml-2"
                title="Hang up Call"
                id="btn-hangup"
              >
                <PhoneOff className="w-6 h-6 transform rotate-135" />
              </button>
            </div>

            {/* Cryptographic Key Strength Rating badge on right side */}
            <div className="hidden md:flex flex-col text-right gap-0.5">
              <span className="text-[9.5px] text-slate-500 font-bold tracking-widest uppercase">Verified Connection</span>
              <span className="text-xs text-emerald-500 font-bold flex items-center gap-1 justify-end">
                <ShieldCheck className="w-3.5 h-3.5" /> SECURED PEER-TO-PEER
              </span>
            </div>

          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
}
