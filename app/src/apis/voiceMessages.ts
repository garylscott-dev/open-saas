import {
  type GetVoiceMessages,
  type SaveVoiceMessage,
  type GetWakeWord,
  type UpdateWakeWord,
} from 'wasp/server/api';

export const getVoiceMessages: GetVoiceMessages = async (req, res, context) => {
  try {
    const userId = (req.query.userId as string) || (req as any).user?.id;
    if (!userId) {
      res.json([]);
      return;
    }

    const messages = await context.entities.VoiceMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
      },
    });

    res.json(messages);
  } catch (error) {
    console.error('Error fetching voice messages:', error);
    res.status(500).json({ error: 'Failed to fetch voice messages' });
  }
};

export const saveVoiceMessage: SaveVoiceMessage = async (req, res, context) => {
  try {
    const { userId, role, content } = req.body;
    if (!userId || !role || !content) {
      res.status(400).json({ error: 'Missing userId, role, or content in request body' });
      return;
    }

    // Check if user exists before attempting to write to avoid FK constraint failures
    const userExists = await context.entities.User.findUnique({
      where: { id: userId },
    });

    if (!userExists) {
      res.json({ id: 'temp-' + Date.now(), role, content, createdAt: new Date() });
      return;
    }

    const newMessage = await context.entities.VoiceMessage.create({
      data: {
        userId,
        role,
        content: typeof content === 'string' ? content : JSON.stringify(content),
      },
    });

    res.json(newMessage);
  } catch (error) {
    console.error('Error saving voice message:', error);
    res.status(500).json({ error: 'Failed to save voice message' });
  }
};

export const getWakeWord: GetWakeWord = async (req, res, context) => {
  try {
    const userContext = (req as any).user;
    if (!userContext) {
      res.json({ wakeWord: 'hey Jarvis' });
      return;
    }

    const user = await context.entities.User.findUnique({
      where: { id: userContext.id },
      select: { wakeWord: true },
    });

    res.json({ wakeWord: user?.wakeWord || 'hey Jarvis' });
  } catch (error) {
    console.error('Error getting wake word:', error);
    res.status(500).json({ error: 'Failed to get wake word' });
  }
};

export const updateWakeWord: UpdateWakeWord = async (req, res, context) => {
  try {
    const userContext = (req as any).user;
    if (!userContext) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { wakeWord } = req.body;
    if (!wakeWord) {
      res.status(400).json({ error: 'Missing wakeWord in request body' });
      return;
    }

    await context.entities.User.update({
      where: { id: userContext.id },
      data: { wakeWord },
    });

    res.json({ success: true, wakeWord });
  } catch (error) {
    console.error('Error updating wake word:', error);
    res.status(500).json({ error: 'Failed to update wake word' });
  }
};
