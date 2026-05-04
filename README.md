# AI Email Agent

AI-powered email reply agent for Gmail with RAG (Retrieval-Augmented Generation) from your knowledge base.

## Features

- ✉️ **Gmail Integration**: Sync emails from Primary inbox
- 🤖 **AI-Powered Replies**: Generate intelligent responses using Groq/OpenAI/Gemini
- 📚 **RAG Pipeline**: Retrieve relevant context from your course/program knowledge base
- ✏️ **Human-in-the-Loop**: Edit drafts before sending (never auto-sends)
- ⭐ **Feedback System**: Rate replies and provide textual feedback
- 🔐 **Secure Authentication**: Supabase Auth with Google OAuth integration
- 💾 **Local Embeddings**: Uses sentence-transformers for cost-effective vector storage
- 🎨 **Modern UI**: Next.js frontend with Tailwind CSS

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

2. **Run the schema** (`backend/database/schema.sql`)

3. **Ingest your knowledge base**:
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

Visit:
- Backend API: `http://localhost:8000/docs`
- Frontend: `http://localhost:3000`

## Project Structure

```
ai-email-agent/
├── src/                               # Main source code
│   ├── api/                           # FastAPI application
│   │   ├── routers/
│   │   │   ├── auth.py               # Supabase Auth verification
│   │   │   ├── emails.py             # Email management
│   │   │   ├── drafts.py             # AI draft generation
│   │   │   ├── feedback.py           # Rating system
│   │   │   └── knowledge.py          # Vector DB management
│   │   ├── main.py                   # FastAPI app entry
│   │   └── config.py                 # Settings
│   ├── db/
│   │   └── supabase.py               # Database client
│   ├── email/
│   │   └── gmail.py                  # Gmail API service
│   └── rag/
│       └── service.py                # RAG pipeline service
├── backend/                           # Backend resources (NOT in src)
│   ├── database/
│   │   └── schema.sql                # Database schema
│   └── scripts/
│       ├── ingest_csv.py             # CSV ingestion tool
│       └── migrate_embeddings.py     # Database migration tool
├── frontend/                          # Frontend application (at root)
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx              # Login page with Supabase Auth
│   │   │   ├── auth/
│   │   │   │   └── callback/
│   │   │   │       └── page.tsx      # Auth callback handler
│   │   │   ├── inbox/
│   │   │   │   └── page.tsx          # Email list
│   │   │   └── reply/
│   │   │       └── [id]/
│   │   │           └── page.tsx      # Reply editor
│   │   ├── utils/
│   │   │   └── supabase.ts           # Supabase client
│   │   └── types/
│   ├── .env.local                     # Frontend environment variables
│   ├── package.json
│   └── next.config.js
├── data/                             # Data directory (at root)
│   └── vizaura_courses_dataset.csv   # Your course/program data
├── CLAUDE.md                         # Detailed specification
├── README.md                         # This file
├── pyproject.toml                    # Python project configuration
└── .env.example                      # Environment variables template
```

## API Endpoints

### Authentication
- `GET /auth/me` - Get current user (Supabase Auth verification)

### Emails
- `GET /emails/` - List emails
- `GET /emails/{id}` - Get email details
- `POST /emails/sync` - Sync from Gmail
- `POST /emails/{id}/process` - Generate AI draft

### Drafts
- `GET /drafts/{email_id}` - Get AI draft
- `POST /drafts/{email_id}/regenerate` - Regenerate draft
- `POST /drafts/send` - Send approved draft

### Knowledge Base
- `POST /knowledge/ingest` - Ingest CSV to vector DB
- `POST /knowledge/search` - Search vectors

## Workflow

1. User authenticates via Supabase Auth (Google OAuth)
2. Emails are synced from Gmail to Supabase
3. User selects an email to reply to
4. System retrieves relevant docs via RAG
5. AI generates draft reply with context
6. User reviews and edits the draft
7. User clicks "Approve & Send"
8. Email sent via Gmail API
9. User provides star rating and feedback

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
GMAIL_REDIRECT_URI="http://localhost:8000/auth/gmail/callback"

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

### LLM Provider Options

1. **Groq (Recommended)**: Fast, affordable, supports Llama3 models
2. **OpenAI**: GPT-4, requires API key
3. **Gemini**: Google's model, requires API key

The system uses local sentence-transformers for embeddings (no API key needed).

## Troubleshooting

### Common Issues

1. **CUDA errors during ingestion**: The system automatically uses CPU mode for embeddings
2. **Dimension mismatch**: Run the migration script if switching between embedding providers
3. **API key errors**: Ensure your LLM API key is valid and has sufficient quota
4. **Database connection**: Verify Supabase URL and service key are correct

### Migration Scripts

If you need to update embeddings dimensions:
```bash
cd backend/scripts
uv run python migrate_embeddings.py
```

## Development Status

✅ **Completed Features:**
- Backend API with FastAPI
- RAG pipeline with local embeddings
- Gmail integration
- Supabase database with pgvector
- Supabase Auth with Google OAuth
- CSV ingestion for knowledge base
- Feedback system
- Next.js frontend with modern UI
- Complete authentication flow

⬜ **Pending:**
- End-to-end testing
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
