import MessageInput from "./MessageInput";
import MessageList from "./MessageList";
import SimulationReport from "./SimulationReport";

import "../../styles/chat.css";
import { formatSessionDate, useChat } from "../../hooks/useChat";


export default function ChatWindow() {
    const {
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
    } = useChat();

    const handleDeleteChat = (event, sessionId) => {
        event.stopPropagation();
        deleteChat(sessionId);
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
                        onClick={createNewChat}
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
                                onClick={() => selectChat(session.id)}
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
                        onClick={useAssignmentPrompt}
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

                <div className="analysis-workspace">
                    <SimulationReport report={report} />
                    <MessageList messages={messages} />
                </div>
                <MessageInput onSend={sendMessage} disabled={isRunning} />
            </div>
        </section>
    )
}
