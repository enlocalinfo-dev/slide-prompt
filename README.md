# スライドプロンプト（静的プレビュー）

## URL を自動で出す（おすすめ）

手元で HTML を開き直す代わりに、**Vercel に Git をつなぐ**と、`git push` するたびに本番 URL が更新されます。

### 初回だけ

1. [Vercel](https://vercel.com) にログインし、**Add New… → Project** でこのリポジトリをインポートする。
2. フレームワークは **Other** のままでよい。  
   - **Build Command**: 空欄でよい（`package.json` の `build` が自動で使われる）。手動で入れるなら `npm run build`。  
   - **Output Directory**: 空欄または `.`（プロジェクトルートをそのまま配信）
3. **Deploy** を押すと、`*.vercel.app` の URL が発行される。

### 以後の作業

- `slides-data.json` を編集したあと、`npm run build` を実行して `slide-*.html` を再生成し、**コミットして push** する。  
  （デプロイ時にも `npm run build` が走るので、JSON さえ最新ならサーバ側でも HTML は揃います。）
- 毎回ローカルで開かなくても、**同じ URL** で一覧・各スライド・エディタにアクセスできる。

### 入口パス（デプロイ後）

| 内容 | パス |
|------|------|
| 汎用プレビュー | `/` |
| カリキュラム一覧（全23枚・セクション3） | `/output/curriculum-20h/` |
| 原稿編集・Genspark | `/output/curriculum-20h/editor.html` |

例: `https://あなたのプロジェクト.vercel.app/output/curriculum-20h/`

### スクリプト

| コマンド | 意味 |
|----------|------|
| `npm run build` | `slides-data.json` から `slide-01.html` … を再生成 |
| `npm run publish:slides` | `publish-slides-data.mjs` で JSON を書き直してから上と同じ生成（マスターが `.mjs` のとき） |

---

## ローカルだけで見る

プロジェクトルートで:

```bash
python3 -m http.server 8765
```

ブラウザで `http://localhost:8765/` などを開く。

---

## OpenAI を使う（2通り）

### A. ターミナルなし・URL だけ（おすすめ）

Vercel にデプロイしたあと、**一度だけ**ダッシュボードで環境変数を登録します。

1. Vercel → 該当プロジェクト → **Settings → Environment Variables**  
2. `OPENAI_API_KEY` に `sk-...` を保存（Production にチェック）。既定は `gpt-5.4`。コスト優先なら `OPENAI_MODEL` に `gpt-5.4-mini` などを設定。  
3. **Redeploy**（または次回 `git push` で自動デプロイ）。  
4. ブラウザで **`https://（あなたのプロジェクト）.vercel.app/`** をブックマーク。以後は **URL を開くだけ**で「OpenAI で構成を生成」が動きます。

API キーは **Vercel 側にだけ**置き、リポジトリには含めません。

### B. 自分の PC だけ（ローカル）

API キーは **`.env` にだけ**書き、**Git に含めない**でください。

1. `cp .env.example .env` し、`OPENAI_API_KEY=sk-...` を記入する。  
2. プロジェクト直下で `npm install`（初回のみ）。  
3. `npm run dev` を実行する。  
4. ブラウザで **`http://localhost:8787/`** を開き、「**OpenAI で構成を生成**」を押す。

`python3 -m http.server` では API が動かないため、ローカルで OpenAI を使うときは **`npm run dev` 必須**です。

実装メモ: 共通ロジックは `lib/openai-generate-slides.mjs`。ローカルは `server.mjs`、本番は `api/generate-slides.js`（Vercel Serverless）が同じエンドポイント `POST /api/generate-slides` を提供します。
