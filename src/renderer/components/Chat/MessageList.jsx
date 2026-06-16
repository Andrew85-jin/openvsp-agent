import { useEffect, useRef } from "react";
import MessageItem from "./MessageItem";

export default function MessageList({ messages }) {
    const listRef = useRef(null);

    useEffect(() => {
        listRef.current?.scrollTo({
            top: listRef.current.scrollHeight,
            behavior: "smooth",
        });
    }, [messages]);

    return (
        <div className="message-list" aria-live="polite" ref={listRef}>
            {messages.map((message) => (
                <MessageItem message={message} key={message.id} />
            ))}
        </div>
    );
}
