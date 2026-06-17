import { useEffect, useMemo, useRef, useState } from "react";
import {
    createInitialAgents,
    getAssignmentPrompt,
    runAgentHarness,
} from "../services/agentHarness";
import {
    createChatSession,
    createSessionTitle,
    loadActiveChatSessionId,
    loadChatSessions,
    saveActiveChatSessionId,
    saveChatSessions,
} from "../services/chatHistory";

const createMessage = ({ author, role, content }) => ({
    id: `${Date.now()}-${crypto.randomUUID()}`,
    author,
    role,
    content,
    timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    }),
});

const createWelcomeMessage = () =>
    createMessage({
        author: "OpenVSP Agent",
        role: "assistant",
        content: "Ready to coordinate the drone design study. Send the mission prompt to start the agent run.",
    });

const createEmptySession = () =>
    createChatSession({
        messages: [createWelcomeMessage()],
        agents: createInitialAgents(),
    });

const normalizeSession = (session) => {
    const now = new Date().toISOString();

    return {
        ...session,
        id: session.id || crypto.randomUUID(),
        title: session.title || "New drone design chat",
        messages: Array.isArray(session.messages) && session.messages.length > 0
            ? session.messages
            : [createWelcomeMessage()],
        agents: Array.isArray(session.agents) && session.agents.length > 0
            ? session.agents
            : createInitialAgents(),
        report: session.report ?? null,
        createdAt: session.createdAt || now,
        updatedAt: session.updatedAt || session.createdAt || now,
    };
};

const createInitialChatState = () => {
    const storedSessions = loadChatSessions().map(normalizeSession);

    if (storedSessions.length > 0) {
        const storedActiveSessionId = loadActiveChatSessionId();
        const activeSessionExists = storedSessions.some(
            (session) => session.id === storedActiveSessionId,
        );

        return {
            sessions: storedSessions,
            activeSessionId: activeSessionExists
                ? storedActiveSessionId
                : storedSessions[0].id,
        };
    }

    const firstSession = createEmptySession();

    return {
        sessions: [firstSession],
        activeSessionId: firstSession.id,
    };
};

export const formatSessionDate = (dateValue) =>
    new Date(dateValue).toLocaleDateString([], {
        month: "short",
        day: "numeric",
    });

export function useChat() {
    const [{ sessions, activeSessionId }, setChatState] = useState(createInitialChatState);
    const [isRunning, setIsRunning] = useState(false);
    const isRunningRef = useRef(false);
    const runIdRef = useRef(0);

    const activeSession = useMemo(
        () => sessions.find((session) => session.id === activeSessionId) ?? sessions[0],
        [activeSessionId, sessions],
    );

    const messages = activeSession?.messages ?? [];
    const agents = activeSession?.agents ?? createInitialAgents();
    const report = activeSession?.report ?? null;

    const completedAgents = useMemo(
        () => agents.filter((agent) => agent.status === "complete").length,
        [agents],
    );

    useEffect(() => {
        saveChatSessions(sessions);
        saveActiveChatSessionId(activeSessionId);
    }, [activeSessionId, sessions]);

    const updateSession = (sessionId, updater) => {
        setChatState((currentState) => ({
            ...currentState,
            sessions: currentState.sessions.map((session) => {
                if (session.id !== sessionId) {
                    return session;
                }

                return {
                    ...updater(session),
                    updatedAt: new Date().toISOString(),
                };
            }),
        }));
    };

    const updateActiveSession = (updater) => {
        updateSession(activeSessionId, updater);
    };

    const addMessageToSession = (sessionId, message, options = {}) => {
        const nextMessage = createMessage(message);

        updateSession(sessionId, (session) => {
            const hasUserMessage = session.messages.some(
                (currentMessage) => currentMessage.role === "user",
            );

            return {
                ...session,
                title: options.titleFromMessage && !hasUserMessage
                    ? createSessionTitle(nextMessage.content)
                    : session.title,
                messages: [...session.messages, nextMessage],
            };
        });
    };

    const addMessage = (message, options = {}) => {
        addMessageToSession(activeSessionId, message, options);
    };

    const updateAgentInSession = (sessionId, agentId, patch) => {
        updateSession(sessionId, (session) => ({
            ...session,
            agents: session.agents.map((agent) =>
                agent.id === agentId ? { ...agent, ...patch } : agent,
            ),
        }));
    };

    const updateAgent = (agentId, patch) => {
        updateAgentInSession(activeSessionId, agentId, patch);
    };

    const createNewChat = () => {
        if (isRunningRef.current) return;

        const nextSession = createEmptySession();

        setChatState((currentState) => ({
            sessions: [nextSession, ...currentState.sessions],
            activeSessionId: nextSession.id,
        }));
    };

    const selectChat = (sessionId) => {
        if (isRunningRef.current) return;

        setChatState((currentState) => ({
            ...currentState,
            activeSessionId: sessionId,
        }));
    };

    const deleteChat = (sessionId) => {
        if (isRunningRef.current) return;

        setChatState((currentState) => {
            const remainingSessions = currentState.sessions.filter(
                (session) => session.id !== sessionId,
            );

            const nextSessions = remainingSessions.length > 0
                ? remainingSessions
                : [createEmptySession()];

            const deletedActiveSession = currentState.activeSessionId === sessionId;

            return {
                sessions: nextSessions,
                activeSessionId: deletedActiveSession
                    ? nextSessions[0].id
                    : currentState.activeSessionId,
            };
        });
    };

    const sendMessage = async (messageText) => {
        const prompt = messageText.trim();

        if (!prompt || isRunningRef.current) return;

        runIdRef.current += 1;
        const activeRunId = runIdRef.current;
        const runSessionId = activeSessionId;

        isRunningRef.current = true;
        setIsRunning(true);

        updateSession(runSessionId, (session) => ({
            ...session,
            agents: createInitialAgents(),
            report: null,
        }));

        addMessageToSession(
            runSessionId,
            {
                author: "You",
                role: "user",
                content: prompt,
            },
            { titleFromMessage: true },
        );

        try {
            const runReport = await runAgentHarness(prompt, {
                addMessage: (message, options) => addMessageToSession(runSessionId, message, options),
                updateAgent: (agentId, patch) => updateAgentInSession(runSessionId, agentId, patch),
            });

            updateSession(runSessionId, (session) => ({
                ...session,
                report: runReport,
            }));
        } finally {
            if (runIdRef.current === activeRunId) {
                isRunningRef.current = false;
                setIsRunning(false);
            }
        }
    };

    const useAssignmentPrompt = () => {
        if (!isRunningRef.current) {
            sendMessage(getAssignmentPrompt());
        }
    };

    return {
        sessions,
        activeSession,
        activeSessionId,
        messages,
        agents,
        report,
        completedAgents,
        isRunning,
        createNewChat,
        selectChat,
        deleteChat,
        sendMessage,
        useAssignmentPrompt,
    };
}
