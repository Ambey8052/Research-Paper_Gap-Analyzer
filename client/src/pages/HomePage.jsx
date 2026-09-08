import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createResearchSession } from "../api/researchApi.js";
import TopicForm from "../components/TopicForm.jsx";
import RecentSessionsList from "../components/RecentSessionsList.jsx";

export default function HomePage() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

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

      <RecentSessionsList />
    </div>
  );
}
