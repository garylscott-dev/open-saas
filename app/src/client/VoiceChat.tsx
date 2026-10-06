import React, { useState, useEffect, useRef } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useRoomContext,
  useLocalParticipant,
  useTrackVolume,
  useAudioPlayback,
} from '@livekit/components-react';
import { Track, RoomEvent, LocalAudioTrack, RemoteAudioTrack } from 'livekit-client';
import { Mic, MicOff, RefreshCw, PhoneOff, PhoneCall, Radio, MessageSquare, Volume2, Sparkles, Check, AlertCircle } from 'lucide-react';
import { useAuth } from 'wasp/client/auth';

interface VoiceDashboardProps {
  onDisconnect: () => void;
  onReconnect: () => void;
}

function VoiceDashboard({ onDisconnect, onReconnect }: VoiceDashboardProps) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const { canPlayAudio, startAudio } = useAudioPlayback(room);

  const [agentState, setAgentState] = useState<'initializing' | 'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [userState, setUserState] = useState<'speaking' | 'listening' | 'away'>('listening');
  const [micError, setMicError] = useState<string>('');
  const [transcripts, setTranscripts] = useState<Array<{ id: string; speaker: 'user' | 'agent'; text: string; timestamp: Date }>>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-enable microphone and unblock audio on connect
  useEffect(() => {
    if (localParticipant) {
      localParticipant
        .setMicrophoneEnabled(true)
        .then(() => {
          setMicError('');
        })
        .catch((err: any) => {
          console.warn('Microphone permission request:', err);
          setMicError(err?.message || 'Microphone could not be enabled');
        });
    }
    if (room) {
      room.startAudio().catch(() => {});
    }
  }, [localParticipant, room]);

  const isMicMuted = localParticipant ? !localParticipant.isMicrophoneEnabled : false;

  const toggleMute = async () => {
    if (localParticipant) {
      try {
        const currentlyEnabled = localParticipant.isMicrophoneEnabled;
        await localParticipant.setMicrophoneEnabled(!currentlyEnabled);
        setMicError('');
        if (!currentlyEnabled && room) {
          await room.startAudio().catch(() => {});
        }
      } catch (err: any) {
        console.error('Toggle mic error:', err);
        setMicError(err?.message || 'Failed to toggle microphone');
      }
    }
  };

  const handleReconnect = () => {
    onReconnect();
  };

  // Load conversation history from DB when connecting
  useEffect(() => {
    fetch('/api/voice/messages')
      .then((res) => {
        if (res.ok) return res.json();
        return [];
      })
      .then((messages) => {
        if (Array.isArray(messages) && messages.length > 0) {
          const loaded = messages.map((m: any) => ({
            id: m.id || `msg-${m.createdAt}-${Math.random()}`,
            speaker: (m.role === 'user' ? 'user' : 'agent') as 'user' | 'agent',
            text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            timestamp: new Date(m.createdAt || Date.now()),
          }));
          setTranscripts(loaded);
        }
      })
      .catch((err) => console.error('Failed to load past conversation messages:', err));
  }, []);

  // Listen for data channel events from the agent
  useEffect(() => {
    if (!room) return;

    const handleData = (payload: Uint8Array, _participant?: any, _kind?: any, _topic?: string) => {
      try {
        const decoder = new TextDecoder();
        const str = decoder.decode(payload);
        const data = JSON.parse(str);

        if (data.type === 'agent_state') {
          setAgentState(data.state);
        } else if (data.type === 'user_state') {
          setUserState(data.state);
        } else if (data.type === 'transcript') {
          let text = data.text;
          if (Array.isArray(text)) {
            text = text.join(' ');
          } else if (typeof text !== 'string') {
            text = String(text || '');
          }

          text = text.trim();
          if (!text) return;

          setTranscripts((prev) => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg && lastMsg.speaker === data.speaker && lastMsg.text === text) {
              return prev;
            }

            const newMsg = {
              id: `${data.speaker}-${Date.now()}-${Math.random()}`,
              speaker: data.speaker,
              text: text,
              timestamp: new Date(),
            };
            return [...prev, newMsg];
          });
        }
      } catch (err) {
        console.error('Failed to parse data channel message:', err);
      }
    };

    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room]);

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  // Get audio track references for volume levels
  const localMicTrack = localParticipant?.getTrackPublication(Track.Source.Microphone)?.track;

  const remoteParticipants = Array.from(room.remoteParticipants.values());
  const agentParticipant = remoteParticipants.find(
    (p) => p.identity.startsWith('agent') || (p as any).isAgent
  ) || remoteParticipants[0];
  const agentAudioTrack = agentParticipant?.getTrackPublication(Track.Source.Microphone)?.track;

  const localVolume = useTrackVolume(localMicTrack as LocalAudioTrack | undefined);
  const agentVolume = useTrackVolume(agentAudioTrack as RemoteAudioTrack | undefined);

  const localVolumePercentage = Math.round((localVolume || 0) * 100);
  const agentVolumePercentage = Math.round((agentVolume || 0) * 100);

  // Connection State Badge Styling
  const getBadgeConfig = () => {
    switch (agentState) {
      case 'speaking':
        return { text: 'SPEAKING', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30 shadow-[0_0_10px_rgba(168,85,247,0.1)]', dotClass: 'bg-purple-400 animate-ping' };
      case 'thinking':
        return { text: 'THINKING', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.1)]', dotClass: 'bg-cyan-400 animate-pulse' };
      case 'listening':
        return { text: 'LISTENING', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.1)]', dotClass: 'bg-emerald-400 animate-ping' };
      default:
        return { text: 'CONNECTED', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30', dotClass: 'bg-indigo-400' };
    }
  };

  const badge = getBadgeConfig();

  return (
    <div
      onClick={() => {
        if (!canPlayAudio) {
          startAudio();
          room.startAudio().catch(() => {});
        }
      }}
      className="w-full max-w-2xl mx-auto flex flex-col gap-6 p-6 rounded-2xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-xl shadow-2xl"
    >
      {/* Audio Playback Warning Banner if browser blocked autoplay */}
      {!canPlayAudio && (
        <button
          onClick={async (e) => {
            e.stopPropagation();
            await startAudio();
            await room.startAudio().catch(() => {});
          }}
          className="w-full py-3 px-4 bg-amber-500/20 border border-amber-500/40 text-amber-300 font-semibold rounded-xl flex items-center justify-center gap-2 animate-pulse hover:bg-amber-500/30 transition-all cursor-pointer shadow-lg shadow-amber-500/10"
        >
          <Volume2 className="w-5 h-5 text-amber-400" />
          <span>Click here to enable assistant audio (browser autoplay is paused)</span>
        </button>
      )}

      {/* Microphone Error Warning Banner */}
      {micError && (
        <div className="w-full py-3 px-4 bg-red-500/20 border border-red-500/40 text-red-300 rounded-xl flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <MicOff className="w-4 h-4 text-red-400 shrink-0" />
            <span>Microphone unavailable: {micError}</span>
          </div>
          <button
            onClick={async (e) => {
              e.stopPropagation();
              try {
                await localParticipant?.setMicrophoneEnabled(true);
                setMicError('');
              } catch (err: any) {
                setMicError(err?.message || 'Failed to enable microphone');
              }
            }}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg shrink-0 cursor-pointer"
          >
            Retry Mic
          </button>
        </div>
      )}

      {/* Header Info */}
      <div className="flex items-center justify-between border-b border-slate-850 pb-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-3 w-3">
            <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${badge.dotClass}`}></span>
            <span className={`relative inline-flex rounded-full h-3 w-3 ${badge.dotClass.split(' ')[0]}`}></span>
          </div>
          <div className="text-left">
            <h2 className="font-semibold text-slate-200 tracking-wide text-sm md:text-base">Alpha Voice Session</h2>
            <p className="text-[10px] md:text-xs text-slate-400">Room: {room.name}</p>
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-semibold border ${badge.color}`}>
          {badge.text}
        </div>
      </div>

      {/* Visual Orb representation */}
      <div className="flex flex-col items-center justify-center py-10 relative">
        <div className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500 ease-out shadow-2xl relative
          ${agentState === 'speaking' ? 'bg-gradient-to-tr from-purple-600 to-indigo-600 ring-8 ring-purple-500/20 scale-110 shadow-purple-500/40' :
            agentState === 'thinking' ? 'bg-gradient-to-tr from-cyan-600 to-blue-600 ring-8 ring-cyan-500/20 animate-pulse shadow-cyan-500/40' :
            agentState === 'listening' ? 'bg-gradient-to-tr from-emerald-600 to-teal-600 ring-8 ring-emerald-500/20 scale-105 shadow-emerald-500/40' :
            'bg-gradient-to-tr from-indigo-700 to-slate-800 shadow-indigo-500/20'}`}
        >
          <Radio className={`w-12 h-12 text-white opacity-85 ${agentState === 'speaking' ? 'animate-bounce' : agentState === 'thinking' ? 'animate-spin' : ''}`} />
          {agentState === 'speaking' && (
            <>
              <div className="absolute inset-0 rounded-full bg-purple-500/10 animate-ping -z-10 duration-1000"></div>
              <div className="absolute -inset-4 rounded-full bg-purple-500/5 animate-ping -z-10 duration-700"></div>
            </>
          )}
          {agentState === 'listening' && (
            <div className="absolute inset-0 rounded-full bg-emerald-500/10 animate-ping -z-10 duration-1000"></div>
          )}
        </div>
        <p className="mt-4 text-xs font-medium tracking-wide text-slate-400 transition-all">
          {agentState === 'speaking' ? 'Agent is speaking...' :
           agentState === 'thinking' ? 'Agent is thinking...' :
           agentState === 'listening' ? 'Listening to your voice... Speak now!' :
           'Assistant connected and ready.'}
        </p>
      </div>

      {/* Audio Level Indicators */}
      <div className="grid grid-cols-2 gap-4 bg-slate-950/40 border border-slate-850 rounded-xl p-4">
        <div className="flex flex-col gap-1.5 text-left">
          <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">Your Mic Level</span>
          <div className="flex items-center gap-2">
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-full transition-all duration-75 rounded-full"
                style={{ width: `${isMicMuted ? 0 : Math.max(localVolumePercentage, localMicTrack ? 5 : 0)}%` }}
              ></div>
            </div>
            <span className="text-[11px] font-mono text-slate-400 w-12 text-right">
              {isMicMuted ? 'Muted' : !localMicTrack ? 'No Mic' : `${localVolumePercentage}%`}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 text-left">
          <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">Agent Voice Level</span>
          <div className="flex items-center gap-2">
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-purple-500 h-full transition-all duration-75 rounded-full"
                style={{ width: `${Math.max(agentVolumePercentage, agentState === 'speaking' ? 40 : 0)}%` }}
              ></div>
            </div>
            <span className="text-[11px] font-mono text-slate-400 w-12 text-right">{agentVolumePercentage}%</span>
          </div>
        </div>
      </div>

      {/* Transcript Screen */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-350 text-left">
          <MessageSquare className="w-4 h-4 text-slate-400" />
          <span>Live Conversation History</span>
        </div>
        <div className="w-full h-48 overflow-y-auto rounded-xl border border-slate-800/60 bg-slate-950/70 p-4 flex flex-col gap-3 scrollbar-thin">
          {transcripts.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-xs italic">
              Say something like "Hello, what can you do?"...
            </div>
          ) : (
            transcripts.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col max-w-[80%] rounded-2xl px-4 py-2.5 text-sm text-left ${
                  msg.speaker === 'user'
                    ? 'self-end bg-indigo-600 text-white rounded-br-none shadow-md shadow-indigo-600/10'
                    : 'self-start bg-slate-800 text-slate-100 rounded-bl-none border border-slate-700/40 shadow-md shadow-slate-950/20'
                }`}
              >
                <span className="text-[10px] font-bold tracking-wide uppercase opacity-60 mb-0.5 self-start">
                  {msg.speaker === 'user' ? 'You' : 'Assistant'}
                </span>
                <span className="leading-relaxed">{msg.text}</span>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex flex-wrap md:flex-nowrap items-center justify-between border-t border-slate-850 pt-4 gap-4">
        <button
          onClick={toggleMute}
          className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold tracking-wide transition-all cursor-pointer
            ${isMicMuted
              ? 'bg-red-500/15 border-red-500/30 text-red-400 hover:bg-red-500/20 shadow-red-500/5 shadow-inner'
              : 'bg-slate-800/50 border-slate-700/60 text-slate-200 hover:bg-slate-800 hover:text-white'}`}
        >
          {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-emerald-400" />}
          <span>{isMicMuted ? 'Unmute Mic' : 'Mute Mic'}</span>
        </button>

        <button
          onClick={handleReconnect}
          className="flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-700/60 bg-slate-800/50 text-slate-200 text-sm font-semibold tracking-wide hover:bg-slate-800 hover:text-white transition-all cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Reconnect</span>
        </button>

        <button
          onClick={onDisconnect}
          className="flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold tracking-wide hover:bg-red-700 shadow-lg shadow-red-600/20 hover:shadow-red-700/30 transition-all cursor-pointer"
        >
          <PhoneOff className="w-4 h-4" />
          <span>Disconnect</span>
        </button>
      </div>
    </div>
  );
}

export function VoiceChat({ initialConnect = false }: { initialConnect?: boolean }) {
  const [isConnected, setIsConnected] = useState(() => {
    if (initialConnect) return true;
    if (typeof window !== 'undefined' && window.location.search.includes('autoConnect=true')) {
      return true;
    }
    return false;
  });
  const [token, setToken] = useState('');
  const [error, setError] = useState('');

  const { data: user } = useAuth();
  const [wakeWord, setWakeWord] = useState('hey Jarvis');
  const [isWakeWordActive, setIsWakeWordActive] = useState(false);
  const [isSavingWakeWord, setIsSavingWakeWord] = useState(false);
  const [isListeningForWakeWord, setIsListeningForWakeWord] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Fetch custom wake word from server if user is logged in
  useEffect(() => {
    if (user) {
      fetch('/api/voice/wakeword')
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error('Failed to fetch wake word');
        })
        .then((data) => {
          if (data.wakeWord) {
            setWakeWord(data.wakeWord);
          }
        })
        .catch((err) => console.error('Error fetching wake word:', err));
    }
  }, [user]);

  const saveWakeWord = async (newWord: string) => {
    setIsSavingWakeWord(true);
    try {
      const res = await fetch('/api/voice/wakeword', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wakeWord: newWord }),
      });
      if (res.ok) {
        console.log('Wake word saved successfully:', newWord);
      }
    } catch (err) {
      console.error('Error saving wake word:', err);
    } finally {
      setIsSavingWakeWord(false);
    }
  };

  // Local wake word speech recognition engine
  useEffect(() => {
    if (isConnected || !isWakeWordActive) {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
        recognitionRef.current = null;
        setIsListeningForWakeWord(false);
      }
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition is not supported in this browser.');
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    recognitionRef.current = rec;

    rec.onstart = () => {
      setIsListeningForWakeWord(true);
    };

    rec.onresult = (event: any) => {
      if (!event?.results || event.results.length === 0) return;
      const result = event.results[event.results.length - 1];
      if (!result || !result[0]) return;
      const text = result[0].transcript.toLowerCase().trim();
      console.log(`[WakeWord] Heard phrase: "${text}"`);
      
      const targetPhrase = wakeWord.toLowerCase().trim();
      if (text.includes(targetPhrase)) {
        console.log(`[WakeWord] MATCH DETECTED for "${targetPhrase}"! Connecting voice assistant...`);
        rec.onend = null;
        rec.stop();
        recognitionRef.current = null;
        setIsListeningForWakeWord(false);
        handleConnect();
      }
    };

    rec.onerror = (e: any) => {
      console.error('[WakeWord] SpeechRecognition error:', e);
    };

    rec.onend = () => {
      setIsListeningForWakeWord(false);
      if (isWakeWordActive && !isConnected) {
        try {
          rec.start();
        } catch (err) {
          console.error('[WakeWord] Failed to restart:', err);
        }
      }
    };

    try {
      rec.start();
    } catch (err) {
      console.error('[WakeWord] Start failed:', err);
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
        recognitionRef.current = null;
        setIsListeningForWakeWord(false);
      }
    };
  }, [isConnected, isWakeWordActive, wakeWord]);

  const getDynamicLiveKitUrl = () => {
    if (typeof window !== 'undefined') {
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return `ws://localhost:7880`;
      }
      return `ws://${window.location.hostname}:7880`;
    }
    return `ws://localhost:7880`;
  };

  const liveKitUrl = getDynamicLiveKitUrl();

  useEffect(() => {
    if (!isConnected) {
      setToken('');
      setError('');
      return;
    }

    let isMounted = true;
    async function fetchToken() {
      try {
        const res = await fetch(`/api/voice/token`);
        if (!res.ok) {
          throw new Error(`HTTP error status: ${res.status}`);
        }
        const data = await res.json();
        if (isMounted) {
          if (data.token) {
            setToken(data.token);
          } else {
            setError('No token returned from server');
          }
        }
      } catch (err) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Failed to fetch token';
          console.error('Token fetch error:', err);
          setError(msg);
        }
      }
    }

    fetchToken();
    return () => {
      isMounted = false;
    };
  }, [isConnected]);

  const isSecureOrigin =
    typeof window !== 'undefined'
      ? window.isSecureContext ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'
      : true;

  const handleConnect = async () => {
    setError('');

    // Check mediaDevices support
    if (typeof navigator !== 'undefined' && (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)) {
      setError(
        `Microphone is unavailable: Chrome blocks microphone access on HTTP IP addresses (${window.location.origin}). ` +
        `To use microphone from another device on your network: in Chrome, go to chrome://flags/#unsafely-treat-insecure-origin-as-secure, ` +
        `add "${window.location.origin}", set to Enabled, and click Relaunch.`
      );
      return;
    }

    // Explicitly request mic permission during the user gesture click!
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch (err: any) {
      console.error('Microphone access denied:', err);
      setError(
        `Microphone access was denied: ${err?.message || 'Permission denied'}. ` +
        `Please allow microphone access in your browser address bar.`
      );
      return;
    }

    setIsConnected(true);
  };

  const handleDisconnect = () => {
    setIsConnected(false);
  };

  const handleReconnect = () => {
    setIsConnected(false);
    setToken('');
    setTimeout(() => {
      setIsConnected(true);
    }, 200);
  };

  if (!isConnected) {
    return (
      <div className="w-full max-w-md mx-auto flex flex-col items-center justify-center p-8 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl shadow-2xl text-center gap-6">
        <div className="w-16 h-16 rounded-full bg-indigo-600/10 flex items-center justify-center border border-indigo-500/20 text-indigo-400 animate-pulse animate-duration-1000">
          <Radio className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-100 tracking-wide">Alpha Voice Assistant</h2>
          <p className="text-sm text-slate-400 mt-2 max-w-sm">
            Experience low-latency, real-time voice conversations with the Alpha conversational model.
          </p>
        </div>
        <button
          onClick={handleConnect}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 hover:shadow-indigo-700/30 transition-all cursor-pointer"
        >
          <PhoneCall className="w-4 h-4" />
          <span>Connect Voice Assistant</span>
        </button>

        {/* Warning if running in non-secure context on remote browser */}
        {!isSecureOrigin && (
          <div className="w-full p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-left text-xs text-amber-300 flex flex-col gap-1.5">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Network IP Notice: Chrome Mic Permission</span>
            </div>
            <p className="text-[11px] text-slate-300">
              You are accessing via <span className="font-mono text-amber-200">{typeof window !== 'undefined' ? window.location.origin : ''}</span>. Chrome blocks microphone access on non-localhost HTTP.
            </p>
            <p className="text-[11px] text-slate-300">
              <strong>To allow mic in Chrome:</strong> Open <span className="font-mono bg-slate-950 px-1 py-0.5 rounded text-amber-200">chrome://flags/#unsafely-treat-insecure-origin-as-secure</span>, add this origin, set to <strong>Enabled</strong>, and relaunch.
            </p>
          </div>
        )}

        {/* Wake Word Activation Settings */}
        <div className="w-full border-t border-slate-850/80 pt-5 mt-2 text-left flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-semibold text-slate-200">Voice Wake Word</span>
            </div>
            <button
              onClick={() => setIsWakeWordActive(prev => !prev)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                isWakeWordActive ? 'bg-indigo-600' : 'bg-slate-800'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isWakeWordActive ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {isWakeWordActive && (
            <div className="flex flex-col gap-3 animate-fadeIn duration-200">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <p className="text-xs text-slate-400">
                  {isListeningForWakeWord ? `Always listening for: "${wakeWord}"` : 'Starting wake-word engine...'}
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={wakeWord}
                  onChange={(e) => setWakeWord(e.target.value)}
                  placeholder="e.g. hey Jarvis"
                  className="flex-1 px-3 py-2 bg-slate-950/60 border border-slate-850 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <button
                  onClick={() => saveWakeWord(wakeWord)}
                  disabled={isSavingWakeWord}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-indigo-600/10"
                >
                  {isSavingWakeWord ? 'Saving...' : <><Check className="w-3.5 h-3.5" /> Save</>}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 italic">
                You can say "{wakeWord}" to wake up the assistant automatically.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-md mx-auto flex flex-col items-center justify-center p-6 rounded-2xl border border-red-950 bg-red-950/20 backdrop-blur-xl shadow-2xl text-center gap-4">
        <div className="text-red-400 text-sm font-semibold flex items-center justify-center gap-1.5">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span>Connection Error</span>
        </div>
        <div className="text-xs text-red-400 max-w-xs">{error}</div>
        <button
          onClick={handleDisconnect}
          className="px-4 py-2 bg-slate-800 text-slate-200 text-xs font-semibold rounded-lg hover:bg-slate-700 transition-all cursor-pointer"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="w-full max-w-md mx-auto flex flex-col items-center justify-center p-8 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl shadow-2xl text-center gap-6">
        <div className="w-12 h-12 rounded-full border border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
        <div className="text-sm text-indigo-400 font-medium animate-pulse">
          Connecting to Alpha Voice Service...
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={liveKitUrl}
      token={token}
      connect={true}
      audio={true}
      video={false}
      className="flex flex-col items-center justify-center gap-4 w-full"
    >
      <VoiceDashboard onDisconnect={handleDisconnect} onReconnect={handleReconnect} />
      <RoomAudioRenderer />
      <StartAudio label="Click to allow audio" />
    </LiveKitRoom>
  );
}

export default VoiceChat;
