import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from 'wasp/client/auth';
import { routes } from 'wasp/client/router';

export function GlobalVoiceListener() {
  const { data: user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const recognitionRef = useRef<any>(null);

  const allowVoice = (user as any)?.allowVoice ?? true;
  const wakeWord = (user as any)?.wakeWord || 'hey Jarvis';
  const isVoicePage = location.pathname === '/voice';

  useEffect(() => {
    // Only listen if user is logged in, voice is allowed, and not already on the active voice page
    if (!user || !allowVoice || isVoicePage) {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return;
    }

    let isMounted = true;
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    recognitionRef.current = rec;

    rec.onresult = (event: any) => {
      if (!event?.results || event.results.length === 0) return;
      const result = event.results[event.results.length - 1];
      if (!result || !result[0]) return;

      const text = result[0].transcript.toLowerCase().trim();
      const targetPhrase = wakeWord.toLowerCase().trim();

      if (text.includes(targetPhrase)) {
        console.log(`[GlobalVoiceListener] Wake word detected ("${targetPhrase}")!`);

        // Stop background speech recognition before transitioning
        rec.onend = null;
        rec.stop();
        recognitionRef.current = null;

        // Respond aloud: "Yes <User name>" (no comma for natural speech flow)
        const userName =
          user.username || (user.email ? user.email.split('@')[0] : 'there');
        const responseText = `Yes ${userName}`;

        if ('speechSynthesis' in window) {
          try {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(responseText);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            window.speechSynthesis.speak(utterance);
          } catch (err) {
            console.error('Speech synthesis error:', err);
          }
        }

        // Navigate to the voice screen
        navigate('/voice?autoConnect=true');
      }
    };

    rec.onerror = (e: any) => {
      // Ignore routine abort/no-speech errors in background listener
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.warn('[GlobalVoiceListener] SpeechRecognition error:', e.error);
      }
    };

    rec.onend = () => {
      // Automatically restart background recognition loop if still active
      if (isMounted && allowVoice && !isVoicePage) {
        try {
          rec.start();
        } catch (err) {
          // Handled silently
        }
      }
    };

    try {
      rec.start();
    } catch (err) {
      console.warn('[GlobalVoiceListener] Start failed:', err);
    }

    return () => {
      isMounted = false;
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, [user, allowVoice, wakeWord, isVoicePage, navigate]);

  return null;
}

export default GlobalVoiceListener;
