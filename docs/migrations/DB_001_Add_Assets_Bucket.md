# Database & Storage Migration Guide: Assets Support

**Goal**: Configure Supabase Storage and Database Policies.

## 1. Storage Configuration (SQL Execution)

### Task: Create New Bucket `memos-assets`
We enforce strict MIME types for security.

```sql
-- Create Bucket (if not exists logic handled by app usually, but here is SQL)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'memos-assets', 
  'memos-assets', 
  false, 
  52428800, -- 50MB
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/heic', 'video/mp4', 'video/webm', 'video/quicktime']
) ON CONFLICT (id) DO NOTHING;
```

## 2. Storage RLS Policies (Defense in Depth)

**Architecture Note**: 
The Backend uses `service_role` key to upload files, which **bypasses RLS**.
However, we MUST still enable RLS to prevent malicious users from using their Anon Key to directly manipulate the bucket.

**Policy Strategy**:
- **Architecture Warning**: Frontend MUST NOT upload directly. All uploads go through Backend (`/media`).
- **Scope**: Enabling RLS on `storage.objects` affects ALL buckets (including `memos-audio`). Direct access is blocked by default. All access (Audio & Assets) must use Backend-Signed URLs.
- **Authenticated Users**: Can VIEW their own assets (if they guess the path).
- **Authenticated Users**: Can NOT upload/delete directly (Must go through Backend API).
- **Service Role**: Has full access (Bypasses RLS).

```sql
-- Enable RLS
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own assets (Path: user_id/...)
CREATE POLICY "Users view own assets" ON storage.objects
FOR SELECT
USING ( bucket_id = 'memos-assets' AND auth.uid()::text = (storage.foldername(name))[1] );

-- Policy: Block Direct Uploads (Force usage of Backend API)
-- No INSERT/UPDATE/DELETE policy for 'authenticated' role means they are denied by default.
-- Service Role naturally bypasses this.
```

## 3. Database Schema Verification

### Table: `memos`
Ensure `attachments` JSONB column exists.

**Recommended JSON Structure (Enforced by App Logic, not SQL):**
```json
[
  {
    "type": "image",
    "path": "user_123/memo_456/uuid.jpg",
    "mime": "image/jpeg",
    "created_at": 1700000000
  },
  {
    "type": "location",
    "lat": 39.9,
    "lng": 116.4
  }
]
```
