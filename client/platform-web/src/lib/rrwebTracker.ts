import * as rrweb from "rrweb";

let events: any[] = [];
let sessionId: string | null = null;
export let stopRecording: (() => void) | null = null;

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4100/api/v1";

export async function startRrwebTracker() {
  if (sessionId) return; // already tracking

  try {
    // 1. Create a session in the backend
    const res = await fetch(`${API_BASE}/telemetry/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        browser: navigator.userAgent,
        os: navigator.platform,
      }),
    });
    
    if (!res.ok) throw new Error("Could not start telemetry session");
    
    const data = await res.json();
    sessionId = data.sessionId;

    // 2. Start recording DOM
    stopRecording = rrweb.record({
      emit(event) {
        events.push(event);
      },
    }) || null;

    // 3. Flush events every 10 seconds
    setInterval(flushEvents, 10000);
    
    // Also try to flush when user leaves page
    window.addEventListener("beforeunload", flushEvents);
  } catch (err) {
    console.error("rrweb tracker failed to start:", err);
  }
}

async function flushEvents() {
  if (!sessionId || events.length === 0) return;

  const eventsToSend = [...events];
  events = []; // clear the buffer

  try {
    await fetch(`${API_BASE}/telemetry/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        events: eventsToSend,
      }),
    });
  } catch (err) {
    console.error("rrweb flush failed:", err);
    // Optionally put them back in the buffer if it failed, but we'll drop them for now to prevent memory leaks
  }
}
