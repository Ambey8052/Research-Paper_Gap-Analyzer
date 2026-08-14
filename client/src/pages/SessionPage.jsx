import { useState } from "react";
import { useParams } from "react-router-dom";
import { useResearchSession } from "../hooks/useResearchSession.js";
import PipelineProgress from "../components/PipelineProgress.jsx";
import PaperList from "../components/PaperList.jsx";
import LiteratureReview from "../components/LiteratureReview.jsx";
import GapCard from "../components/GapCard.jsx";

const TABS = ["Gaps", "Literature Review", "Papers"];

export default function SessionPage() {
  const { id } = useParams();
  const { session, papers, error } = useResearchSession(id);
  const [activeTab, setActiveTab] = useState("Gaps");

  if (error) {
    return <div className="mx-auto max-w-4xl px-6 py-16 text-red-600">{error}</div>;
  }

  if (!session) {
    return <div className="mx-auto max-w-4xl px-6 py-16 text-slate-500">Loading session...</div>;
  }

  const isDone = session.status === "completed";
  const isFailed = session.status === "failed";

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6">
        <p className="text-sm font-medium text-brand-600">Research topic</p>
        <h1 className="text-2xl font-bold text-slate-900">{session.topic}</h1>
        {session.paperCount > 0 && (
          <p className="mt-1 text-sm text-slate-500">
            {session.paperCount} papers · {session.clusters?.length || 0} clusters
          </p>
        )}
      </div>

      <div className="mb-8">
        <PipelineProgress steps={session.steps} />
      </div>

      {isFailed && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Pipeline failed: {session.errorMessage}
        </div>
      )}

      {isDone && (
        <>
          <div className="mb-6 flex gap-2 border-b border-slate-200">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium ${
                  activeTab === tab
                    ? "border-b-2 border-brand-600 text-brand-700"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === "Gaps" && (
            <div className="space-y-4">
              {session.gaps?.length > 0 ? (
                session.gaps.map((gap) => <GapCard key={gap.title} gap={gap} />)
              ) : (
                <p className="text-sm text-slate-500">No candidate gaps were identified.</p>
              )}
            </div>
          )}

          {activeTab === "Literature Review" && <LiteratureReview review={session.literatureReview} />}

          {activeTab === "Papers" && <PaperList papers={papers} />}
        </>
      )}
    </div>
  );
}
