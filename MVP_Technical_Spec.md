# Nice Catcher MVP - Technical Implementation Specification

## 1. Project Overview
**Nice Catcher** is a voice-first note-taking application designed to capture fleeting inspirations. 
The MVP focuses on a streamlined flow: Record -> Transcribe (High Accuracy) -> Review/Edit -> Categorize -> Archive.

## 2. System Architecture

### 2.1 Tech Stack
- **Frontend**: React (Vite)
  - Styled with "Liquid Glass" aesthetic (CSS/Tailwind).
  - Deployed as static files served by FastAPI.
- **Backend**: Python (FastAPI)
  - Acts as the main application server.
  - Handles API requests, integration with Transcription Service, and Supabase interactions.
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth (Email/Password + OAuth / JWT)
- **Object Storage**: Supabase Storage (for audio files)
- **AI Service**: AI Builder Space API (`/v1/audio/transcriptions`)
  - **Reference**: [OpenAPI Spec](https://space.ai-builders.com/backend/openapi.json) - *Consult this JSON for API implementation details.*
- **Deployment**: Docker container on AI Builder Space (Single Process: FastAPI serves React)

### 2.2 Data Flow
1. **Auth**: User logs in once; Session persists locally (long-lived token).
2. **Capture**: User records audio **in browser**. Request includes Auth Token.
3. **Safe Save (Auto)**: Audio is uploaded to FastAPI. Backend validates Token & extracts `User ID`.
4. **Persist & Process**: 
   - Backend saves audio to Supabase Storage (bucket: `memos-audio`).
   - Backend creates a DB record in `memos` with `project_id=NULL` (Inbox) AND `user_id`.
   - Backend calls **AI Builder Space API** for transcription.
5. **Update**: 
   - Once transcription is ready, Backend updates the DB record with text.
   - Frontend receives the text (via response polling or manual refresh).
6. **Review (Async)**: User can edit text/project immediately OR leave it for later in the "Inbox". User sees their own data only (enforced by RLS).

## 3. Database Schema (Supabase)

**Security Note**: Enable Row Level Security (RLS) on all tables. Policy: `auth.uid() = user_id`.

### 3.1 Table: `projects`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK | Unique Project ID |
| `user_id` | uuid | FK, NOT NULL | **Owner (Link to auth.users)** |
| `name` | text | NOT NULL | "AI Article", "Weekend Trip" |
| `description` | text | NULL | Optional context |
| `created_at` | timestamptz | default: now() | Creation time |

### 3.2 Table: `memos`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK | Unique Memo ID |
| `user_id` | uuid | FK, NOT NULL | **Owner (Link to auth.users)** |
| `content` | text | NULL | Transcribed text (NULL initially) |
| `audio_path` | text | NOT NULL | Path in Supabase Storage (Core media) |
| `project_id` | uuid | FK, NULLABLE | **NULL = Inbox**. Points to a Project when sorted. |
| `status` | text | default: 'pending' | 'pending', 'review_needed', 'done' |
| `attachments` | jsonb | default: [] | Array of context items: location, photos, videos. |
| `created_at` | timestamptz | default: now() | Creation time |

## 4. API Design (FastAPI)

Base URL: `/api/v1`
**Security**: All endpoints require `Authorization: Bearer <token>` header. Backend verifies token with Supabase.

### 4.1 Quick Capture (The Core API)
**POST** `/capture`
- **Purpose**: One-shot upload for immediate safety.
- **Request**: `multipart/form-data`
  - `file`: Audio file (Blob)
  - `attachments`: string (Optional JSON string, e.g. `[{"type":"location", "lat":...}]`)
- **Process**:
  1. **Auth**: Extract `user_id` from Bearer Token.
  2. Upload `file` to Supabase Storage.
  3. Create `memos` entry with `user_id`, `project_id=NULL` (Inbox), `status="pending"`, and `attachments`.
  4. **Async Task**: Call Transcription API -> Update `memos.content` -> Update `status="review_needed"`.
  5. Generate **Signed URL** for the uploaded audio.
  6. Return `memo_id` and the Signed URL (as `audio_url`).
- **Response**:
  ```json
  {
    "id": "uuid",
    "status": "processing", 
    "audio_url": "https://supabase.../token=...",
    "estimated_wait": "2s" 
  }
  ```

### 4.2 Memos Management
**PATCH** `/memos/{memo_id}`
- **Purpose**: User reviews and sorts memo into a project.
- **Request**: JSON
  - `content`: string (Edited text)
  - `project_id`: uuid (Target project)
  - `new_project_name`: string (Optional: Create new project if provided)
  - `status`: "done"
- **Process**: Ensure `memo_id` belongs to `current_user`.
- **Response**: Updated Memo object.

**GET** `/memos`
- **Purpose**: Fetch timeline.
- **Query Params**: `status`, `project_id`.
- **Process**: 
  1. Filter results by `user_id`.
  2. **Crucial**: Convert stored `audio_path` to short-lived **Signed URL** (e.g., 1 hour validity) via Supabase Storage API. Return this Signed URL as `audio_url`.

### 4.3 Static Files & SPA Serving
- **GET** `/static/*`: Serve static assets (JS/CSS) from `/app/static`.
- **GET** `/{full_path}`: Catch-all route. Returns `index.html` to support React Router (SPA).

## 5. Frontend Specifications (React)

### 5.1 Route Structure
- `/login`: **Auth Page**. (Email/Password or OAuth).
- `/`: **Dashboard & Recorder** (Protected Route).
  - **Auth Logic**: Check for Session -> Redirect to Login if invalid.
  - **State**: `Idle` | `Recording` | `Review` | `Saving`.
  - **Components**:
    - `ActionBubble`: Central recording button. **Click-to-start, Click-to-stop**. Visualizes audio levels.
    - `TranscriptionEditor`: Text area. Includes "Save" (PATCH /memos) and "Discard" actions.
    - `ProjectSelector`: Dropdown/Create New Project.
    - `Timeline`: List of memo cards. **Must include Audio Player** (play `audio_path`) and text preview.

### 5.2 Key Libraries
- `axios`: API requests.
- `framer-motion`: Animations (Liquid effects, transitions).
- `lucide-react`: Icons.
- `react-media-recorder` (or native MediaStream API): Audio capture.

## 6. Deployment & Environment (AI Builder Space)

**Important**: Before deployment, consult the [AI Builder Deployment Guide](https://space.ai-builders.com/deployment-prompt.md) to ensure compliance.

### 6.1 Docker Structure
**Requirement**: Must serve API and Static files from a single port, honoring the `PORT` env var.

```dockerfile
# Stage 1: Build React
FROM node:18-alpine as frontend-build
WORKDIR /app/frontend
COPY frontend/package.json .
RUN npm install
COPY frontend/ .
RUN npm run build

# Stage 2: Python Backend
FROM python:3.11-slim
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ .

# Copy built static files from Stage 1
# Backend must mount this folder to serve static assets
COPY --from=frontend-build /app/frontend/dist /app/static

# Expose port (PORT will be set at runtime by platform)
EXPOSE 8000

# Start application using PORT environment variable
# Use shell form (sh -c) to ensure environment variable expansion
CMD sh -c "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"
```

### 6.2 Configuration & Secrets
**Auto-Injected by Platform**:
- `AI_BUILDER_TOKEN`: Used to call Transcription API. (Do not set manually)

**User Managed (`deploy-config.json` / `env_vars`)**:
- `SUPABASE_URL`: Connection string.
- `SUPABASE_KEY`: Service role key.

*Note: Never commit `.env` files or secrets to the public repository.*
