/**
 * Landing page for the PayGate Next.js example.
 * Intentionally plain — this example is about the paywall, not the UI.
 */
export default function Home() {
  return (
    <main style={{ padding: 32, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <h1>PayGate — Next.js App Router example</h1>
      <p>
        Try <code>GET /api/premium</code> — the route is gated by the
        middleware and will respond with HTTP 402 until an agent presents a
        valid <code>X-PAYMENT</code> header.
      </p>
      <pre>curl -i http://localhost:3000/api/premium</pre>
    </main>
  );
}
