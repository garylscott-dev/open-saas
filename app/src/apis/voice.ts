import { type GetVoiceToken } from 'wasp/server/api';
import { AccessToken } from 'livekit-server-sdk';

export const getVoiceToken: GetVoiceToken = async (req, res, _context) => {
  try {
    const apiKey = process.env.LIVEKIT_API_KEY || 'devkey';
    const apiSecret = process.env.LIVEKIT_API_SECRET || 'secretsecretsecretsecretsecret1234';

    const userContext = (req as any).user;
    const userId = userContext?.id || `anon-${Math.floor(Math.random() * 10000)}`;
    const participantIdentity = `user-${userId}`;
    const roomName = `voice-room-${userId}`;
    
    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantIdentity,
      ttl: '1h',
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    res.json({
      token,
      identity: participantIdentity,
      room: roomName,
    });
  } catch (error) {
    console.error('Error generating LiveKit token:', error);
    res.status(500).json({ error: 'Failed to generate voice token' });
  }
};
