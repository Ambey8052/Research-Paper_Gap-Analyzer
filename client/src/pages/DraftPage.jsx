import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, FileCode2, Loader2, Printer, ShieldCheck } from "lucide-react";
import { fetchPaperDraft } from "../api/researchApi.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { splitCitations } from "../utils/citations.js";
import {
  sectionNumber,
  subsectionLetter,
  draftFilename,
  downloadFile,
  draftToMarkdown,
  draftToLatex,
} from "../utils/exportDraft.js";

const POLL_INTERVAL_MS = 3000;
const ACTIVE_STATUSES = new Set(["pending", "running"]);
const ANCHOR_PREFIX = "draft-ref-";

function useDraft(sessionId, draftId) {
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const data = await fetchPaperDraft(sessionId, draftId);
        if (cancelled) return;
        setDraft(data);
        if (ACTIVE_STATUSES.has(data.status)) setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || err.message);
      }
    }
    poll();
    return () => {
      cancelled = true;
    };
  }, [sessionId, draftId]);

  return { draft, error };
}

function CitedParagraph({ text }) {
  return (
    <p className="mb-3 indent-6 text-justify leading-relaxed">
      {splitCitations(text).map((part, i) =>
        typeof part === "string" ? (
          part
        ) : (
          <a key={i} href={`#${ANCHOR_PREFIX}${part.ref}`} className="text-brand-700 hover:underline print:text-inherit">
            [{part.ref}]
          </a>
        )
      )}
    </p>
  );
}

function OriginalityReport({ originality }) {
  if (!originality) return null;
  const flagged = originality.flaggedPassages || [];
  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 text-sm print:hidden">
      <div className="flex items-center gap-2 font-medium text-slate-900">
        <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        Originality check: {originality.overlapPercent}% verbatim overlap
      </div>
      <p className="mt-1 text-slate-600">
        Share of the draft's 8-word sequences that also appear in the {originality.sourceCount} source
        abstracts it was written from.
        {originality.rewrittenSections?.length > 0 &&
          ` Copied phrasing was found and rewritten automatically in: ${originality.rewrittenSections.join(", ")}.`}
      </p>
      {flagged.length > 0 && (
        <div className="mt-2">
          <p className="font-medium text-amber-700">Still overlapping — rephrase these before submitting:</p>
          <ul className="mt-1 list-inside list-disc text-slate-600">
            {flagged.map((f, i) => (
              <li key={i}>
                <span className="italic">“{f.text}”</span> ({f.section}; matches “{f.paperTitle}”)
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-400">
        This only compares against this session's papers. It is not a substitute for your
        institution's plagiarism checker (e.g. Turnitin or iThenticate). This is an AI-generated
        draft: verify every claim and citation, and follow your venue's AI-disclosure policy.
      </p>
    </div>
  );
}

function PaperView({ draft }) {
  return (
    <article className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white px-6 py-10 font-serif text-[15px] text-slate-900 sm:px-12 print:max-w-none print:border-0 print:p-0 print:text-[10pt]">
      <h1 className="text-center text-2xl leading-snug sm:text-3xl">{draft.title}</h1>
      {(draft.authors || draft.affiliation) && (
        <div className="mt-4 text-center">
          {draft.authors && <p>{draft.authors}</p>}
          {draft.affiliation && <p className="text-sm italic text-slate-600">{draft.affiliation}</p>}
        </div>
      )}

      <div className="mt-8 print:columns-2 print:gap-8">
        <p className="mb-3 text-justify text-sm font-semibold leading-relaxed">
          <span className="italic">Abstract</span>—{draft.abstract}
        </p>
        {draft.indexTerms?.length > 0 && (
          <p className="mb-6 text-justify text-sm font-semibold">
            <span className="italic">Index Terms</span>—{draft.indexTerms.join(", ")}
          </p>
        )}

        {draft.sections.map((section, i) => (
          <section key={section.heading} className="mb-4">
            <h2 className="mb-3 mt-6 break-after-avoid text-center text-sm uppercase tracking-wider">
              {sectionNumber(i)}. {section.heading}
            </h2>
            {section.paragraphs.map((p, k) => (
              <CitedParagraph key={k} text={p} />
            ))}
            {section.subsections?.map((sub, j) => (
              <div key={sub.heading}>
                <h3 className="mb-2 mt-4 break-after-avoid italic">
                  {subsectionLetter(j)}. {sub.heading}
                </h3>
                {sub.paragraphs.map((p, k) => (
                  <CitedParagraph key={k} text={p} />
                ))}
              </div>
            ))}
          </section>
        ))}

        <section>
          <h2 className="mb-3 mt-6 text-center text-sm uppercase tracking-wider">References</h2>
          <ol className="space-y-1.5 text-sm">
            {draft.references.map((r) => (
              <li key={r.ref} id={`${ANCHOR_PREFIX}${r.ref}`} className="flex scroll-mt-6 gap-2 break-inside-avoid">
                <span className="w-8 shrink-0 text-right">[{r.ref}]</span>
                <span>{r.text}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </article>
  );
}

const TOOLBAR_BUTTON =
  "flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50";

export default function DraftPage() {
  const { id, draftId } = useParams();
  const { draft, error } = useDraft(id, draftId);

  useDocumentTitle(draft?.title || "Research paper draft — ResearchMind");

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 print:p-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to={`/session/${id}`} className="flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to session
        </Link>

        {draft?.status === "completed" && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={TOOLBAR_BUTTON}
              onClick={() => downloadFile(draftFilename(draft, "tex"), draftToLatex(draft), "application/x-tex")}
            >
              <FileCode2 className="h-4 w-4" aria-hidden="true" /> LaTeX (IEEE)
            </button>
            <button
              type="button"
              className={TOOLBAR_BUTTON}
              onClick={() => downloadFile(draftFilename(draft, "md"), draftToMarkdown(draft), "text/markdown")}
            >
              <Download className="h-4 w-4" aria-hidden="true" /> Markdown
            </button>
            <button type="button" className={TOOLBAR_BUTTON} onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden="true" /> Print / PDF
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-red-600">{error}</p>}
      {!draft && !error && <p className="text-slate-500">Loading draft...</p>}

      {draft && ACTIVE_STATUSES.has(draft.status) && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-6">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-brand-600" aria-hidden="true" />
            <p className="font-medium text-slate-900">{draft.progressMessage}</p>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Writing a paper from: {draft.gapTitles?.join(" + ")}. The outline is planned first,
            then each section is written against it, checked for copied phrasing, and given
            IEEE-numbered citations. This usually takes 1-2 minutes.
          </p>
        </div>
      )}

      {draft?.status === "failed" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Paper generation failed: {draft.errorMessage}
        </div>
      )}

      {draft?.status === "completed" && (
        <>
          <OriginalityReport originality={draft.originality} />
          <PaperView draft={draft} />
        </>
      )}
    </div>
  );
}
