const CHAT_SESSIONS_KEY = 'openvsp-agent.chatSessions';
const ACTIVE_SESSION_KEY = 'openvsp-agent.activeChatSessionId';

export function loadChatSessions() {
  try {
    const rawSessions = window.localStorage.getItem(CHAT_SESSIONS_KEY);

    if (!rawSessions) {
      return [];
    }

    const sessions = JSON.parse(rawSessions);
    return Array.isArray(sessions) ? sessions : [];
  } catch {
    return [];
  }
}

export function saveChatSessions(sessions) {
  window.localStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(sessions));
}

export function loadActiveChatSessionId() {
  return window.localStorage.getItem(ACTIVE_SESSION_KEY);
}

export function saveActiveChatSessionId(sessionId) {
  window.localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
}

export function createChatSession({ messages, agents }) {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    title: 'New drone design chat',
    messages,
    agents,
    createdAt: now,
    updatedAt: now,
  };
}

export function createSessionTitle(messageText) {
  const normalizedText = messageText.replace(/\s+/g, ' ').trim();

  if (!normalizedText) {
    return 'New drone design chat';
  }

  return normalizedText.length > 42
    ? `${normalizedText.slice(0, 42)}...`
    : normalizedText;
}
