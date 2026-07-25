# Supabase / GitHub Pages 設定手順

この作業はSupabaseアカウントやプロジェクトを変更します。アプリからは自動実行しないため、以下を所有者本人が行ってください。

## 1. Supabaseプロジェクトを作成する

1. [Supabase Dashboard](https://supabase.com/dashboard)で無料プランのプロジェクトを作成します。
2. Project URLを控えます。
3. Settings > API Keys（またはConnect画面）から、ブラウザ用のpublishable keyを控えます。既存プロジェクトでlegacyキーを使う場合はanon keyでも動作します。
4. `service_role`、secret key、データベースパスワードはブラウザ用ファイルやGitHubへ置かないでください。

2026年7月21日に確認した公式価格表では、Freeプランはデータベース500MB、月間アクティブユーザー50,000、Realtime同時接続200、月200万メッセージです。家族2人の家事共有には十分小さい想定ですが、無料プロジェクトは1週間利用がないと一時停止されます。最新値は[Supabase Pricing](https://supabase.com/pricing)で再確認してください。

## 2. Authを設定する

1. Authentication > Providers > Email でメール／パスワード認証を有効にします。
2. Confirm Email（メール確認）は有効を推奨します。
3. Authentication > URL Configuration のSite URLを、公開するGitHub Pagesの正確なURLにします。
4. Redirect URLsへ次を追加します。
   - 公開URL（例: `https://USER.github.io/REPOSITORY/`）
   - ローカル確認用URL（例: `http://localhost:8000/**`）

本番では広いワイルドカードを使わず、正確なGitHub Pages URLを登録してください。詳細は[Redirect URLs公式ガイド](https://supabase.com/docs/guides/auth/redirect-urls)を参照してください。

## 3. テーブル・RLS・RPC・Realtime通知を作成する

1. Supabase Dashboard > SQL Editorを開きます。
2. [`supabase/schema.sql`](supabase/schema.sql)の全内容を貼り付けて実行します。
3. Database > Tablesで次の4テーブルができていることを確認します。
   - `households`
   - `household_members`
   - `shared_todos`
   - `household_invites`
4. Database > PoliciesまたはSecurity Advisorで、4テーブルのRLSが有効であることを確認します。
5. Realtime SettingsでRealtimeを有効にし、Channel Restrictionsを「private channels only」にします。

SQLは次の安全策を含みます。

- 未ログイン（`anon`）には共有テーブル／RPCの権限を与えない
- 同じ家族グループのメンバーだけが共有家事を読める
- 追加・更新・削除でも所属をRLSで再確認する
- 招待コードは18ランダムバイト（36桁16進数）を発行し、DBにはSHA-256ハッシュだけを保存する
- 招待は72時間・1回限りで、作成者が期限前でも無効化できる
- Realtimeは非公開の家族別チャンネルを使い、通知に家事本文を含めず、受信後にRLS付きで再取得する
- グループ削除は作成者だけ、脱退は作成者以外だけが実行できる

RLSの考え方は[Row Level Security公式ガイド](https://supabase.com/docs/guides/database/postgres/row-level-security)、非公開チャンネルは[Realtime Authorization公式ガイド](https://supabase.com/docs/guides/realtime/authorization)を参照してください。

## 4. 静的アプリへ公開キーを設定する

`supabase-config.js`を編集します。

```js
window.TMT_SUPABASE_CONFIG = Object.freeze({
  url: "https://YOUR_PROJECT_REF.supabase.co",
  anonKey: "YOUR_ANON_OR_PUBLISHABLE_KEY"
});
```

配置してよいのはProject URLとanon keyまたはpublishable keyだけです。Supabaseの現行公式ガイドは新規利用にpublishable keyを推奨しています。publishable/anonは公開される前提の低権限キーであり、実際のデータ保護はAuthとRLSで行います。[API Keys公式ガイド](https://supabase.com/docs/guides/getting-started/api-keys)

## 5. ローカルで確認する

アプリのディレクトリで静的HTTPサーバーを起動します。

```bash
python -m http.server 8000
```

`http://localhost:8000/`を開きます。Supabase SDKは公式に案内されているCDN版`@supabase/supabase-js@2`を読み込みます。

2つの別ブラウザ、または通常ウィンドウとプライベートウィンドウで確認します。

1. アカウントAを新規登録し、家族グループを作成する
2. Aで招待を発行する
3. アカウントBを新規登録し、別ブラウザで招待参加する
4. Aで家事を追加し、Bに反映されることを確認する
5. Bで担当者・状態・優先を変更し、Aに反映されることを確認する
6. Bが脱退後に共有一覧を読めないことを確認する
7. 別グループのユーザーから、Aの`household_id`を指定しても取得・更新できないことを確認する
8. 未ログイン状態では共有テーブルを取得できないことを確認する

## 6. GitHub Pagesへ公開する

1. `todo-note-app`内のファイルを、現在GitHub Pagesで公開しているリポジトリの公開ディレクトリへ反映します。
2. `supabase-config.js`にProject URLと公開用キーだけが入っていることを確認します。
3. `service_role`、secret key、DBパスワードがコミット対象にないことを検索します。
4. GitHubのSettings > Pagesで、現在と同じ公開元ブランチ／フォルダーを選びます。
5. 公開後、ブラウザを再読み込みします。Service Workerキャッシュはv11へ更新され、旧キャッシュはactivate時に削除されます。
6. DevTools > Application > Service Workersで新しいService Workerが有効になったことを確認します。

## データ境界

- 個人用ToDo・メモ: 既存のIndexedDB
- 共有家事: Supabase
- 個人用バックアップ: 個人用ToDo・メモのみ
- 共有家事JSON: 共有画面から読み取り専用のエクスポート
- 個人用バックアップの復元: Supabaseへ通信せず、共有家事を変更しない
- 個人ToDoから共有家事への追加: ボタン操作時だけ、内容・予定日・時刻・優先表示を新規共有レコードへコピーする

