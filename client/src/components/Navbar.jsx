import { Link } from "react-router-dom";
import { BrainCircuit } from "lucide-react";

export default function Navbar() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <BrainCircuit className="h-6 w-6 text-brand-600" />
          <span>ResearchMind</span>
        </Link>
        <p className="hidden text-sm text-slate-500 sm:block">
          Multi-agent literature review &amp; research gap discovery
        </p>
      </div>
    </header>
  );
}
