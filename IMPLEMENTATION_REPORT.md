# 共有家事機能 実装報告

実装日: 2026年7月21日

## 実装概要

既存の「今日メモTodo」v10を基に、個人データと共有データの保存先を分離した共有家事機能を追加しました。

- 個人用ToDo・メモ: IndexedDBのまま
- 共有家事: Supabase
- 個人データの自動共有: なし
- 個人ToDoからの共有: 詳細画面または複数選択の「共有家事に追加」を押したときだけ、新しい共有レコードとしてコピー
- 個人バックアップ: 既存どおり個人用ToDo・メモだけ
- 共有家事バックアップ: 共有画面から別JSONとして出力

## 変更ファイル

| ファイル | 内容 |
|---|---|
| `index.html` | 共有画面、認証、グループ作成／参加、共有フォーム、絞り込み、共有管理、個人ToDoの共有導線、下部ナビを追加 |
| `style-v12.css` | 既存デザインを維持し、モバイル共有UI、同期状態、担当者バッジ、フィルター、ダイアログを追加 |
| `app-v12.js` | 既存の個人ToDo・メモ・ルーチン・複数選択・バックアップ機能を維持 |
| `db-v12.js` | 既存IndexedDB v2とルーチンストアを維持。Supabase参照は追加していない |
| `shared-bridge.js` | `#shared`ルート、共有モジュール連携、個人ToDoの明示共有を既存画面へ追加 |
| `shared.js` | Supabase Auth、家族グループ、招待、共有家事CRUD、Realtime、エラー処理、JSON出力を実装 |
| `supabase-config.js` | Project URLと公開用キーのプレースホルダーを追加 |
| `supabase/schema.sql` | 4テーブル、RLS、権限、RPC、招待、Realtime通知、削除／脱退処理を追加 |
| `service-worker.js` | キャッシュをv13へ更新し、共有関連ファイルを追加。Supabase／CDN応答はキャッシュ対象外に変更 |
| `manifest.json` | 説明文を共有家事対応へ更新 |
| `SUPABASE_SETUP.md` | Supabase・Auth・Realtime・GitHub Pagesの設定手順を追加 |
| `README.md` | データ境界と構成を更新 |

## Supabase SQL

適用ファイルは[`supabase/schema.sql`](supabase/schema.sql)です。Supabase Dashboard > SQL Editorで全体を実行します。

作成するテーブル:

- `households`
- `household_members`
- `shared_todos`
- `household_invites`

主なセキュリティ:

- 4テーブルすべてRLSを有効化
- `anon`には共有テーブル／共有RPCの権限を付与しない
- 家族メンバー判定をDB側で行い、同じ`household_id`のメンバーだけSELECT／INSERT／UPDATE／DELETE可能
- `id`、`household_id`、`created_by`は更新不可
- 招待コードは18ランダムバイト（36桁16進数）、DBにはSHA-256ハッシュだけ保存
- 招待は72時間・1回限りで、作成者が無効化可能
- 脱退は作成者以外、グループ削除は作成者だけ
- Realtimeは家族別private channel。通知には家事本文を含めず「変更あり」だけを送り、受信側がRLS付きで再取得

## 確認結果

### 実行済み

- JavaScript 5ファイルの構文確認: 成功
- `manifest.json`解析: 成功
- HTML ID 125件の重複: なし
- JavaScriptから参照するDOM ID 108件: 参照漏れなし
- PWAキャッシュ対象ファイル: 存在確認済み
- PWAキャッシュv13と外部オリジン除外: 確認済み
- `service_role`／secret keyの実値: 混入なし
- すべての`SECURITY DEFINER`関数: 固定`search_path`あり
- 4テーブルのRLS有効化・`anon`権限剥奪: SQL静的確認済み
- `shared.js`からIndexedDB／個人バックアップへの参照: なし
- `db-v12.js`からSupabase／共有データへの参照: なし
- 390px幅のモバイル画面: 表示確認済み
- 個人ToDoの追加・優先表示・詳細・複数選択: 動作確認済み
- Supabase未設定時の共有案内: 動作確認済み
- ローカル模擬クライアントによる参加済み共有画面: 動作確認済み
  - 自分／長男／未割り当ての担当バッジ
  - 担当者、自分のみ、未割り当て、完了済みの絞り込み
  - 共有家事の追加、編集、状態変更、担当変更
  - 招待発行結果
  - 個人ToDoから内容・日付・時刻・優先・担当を引き継いだ共有コピー
  - 共有後も元の個人ToDoが残ること

### Supabaseプロジェクト作成後に必要な実機確認

Supabaseアカウント／プロジェクトは依頼どおり作成・変更していないため、次は未実行です。

1. 実アカウント2つによる同一グループ参加
2. 実Realtime WebSocketによる2端末間反映
3. 別グループIDを直接指定したときのRLS拒否
4. 未ログインREST／Realtimeアクセスの拒否
5. メール確認リンクのGitHub Pagesへのリダイレクト

手順は[`SUPABASE_SETUP.md`](SUPABASE_SETUP.md)の「ローカルで確認する」に記載しました。

## 既存ソースとの差異

依頼文には「ルーチン」機能の維持が含まれていましたが、今回確認できた既存v10ソースにはルーチンの画面・データストア・処理がありませんでした。そのため、存在するホーム、ToDo、カレンダー、メモ、設定、複数選択削除、IndexedDBバックアップ／復元を維持して実装しています。

## 参照したSupabase公式資料

- [API Keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [JavaScript CDN installation](https://supabase.com/docs/reference/javascript/installing)
- [Email/password sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithpassword)
- [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Database Functions](https://supabase.com/docs/guides/database/functions)
- [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)
- [Subscribing to Database Changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
- [Pricing](https://supabase.com/pricing)
