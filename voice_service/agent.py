import logging
import asyncio
import os
import json
import time
import httpx
from dotenv import load_dotenv

import numpy as np
import livekit.rtc as rtc
from livekit.agents.types import NOT_GIVEN, NotGivenOr, APIConnectOptions, DEFAULT_API_CONNECT_OPTIONS
from livekit.agents import AutoSubscribe, JobContext, WorkerOptions, cli, llm, stt, tts
from livekit.agents import voice
from livekit.plugins import silero, openai

# Load environment variables
load_dotenv()

WASP_API_URL = os.getenv("WASP_API_URL", "http://localhost:3001")

logger = logging.getLogger("voice-agent")
logging.basicConfig(level=logging.INFO)

class LocalWhisperSTT(stt.STT):
    def __init__(self):
        super().__init__(
            capabilities=stt.STTCapabilities(
                streaming=False,
                interim_results=False,
                diarization=False,
                keyterms=False,
                chat_context=False,
            )
        )
        from faster_whisper import WhisperModel
        logger.info("Loading faster-whisper base model on CPU...")
        self._model = WhisperModel("base", device="cpu", compute_type="int8")

    @property
    def model(self) -> str:
        return "faster-whisper-base"

    @property
    def provider(self) -> str:
        return "local"

    async def _recognize_impl(
        self,
        buffer: stt.AudioBuffer,
        *,
        language: NotGivenOr[str | list[str]] = NOT_GIVEN,
        conn_options: APIConnectOptions,
    ) -> stt.SpeechEvent:
        frame = rtc.combine_audio_frames(buffer)
        audio_array = np.frombuffer(frame.data, dtype=np.int16).astype(np.float32) / 32768.0

        loop = asyncio.get_running_loop()
        def _transcribe():
            segments, info = self._model.transcribe(audio_array, beam_size=5)
            return "".join([segment.text for segment in segments]).strip()

        text = await loop.run_in_executor(None, _transcribe)
        logger.info(f"[LocalWhisperSTT] Transcribed: {text}")

        return stt.SpeechEvent(
            type=stt.SpeechEventType.FINAL_TRANSCRIPT,
            alternatives=[stt.SpeechData(text=text, language="en")],
        )

class LocalKokoroTTS(tts.TTS):
    def __init__(self):
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=24000,
            num_channels=1,
        )
        from kokoro_onnx import Kokoro
        logger.info("Loading Kokoro TTS model...")
        self._kokoro = Kokoro("models/kokoro-v1.0.onnx", "models/voices-v1.0.bin")

    @property
    def model(self) -> str:
        return "kokoro-v1.0"

    @property
    def provider(self) -> str:
        return "local"

    def synthesize(
        self, text: str, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS
    ) -> tts.ChunkedStream:
        return KokoroChunkedStream(tts=self, input_text=text, conn_options=conn_options)

class KokoroChunkedStream(tts.ChunkedStream):
    def __init__(self, *, tts: LocalKokoroTTS, input_text: str, conn_options: tts.APIConnectOptions) -> None:
        super().__init__(tts=tts, input_text=input_text, conn_options=conn_options)
        self._tts = tts

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        loop = asyncio.get_running_loop()
        def _generate():
            samples, sample_rate = self._tts._kokoro.create(
                self.input_text, voice="af_bella", speed=1.0, lang="en-us"
            )
            return (samples * 32767.0).astype(np.int16).tobytes()

        pcm_data = await loop.run_in_executor(None, _generate)

        output_emitter.initialize(
            request_id="local-kokoro",
            sample_rate=24000,
            num_channels=1,
            mime_type="audio/pcm",
        )
        output_emitter.push(pcm_data)
        output_emitter.end_input()

# Helper function to publish JSON events over LiveKit data channels
async def publish_event(room, event_type: str, data: dict):
    payload = json.dumps({
        "type": event_type,
        **data
    })
    try:
        if room and room.local_participant:
            await room.local_participant.publish_data(payload, topic="voice-events")
            logger.debug(f"Published event: {event_type} -> {data}")
    except Exception as e:
        logger.error(f"Failed to publish event {event_type}: {e}")

# Downstream Session Hooks for a future Conversation Service
async def on_session_started(session: voice.AgentSession):
    """
    Hook called when a new voice agent session starts.
    Allows a future Conversation Service to attach session state, memory, or user attributes.
    """
    room_name = session.room_io.room.name
    local_identity = session.room_io.room.local_participant.identity
    logger.info(f"[ConversationHook] Session started. Room: {room_name}, Agent Identity: {local_identity}")

async def on_conversation_item_added(session: voice.AgentSession, item: llm.ChatMessage):
    """
    Hook called when any dialogue item is added to the conversation history.
    Allows a future Conversation Service to intercept and store chat history.
    """
    logger.info(f"[ConversationHook] Dialogue entry added - Role: {item.role}, Content: {item.content}")

async def entrypoint(ctx: JobContext):
    room_name = ctx.room.name
    user_id = None
    if room_name.startswith("voice-room-"):
        user_id = room_name.replace("voice-room-", "")
    logger.info(f"Connecting voice pipeline to room: {room_name} for user_id: {user_id}")
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    # Initialize VAD Model
    vad_model = silero.VAD.load()

    # Local STT (Whisper via StreamAdapter)
    logger.info("Initializing Local Whisper STT...")
    local_stt = LocalWhisperSTT()
    stt_plugin = stt.StreamAdapter(stt=local_stt, vad=vad_model)

    # Local LLM (Ollama)
    logger.info("Initializing Local Ollama LLM (llama3.2)...")
    llm_plugin = openai.LLM(
        base_url="http://127.0.0.1:11434/v1",
        api_key="ollama",  # dummy key for compatibility
        model="llama3.2",
    )

    # Local TTS (Kokoro)
    logger.info("Initializing Local Kokoro TTS...")
    tts_plugin = LocalKokoroTTS()

    chat_ctx = llm.ChatContext()
    chat_ctx.add_message(
        role="system",
        content="You are Alpha, a helpful AI voice assistant. Keep your answers concise, natural, and conversational.",
    )

    # Fetch conversation history from Wasp if user is identified
    if user_id:
        try:
            logger.info(f"Fetching conversation history from Wasp for user {user_id}...")
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{WASP_API_URL}/api/voice/messages?userId={user_id}", timeout=5.0)
                if response.status_code == 200:
                    history = response.json()
                    logger.info(f"Loaded {len(history)} messages from Wasp DB")
                    for msg in history:
                        chat_ctx.add_message(
                            role=msg["role"],
                            content=msg["content"],
                        )
                else:
                    logger.error(f"Failed to load context: status {response.status_code}, error: {response.text}")
        except Exception as e:
            logger.error(f"Error loading conversation history: {e}")

    # Create the Voice Agent
    agent = voice.Agent(
        instructions="You are Alpha, a helpful AI voice assistant.",
        vad=vad_model,
        stt=stt_plugin,
        llm=llm_plugin,
        tts=tts_plugin,
        chat_ctx=chat_ctx,
    )

    session = voice.AgentSession()
    await session.start(agent, room=ctx.room)
    logger.info("Voice assistant connected and listening!")

    # Invoke session started hook
    await on_session_started(session)

    # Inactivity Tracking variables
    last_user_activity = time.time()
    is_agent_speaking = False

    # Register event listeners
    @session.on("agent_state_changed")
    def on_agent_state_changed(ev: voice.AgentStateChangedEvent):
        nonlocal is_agent_speaking
        state = ev.new_state
        logger.info(f"Agent state changed to: {state}")
        is_agent_speaking = (state == "speaking")
        
        # Publish agent state to room
        asyncio.create_task(publish_event(ctx.room, "agent_state", {"state": state}))
        # Also publish agent_speaking flag
        asyncio.create_task(publish_event(ctx.room, "agent_speaking", {"speaking": is_agent_speaking}))

    @session.on("user_state_changed")
    def on_user_state_changed(ev: voice.UserStateChangedEvent):
        nonlocal last_user_activity
        state = ev.new_state
        logger.info(f"User state changed to: {state}")
        last_user_activity = time.time()
        
        # Publish user state to room
        asyncio.create_task(publish_event(ctx.room, "user_state", {"state": state}))
        # Also publish user_speaking flag
        speaking = (state == "speaking")
        asyncio.create_task(publish_event(ctx.room, "user_speaking", {"speaking": speaking}))

    @session.on("user_input_transcribed")
    def on_user_input_transcribed(ev: voice.UserInputTranscribedEvent):
        nonlocal last_user_activity
        if ev.transcript:
            text_str = str(ev.transcript).strip()
            if text_str:
                logger.info(f"User input transcribed: {text_str}")
                last_user_activity = time.time()
                asyncio.create_task(publish_event(ctx.room, "transcript", {
                    "speaker": "user",
                    "text": text_str,
                    "is_final": ev.is_final
                }))

    @session.on("conversation_item_added")
    def on_conversation_item_added_handler(ev: voice.ConversationItemAddedEvent):
        if isinstance(ev.item, llm.ChatMessage):
            # Run downstream hook for Dialogue Manager/Conversation Service
            asyncio.create_task(on_conversation_item_added(session, ev.item))
            
            content_str = ev.item.content
            if isinstance(content_str, list):
                content_str = " ".join([str(c) for c in content_str])
            elif content_str is not None:
                content_str = str(content_str)
            else:
                content_str = ""

            content_str = content_str.strip()

            # Publish agent's transcript when assistant message is created
            if ev.item.role == "assistant" and content_str:
                logger.info(f"Agent transcription: {content_str}")
                asyncio.create_task(publish_event(ctx.room, "transcript", {
                    "speaker": "agent",
                    "text": content_str,
                    "is_final": True
                }))
            
            # Save User and Assistant messages to Wasp DB
            if user_id and ev.item.role in ["user", "assistant"] and content_str:
                
                async def save_msg_to_db():
                    try:
                        async with httpx.AsyncClient() as client:
                            response = await client.post(
                                f"{WASP_API_URL}/api/voice/messages",
                                json={
                                    "userId": user_id,
                                    "role": ev.item.role,
                                    "content": content_str,
                                },
                                timeout=5.0
                            )
                            if response.status_code != 200:
                                logger.error(f"Failed to save message to DB: {response.text}")
                    except Exception as e:
                        logger.error(f"Error saving message to DB: {e}")
                
                asyncio.create_task(save_msg_to_db())

    # Monitor room connection status and enforce idle timeout
    IDLE_TIMEOUT_SECONDS = 45
    while ctx.room.connection_state == "connected":
        await asyncio.sleep(1)
        if is_agent_speaking:
            last_user_activity = time.time()
            continue
        if time.time() - last_user_activity > IDLE_TIMEOUT_SECONDS:
            logger.info(f"Idle timeout reached ({IDLE_TIMEOUT_SECONDS}s). Disconnecting...")
            await ctx.room.disconnect()
            break

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
