import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createResearchSession, fetchRecentSessions } from "../api/researchApi.js";
import TopicForm from "../components/TopicForm.jsx";
import { Clock } from "lucide-react";

const STATUS_STYLES = {
  completed: "bg-emerald-50 text-emerald-700",
  running: "bg-brand-50 text-brand-700",
  pending: "bg-slate-100 text-slate-600",
  failed: "bg-red-50 text-red-700",
};

export default function HomePage() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchRecentSessions().then(setRecentSessions).catch(() => {});
  }, []);

  async function handleSubmit(topic) {
    setSubmitting(true);
    setError(null);
    try {
      const { sessionId } = await createResearchSession(topic);
      navigate(`/session/${sessionId}`);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col items-center px-6 py-16">
      <h1 className="text-center text-4xl font-bold tracking-tight text-slate-900">
        Turn a topic into a literature review<br className="hidden sm:block" /> and a scored
        research gap
      </h1>
      <p className="mt-4 max-w-xl text-center text-slate-500">
        Four cooperating AI agents search real papers, cluster them, synthesize a structured
        review, and score candidate research gaps with an explainable Research Gap Confidence
        Score.
      </p>

      <div className="mt-8">
        <TopicForm onSubmit={handleSubmit} submitting={submitting} />
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {recentSessions.length > 0 && (
        <div className="mt-16 w-full max-w-2xl">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-500">
            <Clock className="h-4 w-4" /> Recent sessions
          </h2>
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {recentSessions.map((s) => (
              <li key={s._id}>
                <button
                  onClick={() => navigate(`/session/${s._id}`)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-800">{s.topic}</span>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLES[s.status]}`}
                  >
                    {s.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
