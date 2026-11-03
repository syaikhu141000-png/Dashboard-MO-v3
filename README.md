# Minda Optima — Pantas Baca Daily Monitoring Dashboard

Dashboard harian Meta Ads untuk semua ad account Minda Optima, hosted di GitHub Pages.

**Live:** https://mindaoptimasyaikhufirdaus-beep.github.io/minda-optima-dashboard/

## Fail dalam repo (3 sahaja)

| Fail | Fungsi |
|---|---|
| `index.html` | Dashboard. Baca `data.json` dan papar semua account. |
| `data.json` | Data SEMUA account dalam satu fail. Ditukar setiap hari. |
| `README.md` | Nota ni. |

## Account dalam dashboard

| Key | Account | Ad Account ID |
|---|---|---|
| `mo2` | Minda Optima 2 | 863467445706037 |
| `mo4` | Minda Optima 4 | 4603088879971972 |
| `mo05` | Minda Optima 05 | 28873619612279525 |

Tab **🌐 Gabungan** = ringkasan total semua account (spend, lead, CPL, budget, total tahun ini, red flag).
Tab setiap account = dashboard penuh 10 section (Account, Red Flags, Campaign, Ad Set, Ads, Budget, Trend, Diagnostic, Checklist, Historical).

## Rutin harian

1. Scheduled task Claude jalan pukul ~6 pagi, tarik data Meta Ads untuk semua account dan hantar `data.json` baru dalam chat.
2. Download `data.json` tu.
3. Buka repo → **Add file → Upload files** → drag `data.json` (nama mesti tepat `data.json`, bukan `data.json (1)`) → **Commit changes**.
4. Tunggu 1–2 minit, refresh dashboard.

> Guna **Upload files**, bukan copy-paste. Fail besar (~100KB+) senang terpotong bila paste.

## Struktur `data.json`

```json
{
  "_meta": { "dashboard": "...", "generated_at": "2026-11-03T06:30:00+08:00", "accounts_order": ["mo2","mo4","mo05"] },
  "accounts": {
    "mo2":  { "_meta": {...}, "section_1_budget_card": {...}, "...": "...", "section_10_historical_comparison": {...} },
    "mo4":  { "...": "struktur sama" },
    "mo05": { "...": "struktur sama" }
  }
}
```

Setiap account ada 11 key yang sama: `_meta`, `section_1_budget_card` hingga `section_10_historical_comparison`.
`section_7_ads_performance` mesti ada `ads_14D` DAN `ads_7D_top`.
`total_this_year` (dalam `section_3_account_overview.metrics`) ada date-guard: `period` = tarikh terakhir yang dah dikira, supaya tak double-count kalau task run lebih sekali sehari.

Dashboard masih boleh baca `data.json` format lama (satu account sahaja, tanpa `accounts`) — dipaparkan sebagai Minda Optima 2.

## Remark

Remark dalam dashboard sync live melalui Firestore (project `minda-optima-dashboard`). Tak bergantung pada `data.json`.

## Tambah account baru

1. Tambah satu baris dalam `ACCOUNTS` dalam `index.html` (key + nama).
2. Tambah account tu dalam prompt scheduled task (key yang sama).
