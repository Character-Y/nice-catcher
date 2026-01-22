# Supabase Setup (Nice Catcher MVP)

This project uses Supabase Postgres + Storage. Follow the steps below once.

## 1) Create Supabase project
- Go to https://app.supabase.com and create a new project.
- Save the **Project URL** and **Service Role Key** (Settings → API).

## 2) Run database schema
- Open the SQL Editor in Supabase.
- Paste and run `supabase/schema.sql`.

## 3) Create Storage bucket
- Go to Storage → Create bucket.
- Name: `memos-audio`
- Public bucket: **off** (private).

## 4) Set environment variables
Update `env.example` (or your deployment secrets):
- `SUPABASE_URL` = Project URL
- `SUPABASE_KEY` = Service Role Key
- `SUPABASE_BUCKET` = `memos-audio`

## 5) Quick sanity check (optional)
In Supabase Table Editor:
- Create one project row.
- Create one memo row with `audio_path` set to any string and `project_id` null.

## Notes
- RLS is enabled, but no policies are defined because the backend uses the service role key.
- If you add client-side access later, add RLS policies and avoid exposing the service key.
