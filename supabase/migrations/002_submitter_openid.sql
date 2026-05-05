-- 投稿关联微信 openid（服务端 JWT 写入；勿对 anon 开放查询）
alter table public.riddle_submissions
  add column if not exists submitter_openid text;

create index if not exists riddle_submissions_submitter_openid_idx
  on public.riddle_submissions (submitter_openid);

comment on column public.riddle_submissions.submitter_openid is '微信小程序用户 openid；由 API 使用 service role 写入';
