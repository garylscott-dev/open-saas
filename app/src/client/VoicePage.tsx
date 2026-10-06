import React from 'react';
import { VoiceChat } from './VoiceChat';
import { Radio } from 'lucide-react';

export function VoicePage() {
  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-3xl my-6">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-3">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>Alpha Voice Assistant</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Live Voice Session
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time conversational intelligence powered by local STT, LLM, and TTS.
          </p>
        </div>
        <VoiceChat initialConnect={false} />
      </div>
    </div>
  );
}

export default VoicePage;
