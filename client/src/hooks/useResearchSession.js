import { useEffect, useRef, useState } from "react";
import { fetchSession, fetchSessionPapers } from "../api/researchApi.js";

const POLL_INTERVAL_MS = 2000;
const ACTIVE_STATUSES = new Set(["pending", "running"]);

/** Polls a research session until its pipeline finishes, then loads papers once. */
export function useResearchSession(sessionId) {
  const [session, setSession] = useState(null);
  const [papers, setPapers] = useState([]);
  const [error, setError] = useState(null);
  const papersLoadedRef = useRef(false);

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;
    papersLoadedRef.current = false;

    async function poll() {
      try {
        const data = await fetchSession(sessionId);
        if (cancelled) return;
        setSession(data);

        if (!ACTIVE_STATUSES.has(data.status) && !papersLoadedRef.current) {
          papersLoadedRef.current = true;
          const paperData = await fetchSessionPapers(sessionId);
          if (!cancelled) setPapers(paperData);
        }

        if (ACTIVE_STATUSES.has(data.status) && !cancelled) {
          setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || err.message);
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return { session, papers, error };
}
