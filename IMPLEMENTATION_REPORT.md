# 共有家事機能 実装報告

## v32 ルーチンToDo自動同期版（2026年8月9日）

ルーチンを編集保存した際、今日以降のルーチン由来ToDoを新しい設定へ差分同期する機能を追加しました。

- `app-v32.js`: 新しい予定日の計算、既存ToDoの更新、旧予定の整理、不足分の追加を実装
- `db-v32.js`: ルーチン保存とToDo差分を単一のIndexedDBトランザクションで保存
- 同期対象: 今日以降のルーチン由来ToDo
- 未着手: タイトル・時刻・予定日を同期し、旧予定を整理
- 対応中: 日付と状態を維持し、タイトル・時刻だけ同期
- 手動でToDoへ追加した項目: 日付と状態を維持し、タイトル・時刻だけ同期
- 完了済み・過去分・通常ToDo: 変更しない
- 手動削除日 (`excludedTodoDates`): 再生成しない
- 自動追加OFF／無効化: 作成済みToDoを自動削除しない
- PWAキャッシュ: `today-memo-todo-cache-v32`
- IndexedDBバージョン2、Supabase SQL、RLS、共有データ構造は変更なし

### v32確認結果

- 新規の毎日ルーチンを8月15日〜17日・08:00で展開: 3日分を作成
- 次回予定日を8月13日へ前倒しし、時刻を09:00へ変更: 8月13日〜17日の5日分へ同期
- 毎日から2日ごとへ変更: 新しい予定にない未着手ToDoだけを整理
- 完了済み: 元の日付・時刻・状態を維持
- 対応中: 日付と状態を維持し、タイトル・時刻を更新
- 手動で「ToDoへ追加」した項目: 元の日付を維持し、タイトル・時刻だけを更新
- 自動追加OFF: 作成済みToDoを削除しない
- 共有タブ・未ログイン案内・7個の下部ナビゲーション: 表示を確認
- `app-v32.js`、`db-v32.js`、`shared.js`、`shared-bridge.js`、`service-worker.js`: JavaScript構文確認に合格

## v31 統合版（2026年8月9日）

2026年8月7日に公開された個人／ルーチン版v30へ、共有対応版v24の機能を統合しました。

- `app-v31.js` / `db-v31.js`: v30の日程未定ToDo、ルーチン、個人ToDo改善を維持
- `style-v31.css`: 日程未定UI、共有UI、1行横スクロール式ナビを統合
- `index.html`: 共有画面、復活ダイアログ、共有認証、v31ファイル参照を復元
- `shared.js` / `shared-bridge.js`: 共有タブ、個人ToDoからの明示共有、Realtimeを復元
- `service-worker.js`: `today-memo-todo-cache-v31` へ更新し、共有ファイルをキャッシュ対象へ復元
- Supabaseのテーブル、RLS、SQL、IndexedDBバージョン2は変更なし

共有一覧は未完了と完了済みに分かれ、完了済み家事を新しい予定日で復活できます。個人用データは従来どおりIndexedDBに保存され、自動でSupabaseへ送信されません。

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
| `service-worker.js` | キャッシュをv16へ更新し、共有関連ファイルを追加。Supabase／CDN応答はキャッシュ対象外に変更 |
| `manifest.json` | 説明文を共有家事対応へ更新 |
| `SUPABASE_SETUP.md` | Supabase・Auth・Realtime・GitHub Pagesの設定手順を追加 |
| `README.md` | データ境界と構成を更新 |

### 共有家事一覧 v16

- 共有家事を1件約70pxのコンパクトな行表示へ変更
- タイトル、担当者、状態、予定日時、優先、完了ボタンを一覧へ表示
- 行を押すと、担当者・状態・優先を含む詳細編集ダイアログを表示
- 編集・削除ボタンを一覧から外し、削除は詳細内の確認操作へ移動
- コンパクト表示／詳細表示を切り替え、選択を端末のlocalStorageへ保存
- 優先だけの絞り込みを追加
- 未完了、優先、予定日、時刻、作成日時の順で並べ替え

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
- PWAキャッシュv16と外部オリジン除外: 確認済み
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
