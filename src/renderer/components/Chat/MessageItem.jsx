export default function MessageItem({ message }) {
    return (
        <article className={`message message--${message.role}`}>
            <header className="message__meta">
                <span>{message.author}</span>
                <time>{message.timestamp}</time>
            </header>
            <p>{message.content}</p>
        </article>
    );
}
