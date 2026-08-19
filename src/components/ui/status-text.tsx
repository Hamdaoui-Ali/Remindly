type Urgency = 'OVERDUE' | 'URGENT' | 'SOON' | 'SAFE';

export function StatusText({ urgency, label }: { urgency: Urgency; label: string }) {
  return (
    <span className={`status-text status-text--${urgency.toLowerCase()}`}>
      <strong>{urgency}</strong>
      <span>{label}</span>
    </span>
  );
}
