export function AuthFeedback({ error, errorId, message, messageId }: {
  error: string | null;
  errorId: string;
  message: string | null;
  messageId: string;
}) {
  return (
    <>
      {error ? <p id={errorId} className="login-error" role="alert">{error}</p> : null}
      {message ? <p id={messageId} role="status">{message}</p> : null}
    </>
  );
}
