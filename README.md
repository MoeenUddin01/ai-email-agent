# AI Email Agent

AI-powered email reply agent for Gmail with RAG (Retrieval-Augmented Generation) from your knowledge base.

## Features

- ✉️ **Gmail Integration**: Sync emails from Primary inbox (read, send, modify)
- 🤖 **AI-Powered Replies**: Generate intelligent responses using Groq/OpenAI/Gemini with automatic fallback
- 📚 **RAG Pipeline**: Retrieve relevant context from your course/program knowledge base using local embeddings
- ✏️ **Human-in-the-Loop**: Edit drafts before sending (never auto-sends)
- ⭐ **Feedback System**: Rate replies (1-5 stars) and provide textual feedback with aggregate statistics
- 🔐 **Dual OAuth**: Supabase Auth (Google login) + separate Gmail API OAuth for email access
- 💾 **Local Embeddings**: Uses `all-MiniLM-L6-v2` (384-dim) via sentence-transformers on CPU
- 🎨 **Premium Dark UI**: Modern Next.js frontend with Tailwind CSS and glassmorphism effects
- ⚡ **Persistent State**: Emails cached in `sessionStorage` for instant navigation without re-syncing
- 🏥 **Health Dashboard**: Comprehensive health check endpoint monitoring all system components
- 🧪 **Mock Email System**: Built-in mock emails for testing without live Gmail connection
- 🗄️ **Multiple DB Migrations**: Schema management for `gmail_credentials` and `user_credentials` tables

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Vercel        │────▶│     Railway        │────▶│    Supabase     │
│   (Frontend)    │     │   (Backend API)    │     │   (Database)    │
│   Next.js       │     │   FastAPI          │     │   + Vector DB   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │   Gmail API      │
                        │   Groq API       │
                        │ Local Embeddings │
                        └──────────────────┘
```

## Quick Start

### 1. Clone & Install Dependencies

```bash
# Clone repository
git clone <repository-url>
cd ai-email-agent

# Install backend dependencies with uv
uv sync

# Frontend dependencies
cd frontend
npm install
```

### 2. Environment Setup

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required services:
- **Supabase**: Create project, enable pgvector extension, run schema.sql, configure Auth with Google provider
- **Google Cloud**: Create OAuth 2.0 credentials for Gmail API and Supabase Auth
- **Groq**: Get API key (recommended) OR OpenAI/Gemini API keys

### 3. Database Setup

1. **Enable pgvector extension** in Supabase SQL Editor:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

2. **Run the main schema** (`backend/database/schema.sql`) — creates 6 tables, RLS policies, and functions

3. **(Optional) Run migration scripts** for OAuth credential storage:
   - `database/migrations/001_create_user_credentials.sql`
   - `database/migrations/002_create_gmail_credentials.sql`

4. **Ingest your knowledge base**:
```bash
cd backend/scripts
uv run python ingest_csv.py --csv ../../data/vizaura_courses_dataset.csv
```

### 4. Configure Supabase Auth

1. **Go to your Supabase project**: Authentication → Providers
2. **Enable Google provider** with your OAuth credentials
3. **Update redirect URI** in Google Cloud Console to:
   ```
   https://your-project.supabase.co/auth/v1/callback
   ```

### 5. Frontend Environment Setup

Create `frontend/.env.local` with:
```bash
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
NEXT_PUBLIC_BACKEND_URL="http://localhost:8000"
```

### 6. Run Development Servers

```bash
# Terminal 1: Backend (from project root)
uv run uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2: Frontend
cd frontend
npm run dev
```

Or run the full UI with a single command:

```bash
./run.sh
```

Visit:
- Backend API: `http://localhost:8000/docs`
- Frontend: `http://localhost:3000`

## Project Structure

```
ai-email-agent/
├── src/                               # Main source code
│   ├── api/                           # FastAPI application
│   │   ├── routers/
│   │   │   ├── auth.py               # Supabase Auth + Gmail OAuth endpoints
│   │   │   ├── emails.py             # Email management + mock emails for testing
│   │   │   ├── drafts.py             # AI draft generation & sending
│   │   │   ├── feedback.py           # Rating system + feedback stats
│   │   │   ├── knowledge.py          # Vector DB management (CRUD + search)
│   │   │   └── health.py             # System health dashboard
│   │   ├── main.py                   # FastAPI app entry + CORS
│   │   ├── config.py                 # Pydantic Settings from .env
│   │   └── static/
│   │       └── index.html            # Backend landing page
│   ├── db/
│   │   └── supabase.py               # DB client (CRUD for all tables)
│   ├── email/
│   │   └── gmail.py                  # Gmail API service (OAuth, fetch, send)
│   ├── rag/
│   │   └── service.py                # RAG pipeline (embeddings, search, LLM)
│   └── auth/
│       └── __init__.py
├── backend/                           # Backend resources (NOT in src)
│   ├── database/
│   │   └── schema.sql                # Main schema: 6 tables + pgvector + RLS + functions
│   └── scripts/
│       ├── ingest_csv.py             # CSV ingestion to vector DB
│       ├── migrate_embeddings.py     # 1536→384 dim migration script
│       └── fix_rls_policies.sql      # Custom JWT RLS policies
├── database/
│   └── migrations/
│       ├── 001_create_user_credentials.sql   # OAuth token storage table
│       └── 002_create_gmail_credentials.sql  # Gmail-specific OAuth credentials
├── frontend/                          # Next.js application
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx              # Login page (Supabase Auth)
│   │   │   ├── layout.tsx            # Root layout (dark theme)
│   │   │   ├── globals.css           # Tailwind + dark theme CSS vars
│   │   │   ├── auth/
│   │   │   │   ├── callback/
│   │   │   │   │   └── page.tsx      # Supabase OAuth callback
│   │   │   │   └── gmail/
│   │   │   │       └── callback/
│   │   │   │           └── page.tsx  # Gmail OAuth callback
│   │   │   ├── inbox/
│   │   │   │   └── page.tsx          # Email inbox (sidebar + detail pane)
│   │   │   └── reply/
│   │   │       └── [id]/
│   │   │           └── page.tsx      # Reply editor + AI draft + approve/send + feedback
│   │   ├── utils/
│   │   │   ├── supabase.ts           # Supabase client
│   │   │   └── cn.ts                 # cn() utility (clsx + tailwind-merge)
│   │   └── types/
│   │       └── index.ts              # TypeScript interfaces
│   ├── .env.local
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── postcss.config.js
├── data/
│   └── vizaura_courses_dataset.csv   # 150 course/program entries
├── run.sh                            # One-command startup script
├── debug-auth.js                     # Supabase auth debug script
├── create_gmail_credentials_table.py # Script to create gmail_credentials table via API
├── setup_gmail_table.sql             # Standalone SQL for gmail_credentials table
├── .python-version                   # Python 3.12
├── .env.example
├── .env
├── pyproject.toml
├── package.json
├── CLAUDE.md                         # Full project specification
└── README.md
```

## API Endpoints

### Root
- `GET /` - Backend landing page
- `GET /ping` - Simple health check (`{"status": "ok"}`)

### Authentication
- `GET /auth/me` - Get current authenticated user
- `GET /auth/gmail` - Get Gmail OAuth authorization URL
- `GET /auth/gmail/callback` - Exchange Gmail OAuth code for credentials (`code` query param)
- `POST /auth/gmail/store-credentials` - Store Gmail OAuth tokens

### Emails
- `GET /emails/` - List emails (`?status=`, `?limit=50`, `?offset=0`)
- `GET /emails/{id}` - Get email details
- `POST /emails/sync` - Fetch emails from Gmail (returns results, does NOT persist to DB)
- `POST /emails/{id}/process` - Generate AI draft for an email (supports `mock-1`, `mock-2`)
- `POST /emails/process-direct` - Generate AI draft from inline email data (no DB lookup)

### Drafts
- `GET /drafts/{email_id}` - Get AI draft for an email
- `POST /drafts/{email_id}/regenerate` - Regenerate draft
- `POST /drafts/send` - Send approved draft (`{email_id, final_content, recipient?, subject?, draft_id?}`)

### Feedback
- `POST /feedback/` - Submit rating (1-5) and optional text feedback
- `GET /feedback/stats` - Get feedback statistics (total, avg rating, distribution)

### Knowledge Base
- `POST /knowledge/ingest` - Upload & ingest CSV file into vector DB
- `POST /knowledge/search` - Search vectors by similarity (`{query, limit?}`)
- `GET /knowledge/documents` - List all documents (`?limit=50`, `?offset=0`)
- `DELETE /knowledge/{id}` - Delete a knowledge document

### Health
- `GET /health/health` - Full system health check (DB, AI, Knowledge, System, Auth)
- `GET /health/status` - Simple status for load balancers
- `GET /health/metrics` - System metrics (CPU, memory, disk, network, process)
- `GET /health/gmail-status` - Check Gmail connection status

## Workflow

1. User authenticates via **Supabase Auth** (Google OAuth — login to app)
2. User connects Gmail via **separate Gmail OAuth** (grants email API access)
3. Emails are fetched from Gmail and cached in frontend `sessionStorage`
4. User selects an email to reply to
5. System retrieves relevant docs via RAG (vector similarity search)
6. AI generates draft reply with context (Groq → OpenAI → Gemini fallback)
7. User reviews and edits the draft in the reply editor
8. User clicks "Approve & Send"
9. Email sent via Gmail API with proper `recipient` and `subject`; `recipient`/`subject` auto-populated from sessionStorage if email not persisted in DB; placeholder email record created with UUID if needed (handles both UUID and Gmail message ID as `email_id`)
10. User provides star rating (1-5) and optional text feedback

## Environment Variables

Create `.env` file with the following variables:

```bash
# Supabase
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_KEY="your-service-role-key"
SUPABASE_ANON_KEY="your-anon-key"

# Gmail API
GMAIL_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GMAIL_CLIENT_SECRET="your-client-secret"
GMAIL_REDIRECT_URI="http://localhost:3000/auth/gmail/callback"

# LLM API (choose one or more)
GROQ_API_KEY="gsk_your-groq-key"              # Recommended - fast & affordable
OPENAI_API_KEY="sk-your-openai-key"            # Optional
GEMINI_API_KEY="your-gemini-key"                # Optional

# Authentication (for Supabase Auth verification)
JWT_SECRET="your-jwt-secret"

# URLs
BACKEND_URL="http://localhost:8000"
FRONTEND_URL="http://localhost:3000"
```

### Frontend Environment Variables (`frontend/.env.local`)

```bash
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
NEXT_PUBLIC_BACKEND_URL="http://localhost:8000"
NEXT_PUBLIC_FRONTEND_URL="http://localhost:3000"
```

### LLM Provider Options

The system tries providers in order with automatic fallback on failure:

1. **Groq (Recommended)**: `llama-3.3-70b-versatile` via `AsyncGroq` client
2. **OpenAI**: `gpt-4` via `AsyncOpenAI` (skipped if key is placeholder)
3. **Gemini**: `gemini-2.0-flash` via OpenAI-compatible endpoint at `generativelanguage.googleapis.com`

Embeddings always use local **`all-MiniLM-L6-v2`** (384 dimensions) via `sentence-transformers` on CPU — no API key needed.

## Troubleshooting

### Common Issues

1. **CUDA errors during ingestion**: The system automatically uses CPU mode for embeddings
2. **Dimension mismatch**: Run the migration script if switching between embedding providers
3. **API key errors**: Ensure your LLM API key is valid and has sufficient quota
4. **Database connection**: Verify Supabase URL and service key are correct
5. **Send fails with CORS + 500**: Check backend log for exact error. Common causes:
   - `get_supabase_client` not imported in `drafts.py`
   - `public.users` table empty — user auto-created in send flow, but ensure Supabase Auth user exists
   - `sent_emails.email_id` expects UUID but Gmail message ID passed — backend auto-resolves by `gmail_id`
6. **Email stored but not delivered ("Recipient address required")**: Frontend must pass `recipient` and `subject` in send request. Backend updates existing email records if they have empty `sender`/`subject`

### Migration Scripts

**Update embeddings dimensions** (e.g., switching from OpenAI 1536-dim to local 384-dim):
```bash
cd backend/scripts
uv run python migrate_embeddings.py
```

**Fix RLS policies** (if using custom JWT instead of `auth.uid()`):
```bash
# Run in Supabase SQL Editor
backend/scripts/fix_rls_policies.sql
```

**Create gmail_credentials table via API**:
```bash
uv run python create_gmail_credentials_table.py
```

**Debug Supabase Auth**:
```bash
node debug-auth.js
```

### Additional Scripts

| Script | Description |
|--------|-------------|
| `run.sh` | One-command startup: backend + frontend in background |
| `backend/scripts/ingest_csv.py --csv <path> --clear` | Ingest CSV; `--clear` empties existing vectors |
| `backend/scripts/migrate_embeddings.py` | Drop & recreate table for 384-dim embeddings |
| `backend/scripts/fix_rls_policies.sql` | RLS using `current_setting('app.current_user_id')` |
| `create_gmail_credentials_table.py` | Create gmail_credentials table via API |
| `debug-auth.js` | Test Supabase connection and OAuth URL generation |

## Development Status

✅ **Completed Features:**
- Backend API with FastAPI (20+ endpoints)
- RAG pipeline with local `all-MiniLM-L6-v2` embeddings (384-dim)
- Gmail integration (OAuth, sync, send, modify)
- Dual OAuth: Supabase Auth + Gmail API OAuth
- Supabase database with pgvector (7 tables)
- CSV ingestion for knowledge base
- Feedback system with aggregate stats
- Next.js frontend with Tailwind CSS dark UI
- Mock email system for testing without Gmail
- sessionStorage caching for instant navigation
- Health dashboard with system metrics
- LLM provider fallback (Groq → OpenAI → Gemini)
- Database migration scripts for all tables
- Send flow with auto-user/email creation, UUID resolution, recipient/subject passthrough

⬜ **Pending:**
- Production deployment

## Deployment

### Backend (Railway)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy
railway login
railway init
railway up
```

### Frontend (Vercel)
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
cd frontend
vercel --prod
```

### Environment Setup for Production

1. Set all environment variables in Railway dashboard
2. Update redirect URIs in Google Cloud Console
3. Configure Supabase RLS policies for production

## License

MIT
