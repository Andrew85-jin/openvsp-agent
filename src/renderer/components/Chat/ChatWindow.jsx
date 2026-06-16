import { useEffect, useMemo, useRef, useState } from "react";
import MessageInput from "./MessageInput";
import MessageList from "./MessageList";
import {
    createInitialAgents,
    getAssignmentPrompt,
    runAgentHarness,
} from "../../services/agentHarness";
import {
    createChatSession,
    createSessionTitle,
    loadActiveChatSessionId,
    loadChatSessions,
    saveActiveChatSessionId,
    saveChatSessions,
} from "../../services/chatHistory";
import "../../styles/chat.css";

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

const formatSessionDate = (dateValue) =>
    new Date(dateValue).toLocaleDateString([], {
        month: "short",
        day: "numeric",
    });

export default function ChatWindow() {
    const [{ sessions, activeSessionId }, setChatState] = useState(createInitialChatState);
    const [isRunning, setIsRunning] = useState(false);
    const runIdRef = useRef(0);

    const activeSession = useMemo(
        () => sessions.find((session) => session.id === activeSessionId) ?? sessions[0],
        [activeSessionId, sessions],
    );
    const messages = activeSession?.messages ?? [];
    const agents = activeSession?.agents ?? createInitialAgents();

    const completedAgents = useMemo(
        () => agents.filter((agent) => agent.status === "complete").length,
        [agents],
    );

    useEffect(() => {
        saveChatSessions(sessions);
        saveActiveChatSessionId(activeSessionId);
    }, [activeSessionId, sessions]);

    const updateActiveSession = (updater) => {
        setChatState((currentState) => ({
            ...currentState,
            sessions: currentState.sessions.map((session) => {
                if (session.id !== currentState.activeSessionId) {
                    return session;
                }

                return {
                    ...updater(session),
                    updatedAt: new Date().toISOString(),
                };
            }),
        }));
    };

    const addMessage = (message, options = {}) => {
        const nextMessage = createMessage(message);

        updateActiveSession((session) => {
            const hasUserMessage = session.messages.some(
                (currentMessage) => currentMessage.role === "user",
            );

            return {
                ...session,
                title: options.titleFromMessage && !hasUserMessage
                    ? createSessionTitle(nextMessage.content)
                    : session.title,
                messages: [
                    ...session.messages,
                    nextMessage,
                ],
            };
        });
    };

    const updateAgent = (agentId, patch) => {
        updateActiveSession((session) => ({
            ...session,
            agents: session.agents.map((agent) =>
                agent.id === agentId ? { ...agent, ...patch } : agent,
            ),
        }));
    };

    const handleCreateNewChat = () => {
        if (isRunning) {
            return;
        }

        const nextSession = createEmptySession();

        setChatState((currentState) => ({
            sessions: [nextSession, ...currentState.sessions],
            activeSessionId: nextSession.id,
        }));
    };

    const handleSelectChat = (sessionId) => {
        if (isRunning) {
            return;
        }

        setChatState((currentState) => ({
            ...currentState,
            activeSessionId: sessionId,
        }));
    };

    const handleDeleteChat = (event, sessionId) => {
        event.stopPropagation();

        if (isRunning) {
            return;
        }

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

    const handleSend = async (messageText) => {
        const prompt = messageText.trim();

        if (!prompt || isRunning) {
            return;
        }

        runIdRef.current += 1;
        const activeRunId = runIdRef.current;

        setIsRunning(true);
        updateActiveSession((session) => ({
            ...session,
            agents: createInitialAgents(),
        }));
        addMessage(
            {
                author: "You",
                role: "user",
                content: prompt,
            },
            { titleFromMessage: true },
        );

        try {
            await runAgentHarness(prompt, {
                addMessage,
                updateAgent,
            });
        } finally {
            if (runIdRef.current === activeRunId) {
                setIsRunning(false);
            }
        }
    };

    const handleUseAssignmentPrompt = () => {
        if (!isRunning) {
            handleSend(getAssignmentPrompt());
        }
    };

    return (
        <section className="chat-shell" aria-label="Agent chat workspace">
            <aside className="chat-history" aria-label="Chat history">
                <div className="chat-history__header">
                    <div>
                        <p>History</p>
                        <strong>{sessions.length} chats</strong>
                    </div>
                    <button
                        type="button"
                        onClick={handleCreateNewChat}
                        disabled={isRunning}
                    >
                        New chat
                    </button>
                </div>

                <div className="chat-history__list">
                    {sessions.map((session) => (
                        <div
                            className={session.id === activeSessionId ? "chat-history__item is-active" : "chat-history__item"}
                            key={session.id}
                        >
                            <button
                                className="chat-history__select"
                                type="button"
                                onClick={() => handleSelectChat(session.id)}
                                disabled={isRunning}
                            >
                                <span>{session.title}</span>
                                <small>
                                    {session.messages.length} messages - {formatSessionDate(session.updatedAt)}
                                </small>
                            </button>
                            <button
                                className="chat-history__delete"
                                type="button"
                                onClick={(event) => handleDeleteChat(event, session.id)}
                                disabled={isRunning}
                                aria-label={`Delete chat ${session.title}`}
                                title="Delete chat"
                            >
                                x
                            </button>
                        </div>
                    ))}
                </div>
            </aside>

            <div className="chat-window" aria-label="Agent chat">
                <header className="chat-header">
                    <div>
                        <p className="chat-kicker">OpenVSP Agent Harness</p>
                        <h1>{activeSession?.title ?? "Agent Chat"}</h1>
                    </div>
                    <button
                        className="prompt-button"
                        type="button"
                        onClick={handleUseAssignmentPrompt}
                        disabled={isRunning}
                    >
                        Run mission prompt
                    </button>
                </header>

                <div className="agent-grid" aria-label="Subagent status">
                    {agents.map((agent) => (
                        <article className={`agent-card agent-card--${agent.status}`} key={agent.id}>
                            <div className="agent-card__topline">
                                <h2>{agent.name}</h2>
                                <span>{agent.status}</span>
                            </div>
                            <p>{agent.focus}</p>
                            <div className="agent-progress" aria-hidden="true">
                                <span style={{ width: `${agent.progress}%` }} />
                            </div>
                            <small>
                                {agent.testsComplete}/{agent.testsTotal} simulations
                            </small>
                        </article>
                    ))}
                </div>

                <div className="chat-run-summary">
                    <span>{completedAgents}/5 agents complete</span>
                    <span>{isRunning ? "Running parallel study" : "Idle"}</span>
                </div>

                <MessageList messages={messages} />
                <MessageInput onSend={handleSend} disabled={isRunning} />
            </div>
        </section>
    )
}
