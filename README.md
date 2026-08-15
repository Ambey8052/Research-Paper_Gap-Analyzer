# ResearchMind

**An AI-Powered Multi-Agent Research Assistant for Literature Review and Research Gap Identification**

ResearchMind automates the part of research that eats the most time before any real work
begins: finding relevant papers, reading dozens of abstracts, spotting trends, and figuring out
what hasn't been done yet. Give it a topic and it runs four cooperating AI agents that search
real academic sources, cluster the results, synthesize a structured literature review, and
surface candidate research gaps — each with an explainable confidence score instead of a bare
LLM opinion.

## Table of contents

- [Why this exists](#why-this-exists)
- [How it's different from ChatGPT / NotebookLM / Elicit](#how-its-different-from-chatgpt--notebooklm--elicit)
- [Architecture](#architecture)
- [The agent pipeline](#the-agent-pipeline)
- [Research Gap Confidence Score (RGCS)](#research-gap-confidence-score-rgcs)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Deploying (frontend on Vercel, backend on Render)](#deploying-frontend-on-vercel-backend-on-render)
- [API reference](#api-reference)
- [Development process](#development-process)
- [Known limitations & future work](#known-limitations--future-work)

## Why this exists

A student told to "find a research topic on Agentic AI" typically spends weeks manually
searching Google Scholar, IEEE Xplore, Springer, ACM, and arXiv, reading 30–50 papers, comparing
methods, and trying to spot an unexplored corner worth building on. Existing AI tools
(NotebookLM, Elicit, SciSpace, Consensus, or just asking Claude/ChatGPT to summarize a PDF) help
with the *reading* part. None of them reliably do the *comparing 50 papers at once and telling
you what's missing* part — because that requires reasoning across a whole corpus, not answering
questions about one document at a time.

## How it's different from ChatGPT / NotebookLM / Elicit

| | Existing AI research tools | ResearchMind |
|---|---|---|
| Scope | One or a few papers at a time | Searches and reasons over 20–40+ papers together |
| Interaction | Manual prompting, Q&A | One topic in, a full workflow runs automatically |
| Gap finding | Not a first-class feature | Dedicated agent, with a transparent scoring formula |
| Output | Free-form chat answers | Structured session: clusters → review → scored gaps |

The novel contribution isn't "an AI that reads PDFs" — it's the **Research Gap Confidence
Score**, an explainable formula (not just an LLM's raw guess) for ranking how genuine a candidate
gap is. See [below](#research-gap-confidence-score-rgcs) for the exact formula and reasoning.

## Architecture

```
                         ┌─────────────────────┐
                         │   React + Tailwind   │  client/  (Vite, port 5173 dev / 80 in Docker)
                         │   client (browser)   │
                         └──────────┬───────────┘
                                    │ REST (polls session status every 2s)
                                    ▼
                         ┌─────────────────────┐
                         │   Express API        │  server/  (port 5000)
                         │   researchController  │
                         └──────────┬───────────┘
                                    │ fire-and-forget
                                    ▼
                         ┌─────────────────────┐
                         │     Orchestrator      │  agents/orchestrator.js
                         │  runs steps in order,  │
                         │  persists progress     │
                         └──────────┬───────────┘
              ┌─────────────┬───────┴───────┬─────────────┐
              ▼             ▼               ▼             ▼
        Agent 1:       Agent 2:        Agent 3:       Agent 4:
        Paper Finder   Classifier      Literature      Gap Detector
                                       Review Writer
              │             │               │             │
              ▼             ▼               ▼             ▼
        arXiv API     Gemini (cluster   Gemini          Gemini (candidate
        Semantic      papers into       (synthesize     gaps) + quantitative
        Scholar API   sub-topics)       review JSON)    RGCS scoring
              │
              ▼
        Local embedding model
        (Xenova/all-MiniLM-L6-v2,
        runs in-process, no API key)
              │
              ▼
        MongoDB (Atlas Vector Search)
        Paper + ResearchSession collections
```

The frontend never talks to Gemini, arXiv, or Semantic Scholar directly — all of that is
server-side. The client just creates a session and polls `GET /api/research/:id` until the
pipeline finishes, rendering the `steps[]` array as a live progress tracker.

## The agent pipeline

This MVP implements the core 4-agent workflow (of the larger 8-agent design described below in
[Future work](#known-limitations--future-work)):

### Agent 1 — Paper Finder (`server/src/agents/paperFinderAgent.js`)
Queries **arXiv** and **Semantic Scholar** in parallel (both free, no API key required),
dedupes results by normalized title, and embeds each paper's title+abstract locally using
`@xenova/transformers` (`Xenova/all-MiniLM-L6-v2`, 384-dim vectors) — no external embedding API
or key needed. Papers are upserted into MongoDB.

### Agent 2 — Classifier (`classifierAgent.js`)
Sends the paper set to Gemini, which groups them into 3–8 coherent sub-topic clusters (e.g.
"Multi-Agent Coordination", "Clinical Diagnosis Applications") and tags each paper with keywords.
This turns a flat list of papers into a structure the later agents can reason about by theme.

### Agent 3 — Literature Review Writer (`literatureReviewAgent.js`)
Asks Gemini to synthesize (not copy) a structured review from the clustered papers: an
introduction, a per-cluster "related work" summary, a cross-cluster trends paragraph, and a
comparison table with each paper's key contribution.

### Agent 4 — Gap Detector (`gapDetectorAgent.js`)
Gemini proposes 3–6 candidate research gaps grounded in the actual clusters and papers (it's
instructed not to invent papers it wasn't given). Each candidate is then scored with the RGCS
formula below, combining Gemini's own novelty estimate with quantitative signals computed
directly from the paper metadata.

## Research Gap Confidence Score (RGCS)

The risk with "AI finds research gaps" is that the model just asserts something plausible-sounding
with no way to check it. RGCS makes the score explainable by blending four sub-scores, three of
which are computed from real paper metadata rather than trusted from the model:

```
RGCS = 0.40 × sparsity + 0.25 × recency + 0.20 × citationTrend + 0.15 × llmNovelty
```

| Sub-score | Weight | How it's computed |
|---|---|---|
| **Sparsity** | 40% | `100 × (1 − supportingPapers / totalPapers)` — fewer papers directly touching the gap, relative to the whole corpus, means it's more under-explored. |
| **Recency** | 25% | How recent the *adjacent* supporting papers are. Recent activity nearby suggests a live, moving area rather than an abandoned one. |
| **Citation trend** | 20% | Average citation velocity (citations ÷ years since publication) of the supporting papers, normalized against the corpus max — is this a "hot" area? |
| **LLM novelty** | 15% | Gemini's own 0–100 estimate, kept as the smallest weight so the score isn't just the model's opinion restated as a number. |

The full breakdown (not just the final number) is returned to the frontend and shown on every gap
card, so the score is auditable rather than a black box. Implementation: `computeQuantitativeScores()`
in `server/src/agents/gapDetectorAgent.js`.

## Tech stack

**Frontend** — React 18, Vite, React Router, Tailwind CSS, react-markdown, lucide-react.

**Backend** — Node.js, Express, Mongoose.

**AI / ML**
- [Google Gemini API](https://aistudio.google.com/apikey) (`@google/genai`) — classification, literature synthesis, and gap reasoning. Free tier, no credit card required.
- `@xenova/transformers` running `Xenova/all-MiniLM-L6-v2` locally in the Node process — text embeddings, no external API or key.
- arXiv Atom API + Semantic Scholar Graph API — free, keyless paper search.

**Data** — MongoDB with **Atlas Vector Search** for the embedding similarity layer. Local dev
and Docker default to the official [`mongodb/mongodb-atlas-local`](https://hub.docker.com/r/mongodb/mongodb-atlas-local)
image, which runs the same `mongot` search engine as cloud Atlas — so `$vectorSearch` works
identically with zero cloud setup, and swapping `MONGODB_URI` to a real Atlas cluster for
production is a one-line change. If no vector index has been created yet, the app transparently
falls back to an in-memory cosine-similarity scan (see `vectorSearchService.js`) so the pipeline
never breaks waiting on index setup.

**Infra** — Docker + Docker Compose (three services: `mongodb`, `server`, `client`/nginx).

## Project structure

```
Research-Gap/
├── docker-compose.yml
├── client/                          # React + Vite + Tailwind
│   ├── Dockerfile                   # multi-stage build → nginx
│   ├── nginx.conf                   # SPA fallback + /api reverse proxy
│   └── src/
│       ├── api/researchApi.js       # axios calls to the backend
│       ├── hooks/useResearchSession.js  # polling hook
│       ├── components/              # TopicForm, PipelineProgress, PaperList,
│       │                            # LiteratureReview, GapCard, Navbar
│       └── pages/                   # HomePage, SessionPage
└── server/                          # Express API
    ├── Dockerfile                   # Debian-based (onnxruntime needs glibc, not musl)
    └── src/
        ├── config/                  # env.js, db.js
        ├── models/                  # Paper.js, ResearchSession.js
        ├── services/                # arxivService, semanticScholarService,
        │                            # embeddingService, claudeService, vectorSearchService
        ├── agents/                  # paperFinderAgent, classifierAgent,
        │                            # literatureReviewAgent, gapDetectorAgent, orchestrator
        ├── controllers/ + routes/   # researchController, researchRoutes
        └── scripts/createVectorIndex.js  # one-off Atlas Search index setup
```

## Getting started

### Option A — Docker (recommended)

1. Copy the env template and add your Gemini API key (free, no card needed — grab one at
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey)):
   ```bash
   cp server/.env.example server/.env
   # edit server/.env and set GEMINI_API_KEY=...
   ```
2. Build and start everything:
   ```bash
   docker compose up --build
   ```
3. Open **http://localhost:8080**. The API runs on port 5000, MongoDB (Atlas-local) on 27017.
4. (Optional, recommended) Create the vector search index once the stack is up:
   ```bash
   docker compose exec server npm run create-vector-index
   ```
   Until this is run, semantic similarity lookups automatically fall back to an in-memory scan —
   the app works either way.

### Option B — Local dev without Docker

Requires Node 18+ and a MongoDB instance (local `mongod`, the `mongodb-atlas-local` image run
standalone, or a real Atlas cluster).

```bash
# Backend
cd server
cp .env.example .env      # fill in GEMINI_API_KEY and MONGODB_URI
npm install
npm run dev                # http://localhost:5000

# Frontend (separate terminal)
cd client
npm install
npm run dev                 # http://localhost:5173, proxies /api to :5000
```

> **Windows note:** the embedding model dependency (`@xenova/transformers`) pulls in `sharp` for
> its native bindings. A normal `npm install` fetches a prebuilt binary automatically; if your
> npm setup blocks install scripts (e.g. a lavamoat/allow-scripts policy), run
> `npm install-scripts approve sharp` once.

> **`querySrv ECONNREFUSED` when connecting to Atlas:** some ISPs, routers, VPNs, and antivirus
> tools don't pass through DNS SRV queries, which `mongodb+srv://` connection strings depend on
> for auto-discovery. If you hit this, switch `MONGODB_URI` to the non-SRV "standard connection
> string" form instead — get it from Atlas UI under **Connect → Drivers**, there's a toggle
> between the SRV and standard formats (it lists the shard hosts directly, e.g.
> `mongodb://user:pass@shard-00-00.xxxxx.mongodb.net:27017,shard-00-01...,shard-00-02.../db?ssl=true&replicaSet=...&authSource=admin`).
> This is what `server/.env` in this project already uses, for exactly this reason.

> **`401 invalid x-api-key` that persists no matter what you put in `.env`:** this means some
> other `GEMINI_API_KEY` (or old `ANTHROPIC_API_KEY`, if you're migrating from an earlier version
> of this project) is already set in your shell or Windows environment variables, and it's
> shadowing the project's `.env` file. `server/src/config/env.js` calls
> `dotenv.config({ override: true })` specifically so this project's own `.env` always wins — if
> you're still seeing this, fully restart the terminal (not just the Node process) so it picks up
> a fresh environment.

## Deploying (frontend on Vercel, backend on Render)

This is the recommended way to share a live link with people who shouldn't have to run Docker
themselves. The two services are deployed independently and talk to each other over HTTPS —
there's no shared origin, so this is different from the Docker/nginx setup where nginx proxies
`/api` locally.

**Why not deploy the backend to Vercel too?** Vercel runs serverless functions, not a persistent
process. This app's pipeline is fire-and-forget — the API responds immediately with a session id
while Agents 2–4 keep running in the background — and serverless functions get frozen right after
the response is sent, so the pipeline would never finish. Render (and Railway, Fly.io, etc.) run
your `server/Dockerfile` as a normal long-lived process, which this architecture actually needs.

### 1. Backend → Render

1. In the Render dashboard: **New → Web Service**, connect this GitHub repo.
   - Either let Render pick up `render.yaml` automatically (**New → Blueprint** instead, if you
     want it to configure itself from the file at the repo root), or configure manually:
     **Root Directory: `server`**, **Runtime: Docker**, **Plan: Free**.
2. Add these environment variables in the Render dashboard (the free plan doesn't read `.env`
   files — everything must be set here):
   | Key | Value |
   |---|---|
   | `GEMINI_API_KEY` | your key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
   | `GEMINI_MODEL` | `gemini-flash-lite-latest` |
   | `MONGODB_URI` | your Atlas connection string |
   | `CLIENT_ORIGIN` | your Vercel URL, e.g. `https://research-gap-finder-eight.vercel.app` |
   | `VECTOR_INDEX_NAME` | `paper_vector_index` |
   | `MAX_PAPERS_PER_SEARCH` | `40` |
3. **MongoDB Atlas → Network Access:** add `0.0.0.0/0` (allow from anywhere). Render's free tier
   doesn't have a static outbound IP, so you can't allowlist a single address.
4. Deploy, then copy the resulting URL.

> **Free tier cold starts:** Render's free web services sleep after 15 minutes of inactivity. The
> first request after a lull takes ~30–50s to wake up — normal, not a bug. Anyone you send the
> link to should expect that on the first search.

### 2. Frontend → Vercel

You've likely already deployed the frontend (Vercel auto-detects the Vite app). It needs to know
the Render backend's URL at **build time** (Vite env vars are baked into the static bundle, not
read at runtime), so this repo commits `client/.env.production` — not a secret, just the public
backend URL — which Vite loads automatically for every production build:

```
VITE_API_BASE_URL=https://<your-render-service>.onrender.com/api
```

If you change backend URLs later, either edit that file and push (Vercel auto-redeploys on push),
or override it without touching the repo via Vercel → **Settings → Environment Variables** →
`VITE_API_BASE_URL` (dashboard values take precedence over the committed file) → redeploy.

**This live instance:** frontend at
[research-gap-finder-eight.vercel.app](https://research-gap-finder-eight.vercel.app), backend at
`research-paper-gap-analyzer.onrender.com`, wired together via the two mechanisms above —
`client/.env.production` pointing at the Render URL, and `CLIENT_ORIGIN` on Render set to the
Vercel URL for CORS.

Once both are set, the flow is: browser → Vercel (static React) → Render (`/api/*`) → MongoDB
Atlas + Gemini. Local Docker dev is unaffected — `VITE_API_BASE_URL` is unset there, so the
client falls back to same-origin `/api`, which nginx proxies to the `server` container.

## API reference

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/research` | Body `{ topic }`. Creates a session and starts the pipeline in the background. Returns `{ sessionId }`. |
| `GET` | `/api/research` | Lists the 20 most recent sessions (topic, status, paper count). |
| `GET` | `/api/research/:id` | Full session: pipeline `steps[]`, `clusters[]`, `literatureReview`, `gaps[]`. Poll this every ~2s while `status` is `pending`/`running`. |
| `GET` | `/api/research/:id/papers` | The papers found for a session, with cluster/topic tags. |
| `GET` | `/api/health` | Liveness check. |

## Development process

This MVP was scoped and built as a single focused pass:

1. **Requirements clarification** — rather than assuming defaults, the LLM provider, paper
   sources (arXiv + Semantic Scholar, both free/keyless), vector store (MongoDB Atlas Vector
   Search), and pipeline scope (core 4 agents vs. all 8) were confirmed explicitly before writing
   code, since each is a real architectural fork rather than a style choice.
2. **Backend first** — Mongoose schemas, then external service wrappers (arXiv, Semantic
   Scholar, local embeddings, the LLM client), then the four agents, then the orchestrator that
   chains them and persists progress for polling.
3. **Frontend** — a thin polling-based UI (topic form → live pipeline tracker → tabbed results:
   gaps / literature review / papers), intentionally kept simple so the agent logic stays the
   centerpiece.
4. **Dockerization** — a Debian-based (not Alpine) server image, since `onnxruntime-node`'s
   prebuilt binaries require glibc; an nginx multi-stage build for the client; and
   `mongodb-atlas-local` so `docker compose up` needs no cloud account to try the whole thing.
5. **LLM provider swap mid-build** — the project initially integrated Anthropic Claude, but that
   requires a paid, funded API key. Once that became a blocker, the LLM layer was swapped to the
   **Google Gemini API**, which has a genuinely free tier (no credit card). Because the agents
   only depend on two small functions (`askLLM` / `askLLMJSON` in `services/llmService.js`), the
   swap touched exactly one service file plus three import lines in the agents — the
   agent/orchestrator/RGCS logic itself didn't change.
6. **Verification** — every server file syntax-checked; the Express app import-tested; the
   embedding pipeline run end-to-end to confirm real vectors come out; the arXiv and Semantic
   Scholar integrations hit against their live APIs (arXiv returned real 2026 papers; Semantic
   Scholar's keyless tier rate-limited under test, which the code handles by degrading
   gracefully instead of crashing the pipeline); MongoDB Atlas connectivity, auth, and write
   permissions confirmed against the real cluster; the client built cleanly with Vite.

## Known limitations & future work

This is deliberately the **core 4-agent MVP** (Paper Finder → Classifier → Literature Review →
Gap Detector). The original design considered a fuller 8-agent pipeline; the remaining four are
natural extensions once the core loop is validated:

- **Agent 5 — Novelty Checker**: cross-check a user's own proposed idea against the corpus and
  flag how much overlap already exists.
- **Agent 6 — Citation Network**: visualize how papers cite each other to show how the field
  evolved over time (Semantic Scholar's API already returns citation data this could build on).
- **Agent 7 — Methodology Generator**: given a chosen gap, suggest datasets, architectures, and
  evaluation metrics.
- **Agent 8 — Paper Writing Assistant**: draft an abstract/intro/methodology outline for the
  chosen gap.

Other honest limitations of the current MVP:
- No authentication — sessions are not scoped to a user account.
- No continuous/background monitoring of new papers (each session is a one-shot search).
- Google Scholar, IEEE Xplore, and other paywalled/no-API sources are intentionally out of scope
  for the MVP — see the [Tech stack](#tech-stack) section for why arXiv + Semantic Scholar were
  chosen instead.
- The Atlas vector index must be created manually (`npm run create-vector-index`) for
  production-grade similarity search; without it, the app still works via an in-memory fallback,
  which is fine at MVP scale (tens of papers per session) but wouldn't scale to a shared corpus.
