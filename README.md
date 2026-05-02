# AI Email Agent

AI-powered email reply agent for Gmail with RAG (Retrieval-Augmented Generation) from your knowledge base.

## Features

- ✉️ **Gmail Integration**: Sync emails from Primary inbox
- 🤖 **AI-Powered Replies**: Generate intelligent responses using OpenAI/Gemini
- 📚 **RAG Pipeline**: Retrieve relevant context from your course/program knowledge base
- ✏️ **Human-in-the-Loop**: Edit drafts before sending (never auto-sends)
- ⭐ **Feedback System**: Rate replies and provide textual feedback
- 🔐 **Secure**: Google OAuth authentication, owner-only access

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
                        │   OpenAI API     │
                        └──────────────────┘
```

## Quick Start

### 1. Clone & Install Dependencies

```bash
# Backend dependencies
pip install -e .

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
- **Supabase**: Create project, enable pgvector extension, run schema.sql
- **Google Cloud**: Create OAuth 2.0 credentials for Gmail API
- **OpenAI**: Get API key

### 3. Database Setup

Run the SQL schema in Supabase SQL Editor:

```sql
-- Located at backend/database/schema.sql
```

### 4. Run Development Servers

```bash
# Terminal 1: Backend (from project root)
uvicorn backend.src.app.main:app --reload

# Or using the installed command (after pip install -e .)
ai-email-agent

# Terminal 2: Frontend
cd frontend
npm run dev
```

## Project Structure

```
ai-email-agent/
├── src/                               # Main source code
│   ├── api/                           # FastAPI application
│   │   ├── routers/
│   │   │   ├── auth.py               # Google OAuth
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
│       └── ingest_csv.py             # CSV ingestion tool
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx        # Login page
│   │   │   ├── inbox/
│   │   │   │   └── page.tsx    # Email list
│   │   │   └── reply/
│   │   │       └── [id]/
│   │   │           └── page.tsx # Reply editor
│   │   └── utils/
│   ├── package.json
│   └── next.config.js
├── data/
│   └── knowledge_base.csv      # Your course/program data
├── CLAUDE.md                   # Detailed specification
└── README.md                   # This file
```

## API Endpoints

### Authentication
- `GET /auth/google` - Initiate Google OAuth
- `GET /auth/google/callback` - OAuth callback
- `GET /auth/me` - Get current user

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

1. User authenticates via Google OAuth
2. Emails are synced from Gmail to Supabase
3. User selects an email to reply to
4. System retrieves relevant docs via RAG
5. AI generates draft reply with context
6. User reviews and edits the draft
7. User clicks "Approve & Send"
8. Email sent via Gmail API
9. User provides star rating and feedback

## Environment Variables

See `.env.example` for all required variables.

## Deployment

### Backend (Railway)
```bash
railway login
railway init
railway up
```

### Frontend (Vercel)
```bash
vercel --prod
```

## License

MIT
