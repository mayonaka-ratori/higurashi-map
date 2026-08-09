-- 2026-08-09: 「さっき聞いた分を記録」に対応する。
--
-- 投稿時刻をアプリ側から送るようになったため、insert ポリシーを貼り替える。
-- これを当てないと、朝に聞いた分も「送信した瞬間」の記録になってしまう。
--
-- 稼働中のDBに当てるもの。Supabaseの SQL Editor にこのファイルの中身を貼り付けて Run する。

drop policy "anyone can insert reports" on public.reports;

create policy "anyone can insert reports"
  on public.reports for insert
  with check (
    char_length(coalesce(comment, '')) <= 200
    and created_at <= now() + interval '5 minutes'
    and created_at >= now() - interval '2 days'
  );
