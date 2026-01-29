-- Nice Catcher MVP schema
-- Run this in Supabase SQL Editor

create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text null,
  created_at timestamptz not null default now()
);

create table if not exists public.memos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text null,
  audio_path text not null,
  project_id uuid null references public.projects(id) on delete set null,
  status text not null default 'pending',
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint memos_status_check
    check (status in ('pending', 'review_needed', 'done'))
);

create index if not exists memos_created_at_idx on public.memos (created_at desc);
create index if not exists memos_project_id_idx on public.memos (project_id);
create index if not exists memos_status_idx on public.memos (status);

alter table public.projects enable row level security;
alter table public.memos enable row level security;

create policy "projects_select_own" on public.projects
  for select using (auth.uid() = user_id);
create policy "projects_insert_own" on public.projects
  for insert with check (auth.uid() = user_id);
create policy "projects_update_own" on public.projects
  for update using (auth.uid() = user_id);
create policy "projects_delete_own" on public.projects
  for delete using (auth.uid() = user_id);

create policy "memos_select_own" on public.memos
  for select using (auth.uid() = user_id);
create policy "memos_insert_own" on public.memos
  for insert with check (auth.uid() = user_id);
create policy "memos_update_own" on public.memos
  for update using (auth.uid() = user_id);
create policy "memos_delete_own" on public.memos
  for delete using (auth.uid() = user_id);
