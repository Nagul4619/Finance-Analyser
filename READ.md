# Finance Tracker App

A browser-based bank statement analyzer for reviewing income, expenditure, balances, and category trends from uploaded account statements.

## Features

- Upload one or more bank statements.
- Supports `.csv`, `.xls`, `.xlsx`, and text-based `.pdf` files.
- Creates a separate account tab for each uploaded statement.
- Rejects duplicate uploads using content and transaction fingerprints.
- Validates whether an uploaded file looks like a bank statement.
- Reads customer name, bank name, currency, and closing balance when available.
- Shows total income, total expenditure, closing balance, and net value.
- Includes a statement chat assistant for asking questions about uploaded transactions.
- Displays report data as both graph and table.
- Supports category, month-wise, week-wise, and day-wise views.
- Month, week, day, and category rows can be expanded.
- Expanded rows include sorting and filtering.
- Category drilldowns show aggregated sub-categories first, then expandable individual transactions.

## Run Locally

From this folder:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:4173/
```

## Usage

1. Click **Upload bank statements** in the top-right corner.
2. Select one or more supported statement files.
3. Use the account tabs to switch between uploaded statements.
4. Use **Graph** or **Table** to change the report view.
5. Use **Category**, **Month**, **Week**, or **Day** to change the breakdown.
6. Click rows or chart periods to expand details.
7. Use filter inputs and sortable headers inside expanded tables.
8. Ask questions in **Statement Chat**, such as "Where did I spend the most?" or "What is my net amount?"

## Notes

- Excel parsing uses SheetJS from a CDN when `.xls` or `.xlsx` files are uploaded.
- PDF parsing uses PDF.js from a CDN and works best with text-based PDFs.
- Scanned image PDFs are not supported unless converted to searchable text first.
- All parsing happens in the browser; no backend server is required beyond the static local file server.
