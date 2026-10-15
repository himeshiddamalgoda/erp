"use client";

import { useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function Home() {
  const [status, setStatus] = useState("Ready to check the backend connection.");
  const [checking, setChecking] = useState(false);

  async function checkBackend() {
    setChecking(true);
    setStatus("Checking connection…");

    try {
      const response = await fetch(`${apiUrl}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error("Backend request failed");
      const data = await response.json();
      setStatus(`Backend connected: ${data.status}`);
    } catch {
      setStatus("Cannot reach the backend. Check that it is running and the API URL is correct.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <main>
      <p className="eyebrow">ERP / GETTING STARTED</p>
      <h1>Your ERP starts here.</h1>
      <p>Next.js frontend and Express backend, ready to run independently.</p>
      <section aria-label="Backend connection">
        <h2>Backend connection</h2>
        <p aria-live="polite">{status}</p>
        <button onClick={checkBackend} disabled={checking}>
          {checking ? "Checking…" : "Check connection"}
        </button>
      </section>
    </main>
  );
}
