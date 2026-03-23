# Invoice Reconciler — NetSuite vs ICRM

A web application to reconcile invoice data between **NetSuite ERP** (`.xlsx`) and **ICRM** (`.csv`) systems. Upload both files, map columns, and instantly see discrepancies at the invoice level.

![Reconciliation Report](https://img.shields.io/badge/Status-Production_Ready-10b981)

## Features

- **Upload**: NetSuite Excel (`.xlsx`) + ICRM CSV (`.csv`)
- **Smart Column Mapping**: Auto-detects common column names, with manual override
- **Reconciliation Engine**: Matches by Invoice Number and detects:
  - Amount mismatches
  - Missing invoices (NetSuite-only / ICRM-only)
  - Date mismatches
  - Customer name mismatches
  - Multiple issues per invoice
- **Dashboard**: Summary stats, match rate, total variance, visual breakdown
- **Sortable & Filterable Table**: Search by invoice # or customer, filter by status
- **Expandable Rows**: Side-by-side NetSuite vs ICRM detail view
- **Export CSV**: Download full reconciliation report
- **Copy to Clipboard**: Quick-copy for pasting into Excel/Sheets
- **Sample Data**: Built-in demo to try without uploading files

## Quick Start

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/invoice-reconciler.git
cd invoice-reconciler

# Install dependencies
npm install

# Run locally
npm run dev
```

Open `http://localhost:5173/invoice-reconciler/` in your browser.

## Deploy to GitHub Pages

1. Push this repo to GitHub
2. Go to **Settings → Pages → Source** → select **GitHub Actions**
3. Push to `main` branch — the app auto-deploys

Your app will be live at:
```
https://YOUR_USERNAME.github.io/invoice-reconciler/
```

> **Important**: If your repo name is different from `invoice-reconciler`, update the `base` path in `vite.config.js` to match.

## Expected File Formats

### NetSuite (.xlsx)
| Column | Example |
|--------|---------|
| Invoice Number | INV-01001 |
| Amount | 15000.00 |
| Date | 2025-03-15 |
| Customer | Acme Corp |
| Status | Posted |

### ICRM (.csv)
| Column | Example |
|--------|---------|
| Invoice No | INV-01001 |
| Invoice Amount | 15000.00 |
| Invoice Date | 2025-03-15 |
| Client Name | Acme Corp |
| Invoice Status | Approved |

> Column names are flexible — the app auto-maps common variants and lets you manually select any column.

## Tech Stack

- **React 18** + Vite
- **SheetJS (xlsx)** for Excel parsing
- **No backend** — everything runs in the browser, your data never leaves your machine

## License

MIT
