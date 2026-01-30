# Supabase Setup (Nice Catcher MVP)

This project uses Supabase Postgres + Storage + Auth. Follow the steps below once.

## 1) Create Supabase project
- Go to https://app.supabase.com and create a new project.
- Save the **Project URL** and **Service Role Key** (Settings → API).

## 2) Run database schema
- Open the SQL Editor in Supabase.
- Paste and run `supabase/schema.sql`.
  - This adds `user_id` columns and RLS policies.

## 3) Create Storage bucket
- Go to Storage → Create bucket.
- Name: `memos-audio`
- Public bucket: **off** (private).

## 4) Set environment variables
Update `env.example` (or your deployment secrets):
- `SUPABASE_URL` = Project URL
- `SUPABASE_KEY` = Service Role Key
- `SUPABASE_BUCKET` = `memos-audio`
 - `SIGNED_URL_TTL_SECONDS` = Optional (default 3600)

## 5) Quick sanity check (optional)
In Supabase Table Editor:
- Create one project row.
- Create one memo row with `audio_path` set to any string and `project_id` null.

## Notes
- RLS policies are included for multi-tenant safety.
- The backend uses the service role key, so it must still enforce `user_id` filtering.
- If you add client-side access later, keep the service key private and use the anon key.
