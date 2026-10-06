import { type GetVoiceToken } from 'wasp/server/api';
import { AccessToken } from 'livekit-server-sdk';

export const getVoiceToken: GetVoiceToken = async (req, res, context) => {
  try {
    const apiKey = process.env.LIVEKIT_API_KEY || 'devkey';
    const apiSecret = process.env.LIVEKIT_API_SECRET || 'secretsecretsecretsecretsecret1234';

    const userId = context.user?.id || (req as any).user?.id || 'guest';
    const sessionSuffix = Date.now().toString(36);
    const participantIdentity = `user-${userId}-${sessionSuffix}`;
    const roomName = `voice-room-${userId}-${sessionSuffix}`;
    
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
