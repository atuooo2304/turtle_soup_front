-- 在 Supabase SQL Editor 中执行，或通过 supabase db push 应用
create table if not exists public.riddle_submissions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  surface text not null,
  bottom text not null,
  soup_type text not null check (soup_type in ('清汤', '红汤', '黑汤')),
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewer_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists riddle_submissions_status_idx
  on public.riddle_submissions (status);

create index if not exists riddle_submissions_created_at_idx
  on public.riddle_submissions (created_at desc);

comment on table public.riddle_submissions is '用户投稿；仅 API（service role）访问，勿对 anon 开放写入';
