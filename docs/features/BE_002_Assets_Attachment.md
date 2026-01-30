# Feature Spec: Assets & Media Attachments (Backend)

**Goal**: Support progressive upload of Photos and Location data to an existing memo.

## 1. Media Upload Endpoint
- **Method**: `POST`
- **URL**: `/api/v1/memos/{memo_id}/media`
- **Auth**: Required
- **Input**: `multipart/form-data` -> `files` (List)

### Logic:
1.  **Ownership**: Verify `memo.user_id == current_user`.
2.  **Storage Naming**:
    -   Generate a unique path: `{user_id}/{memo_id}/{uuid}.{ext}`.
    -   **STRICT RULE**: The `path` string stored in DB MUST NOT include the bucket name (`memos-assets`).
    -   Upload to Supabase Bucket `memos-assets`.
3.  **DB Update**:
    -   Read current `attachments` (JSONB).
    -   Append new item: `{"type": "image", "path": "user_1/.../img.jpg"}`.
    -   **CRITICAL**: Store the **PATH**, not the URL.
    -   Save to DB.
4.  **Response**: Return updated Memo object (with Signed URLs generated on the fly).

## 2. Location Endpoint
- **Method**: `POST`
- **URL**: `/api/v1/memos/{memo_id}/location`
- **Input**: JSON `{"lat": 12.34, "lng": 56.78}`

### Logic:
1.  **Ownership**: Verify.
2.  **DB Update**:
    -   Append: `{"type": "location", "lat": ..., "lng": ...}`.
    -   Save to DB.

## 3. The "Signed URL" Rule (Crucial for GET)

When serving data in `GET /memos` or any response returning a Memo:

**You MUST Transform Paths to Signed URLs.**

### Pseudocode for Response Generation:
```python
memo_dict = db_memo.to_dict()

# 1. Transform Main Audio
memo_dict["audio_url"] = supabase.storage.sign_url(db_memo.audio_path, expiresIn=3600)

# 2. Transform Attachments
for item in memo_dict["attachments"]:
    if item["type"] == "image":
        # Dynamic Signing
        item["url"] = supabase.storage.sign_url(item["path"], expiresIn=3600)
        # Remove "path" from response to avoid confusion
        del item["path"]

return memo_dict
```
**Why?** Private bucket links expire. We must generate fresh links on every read request.
