import { useState } from "react";

export default function MessageInput({ onSend, disabled }) {
    const [message, setMessage] = useState("");

    const handleSubmit = (event) => {
        event.preventDefault();

        if (!message.trim() || disabled) {
            return;
        }

        onSend(message);
        setMessage("");
    };

    return (
        <form className="message-input" onSubmit={handleSubmit}>
            <input
                type="text"
                name="message"
                id="message"
                placeholder="Ask the agents to design the surveillance drone..."
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                disabled={disabled}
            />
            <button type="submit" disabled={disabled || !message.trim()}>
                {disabled ? "Running" : "Send"}
            </button>
        </form>
    )
}
