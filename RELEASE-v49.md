# v49 ToDoの完了色を明るい緑に調整

ToDoタブの一覧と詳細画面で、「完了」の背景を明るい緑に調整し、周囲の濃い緑の囲いをなくしました。未着手・対応中の色は変更していません。完了の文字と取り消し線は維持します。

一覧・詳細の色と枠なし表示を確認し、未着手・対応中の色も従来どおりであることを確認しました。完了文字と背景のコントラスト比は8.21:1です。320・390・768pxで横にはみ出しません。実機確認の結果はチャットに記載します。

変更ファイル: style-v49.css、index.html、service-worker.js、RELEASE-v49.md。

PWAキャッシュ: today-memo-todo-cache-v49。JavaScript・IndexedDB・Supabaseに変更はありません。ZIP: todo-note-app-v49-bright-green-no-border-20261031.zip。
