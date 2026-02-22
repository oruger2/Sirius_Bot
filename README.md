# Sirius_Bot

## bot-Hosting.net向けホームページ
ホームページを `web/` 配下に分割しました（HTML / CSS / JS）。

- `web/index.html`
- `web/style.css`
- `web/script.js`
- `web/server.js`（Node.js製の静的サーバー）

### ポート解放して起動（bot-Hosting.net向け）
`web/server.js` は `0.0.0.0` で待ち受け、`PORT` 環境変数を優先します。

```bash
PORT=3000 node web/server.js
```

> bot-Hosting.net 側の管理画面で同じポート番号を公開設定してください。

### ローカル確認
```bash
node web/server.js
# http://localhost:3000
```
