# AI Email Agent - Project Specification

## Overview
An AI-powered email agent for Gmail that automatically drafts intelligent replies by referencing a knowledge base of course/program information stored in a vector database.

---

## Core Features

### 1. Gmail Integration
- **Gmail API**: Fetch all emails from the Primary inbox
- **Read-only access**: Monitor incoming emails continuously
- **Never auto-send**: All replies require explicit user approval

### 2. AI-Powered Reply Generation
- **LLM Provider**: OpenAI API or Google Gemini API
- **Context-aware**: Replies reference relevant course/program documentation
- **RAG Implementation**: Retrieve relevant information from vector database before generating replies

### 3. Knowledge Base (Vector Database)
- **Storage**: Supabase with pgvector extension
- **Data Source**: Existing CSV file in working directory containing course/program information
- **Vectorization**: Convert CSV data to embeddings and store in vector database
- **Retrieval**: RAG pipeline to fetch relevant documents based on email content

### 4. Email Workflow
1. New email arrives in Primary inbox
2. System fetches email via Gmail API
3. RAG retrieves relevant course/program documents from vector database
4. AI drafts reply using retrieved context + email content
5. User reviews drafted reply in frontend
6. User can edit/modify the draft before sending
7. User clicks "Approve & Send" to send email
8. Original AI draft + final sent email stored in Supabase

### 5. Feedback System
- **Star Rating**: 1-5 star rating for every email reply
- **Textual Feedback**: Optional text feedback on reply quality
- **Storage**: All feedback stored in Supabase linked to email thread

### 6. Authentication & Security
- **Method**: Google OAuth login
- **Access Control**: Only the email owner can access the system
- **Session Management**: Secure token handling

---

## Tech Stack

### Frontend
- **Platform**: Vercel
- **Framework**: React / Next.js (recommended)
- **Features**:
  - Email inbox view (synced from Gmail)
  - AI draft review & editing interface
  - Send approval button
  - Star rating & feedback UI
  - Knowledge base management (optional)

### Backend
- **Platform**: Railway
- **Runtime**: Python (FastAPI) or Node.js (Express)
- **Responsibilities**:
  - Gmail API integration
  - LLM API calls (OpenAI/Gemini)
  - RAG pipeline execution
  - Supabase operations
  - Authentication handling

### Database
- **Platform**: Supabase
- **Extensions**: pgvector for vector storage
- **Tables**:
  - `emails`: Stored email threads
  - `ai_drafts`: Original AI-generated drafts
  - `sent_emails`: Final sent emails (user-modified)
  - `knowledge_vectors`: Course/program vector embeddings
  - `feedback`: Star ratings and textual feedback
  - `users`: User authentication data

---

## Database Schema

### users
```sql
- id (uuid, primary key)
- email (string, unique)
- google_id (string)
- created_at (timestamp)
- last_login (timestamp)
```

### emails
```sql
- id (uuid, primary key)
- gmail_id (string, unique)
- user_id (uuid, foreign key)
- thread_id (string)
- sender (string)
- subject (string)
- body_text (text)
- received_at (timestamp)
- processed_at (timestamp)
- status (enum: 'unread', 'processed', 'replied')
```

### ai_drafts
```sql
- id (uuid, primary key)
- email_id (uuid, foreign key)
- draft_content (text)
- model_used (string)
- retrieved_context (jsonb)
- created_at (timestamp)
```

### sent_emails
```sql
- id (uuid, primary key)
- email_id (uuid, foreign key)
- ai_draft_id (uuid, foreign key)
- final_content (text)
- was_modified (boolean)
- sent_at (timestamp)
- gmail_message_id (string)
```

### knowledge_vectors
```sql
- id (uuid, primary key)
- content (text)
- metadata (jsonb: course_name, program_info, etc.)
- embedding (vector(1536)) -- adjust dimension based on model
- created_at (timestamp)
```

### feedback
```sql
- id (uuid, primary key)
- sent_email_id (uuid, foreign key)
- star_rating (integer, 1-5)
- text_feedback (text, nullable)
- created_at (timestamp)
```

---

## Implementation Roadmap

### Phase 1: Setup & Infrastructure
1. Create Supabase project with pgvector extension
2. Set up database tables and schemas
3. Create Vercel project for frontend
4. Create Railway project for backend
5. Configure environment variables

### Phase 2: Knowledge Base
1. Read existing CSV file with course/program data
2. Generate embeddings for each document/row
3. Store vectors in Supabase `knowledge_vectors` table
4. Implement RAG retrieval function

### Phase 3: Gmail Integration
1. Set up Gmail API credentials (OAuth 2.0)
2. Implement Gmail watch/polling mechanism
3. Fetch emails from Primary inbox
4. Store fetched emails in Supabase

### Phase 4: AI Reply Generation
1. Integrate OpenAI/Gemini API
2. Build RAG pipeline:
   - Extract query from email content
   - Retrieve top-k relevant vectors from Supabase
   - Inject context into LLM prompt
3. Generate reply drafts
4. Store drafts in `ai_drafts` table

### Phase 5: Frontend
1. Google OAuth authentication
2. Email inbox view (synced from Supabase)
3. Draft review & editing interface
4. "Approve & Send" button
5. Star rating & feedback form

### Phase 6: Email Sending & Feedback
1. Gmail API send functionality
2. Store sent emails in `sent_emails` table
3. Link sent emails to original drafts
4. Feedback collection UI
5. Store feedback in Supabase

### Phase 7: Testing & Polish
1. End-to-end workflow testing
2. Error handling & retry logic
3. UI/UX refinements
4. Security audit

---

## Key Constraints & Rules

1. **NO AUTO-SEND**: All emails must be approved by the user with a single button click
2. **Authentication Required**: Only the email owner can access the system via Google login
3. **RAG is Mandatory**: Every reply must reference the knowledge base using RAG
4. **Data Persistence**: Original AI drafts and final sent emails must both be stored
5. **Feedback Collection**: Every reply must have a star rating option

---

## Environment Variables

```bash
# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
SUPABASE_ANON_KEY=

# Gmail API
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REDIRECT_URI=

# LLM API
OPENAI_API_KEY=
# OR
GEMINI_API_KEY=

# Authentication
JWT_SECRET=
NEXTAUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

---

## API Endpoints (Backend)

### Authentication
- `POST /auth/google` - Google OAuth callback
- `GET /auth/me` - Get current user

### Emails
- `GET /emails` - List all emails (synced from Gmail)
- `GET /emails/:id` - Get specific email details
- `POST /emails/:id/process` - Trigger AI draft generation

### AI Drafts
- `GET /drafts/:email_id` - Get AI draft for an email
- `POST /drafts/:email_id/regenerate` - Regenerate draft

### Sending
- `POST /emails/:id/send` - Send approved reply
  - Body: `{ "draft_id": "uuid", "final_content": "string" }`

### Feedback
- `POST /feedback` - Submit star rating and text feedback
  - Body: `{ "sent_email_id": "uuid", "star_rating": 1-5, "text_feedback": "string" }`

### Knowledge Base
- `POST /knowledge/ingest` - Ingest CSV to vector database (admin)
- `GET /knowledge/search` - Test RAG retrieval (admin)

---

## File Structure

```
ai-email-agent/
├── CLAUDE.md              # This file
├── README.md
├── .env.example
├── backend/               # Railway deployment
│   ├── main.py           # FastAPI app
│   ├── requirements.txt
│   ├── services/
│   │   ├── gmail.py
│   │   ├── openai_service.py
│   │   ├── rag.py
│   │   └── supabase.py
│   └── routers/
│       ├── auth.py
│       ├── emails.py
│       └── feedback.py
├── frontend/              # Vercel deployment
│   ├── package.json
│   ├── next.config.js
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   └── lib/
│   └── .env.local
└── data/
    └── knowledge_base.csv  # Existing course/program data
```

---

## Notes

- Vector dimension (1536) assumes OpenAI `text-embedding-ada-002` or similar
- Adjust dimension if using different embedding model
- Gmail API has rate limits - implement exponential backoff
- Consider webhook approach for real-time email notifications
- Store original email metadata for audit trail
