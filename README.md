# 持股透視

輸入台股持股代號與股數，看穿透 ETF 之後實際押在哪些公司，以及每家公司依「成長主軸」和競爭對手比較的預估本益比、分析師預估 EPS 與前景產品。

- 純前端靜態網頁，放在 GitHub Pages，朋友打開網址就能用，不用註冊。
- 持股只存在使用者自己瀏覽器的 localStorage，不會上傳。
- 股價每個交易日由 GitHub Actions 自動更新。

## 檔案

| 路徑 | 內容 | 更新方式 |
|---|---|---|
| `index.html`、`app.js` | 頁面 | 手動 |
| `data/tw_quotes.json` | 所有上市櫃股票的收盤價與本益比（證交所、櫃買中心 OpenAPI） | 自動，每個交易日 16:13 |
| `data/global_quotes.json` | 分析公司與同業的價格、近四季與預估本益比（Yahoo Finance） | 自動，同上 |
| `data/companies.json` | 成長主軸、比較同業、FactSet 預估 EPS、前景產品、來源 | Claude（GitHub Actions），每週六 08:47；也可手動修改 |
| `data/etf.json` | ETF 前十大成分股權重 | 手動，建議每月 |
| `data/news.json` | 今日市場與個股近期新聞 | Claude（GitHub Actions），週一到週五 17:12 |
| `agent/*.md` | Claude 排程的工作說明（要改排程的做法就改這裡） | 手動 |
| `.github/workflows/daily-news.yml`、`weekly-analyst-review.yml` | 用 Claude Code GitHub Action 執行上面兩份說明 | — |
| `scripts/update_quotes.py` | 抓股價的腳本 | — |
| `.github/workflows/update-quotes.yml` | 排程 | — |

## 第一次設定

1. 把這個資料夾推到 GitHub 的 repo（GitHub Pages 免費方案需要 public repo）。
2. **Settings → Pages**：Source 選 `Deploy from a branch`，Branch 選 `main`、資料夾 `/ (root)`。幾分鐘後網址會出現在同一頁。
3. **Settings → Actions → General → Workflow permissions**：選 `Read and write permissions`，讓排程能把新股價提交回 repo。
4. **Settings → Secrets and variables → Actions → New repository secret**：名稱 `CLAUDE_CODE_OAUTH_TOKEN`，值是在自己電腦執行 `claude setup-token` 產生的權杖（需要 Claude Pro、Max、Team 或 Enterprise 方案）。每日新聞與每週分析師重點兩個排程會用它。
5. **Actions → 更新股價 → Run workflow** 手動跑一次，確認抓得到資料。之後就會每個交易日自動執行。

## 本機預覽

直接雙擊 `index.html` 會讀不到資料檔，請用本機伺服器：

```bash
python -m http.server 8000
# 打開 http://localhost:8000
```

## 新增一家要分析的公司

在 `data/companies.json` 加一筆，格式照現有的三家：

- `symbol`：Yahoo Finance 代號（上市 `.TW`、上櫃 `.TWO`、韓股 `.KS`、港股 `.HK`、美股直接用代號）。
- `thesis`：分析師關注的成長主軸，以及為什麼挑這些同業。用 `**粗體**` 標重點。
- `peers`：依成長主軸挑的競爭對手。`ref: true` 只當參考，不計入中位數。
- `eps`：FactSet 調查的 2026、2027 年 EPS 中位數、區間、分析師人數、目標價與日期。
- `outlook`、`sources`：前景產品與來源連結。

存檔推上去後，下一次排程會自動抓新同業的估值資料；想立刻看到，就手動 Run workflow。

## 注意

- 證交所與櫃買中心 OpenAPI 的欄位名稱若改版，腳本會在 Actions 紀錄裡報錯，並保留前一天的資料。
- yfinance 是非官方工具，偶爾會失敗；失敗的個股會沿用舊資料，頁面上的日期會顯示資料時間。
- 估算價只是本益比乘以 EPS 的機械計算，不是目標價，也不構成投資建議。
