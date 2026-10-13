# CLAUDE.md — ResearchMind (repo: Research-Gap)

> Fast-load context for AI assistants. Read this first; open source files only for the area you're changing.
> Human-facing docs live in `README.md` (long). This file is the compressed version + things README doesn't say.
> Whole codebase is ~4k lines of JS. Last synced with code: 2026-10-13 (citations + paper writer added after commit 7e2eeb4).

## 1. One-paragraph summary

**ResearchMind** = "topic in → literature review + scored research gaps out". A user types a research
topic; a backend pipeline of **4 sequential LLM "agents"** searches real papers (arXiv + Semantic Scholar),
clusters them, writes a structured literature review, and proposes candidate research gaps ranked by
the **Research Gap Confidence Score (RGCS)** — an explainable formula, *not* a raw LLM opinion. That
formula is the project's core novelty claim. Target user: students/researchers hunting for a thesis topic.

## 2. Mind map

```
ResearchMind
├── Problem: finding a research gap = weeks of reading 30-50 papers manually
├── Solution: 4-agent pipeline over a 20-40 paper corpus, one click
│   ├── A1 Paper Finder  → arXiv + Semantic Scholar, dedupe by title, local embeddings, save Papers
│   ├── A2 Classifier    → Gemini: 3-8 clusters + 1-4 tags per paper
│   ├── A3 Lit Review    → Gemini: intro, per-cluster related work, trends, comparison table, IEEE refs
│   ├── A4 Gap Detector  → Gemini proposes 3-6 gaps → code computes RGCS → sort desc
│   └── On demand: Paper Writer → user selects 1-4 gaps → IEEE proposal paper draft (see §5b)
├── Novelty: RGCS = 0.40·sparsity + 0.25·recency + 0.20·citationTrend + 0.15·llmNovelty
│   (65%+ of score is computed from data, LLM's own opinion is only 15%)
├── Stack: MongoDB · Express · React(Vite, Tailwind v3) · Node 20 ESM · Google Gemini · HF transformers.js
├── Deploy: client → Vercel | server → Render (Docker, free) | DB → MongoDB Atlas
│   └── alt: docker compose (mongodb-atlas-local + server + nginx client)
└── Status: MVP done & live. No auth. Paper writer built; agents 5-7 are future work (see §9).
```

## 3. Request / data flow

```
Browser ──POST /api/research {topic}──► controller creates ResearchSession(status=pending)
        ◄──201 {sessionId}──────────── and fire-and-forgets runPipeline(id)  (NO job queue)
        │
        └─ polls GET /api/research/:id every 2s (useResearchSession hook)
             while status ∈ {pending, running}; when done → GET /:id/papers once

runPipeline (agents/orchestrator.js), each step writes progress to session.steps[] via arrayFilters:
  paper_finder → classifier → literature_review → gap_detector → status=completed
  any throw → that step=failed, session.status=failed, errorMessage=err.message (shown in UI)
```

Agents talk to the LLM via ids: papers are listed to Gemini as `[id=<externalId>]`, and Gemini's JSON
answer references those ids; the code maps them back to Mongo docs (`paperByExternalId` Map). Unknown ids
are silently dropped — the anti-hallucination guard.

## 4. File map (where to look)

```
server/src/
  server.js            boot: connectDB → createApp → listen
  app.js               helmet, cors(CLIENT_ORIGIN), json 1mb, morgan, trust proxy=1, /api/health, limiter, routes
  config/env.js        ALL env vars + defaults (dotenv override:true). Required: GEMINI_API_KEY, MONGODB_URI
  config/db.js         mongoose connect; exits process on failure
  routes/researchRoutes.js   POST / · GET / · GET /:id · GET /:id/papers · DELETE /:id
  controllers/researchController.js  topic validation (3-200 chars), list = last 20, delete cascades Papers
  middleware/          rateLimiters (100/15min all; 10/hr for POST), validateObjectId (400), errorHandler (hides 500 msgs)
  models/ResearchSession.js  topic, status, steps[], paperCount, clusters[], literatureReview{}, gaps[] (embedded)
  models/Paper.js      sessionId, externalId, source(arxiv|semanticscholar), title, abstract, authors, year,
                       doi, url, venue/volume/pages (S2 only), citationCount, topics[], cluster, embedding[384]. Unique (sessionId, externalId)
  agents/orchestrator.js      sequential runner + step status writes
  agents/paperFinderAgent.js  parallel search, S2 preferred on dup (has citations), cap MAX_PAPERS_PER_SEARCH (40)
  agents/classifierAgent.js   askLLMJSON → bulkWrite cluster/topics; missing → "Uncategorized"
  agents/literatureReviewAgent.js  askLLMJSON (6000 tokens), abstracts truncated to 250 chars
  agents/gapDetectorAgent.js  askLLMJSON (4096) + computeQuantitativeScores() + RGCS  ← core logic
  agents/paperWriterAgent.js  on-demand paper draft: outline → 7 sections → abstract proofread → originality → citations
  controllers/draftController.js  POST/GET/DELETE /:id/drafts[/:draftId]; max 4 gaps; session must be completed
  models/PaperDraft.js        sessionId, gapIndexes, status/progressMessage, title, abstract, indexTerms, sections[], references[], originality
  utils/citations.js          [n] renumbering by first appearance, hallucinated-number removal, IEEE reference formatter
  utils/originality.js        8-word shingle overlap vs source abstracts
  services/llmService.js      Gemini client: askLLM / askLLMJSON, retry 429/500/503 (1s, 3s), thinking off
  services/arxivService.js    Atom XML API (keyless), returns [] on error
  services/semanticScholarService.js  Graph API, optional key, returns [] on error
  services/embeddingService.js  @huggingface/transformers, Xenova/all-MiniLM-L6-v2, 384-dim, local CPU
  services/vectorSearchService.js  Atlas $vectorSearch with in-memory cosine fallback  ⚠ currently unused
  scripts/createVectorIndex.js     `npm run create-vector-index` (one-off)

client/src/
  App.jsx              routes: / · /session/:id · /session/:id/draft/:draftId · /about · /guide · /help
  api/researchApi.js   axios; baseURL = VITE_API_BASE_URL || "/api"
  hooks/useResearchSession.js  polling logic;  hooks/useDocumentTitle.js
  pages/               HomePage (TopicForm + RecentSessionsList), SessionPage (progress + tabs Gaps|Lit Review|Papers),
                       DraftPage (polls draft, IEEE layout, originality report, export LaTeX/Markdown/print-PDF),
                       AboutPage, HelpPage, ResultsGuidePage (explains RGCS to end users)
  utils/citations.js   [n] → anchor links;  utils/exportDraft.js  IEEEtran LaTeX (\cite merging, thebibliography) + Markdown
  components/          GapCard (RGCS badge: ≥70 green, ≥40 amber + 4 breakdown bars, select checkbox, closest work [n]),
                       PaperGeneratorPanel (top of Gaps tab), LiteratureReview (react-markdown+gfm, papers per theme, References),
                       PaperList, PipelineProgress, RecentSessionsList (with delete), ConfirmDialog, Navbar, TopicForm
  tailwind: custom `brand` palette = indigo (brand-600 #4f46e5). Icons: lucide-react.
client/public/         favicons, og-image, robots.txt, sitemap.xml, site.webmanifest (SEO added 2026-09-08)
```

## 5. RGCS — exact computation (gapDetectorAgent.js)

For each LLM-proposed gap, `supporting` = papers whose ids the LLM cited as closest existing work:
- **sparsity** = 100 × (1 − |supporting| / |all papers|)
- **recency** = 100 × (1 − avgAge/10), age = min(currentYear − year, 10)
- **citationTrend** = 100 × avgVelocity(supporting) / maxVelocity(all, ≥1), velocity = citations / (age+1)
- **llmNovelty** = LLM's own 0-100 number (default 50)
- **rgcs** = round(0.40·s + 0.25·r + 0.20·c + 0.15·n), all clamped 0-100; stored with `scoreBreakdown`.

arXiv papers have `citationCount: 0` (API doesn't give it) → they pull citationTrend down.
If you change weights, also update: the JSDoc above `runGapDetector`, README §RGCS, `ResultsGuidePage.jsx`, `AboutPage.jsx`, `HelpPage.jsx`.

## 5b. Citations & the paper writer

- **Citation keys**: prompts list papers as `[1]..[n]` (`formatPaperListForPrompt`, n = index in the list given). The LLM
  cites `[n]`; `createCitationRenumberer` rewrites to IEEE first-appearance order, sorts within groups, drops numbers
  that don't exist and `[ref]` placeholders. Lit review references include *all* papers (uncited appended);
  paper drafts include *only cited* papers. Classifier & gap detector still use `[id=externalId]` keys.
- **Paper writer** (`paperWriterAgent.js`, ~10-12 sequential Gemini calls, 1-2 min): fixed IEEE *proposal* template
  (Intro, Related Work, Research Gap, Proposed Approach, Evaluation Protocol, Discussion & Limitations, Conclusion).
  No experiments exist, so `WRITING_RULES` forbid reported results/percentages — modeled on a framework paper that
  defines its evaluation protocol before results. Each section prompt sees the whole outline (coherence).
  Multiple gaps → unified into one problem, lowest index (highest RGCS) = primary.
- **Originality**: any 8-word sequence shared with a source title/abstract = copied; that section gets one rewrite,
  then re-check; remaining overlaps stored in `originality.flaggedPassages`. Only covers session sources — UI says it's
  not a Turnitin substitute. Don't claim "plagiarism-free".
- Sessions created before this feature lack `literatureReview.references`; UI degrades (no numbers, hint to re-run).

## 6. Run / build / deploy

```bash
# local dev (needs server/.env from .env.example: GEMINI_API_KEY + MONGODB_URI)
cd server && npm install && npm run dev      # :5000, node --watch
cd client && npm install && npm run dev      # :5173, proxies /api → VITE_API_PROXY_TARGET or :5000
# full stack, no cloud
docker compose up --build                    # client :8080, server :5000, mongodb-atlas-local :27017
```
- **No tests, no linter, no TypeScript.** Verify by `npm run build` (client), `node --check` / starting server, and a real pipeline run.
- Prod: Vercel builds `client/` with `client/.env.production` → `VITE_API_BASE_URL=https://research-paper-gap-analyzer.onrender.com/api`.
  Render uses `render.yaml` (Docker, rootDir server); `CLIENT_ORIGIN=https://research-gap-finder-eight.vercel.app`.
  Secrets (`GEMINI_API_KEY`, `MONGODB_URI`, `SEMANTIC_SCHOLAR_API_KEY`) are set in the Render dashboard, never committed.
- `client/vercel.json` = SPA rewrite to index.html. `client/nginx.conf` = Docker path, proxies /api → server:5000.

## 7. Invariants — don't break these

- **Agents depend only on `askLLM`/`askLLMJSON`.** LLM provider is swappable in one file (it was already swapped
  Anthropic → Gemini because Gemini has a free tier). Keep provider details out of agents.
- **Free-tier first**: Gemini free tier, keyless arXiv/S2, local embeddings, Render free plan. Don't add paid deps casually.
- **Every LLM output must be grounded**: ids map back to real Papers; never trust LLM-invented papers.
- **RGCS stays explainable**: always store `scoreBreakdown` alongside `rgcs`; keep LLM weight minor.
- **Source services never throw** — they log and return `[]`, so one dead source doesn't kill the pipeline.
  Paper Finder throws only if *both* return nothing.
- Pipeline step names are an enum shared by model (`PIPELINE_STEPS`), orchestrator, and `PipelineProgress.jsx` `STEP_LABELS`.
- Error handler: only errors with `err.statusCode` show their message to clients; others → "Internal server error".
- Server is ESM (`"type": "module"`) — use `import`, include `.js` extensions in relative imports.

## 8. Gotchas / non-obvious facts

- `dotenv.config({ override: true })` — server/.env beats shell env on purpose (stale ambient keys bit us).
- `CLIENT_ORIGIN` trailing slash is stripped — CORS needs an exact match with the browser's Origin.
- `trust proxy = 1` is required on Render or every user shares one rate-limit bucket.
- Gemini "lite" models reject `thinkingConfig` (400); non-lite models need `thinkingBudget: 0` or thinking eats
  the output-token budget → empty response. Handled by the `modelSupportsThinkingConfig` check. Default model `gemini-flash-lite-latest`.
- Server Docker image must be Debian (`bookworm-slim`), not Alpine — onnxruntime-node needs glibc.
  (Dockerfile comments still say `@xenova/transformers`; the real dep is now `@huggingface/transformers`, swapped for a security fix.)
- First embedding call downloads the model (slow cold start on Render free tier, which also sleeps when idle).
- **Embeddings are computed and stored but not used by any agent yet.** `findSimilarPapers` and `askLLM` have no callers —
  they're groundwork for RAG / future agents. Atlas vector index is optional (in-memory fallback exists).
- Pipeline runs in-process (fire-and-forget promise). A server restart mid-run leaves the session stuck at `running`.
- Session list is global (no auth) — anyone can see/delete any session (and its drafts).
- Semantic Scholar keyless tier often 429s → corpus is arXiv-only → no venues and all citationCount 0 (weakens
  citationTrend in RGCS and IEEE refs fall back to arXiv ids). Setting SEMANTIC_SCHOLAR_API_KEY fixes it.
- `render.md` is gitignored (local deploy notes).

## 9. Roadmap / not built (deliberate MVP scope)

Planned: Novelty Checker (check user's idea against the corpus), Citation Network graph,
Methodology Generator (datasets/metrics for a gap). Paper Writing Assistant is DONE (paper writer). Also missing: auth/user
scoping, background paper monitoring, job queue, tests, paywalled sources (Google Scholar/IEEE intentionally excluded).

## 10. Recipes

- **Add an agent**: create `server/src/agents/xAgent.js` using `askLLMJSON` + `[id=...]` prompting → add step name to
  `PIPELINE_STEPS` in ResearchSession.js (+ schema field for its output) → call it in orchestrator with setStep →
  add label in `PipelineProgress.jsx` → render result in SessionPage (new tab).
- **Change LLM/model**: edit `services/llmService.js` only (+ `GEMINI_MODEL` env / render.yaml).
- **Add a paper source**: new service returning the shared paper shape `{externalId, source, title, abstract, authors,
  year, doi, url, citationCount}` + add it to the `source` enum in Paper.js + merge in paperFinderAgent.
- **New API route**: route in researchRoutes.js (wrap with `asyncHandler`, add `validateObjectIdParam` for :id) →
  controller → client function in `api/researchApi.js`.
- **Change the paper template**: edit `SECTIONS` / `WRITING_RULES` in paperWriterAgent.js; DraftPage and exports
  render whatever sections come back (Roman numerals by position).
- **New page**: page in `client/src/pages/` with `useDocumentTitle`, route in App.jsx, link in the `NAV_LINKS`-style array at top of Navbar.jsx, entry in `public/sitemap.xml`.

## 11. Conventions

JS only, 2-space indent, double quotes, semicolons. Functional React components + hooks, Tailwind utility classes
inline (no CSS modules). Comments explain *why* (often a past bug), not *what* — keep that style.
Commits: short imperative messages on `main`.
