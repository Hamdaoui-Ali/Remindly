import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="loading-shell" aria-labelledby="page-title">
      <p className="wordmark">Remindly</p>
      <h1 id="page-title">Your reminder workspace is loading.</h1>
      <p>Preparing your private dashboard.</p>
      <Link href="/login">Go to login</Link>
    </main>
  );
}
