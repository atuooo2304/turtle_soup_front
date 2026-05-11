-- 投稿：用 tag（汤谱标签）替代 soup_type（清汤/红汤/黑汤）。请在部署新 API 前于 Supabase SQL Editor 执行一次。
-- 若 drop column 报错，请用 \d public.riddle_submissions 确认已无 soup_type（表示已应用过）。

alter table public.riddle_submissions
  add column if not exists tag text;

update public.riddle_submissions
set tag = case soup_type
  when '清汤' then '轻松'
  when '红汤' then '恐怖'
  when '黑汤' then '悬疑'
  else '轻松'
end
where tag is null;

update public.riddle_submissions
set tag = '轻松'
where tag is null or trim(tag) = '';

alter table public.riddle_submissions
  alter column tag set not null;

alter table public.riddle_submissions
  drop column if exists soup_type;

alter table public.riddle_submissions
  drop constraint if exists riddle_submissions_tag_check;

alter table public.riddle_submissions
  add constraint riddle_submissions_tag_check
  check (tag in ('轻松', '恐怖', '悬疑', '搞笑'));

comment on column public.riddle_submissions.tag is '汤谱展示用标签，与 riddles.csv 的 type 一致';
