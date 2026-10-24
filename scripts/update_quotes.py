"""每個交易日更新股價資料。

1. 台股：證交所（上市）與櫃買中心（上櫃）OpenAPI 的收盤價與本益比，寫入 data/tw_quotes.json。
   這份涵蓋所有上市櫃股票與 ETF，讓使用者輸入任何台股代號都能帶出價格。
2. 估值：companies.json 裡每家公司與其同業的價格、近四季本益比、預估本益比，
   透過 yfinance（Yahoo Finance）取得，寫入 data/global_quotes.json。

任何一段抓取失敗時保留舊資料，不會把檔案清空。
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests

DATA = Path(__file__).resolve().parents[1] / "data"
TPE = timezone(timedelta(hours=8))
HEADERS = {"User-Agent": "Mozilla/5.0 (chigu-toushi)", "Accept": "application/json"}

TWSE_DAY = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
TWSE_PE = "https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL"
TPEX_DAY = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes"
TPEX_PE = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis"


def now_iso() -> str:
    return datetime.now(TPE).isoformat(timespec="seconds")


def num(x) -> float | None:
    try:
        v = float(str(x).replace(",", "").strip())
    except (TypeError, ValueError):
        return None
    return v if v > 0 else None


def pick(row: dict, *keys):
    for k in keys:
        v = row.get(k)
        if v not in (None, "", "--", "-"):
            return v
    return None


def roc_date(s) -> str | None:
    """'1151023' 或 '115/10/23'（民國）轉成 '2026-10-23'。"""
    if not s:
        return None
    digits = "".join(ch for ch in str(s) if ch.isdigit())
    if len(digits) == 7:
        return f"{int(digits[:3]) + 1911}-{digits[3:5]}-{digits[5:]}"
    if len(digits) == 8:
        return f"{digits[:4]}-{digits[4:6]}-{digits[6:]}"
    return None


def fetch(url: str) -> list[dict]:
    r = requests.get(url, headers=HEADERS, timeout=40)
    r.raise_for_status()
    data = r.json()
    if not isinstance(data, list):
        raise ValueError(f"{url} 回傳格式不是列表")
    return data


def load(name: str) -> dict:
    try:
        return json.loads((DATA / name).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}


def write(name: str, obj: dict) -> None:
    (DATA / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def update_tw() -> bool:
    quotes: dict[str, dict] = {}
    dates: list[str] = []

    for url, code_k, name_k, close_k in (
        (TWSE_DAY, ("Code",), ("Name",), ("ClosingPrice",)),
        (TPEX_DAY, ("SecuritiesCompanyCode", "Code"), ("CompanyName", "Name"), ("Close", "ClosingPrice")),
    ):
        try:
            for row in fetch(url):
                code, close = pick(row, *code_k), num(pick(row, *close_k))
                if code and close:
                    quotes[str(code).strip()] = {"n": str(pick(row, *name_k) or code).strip(), "p": close}
                d = roc_date(pick(row, "Date"))
                if d:
                    dates.append(d)
        except Exception as e:  # noqa: BLE001
            print(f"[tw] 收盤價抓取失敗 {url}: {e}", file=sys.stderr)

    for url, code_k, pe_k in (
        (TWSE_PE, ("Code",), ("PEratio", "PERatio")),
        (TPEX_PE, ("SecuritiesCompanyCode", "Code"), ("PriceEarningRatio", "PEratio")),
    ):
        try:
            for row in fetch(url):
                code, pe = pick(row, *code_k), num(pick(row, *pe_k))
                if code and pe and str(code).strip() in quotes:
                    quotes[str(code).strip()]["pe"] = pe
        except Exception as e:  # noqa: BLE001
            print(f"[tw] 本益比抓取失敗 {url}: {e}", file=sys.stderr)

    if len(quotes) < 500:
        print(f"[tw] 只拿到 {len(quotes)} 檔，視為失敗，保留舊資料", file=sys.stderr)
        return False
    write("tw_quotes.json", {
        "updated": now_iso(),
        "date": max(dates) if dates else date.today().isoformat(),
        "source": "twse+tpex",
        "quotes": dict(sorted(quotes.items())),
    })
    print(f"[tw] 已更新 {len(quotes)} 檔")
    return True


def update_global() -> bool:
    import yfinance as yf

    companies = {k: v for k, v in load("companies.json").items() if not k.startswith("_")}
    symbols = sorted({c["symbol"] for c in companies.values()} | {p["symbol"] for c in companies.values() for p in c["peers"]})
    old = load("global_quotes.json").get("quotes", {})
    out, ok = {}, 0
    for sym in symbols:
        try:
            info = yf.Ticker(sym).info
            p = num(info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose"))
            if not p:
                raise ValueError("沒有價格")
            out[sym] = {
                "price": p,
                "currency": info.get("currency"),
                "pe": num(info.get("trailingPE")),
                "fpe": num(info.get("forwardPE")),
                "asof": date.today().isoformat(),
            }
            ok += 1
        except Exception as e:  # noqa: BLE001
            print(f"[global] {sym} 失敗，沿用舊資料: {e}", file=sys.stderr)
            if sym in old:
                out[sym] = old[sym]
    write("global_quotes.json", {"updated": now_iso(), "source": "yfinance", "quotes": out})
    print(f"[global] 更新 {ok}/{len(symbols)} 檔")
    return ok > 0


if __name__ == "__main__":
    results = []
    for step in (update_tw, update_global):
        try:
            results.append(step())
        except Exception as e:  # noqa: BLE001
            print(f"{step.__name__} 發生錯誤: {e}", file=sys.stderr)
            results.append(False)
    sys.exit(0 if any(results) else 1)
