# 今日メモTodo

個人用ToDo・カレンダー・メモを端末内のIndexedDBへ保存し、家族の共有家事だけをSupabaseで同期する静的PWAです。GitHub Pagesで公開できます。

## データの保存先

| データ | 保存先 | クラウド送信 |
|---|---|---|
| 個人用ToDo | IndexedDB | 自動送信しない |
| メモ | IndexedDB | 自動送信しない |
| 個人用バックアップ | 端末へJSON出力 | Supabaseを変更しない |
| 共有家事 | Supabase | 共有画面または「共有家事に追加」の明示操作だけ |

個人ToDoから共有家事へ追加しても、元の個人ToDoは削除・変更されません。個人用内部IDも送信しません。

## 主なファイル

```text
todo-note-app/
├─ index.html
├─ style.css
├─ app.js                 # 既存の個人用画面
├─ db.js                  # IndexedDB（個人データのみ）
├─ shared.js              # Supabase Auth / 共有家事 / Realtime
├─ supabase-config.js     # Project URL + 公開用キーだけ
├─ service-worker.js
├─ manifest.json
├─ SUPABASE_SETUP.md
├─ supabase/
│  └─ schema.sql          # テーブル、RLS、RPC、Realtime通知
└─ icons/
```

## セットアップ

Supabase側の作成、SQL適用、Auth/Realtime設定、GitHub Pages公開は[`SUPABASE_SETUP.md`](SUPABASE_SETUP.md)を参照してください。

ローカル確認は静的HTTPサーバーで行います。

```bash
python -m http.server 8000
```

## セキュリティ上の前提

- `service_role`／secret keyはブラウザにもGitHubにも置きません。
- ブラウザにはProject URLとanon keyまたはpublishable keyだけを置きます。
- 共有テーブルはすべてRLSを有効にし、家族グループ単位で分離します。
- Realtimeは家族別のprivate channelを使います。
- Service WorkerはSupabaseやCDNの応答をキャッシュしません。
- 共有操作が失敗した場合は成功扱いにせず、日本語エラーを表示します。

## バックアップ

設定画面のバックアップ出力／復元は、これまでどおりIndexedDB内の個人用ToDoとメモだけが対象です。共有家事は共有画面から別のJSONとして出力でき、個人バックアップの復元でクラウドデータを上書きしません。

## 既存版との差分について

今回ベースにしたv10ソースには、ホーム、ToDo、カレンダー、メモ、設定、複数選択削除、IndexedDBバックアップ／復元がありました。依頼文に記載された「ルーチン」機能はこのソース内には存在しないため、変更対象にも含めていません。
