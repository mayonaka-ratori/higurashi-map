-- 2026-08-19: 自由報告（登録スポット外での「いま聞こえた」）を受け付ける。
--
-- 地図に名前が載っていない場所でも「いま聞こえた」を記録できるようにする。
-- そのため place_id を空にできるようにし、代わりに座標を必須にする。
--
-- 稼働中のDBに当てるもの。Supabaseの SQL Editor にこのファイルの中身を貼り付けて Run する。
-- 二度流しても落ちない。旧アプリは常に place_id を送るので、先に流しても壊れない。
-- **順番はこのマイグレーション → アプリのデプロイ。**

alter table public.reports alter column place_id drop not null;

alter table public.reports drop constraint if exists reports_location_required;

alter table public.reports add constraint reports_location_required
  check (place_id is not null or (latitude is not null and longitude is not null));
