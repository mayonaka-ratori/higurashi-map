-- ひぐらしのなくところに: データベース設定
-- Supabaseの管理画面 → SQL Editor にこのファイルの中身を貼り付けて Run する。

-- 投稿テーブル（スポット一覧はアプリ内のJSONで管理するので、テーブルはこれ1つだけ）
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  place_id text not null,
  heard boolean not null,
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  comment text check (char_length(comment) <= 200),
  created_at timestamptz not null default now()
);

create index reports_place_created on public.reports (place_id, created_at desc);
create index reports_created on public.reports (created_at desc);

-- 行レベルセキュリティ: 匿名ユーザーは「読む」「書き込む」だけ許可。
-- 書き換え・削除は誰にもさせない（荒らし対策の最低ライン）。
alter table public.reports enable row level security;

create policy "anyone can read reports"
  on public.reports for select
  using (true);

create policy "anyone can insert reports"
  on public.reports for insert
  with check (
    char_length(coalesce(comment, '')) <= 200
  );
