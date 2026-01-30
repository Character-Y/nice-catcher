# Feature Spec: Hard Delete Memo (Backend)

**Goal**: Allow users to permanently delete a memo and its associated resources.

## 1. API Endpoint
- **Method**: `DELETE`
- **URL**: `/api/v1/memos/{memo_id}`
- **Auth**: Required (Bearer Token)

## 2. Implementation Logic

### Prerequisite: Attachment Schema Definition
To ensure proper cleanup, `attachments` JSONB items MUST follow this structure:
- **Media**: `{"type": "image"|"video", "path": "user_id/memo_id/file.ext", ...}` (Note: `path` excludes bucket name)
- **Data**: `{"type": "location", ...}` (No `path` field)

### Step 1: Ownership Verification & Pre-Fetch
- Extract `user_id` from Auth Token.
- Query DB for the memo.
- **IF NOT FOUND** (or user mismatch): Return `404`.
- **CRITICAL**: Store `audio_path` and `attachments` into a local variable (e.g., `files_to_delete`) **BEFORE** deleting the record. You won't be able to query them after Step 2.

### Step 2: Database Deletion (First)
- Execute `DELETE FROM memos ...`.
- This ensures the user immediately sees the item gone.

### Step 3: Resource Cleanup (Background Task)
- **Mechanism**: Use FastAPI `BackgroundTasks`.
- **Input**: Pass the `files_to_delete` list captured in Step 1.
- **Logic**: 
  - Iterate through list.
  - Filter: Only process items that have a `path`. Ignore `location` items.
  - **Path Format**: `path` should NOT include bucket name. Call `storage.from('bucket').remove(['path'])`.
- **Reliability**: This is "Best Effort". If the server restarts immediately, orphaned files may remain. This is acceptable for MVP.
- **Log Level**: Use `WARNING` for cleanup failures, not `ERROR`.

## 3. Response
- **Success**: HTTP `204 No Content`.
- **404 Not Found**: Memo does not exist OR does not belong to user.
- **500 Internal Server Error**: Database transaction failed.
- **Storage Errors**: Ignored (do not affect response code).
