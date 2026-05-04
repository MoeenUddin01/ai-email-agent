# AI Email Agent - File Documentation

This document provides detailed information about the purpose and functionality of each file in the AI Email Agent project.

## Project Root Files

### `README.md`
- **Purpose**: Main project documentation and setup guide
- **Content**: Features, architecture, setup instructions, API endpoints, deployment guide
- **Usage**: Primary reference for developers and contributors

### `CLAUDE.md`
- **Purpose**: Detailed technical specification and requirements
- **Content**: In-depth project specifications, technical requirements, implementation details
- **Usage**: Reference for understanding project scope and technical constraints

### `idea.md`
- **Purpose**: Project ideas and brainstorming notes
- **Content**: Initial concepts, feature ideas, development thoughts
- **Usage**: Reference for project evolution and future enhancements

### `pyproject.toml`
- **Purpose**: Python project configuration and dependency management
- **Content**: Project metadata, dependencies (FastAPI, Supabase, etc.), development settings
- **Usage**: Used by `uv` package manager for dependency installation

### `.python-version`
- **Purpose**: Specifies Python version for the project
- **Content**: Python version number (e.g., "3.11")
- **Usage**: Ensures consistent Python environment across development setups

### `.env.example`
- **Purpose**: Template for environment variables
- **Content**: All required environment variables with placeholder values
- **Usage**: Copy to `.env` and fill with actual values for local development

### `.gitignore`
- **Purpose**: Git ignore configuration
- **Content**: Files and directories to exclude from version control
- **Usage**: Prevents sensitive files and build artifacts from being committed

---

## Backend Source Code (`src/`)

### `src/__init__.py`
- **Purpose**: Python package initialization
- **Content**: Package metadata and imports
- **Usage**: Marks `src` as a Python package

### `src/api/` - FastAPI Application

#### `src/api/__init__.py`
- **Purpose**: API package initialization
- **Content**: Package initialization
- **Usage**: Marks `api` as a Python package

#### `src/api/main.py`
- **Purpose**: FastAPI application entry point
- **Content**: App configuration, middleware setup, router registration, static files
- **Usage**: Main server file that starts the FastAPI application

#### `src/api/config.py`
- **Purpose**: Application configuration and settings
- **Content**: Environment variable definitions, database URLs, API keys, JWT settings
- **Usage**: Centralized configuration management using Pydantic settings

#### `src/api/routers/` - API Route Handlers

##### `src/api/routers/__init__.py`
- **Purpose**: Routers package initialization
- **Content**: Package initialization
- **Usage**: Marks `routers` as a Python package

##### `src/api/routers/auth.py`
- **Purpose**: Authentication endpoints
- **Content**: Supabase Auth token verification, user profile endpoints
- **Usage**: Handles authentication verification for protected routes

##### `src/api/routers/emails.py`
- **Purpose**: Email management endpoints
- **Content**: Email listing, syncing from Gmail, email details retrieval
- **Usage**: Core email operations and Gmail integration

##### `src/api/routers/drafts.py`
- **Purpose**: AI draft generation endpoints
- **Content**: Draft creation, regeneration, sending functionality
- **Usage**: AI-powered reply generation and email sending

##### `src/api/routers/feedback.py`
- **Purpose**: Feedback system endpoints
- **Content**: Rating storage, feedback collection, analytics
- **Usage**: User feedback and rating system for AI responses

##### `src/api/routers/knowledge.py`
- **Purpose**: Knowledge base management endpoints
- **Content**: Vector search, document ingestion, RAG operations
- **Usage**: Knowledge base operations for context retrieval

##### `src/api/routers/health.py`
- **Purpose**: Health check endpoints
- **Content**: Application health status, monitoring endpoints
- **Usage**: Health monitoring and load balancer checks

#### `src/api/static/` - Static Files

##### `src/api/static/index.html`
- **Purpose**: Landing page for backend
- **Content**: HTML landing page with project information
- **Usage**: Served as root page for backend API

### `src/db/` - Database Layer

#### `src/db/__init__.py`
- **Purpose**: Database package initialization
- **Content**: Package initialization
- **Usage**: Marks `db` as a Python package

#### `src/db/supabase.py`
- **Purpose**: Supabase database client and operations
- **Content**: Database connection, CRUD operations, RLS integration
- **Usage**: All database interactions and user context management

### `src/email/` - Email Services

#### `src/email/__init__.py`
- **Purpose**: Email package initialization
- **Content**: Package initialization
- **Usage**: Marks `email` as a Python package

#### `src/email/gmail.py`
- **Purpose**: Gmail API integration
- **Content**: Gmail authentication, email fetching, sending functionality
- **Usage**: Direct integration with Gmail API for email operations

### `src/auth/` - Authentication

#### `src/auth/__init__.py`
- **Purpose**: Authentication package initialization
- **Content**: Package initialization
- **Usage**: Marks `auth` as a Python package (currently minimal, using Supabase Auth)

---

## Backend Resources (`backend/`)

### `backend/database/` - Database Schema

#### `backend/database/schema.sql`
- **Purpose**: Database schema definition
- **Content**: Table definitions, indexes, RLS policies, vector extensions
- **Usage**: Database setup and migration script

### `backend/scripts/` - Utility Scripts

#### `backend/scripts/ingest_csv.py`
- **Purpose**: CSV data ingestion for knowledge base
- **Content**: CSV parsing, text processing, vector generation, database storage
- **Usage**: Populate knowledge base with course/program data

#### `backend/scripts/migrate_embeddings.py`
- **Purpose**: Embedding migration utility
- **Content**: Vector dimension updates, embedding model changes
- **Usage**: Migrate existing embeddings when changing models

#### `backend/scripts/fix_rls_policies.sql`
- **Purpose**: RLS policy fixes and updates
- **Content**: Row Level Security policy corrections
- **Usage**: Fix database access control issues

---

## Frontend Application (`frontend/`)

### `frontend/package.json`
- **Purpose**: Node.js project configuration and dependencies
- **Content**: Project metadata, dependencies (React, Next.js, Supabase), scripts
- **Usage**: npm package management and project setup

### `frontend/next.config.js`
- **Purpose**: Next.js configuration
- **Content**: Build settings, environment variables, optimization
- **Usage**: Configure Next.js build and development behavior

### `frontend/next-env.d.ts`
- **Purpose**: Next.js TypeScript definitions
- **Content**: Type definitions for Next.js
- **Usage**: TypeScript support for Next.js features

### `frontend/postcss.config.js`
- **Purpose**: PostCSS configuration
- **Content**: Tailwind CSS processing setup
- **Usage**: CSS processing and Tailwind integration

### `frontend/tailwind.config.ts`
- **Purpose**: Tailwind CSS configuration
- **Content**: Theme customization, plugin setup, design tokens
- **Usage**: Tailwind CSS framework configuration

### `frontend/tsconfig.json`
- **Purpose**: TypeScript configuration
- **Content**: Compiler options, path mappings, type checking
- **Usage**: TypeScript compilation and development setup

### `frontend/.env.local`
- **Purpose**: Frontend environment variables
- **Content**: Supabase URL, API keys, backend URL
- **Usage**: Environment-specific configuration for frontend

### `frontend/src/` - Frontend Source Code

#### `frontend/src/app/` - Next.js App Router

##### `frontend/src/app/layout.tsx`
- **Purpose**: Root layout component
- **Content**: HTML structure, global styles, metadata
- **Usage**: Base layout for all pages

##### `frontend/src/app/page.tsx`
- **Purpose**: Home/login page
- **Content**: Authentication UI, Google OAuth integration, landing page
- **Usage**: Main entry point for user authentication

##### `frontend/src/app/globals.css`
- **Purpose**: Global CSS styles
- **Content**: Tailwind imports, custom CSS variables, base styles
- **Usage**: Global styling and design system

##### `frontend/src/app/auth/` - Authentication Routes

###### `frontend/src/app/auth/callback/page.tsx`
- **Purpose**: OAuth callback handler
- **Content**: Supabase auth callback processing, session management
- **Usage**: Handle authentication redirects from Google OAuth

##### `frontend/src/app/inbox/` - Email Management

###### `frontend/src/app/inbox/page.tsx`
- **Purpose**: Email inbox interface
- **Content**: Email list, email details, sync functionality, logout
- **Usage**: Main email management interface

##### `frontend/src/app/reply/` - Reply Composition

###### `frontend/src/app/reply/[id]/page.tsx`
- **Purpose**: Email reply editor
- **Content**: Reply composition, AI draft integration, editing interface
- **Usage**: Create and edit email replies with AI assistance

#### `frontend/src/utils/` - Utility Functions

##### `frontend/src/utils/supabase.ts`
- **Purpose**: Supabase client configuration
- **Content**: Supabase client initialization, authentication helpers
- **Usage**: Frontend Supabase integration and authentication

##### `frontend/src/utils/cn.ts`
- **Purpose**: CSS class name utility
- **Content**: Utility function for conditional CSS classes
- **Usage**: Dynamic styling and class name management

#### `frontend/src/types/` - TypeScript Types

##### `frontend/src/types/index.ts`
- **Purpose**: TypeScript type definitions
- **Content**: Interface definitions for data structures
- **Usage**: Type safety across the frontend application

---

## Data Directory (`data/`)

### `data/vizaura_courses_dataset.csv`
- **Purpose**: Knowledge base data source
- **Content**: Course information, program details, educational content
- **Usage**: Source data for RAG knowledge base ingestion

---

## Development and Deployment Files

### `.git/` - Git Repository
- **Purpose**: Version control metadata
- **Content**: Git history, branches, configuration
- **Usage**: Source code version control

---

## File Interactions and Data Flow

### Authentication Flow
1. `frontend/src/app/page.tsx` → `frontend/src/utils/supabase.ts` → Supabase Auth
2. `frontend/src/app/auth/callback/page.tsx` → Session handling
3. `src/api/routers/auth.py` → Token verification

### Email Management Flow
1. `frontend/src/app/inbox/page.tsx` → API calls
2. `src/api/routers/emails.py` → `src/email/gmail.py`
3. `src/db/supabase.py` → Database operations

### AI Reply Generation Flow
1. `frontend/src/app/reply/[id]/page.tsx` → Draft request
2. `src/api/routers/drafts.py` → AI processing
3. `src/api/routers/knowledge.py` → RAG retrieval
4. `src/db/supabase.py` → Vector search

### Knowledge Base Flow
1. `backend/scripts/ingest_csv.py` → CSV processing
2. `src/api/routers/knowledge.py` → Vector operations
3. `src/db/supabase.py` → Database storage

---

## Configuration Dependencies

### Backend Configuration
- `src/api/config.py` ← `.env` file
- `src/db/supabase.py` ← Supabase credentials
- `src/email/gmail.py` ← Gmail API credentials

### Frontend Configuration
- `frontend/src/utils/supabase.ts` ← `frontend/.env.local`
- `frontend/next.config.js` ← Build settings
- `frontend/tailwind.config.ts` ← Design system

---

## Security Considerations

### Sensitive Files
- `.env` - Contains all API keys and secrets
- `frontend/.env.local` - Frontend API keys
- Never commit these files to version control

### Authentication Security
- Supabase Auth handles user authentication
- JWT tokens are managed by Supabase
- RLS policies in database ensure data isolation

### API Security
- All protected routes require valid Supabase tokens
- Backend verifies tokens with Supabase
- Gmail API uses OAuth 2.0 for email access

---

## Development Workflow

### Local Development
1. Configure environment variables
2. Start backend: `uv run uvicorn src.api.main:app --reload`
3. Start frontend: `npm run dev`
4. Access at `http://localhost:3000`

### Database Setup
1. Run `backend/database/schema.sql`
2. Execute `backend/scripts/ingest_csv.py`
3. Configure RLS policies

### Testing Authentication
1. Configure Google OAuth in Supabase
2. Test login flow through frontend
3. Verify token handling in backend

---

This documentation provides a comprehensive overview of each file's purpose and how they interact within the AI Email Agent system.
