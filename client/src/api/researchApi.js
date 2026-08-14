import axios from "axios";

const api = axios.create({ baseURL: "/api" });

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
