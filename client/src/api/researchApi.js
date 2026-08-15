import axios from "axios";

// Same-origin "/api" works for the Docker/nginx deployment, where nginx proxies /api to
// the server container. When the frontend and backend are on different domains (e.g.
// frontend on Vercel, backend on Render), set VITE_API_BASE_URL at build time to the
// backend's full URL, e.g. https://researchmind-server.onrender.com/api
const baseURL = import.meta.env.VITE_API_BASE_URL || "/api";
const api = axios.create({ baseURL });

export async function createResearchSession(topic) {
  const { data } = await api.post("/research", { topic });
  return data; // { sessionId }
}

export async function fetchSession(sessionId) {
  const { data } = await api.get(`/research/${sessionId}`);
  return data;
}

export async function fetchSessionPapers(sessionId) {
  const { data } = await api.get(`/research/${sessionId}/papers`);
  return data;
}

export async function fetchRecentSessions() {
  const { data } = await api.get("/research");
  return data;
}
