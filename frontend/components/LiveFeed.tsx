"use client";

import { useRef, useEffect, useCallback, useState } from "react";

interface LiveFeedProps {
  onFrame: (base64Frame: string) => void;
  onAudioChunk?: (base64Audio: string) => void;
  isActive: boolean;
  frameRate?: number;
}

export default function LiveFeed({
  onFrame,
  onAudioChunk,
  isActive,
  frameRate = 5,
}: LiveFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: true,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!isActive || !onAudioChunk) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const float32Array = new Float32Array(inputData);
        const buffer = float32Array.buffer;
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        onAudioChunk(base64);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
      setHasPermission(true);
      setError(null);
    } catch (err) {
      setHasPermission(false);
      setError(
        err instanceof Error ? err.message : "Failed to access camera/microphone"
      );
    }
  }, [isActive, onAudioChunk]);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    const base64 = dataUrl.split(",")[1];
    onFrame(base64);
  }, [onFrame]);

  useEffect(() => {
    if (isActive) {
      startCamera();
    } else {
      stopCamera();
    }
    return stopCamera;
  }, [isActive, startCamera, stopCamera]);

  useEffect(() => {
    if (isActive && hasPermission) {
      intervalRef.current = setInterval(captureFrame, 1000 / frameRate);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, hasPermission, captureFrame, frameRate]);

  return (
    <div className="relative rounded-xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)' }}>
      <video
        ref={videoRef}
        className="w-full h-auto"
        style={{ transform: "scaleX(-1)" }}
        playsInline
        muted
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Corner brackets overlay */}
      {isActive && hasPermission && (
        <>
          <div className="absolute inset-3 pointer-events-none z-10">
            {/* Top-left */}
            <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-emerald-400/50 rounded-tl" />
            {/* Top-right */}
            <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-emerald-400/50 rounded-tr" />
            {/* Bottom-left */}
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-emerald-400/50 rounded-bl" />
            {/* Bottom-right */}
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-emerald-400/50 rounded-br" />
          </div>

          {/* Scan line */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
            <div className="w-full h-[2px] bg-gradient-to-r from-transparent via-emerald-400/20 to-transparent animate-scan" />
          </div>
        </>
      )}

      {/* LIVE indicator */}
      {isActive && hasPermission && (
        <div className="absolute top-3 left-3 flex items-center gap-2 z-20">
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-red-500 animate-ping opacity-75" />
          </div>
          <span className="text-[10px] text-white font-bold tracking-[0.15em] uppercase bg-black/40 px-2 py-0.5 rounded-md backdrop-blur-sm">
            Live
          </span>
        </div>
      )}

      {/* Inactive overlay */}
      {!isActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center backdrop-blur-sm" style={{ background: 'rgba(6,7,10,0.85)' }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <svg className="w-5 h-5" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Camera inactive</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>Start a session to begin</p>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center backdrop-blur-sm" style={{ background: 'rgba(6,7,10,0.9)' }}>
          <div className="text-center p-6">
            <p className="text-sm font-medium" style={{ color: 'var(--accent-red)' }}>Camera Error</p>
            <p className="text-xs mt-1 max-w-[200px]" style={{ color: 'var(--text-muted)' }}>{error}</p>
            <button type="button" onClick={startCamera} className="mt-3 btn-primary text-xs px-4 py-2">
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
    </div>
  );
}
