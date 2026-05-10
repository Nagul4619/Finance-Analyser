const fileInput = document.querySelector("#statementFile");
const dropZone = document.querySelector("#dropZone");
const parseStatus = document.querySelector("#parseStatus");
const graphButton = document.querySelector("#graphButton");
const tableButton = document.querySelector("#tableButton");
const breakdownButtons = document.querySelectorAll("[data-breakdown]");
const graphView = document.querySelector("#graphView");
const tableView = document.querySelector("#tableView");
const canvas = document.querySelector("#categoryChart");
const ctx = canvas.getContext("2d");

const elements = {
  incomeTotal: document.querySelector("#incomeTotal"),
  expenseTotal: document.querySelector("#expenseTotal"),
  closingBalance: document.querySelector("#closingBalance"),
  netTotal: document.querySelector("#netTotal"),
  bankName: document.querySelector("#bankName"),
  customerName: document.querySelector("#customerName"),
  topIncome: document.querySelector("#topIncome"),
  topExpense: document.querySelector("#topExpense"),
  transactionCount: document.querySelector("#transactionCount"),
  analysisTitle: document.querySelector("#analysisTitle"),
  chartLabel: document.querySelector("#chartLabel"),
  chartTitle: document.querySelector("#chartTitle"),
  tableLabel: document.querySelector("#tableLabel"),
  tableTitle: document.querySelector("#tableTitle"),
  tableHead: document.querySelector("#tableHead"),
  accountTabs: document.querySelector("#accountTabs"),
  categoryRows: document.querySelector("#categoryRows"),
  chartLegend: document.querySelector("#chartLegend")
};

const categoryRules = [
  ["Salary", /salary|payroll|wage|stipend|compensation/i],
  ["Transfer In", /credit from|incoming|received|deposit|neft cr|imps cr|upi cr|ach credit/i],
  ["Investment Income", /dividend|interest|coupon|capital gain|mutual fund redemption/i],
  ["Rent & Housing", /rent|landlord|mortgage|maintenance|property/i],
  ["Groceries", /grocery|supermarket|market|bigbasket|instacart|whole foods|trader joe|dmart|reliance fresh/i],
  ["Food & Dining", /restaurant|cafe|coffee|swiggy|zomato|doordash|uber eats|mcdonald|starbucks|pizza/i],
  ["Transport", /fuel|petrol|diesel|uber|ola|lyft|metro|rail|bus|parking|toll|taxi/i],
  ["Utilities", /electric|water|gas bill|utility|broadband|internet|phone|mobile|airtel|jio|verizon|comcast/i],
  ["Shopping", /amazon|flipkart|myntra|walmart|target|costco|store|retail|mall/i],
  ["Healthcare", /hospital|clinic|pharmacy|medical|doctor|dental|insurance premium/i],
  ["Entertainment", /netflix|spotify|prime video|cinema|movie|gaming|ticket|subscription/i],
  ["Travel", /airline|flight|hotel|booking|airbnb|expedia|makemytrip|cleartrip/i],
  ["Education", /school|college|tuition|course|udemy|coursera|books/i],
  ["Fees & Charges", /fee|charge|penalty|atm|annual|overdraft|gst/i],
  ["Transfer Out", /transfer to|sent|withdrawal|neft dr|imps dr|upi dr|ach debit/i]
];

let latestTransactions = [];
let latestCategoryGroups = [];
let latestGroups = [];
let currentBreakdown = "category";
let activeCurrency = "USD";
let periodHitboxes = [];
let accountStatements = [];
let activeStatementId = "";
const expandedPeriodKeys = new Set();
const detailPeriodStates = new Map();
const expandedAggregateKeys = new Set();
const expandableBreakdowns = ["month", "week", "day"];

fileInput.addEventListener("change", event => {
  const files = Array.from(event.target.files);
  if (files.length) handleFiles(files);
});

dropZone.addEventListener("dragover", event => {
  event.preventDefault();
  dropZone.classList.add("dragging");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragging");
});

dropZone.addEventListener("drop", event => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  const files = Array.from(event.dataTransfer.files);
  if (files.length) handleFiles(files);
});

elements.accountTabs.addEventListener("click", event => {
  const tab = event.target.closest("[data-statement-id]");
  if (!tab) return;

  setActiveStatement(tab.dataset.statementId);
});

graphButton.addEventListener("click", () => setView("graph"));
tableButton.addEventListener("click", () => setView("table"));

canvas.addEventListener("click", event => {
  if (!["category", ...expandableBreakdowns].includes(currentBreakdown)) return;

  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const hitbox = periodHitboxes.find(box => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height);
  if (!hitbox) return;

  togglePeriod(hitbox.key);
  setView("table");
});

elements.categoryRows.addEventListener("click", event => {
  const sortButton = event.target.closest("[data-detail-sort]");
  if (sortButton) {
    updateDetailSort(sortButton.dataset.periodKey, sortButton.dataset.detailSort);
    return;
  }

  const aggregateRow = event.target.closest("[data-aggregate-key]");
  if (aggregateRow) {
    toggleAggregate(aggregateRow.dataset.aggregateKey);
    return;
  }

  if (event.target.closest(".transaction-detail")) return;

  const row = event.target.closest("tr[data-period-key]");
  if (!row) return;

  togglePeriod(row.dataset.periodKey);
});

elements.categoryRows.addEventListener("change", event => {
  const filterInput = event.target.closest("[data-detail-filter]");
  if (!filterInput) return;

  updateDetailFilter(filterInput.dataset.periodKey, filterInput.dataset.detailFilter, filterInput.value);
});

elements.categoryRows.addEventListener("keydown", event => {
  const filterInput = event.target.closest("[data-detail-filter]");
  if (!filterInput || event.key !== "Enter") return;

  updateDetailFilter(filterInput.dataset.periodKey, filterInput.dataset.detailFilter, filterInput.value);
});

breakdownButtons.forEach(button => {
  button.addEventListener("click", () => setBreakdown(button.dataset.breakdown));
});

window.addEventListener("resize", () => drawChart(latestGroups));

async function handleFiles(files) {
  const supportedFiles = files.filter(isSupportedFile);
  const unsupportedCount = files.length - supportedFiles.length;

  if (!supportedFiles.length) {
    setStatus("Unsupported file type. Please upload CSV, XLS, XLSX, or text-based PDF statements.");
    fileInput.value = "";
    return;
  }

  setStatus(`Reading ${supportedFiles.length} statement${supportedFiles.length === 1 ? "" : "s"}...`);

  const parsedStatements = [];
  const errors = [];
  const incomingFingerprints = new Set();

  for (const file of supportedFiles) {
    try {
      const statement = await parseStatementFile(file);
      if (isDuplicateStatement(statement, incomingFingerprints)) {
        errors.push(`${file.name}: duplicate statement already uploaded.`);
        continue;
      }

      incomingFingerprints.add(statement.contentFingerprint);
      incomingFingerprints.add(statement.transactionFingerprint);
      parsedStatements.push(statement);
    } catch (error) {
      errors.push(`${file.name}: ${error.message}`);
    }
  }

  if (parsedStatements.length) {
    accountStatements = [...accountStatements, ...parsedStatements];
    activeStatementId = parsedStatements[parsedStatements.length - 1].id;
    renderTabs();
    renderActiveStatement();
  }

  const ignoredText = unsupportedCount ? ` ${unsupportedCount} unsupported file${unsupportedCount === 1 ? " was" : "s were"} ignored.` : "";
  const errorText = errors.length ? ` ${errors.length} file${errors.length === 1 ? "" : "s"} could not be loaded: ${errors[0]}${errors.length > 1 ? "..." : ""}` : "";
  const parsedText = parsedStatements.length ? `Loaded ${parsedStatements.length} statement${parsedStatements.length === 1 ? "" : "s"}.` : "No statements were loaded.";
  setStatus(`${parsedText}${ignoredText}${errorText}`);
  fileInput.value = "";
}

async function parseStatementFile(file) {
  const text = await readStatementText(file);
  const profile = extractProfile(text, file.name);
  const transactions = parseTransactions(text);
  const closingBalance = extractClosingBalance(text);

  if (!transactions.length) {
    throw new Error("No transaction rows were found. Try a CSV/XLS/XLSX export, or a text-based PDF with date, description, and amount columns.");
  }

  const validation = validateBankStatement(text, transactions);
  if (!validation.valid) {
    throw new Error(validation.message);
  }

  const groups = summarizeCategories(transactions);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    fileName: file.name,
    contentFingerprint: createContentFingerprint(text),
    transactionFingerprint: createTransactionFingerprint(profile, transactions, closingBalance),
    profile,
    transactions,
    groups,
    closingBalance
  };
}

function isDuplicateStatement(statement, incomingFingerprints) {
  const matchesIncoming = incomingFingerprints.has(statement.contentFingerprint)
    || incomingFingerprints.has(statement.transactionFingerprint);
  const matchesExisting = accountStatements.some(existing => {
    return existing.contentFingerprint === statement.contentFingerprint
      || existing.transactionFingerprint === statement.transactionFingerprint;
  });

  return matchesIncoming || matchesExisting;
}

function createContentFingerprint(text) {
  return hashString(text.replace(/\s+/g, " ").trim().toLowerCase());
}

function createTransactionFingerprint(profile, transactions, closingBalance) {
  const normalizedRows = transactions.map(transaction => {
    return [
      transaction.dateValue ? dateKey(transaction.dateValue) : String(transaction.date || "").trim().toLowerCase(),
      normalizeFingerprintText(transaction.description),
      transaction.amount.toFixed(2)
    ].join("|");
  }).sort();

  return hashString([
    normalizeFingerprintText(profile.bank),
    normalizeFingerprintText(profile.customer),
    closingBalance === null ? "" : closingBalance.toFixed(2),
    transactions.length,
    normalizedRows.join("~")
  ].join("::"));
}

function normalizeFingerprintText(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9. -]/g, " ").replace(/\s+/g, " ").trim();
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
}

function isSupportedFile(file) {
  const lowerName = file.name.toLowerCase();
  return lowerName.endsWith(".csv")
    || lowerName.endsWith(".xls")
    || lowerName.endsWith(".xlsx")
    || lowerName.endsWith(".pdf")
    || file.type === "text/csv"
    || file.type === "application/vnd.ms-excel"
    || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    || file.type === "application/pdf";
}

async function readStatementText(file) {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".xls") || lowerName.endsWith(".xlsx") || /spreadsheet|excel/i.test(file.type)) {
    return readExcelText(file);
  }

  if (lowerName.endsWith(".pdf") || file.type === "application/pdf") {
    return readPdfText(file);
  }

  if (lowerName.endsWith(".csv") || file.type === "text/csv") {
    return file.text();
  }

  throw new Error("Unsupported file type. Please upload a CSV, XLS, XLSX, or text-based PDF statement.");
}

async function readExcelText(file) {
  if (!window.XLSX) {
    await loadSheetJs();
  }

  if (!window.XLSX) {
    throw new Error("Excel parsing needs an internet connection for SheetJS. CSV files work fully offline.");
  }

  const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheets = workbook.SheetNames.map(sheetName => {
    const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      blankrows: false,
      defval: ""
    });

    return rows.map(row => row.map(formatExcelCell).join(",")).join("\n");
  });

  return sheets.join("\n");
}

function loadSheetJs() {
  return new Promise(resolve => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => resolve(), { once: true });
    document.head.appendChild(script);
    setTimeout(resolve, 7000);
  });
}

function formatExcelCell(value) {
  if (value instanceof Date) {
    return value.toLocaleDateString();
  }

  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function readPdfText(file) {
  if (!window.pdfjsLib) {
    await loadPdfJs();
  }

  if (!window.pdfjsLib) {
    throw new Error("PDF text extraction needs an internet connection for PDF.js. CSV files work fully offline.");
  }

  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(" "));
  }

  return pages.join("\n");
}

function loadPdfJs() {
  return new Promise(resolve => {
    const script = document.createElement("script");
    script.type = "module";
    script.textContent = `
      import * as pdfjs from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
      window.pdfjsLib = pdfjs;
      window.dispatchEvent(new Event("pdfjs-ready"));
    `;
    window.addEventListener("pdfjs-ready", () => resolve(), { once: true });
    script.addEventListener("error", () => resolve(), { once: true });
    document.head.appendChild(script);
    setTimeout(resolve, 7000);
  });
}

function extractProfile(text, fileName) {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const bankLine = lines.find(line => /\b(bank|credit union|financial|hdfc|icici|sbi|chase|citi|wells fargo|axis|kotak|barclays|hsbc)\b/i.test(line));
  const namePatterns = [
    /(?:customer|account holder|name|primary owner)\s*[:\-]\s*([a-z][a-z .'-]{2,})/i,
    /(?:mr|mrs|ms|dr)\.?\s+([a-z][a-z .'-]{2,})/i
  ];

  let customer = "";
  for (const line of lines.slice(0, 45)) {
    for (const pattern of namePatterns) {
      const match = line.match(pattern);
      if (match && !/statement|account|bank|branch|address|period/i.test(match[1])) {
        customer = toTitleCase(match[1]);
        break;
      }
    }
    if (customer) break;
  }

  return {
    bank: cleanBankName(bankLine) || "Bank statement",
    customer: customer || inferNameFromFile(fileName) || "Customer statement",
    currency: detectCurrency(text)
  };
}

function detectCurrency(text) {
  if (/₹|\bINR\b|rs\.?/i.test(text)) return "INR";
  if (/€|\bEUR\b/i.test(text)) return "EUR";
  if (/£|\bGBP\b/i.test(text)) return "GBP";
  if (/\bAUD\b/i.test(text)) return "AUD";
  if (/\bCAD\b/i.test(text)) return "CAD";
  if (/\$|\bUSD\b/i.test(text)) return "USD";
  return "USD";
}

function cleanBankName(line = "") {
  const cleaned = line
    .replace(/page\s+no\s*.*$/i, "")
    .replace(/statement\s+of\s+accounts?/gi, "")
    .replace(/statement|account summary|transaction history/gi, "")
    .replace(/,+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned ? toTitleCase(cleaned) : "";
}

function inferNameFromFile(fileName) {
  const cleaned = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b(statement|bank|transactions|account)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length > 2 ? toTitleCase(cleaned) : "";
}

function parseTransactions(text) {
  const rows = parseDelimitedRows(text);
  const structured = parseStructuredRows(rows);

  if (structured.length) {
    return structured;
  }

  return parseLooseRows(text);
}

function extractClosingBalance(text) {
  const rows = parseDelimitedRows(text);
  const headerIndex = rows.findIndex(isTransactionHeader);

  if (headerIndex >= 0) {
    const headers = rows[headerIndex].map(normalizeHeader);
    const balanceIndex = findHeader(headers, ["closing balance", "running balance", "available balance", "ledger balance", "balance"]);
    const dateIndex = findHeader(headers, ["date", "transaction date", "value date", "posted date"]);

    if (balanceIndex >= 0) {
      let lastBalance = null;
      for (const row of rows.slice(headerIndex + 1)) {
        if (dateIndex >= 0 && !parseTransactionDate(row[dateIndex])) continue;
        const value = parseMoney(row[balanceIndex]);
        if (Number.isFinite(value) && String(row[balanceIndex] ?? "").trim() !== "") {
          lastBalance = value;
        }
      }
      if (lastBalance !== null) return lastBalance;
    }
  }

  const textMatch = text.match(/(?:closing|available|ledger)\s+balance\s*[:\-]?\s*([$₹€£]?\s?\(?[-+]?\d[\d,]*(?:\.\d{1,2})?\)?)/i);
  return textMatch ? parseMoney(textMatch[1]) : null;
}

function validateBankStatement(text, transactions) {
  const rows = parseDelimitedRows(text);
  const hasTransactionTable = rows.some(isTransactionHeader);
  const normalizedText = text.toLowerCase();
  const hasStatementSignal = /\b(bank|credit union|statement|account\s*(no|number|branch|holder|summary|status)|ifsc|iban|swift|routing|micr|opening balance|closing balance|withdrawal|deposit|debit|credit)\b/i.test(text);
  const financialKeywordCount = transactions.filter(transaction => {
    return /\b(upi|imps|neft|rtgs|ach|atm|pos|salary|payroll|deposit|withdrawal|debit|credit|transfer|payment|interest|fee|charge|card|cash|cheque|check)\b/i.test(transaction.description);
  }).length;
  const hasBalanceColumn = /\b(closing|running|available|ledger)\s+balance\b/i.test(text);
  const enoughFinancialRows = transactions.length >= 2 && financialKeywordCount / transactions.length >= 0.2;

  if (transactions.length < 1) {
    return {
      valid: false,
      message: "This file does not contain bank-statement transactions."
    };
  }

  if (hasTransactionTable && (hasStatementSignal || hasBalanceColumn || enoughFinancialRows)) {
    return { valid: true };
  }

  if (hasStatementSignal && enoughFinancialRows) {
    return { valid: true };
  }

  if (normalizedText.includes("invoice") || normalizedText.includes("purchase order") || normalizedText.includes("timesheet")) {
    return {
      valid: false,
      message: "This file looks like a business document, not a bank statement."
    };
  }

  return {
    valid: false,
    message: "This file does not look like a bank statement. Please upload a statement with account details and transaction rows."
  };
}

function parseDelimitedRows(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  const delimiter = detectDelimiter(lines.slice(0, 15));

  if (!delimiter) return [];

  return lines.map(line => splitDelimitedLine(line, delimiter));
}

function detectDelimiter(lines) {
  const candidates = [",", "\t", ";", "|"];
  let best = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = lines.reduce((total, line) => total + Math.max(0, splitDelimitedLine(line, candidate).length - 1), 0);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return bestScore >= 3 ? best : null;
}

function splitDelimitedLine(line, delimiter) {
  const values = [];
  let current = "";
  let quoted = false;

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function parseStructuredRows(rows) {
  const headerIndex = rows.findIndex(isTransactionHeader);
  if (headerIndex < 0) return [];

  const headers = rows[headerIndex].map(normalizeHeader);
  const dataRows = rows.slice(headerIndex + 1);
  const dateIndex = findHeader(headers, ["date", "transaction date", "value date", "posted date"]);
  const descriptionIndex = findHeader(headers, ["description", "narration", "details", "particulars", "merchant", "memo"]);
  const amountIndex = findHeader(headers, ["amount", "transaction amount"]);
  const debitIndex = findHeader(headers, ["debit", "withdrawal", "paid out", "outflow"]);
  const creditIndex = findHeader(headers, ["credit", "deposit", "paid in", "inflow"]);

  return dataRows
    .map(row => {
      const date = row[dateIndex] || "";
      const description = row[descriptionIndex] || row.find(cell => /[a-z]/i.test(cell)) || "";
      let amount = amountIndex >= 0 ? parseMoney(row[amountIndex]) : 0;

      if (!amount && (debitIndex >= 0 || creditIndex >= 0)) {
        const debit = debitIndex >= 0 ? parseMoney(row[debitIndex]) : 0;
        const credit = creditIndex >= 0 ? parseMoney(row[creditIndex]) : 0;
        amount = credit || -Math.abs(debit);
      }

      return makeTransaction(date, description, amount);
    })
    .filter(Boolean);
}

function findHeader(headers, candidates) {
  return headers.findIndex(header => candidates.some(candidate => header === candidate || header.includes(candidate)));
}

function isTransactionHeader(row) {
  const headers = row.map(normalizeHeader);
  const hasDate = findHeader(headers, ["date", "transaction date", "value date", "posted date"]) >= 0;
  const hasDescription = findHeader(headers, ["description", "narration", "details", "particulars", "merchant", "memo"]) >= 0;
  const hasMoneyColumn = findHeader(headers, ["amount", "transaction amount", "debit", "withdrawal", "paid out", "outflow", "credit", "deposit", "paid in", "inflow"]) >= 0;

  return hasDate && hasDescription && hasMoneyColumn;
}

function normalizeHeader(header) {
  return header.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
}

function parseLooseRows(text) {
  const moneyPattern = /[-+]?[$₹€£]?\s?\(?\d{1,3}(?:,\d{3})*(?:\.\d{2})?\)?|[-+]?\d+\.\d{2}/g;
  const datePattern = /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|[a-z]{3,9}\s+\d{1,2},?\s+\d{4})\b/i;

  return text
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(line => datePattern.test(line))
    .map(line => {
      const amounts = line.match(moneyPattern) || [];
      const amount = parseMoney(amounts[amounts.length - 1] || "");
      const date = (line.match(datePattern) || [""])[0];
      const description = line
        .replace(date, "")
        .replace(amounts[amounts.length - 1] || "", "")
        .replace(/\s+/g, " ")
        .trim();

      return makeTransaction(date, description, amount);
    })
    .filter(Boolean);
}

function makeTransaction(date, description, amount) {
  if (!description || !Number.isFinite(amount) || amount === 0) return null;
  return {
    date,
    dateValue: parseTransactionDate(date),
    description,
    amount,
    type: amount > 0 ? "Income" : "Expenditure",
    category: categorize(description, amount)
  };
}

function parseMoney(value = "") {
  const text = String(value).trim();
  if (!text || /^-+$/.test(text)) return 0;

  const isNegative = /-/.test(text) || /\(.*\)/.test(text) || /\bdr\b/i.test(text);
  const numeric = Number(text.replace(/[^\d.]/g, ""));

  if (!Number.isFinite(numeric)) return 0;
  return isNegative ? -numeric : numeric;
}

function parseTransactionDate(value = "") {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return startOfDay(value);
  }

  const text = String(value).trim();
  if (!text) return null;

  const numericDate = text.match(/^(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})$/);
  if (numericDate) {
    let first = Number(numericDate[1]);
    const second = Number(numericDate[2]);
    let third = Number(numericDate[3]);
    let year;
    let month;
    let day;

    if (numericDate[1].length === 4) {
      year = first;
      month = second;
      day = third;
    } else {
      year = third < 100 ? 2000 + third : third;
      if (first > 12) {
        day = first;
        month = second;
      } else if (second > 12) {
        month = first;
        day = second;
      } else {
        day = first;
        month = second;
      }
    }

    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function categorize(description, amount) {
  for (const [category, pattern] of categoryRules) {
    if (pattern.test(description)) return category;
  }

  if (/upi|imps|neft|rtgs|ach|transfer/i.test(description)) {
    return amount > 0 ? "Transfer In" : "Transfer Out";
  }

  return amount > 0 ? "Other Income" : "Other Expenditure";
}

function summarizeCategories(transactions) {
  const groups = new Map();

  for (const transaction of transactions) {
    const key = `${transaction.type}:${transaction.category}`;
    const existing = groups.get(key) || {
      key,
      type: transaction.type,
      category: transaction.category,
      amount: 0,
      count: 0,
      transactions: []
    };

    existing.amount += Math.abs(transaction.amount);
    existing.count += 1;
    existing.transactions.push(transaction);
    groups.set(key, existing);
  }

  return Array.from(groups.values()).map(group => ({
    ...group,
    transactions: group.transactions.sort((a, b) => {
      const dateA = a.dateValue ? a.dateValue.getTime() : 0;
      const dateB = b.dateValue ? b.dateValue.getTime() : 0;
      return dateA - dateB;
    })
  })).sort((a, b) => {
    if (a.type !== b.type) return a.type === "Income" ? -1 : 1;
    return b.amount - a.amount;
  });
}

function summarizePeriods(transactions, breakdown) {
  const groups = new Map();

  for (const transaction of transactions) {
    if (!transaction.dateValue) continue;

    const period = getPeriod(transaction.dateValue, breakdown);
    const existing = groups.get(period.key) || {
      key: period.key,
      period: period.label,
      sortDate: period.sortDate,
      income: 0,
      expense: 0,
      net: 0,
      count: 0,
      transactions: []
    };

    if (transaction.amount > 0) {
      existing.income += transaction.amount;
    } else {
      existing.expense += Math.abs(transaction.amount);
    }

    existing.net = existing.income - existing.expense;
    existing.count += 1;
    existing.transactions.push(transaction);
    groups.set(period.key, existing);
  }

  return Array.from(groups.values()).map(group => ({
    ...group,
    transactions: group.transactions.sort((a, b) => {
      const dateA = a.dateValue ? a.dateValue.getTime() : 0;
      const dateB = b.dateValue ? b.dateValue.getTime() : 0;
      return dateA - dateB;
    })
  })).sort((a, b) => a.sortDate - b.sortDate);
}

function getPeriod(date, breakdown) {
  if (breakdown === "day") {
    return {
      key: dateKey(date),
      label: formatDateLabel(date),
      sortDate: date
    };
  }

  if (breakdown === "week") {
    const weekStart = startOfWeek(date);
    return {
      key: dateKey(weekStart),
      label: `Week of ${formatDateLabel(weekStart)}`,
      sortDate: weekStart
    };
  }

  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
  return {
    key: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`,
    label: monthStart.toLocaleDateString(undefined, { month: "short", year: "numeric" }),
    sortDate: monthStart
  };
}

function startOfWeek(date) {
  const start = startOfDay(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  return start;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateLabel(date) {
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function render(profile, transactions, groups, closingBalance = null) {
  latestTransactions = transactions;
  latestCategoryGroups = groups;
  expandedPeriodKeys.clear();
  expandedAggregateKeys.clear();
  detailPeriodStates.clear();
  activeCurrency = profile.currency || "USD";

  const income = transactions.filter(item => item.amount > 0).reduce((sum, item) => sum + item.amount, 0);
  const expenses = transactions.filter(item => item.amount < 0).reduce((sum, item) => sum + Math.abs(item.amount), 0);
  const topIncome = groups.filter(item => item.type === "Income").sort((a, b) => b.amount - a.amount)[0];
  const topExpense = groups.filter(item => item.type === "Expenditure").sort((a, b) => b.amount - a.amount)[0];

  elements.bankName.textContent = profile.bank;
  elements.customerName.textContent = `${profile.customer} - Income & Expenditure`;
  elements.incomeTotal.textContent = formatMoney(income);
  elements.expenseTotal.textContent = formatMoney(expenses);
  elements.closingBalance.textContent = closingBalance === null ? "Not found" : formatMoney(closingBalance);
  elements.netTotal.textContent = formatMoney(income - expenses);
  elements.topIncome.textContent = topIncome ? `${topIncome.category} (${formatMoney(topIncome.amount)})` : "-";
  elements.topExpense.textContent = topExpense ? `${topExpense.category} (${formatMoney(topExpense.amount)})` : "-";
  elements.transactionCount.textContent = String(transactions.length);

  renderCurrentAnalysis();
}

function renderActiveStatement() {
  const statement = accountStatements.find(item => item.id === activeStatementId);
  if (!statement) return;

  render(statement.profile, statement.transactions, statement.groups, statement.closingBalance);
}

function setActiveStatement(statementId) {
  activeStatementId = statementId;
  renderTabs();
  renderActiveStatement();
}

function renderTabs() {
  if (!accountStatements.length) {
    elements.accountTabs.classList.add("hidden");
    elements.accountTabs.innerHTML = "";
    return;
  }

  elements.accountTabs.classList.remove("hidden");
  elements.accountTabs.innerHTML = accountStatements.map((statement, index) => {
    const isActive = statement.id === activeStatementId;
    const label = statement.profile.customer || `Account ${index + 1}`;
    const meta = statement.profile.bank || statement.fileName;

    return `
      <button type="button" class="${isActive ? "active" : ""}" data-statement-id="${escapeHtml(statement.id)}" aria-current="${isActive ? "page" : "false"}">
        <span>${escapeHtml(label)}</span>
        <small>${escapeHtml(meta)}</small>
      </button>
    `;
  }).join("");
}

function renderCurrentAnalysis() {
  latestGroups = getAnalysisRows();
  updateAnalysisTitles();
  renderTable(latestGroups);
  drawChart(latestGroups);
}

function getAnalysisRows() {
  if (currentBreakdown === "category") {
    return latestCategoryGroups;
  }

  return summarizePeriods(latestTransactions, currentBreakdown);
}

function updateAnalysisTitles() {
  const titles = {
    category: {
      title: "Category view",
      label: "Category analysis",
      chart: "Income vs expenditure by category",
      table: "Category table"
    },
    month: {
      title: "Month-wise view",
      label: "Monthly analysis",
      chart: "Income vs expenditure by month",
      table: "Month-wise table"
    },
    week: {
      title: "Week-wise view",
      label: "Weekly analysis",
      chart: "Income vs expenditure by week",
      table: "Week-wise table"
    },
    day: {
      title: "Day-wise view",
      label: "Daily analysis",
      chart: "Income vs expenditure by day",
      table: "Day-wise table"
    }
  };
  const active = titles[currentBreakdown];

  elements.analysisTitle.textContent = active.title;
  elements.chartLabel.textContent = active.label;
  elements.chartTitle.textContent = active.chart;
  elements.tableLabel.textContent = active.label;
  elements.tableTitle.textContent = active.table;
}

function renderTable(rows) {
  if (currentBreakdown !== "category") {
    elements.tableHead.innerHTML = `
      <tr>
        <th>Period</th>
        <th class="number-head">Income</th>
        <th class="number-head">Expenditure</th>
        <th class="number-head">Net</th>
        <th class="number-head">Transactions</th>
      </tr>
    `;
    if (!rows.length) {
      elements.categoryRows.innerHTML = '<tr><td colspan="5" class="empty-cell">No data found for this view.</td></tr>';
      return;
    }

    elements.categoryRows.innerHTML = rows.map(row => renderPeriodRow(row)).join("");
    return;
  }

  elements.tableHead.innerHTML = `
    <tr>
      <th>Type</th>
      <th>Category</th>
      <th>Amount</th>
      <th>Transactions</th>
    </tr>
  `;
  if (!rows.length) {
    elements.categoryRows.innerHTML = '<tr><td colspan="4" class="empty-cell">No data found for this view.</td></tr>';
    return;
  }

  elements.categoryRows.innerHTML = rows.map(group => renderCategoryRow(group)).join("");
}

function renderCategoryRow(group) {
  const isExpanded = expandedPeriodKeys.has(group.key);
  const toggle = `<button type="button" class="expand-toggle" aria-label="${isExpanded ? "Collapse" : "Expand"} ${escapeHtml(group.category)}">${isExpanded ? "-" : "+"}</button>`;
  const summaryRow = `
    <tr class="period-row clickable" data-period-key="${escapeHtml(group.key)}">
      <td><span class="period-cell">${toggle}<span class="pill ${group.type === "Income" ? "income" : "expense"}">${group.type}</span></span></td>
      <td>${escapeHtml(group.category)}</td>
      <td>${formatMoney(group.amount)}</td>
      <td>${group.count}</td>
    </tr>
  `;

  if (!isExpanded) {
    return summaryRow;
  }

  return `${summaryRow}${renderCategoryAggregateDetail(group.key, `${group.category} ${group.type.toLowerCase()} details`, group.count, group.transactions, 4)}`;
}

function renderPeriodRow(row) {
  const canExpand = expandableBreakdowns.includes(currentBreakdown);
  const isExpanded = expandedPeriodKeys.has(row.key);
  const toggle = canExpand ? `<button type="button" class="expand-toggle" aria-label="${isExpanded ? "Collapse" : "Expand"} ${escapeHtml(row.period)}">${isExpanded ? "-" : "+"}</button>` : "";
  const periodClass = canExpand ? "period-row clickable" : "period-row";
  const summaryRow = `
    <tr class="${periodClass}" ${canExpand ? `data-period-key="${escapeHtml(row.key)}"` : ""}>
      <td><span class="period-cell">${toggle}<span>${escapeHtml(row.period)}</span></span></td>
      <td class="number-cell">${formatMoney(row.income)}</td>
      <td class="number-cell">${formatMoney(row.expense)}</td>
      <td class="number-cell">${formatMoney(row.net)}</td>
      <td class="number-cell">${row.count}</td>
    </tr>
  `;

  if (!canExpand || !isExpanded) {
    return summaryRow;
  }

  return `${summaryRow}${renderTransactionDetail(row.key, `${row.period} transactions`, row.count, row.transactions, 5)}`;
}

function renderCategoryAggregateDetail(key, title, totalCount, sourceTransactions, colspan) {
  const state = getDetailState(key);
  const aggregateRows = getVisibleAggregateDetails(aggregateCategoryTransactions(sourceTransactions), state);

  return `
    <tr class="transaction-detail-row">
      <td colspan="${colspan}">
        <div class="transaction-detail">
          <div class="transaction-detail-header">
            <strong>${escapeHtml(title)}</strong>
            <span>${aggregateRows.length} groups from ${totalCount} entries</span>
          </div>
          <div class="transaction-list">
            <table>
              <thead>
                <tr>
                  ${renderDetailHeader(key, "description", "Detail", state)}
                  ${renderDetailHeader(key, "income", "Income", state, "number-head")}
                  ${renderDetailHeader(key, "expense", "Expenditure", state, "number-head")}
                  ${renderDetailHeader(key, "count", "Transactions", state, "number-head")}
                </tr>
                <tr class="filter-row">
                  <th><input data-period-key="${escapeHtml(key)}" data-detail-filter="description" value="${escapeAttribute(state.filters.description)}" placeholder="Filter" aria-label="Filter by detail"></th>
                  <th><input data-period-key="${escapeHtml(key)}" data-detail-filter="income" value="${escapeAttribute(state.filters.income)}" placeholder="Filter" aria-label="Filter by income"></th>
                  <th><input data-period-key="${escapeHtml(key)}" data-detail-filter="expense" value="${escapeAttribute(state.filters.expense)}" placeholder="Filter" aria-label="Filter by expenditure"></th>
                  <th><input data-period-key="${escapeHtml(key)}" data-detail-filter="count" value="${escapeAttribute(state.filters.count)}" placeholder="Filter" aria-label="Filter by transactions"></th>
                </tr>
              </thead>
              <tbody>
                ${aggregateRows.length ? aggregateRows.map(row => renderAggregateRow(key, row)).join("") : '<tr><td colspan="4" class="empty-cell">No grouped details match the filters.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>
  `;
}

function renderAggregateRow(parentKey, row) {
  const aggregateKey = `${parentKey}::${row.description}`;
  const isExpanded = expandedAggregateKeys.has(aggregateKey);
  const toggle = `<button type="button" class="expand-toggle" aria-label="${isExpanded ? "Collapse" : "Expand"} ${escapeHtml(row.description)}">${isExpanded ? "-" : "+"}</button>`;
  const summaryRow = `
    <tr class="aggregate-row clickable" data-aggregate-key="${escapeAttribute(aggregateKey)}">
      <td class="description-cell"><span class="period-cell">${toggle}<span>${escapeHtml(row.description)}</span></span></td>
      <td class="number-cell">${row.income ? formatMoney(row.income) : "-"}</td>
      <td class="number-cell">${row.expense ? formatMoney(row.expense) : "-"}</td>
      <td class="number-cell">${row.count}</td>
    </tr>
  `;

  if (!isExpanded) {
    return summaryRow;
  }

  return `${summaryRow}
    <tr class="aggregate-transaction-row">
      <td colspan="4">
        <div class="aggregate-transactions">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th class="number-head">Income</th>
                <th class="number-head">Expenditure</th>
              </tr>
            </thead>
            <tbody>
              ${row.transactions.map(transaction => `
                <tr>
                  <td>${escapeHtml(formatTransactionDate(transaction))}</td>
                  <td class="description-cell">${escapeHtml(transaction.description)}</td>
                  <td class="number-cell">${transaction.amount > 0 ? formatMoney(transaction.amount) : "-"}</td>
                  <td class="number-cell">${transaction.amount < 0 ? formatMoney(Math.abs(transaction.amount)) : "-"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  `;
}

function renderTransactionDetail(key, title, totalCount, sourceTransactions, colspan) {
  const state = getDetailState(key);
  const transactions = getVisibleDetailTransactions(sourceTransactions, state);

  return `
    <tr class="transaction-detail-row">
      <td colspan="${colspan}">
        <div class="transaction-detail">
          <div class="transaction-detail-header">
            <strong>${escapeHtml(title)}</strong>
            <span>${transactions.length} of ${totalCount} entries</span>
          </div>
          <div class="transaction-list">
            <table>
              <thead>
                <tr>
                  ${renderDetailHeader(key, "date", "Date", state)}
                  ${renderDetailHeader(key, "category", "Category", state)}
                  ${renderDetailHeader(key, "description", "Description", state)}
                  ${renderDetailHeader(key, "income", "Income", state, "number-head")}
                  ${renderDetailHeader(key, "expense", "Expenditure", state, "number-head")}
                </tr>
                <tr class="filter-row">
                  <th><input data-period-key="${escapeHtml(key)}" data-detail-filter="date" value="${escapeAttribute(state.filters.date)}" placeholder="Filter" aria-label="Filter by date"></th>
                  <th><input data-period-key="${escapeHtml(key)}" data-detail-filter="category" value="${escapeAttribute(state.filters.category)}" placeholder="Filter" aria-label="Filter by category"></th>
                  <th><input data-period-key="${escapeHtml(key)}" data-detail-filter="description" value="${escapeAttribute(state.filters.description)}" placeholder="Filter" aria-label="Filter by description"></th>
                  <th><input data-period-key="${escapeHtml(key)}" data-detail-filter="income" value="${escapeAttribute(state.filters.income)}" placeholder="Filter" aria-label="Filter by income"></th>
                  <th><input data-period-key="${escapeHtml(key)}" data-detail-filter="expense" value="${escapeAttribute(state.filters.expense)}" placeholder="Filter" aria-label="Filter by expenditure"></th>
                </tr>
              </thead>
              <tbody>
                ${transactions.length ? transactions.map(transaction => `
                  <tr>
                    <td>${escapeHtml(formatTransactionDate(transaction))}</td>
                    <td>${escapeHtml(transaction.category)}</td>
                    <td class="description-cell">${escapeHtml(transaction.description)}</td>
                    <td class="number-cell">${transaction.amount > 0 ? formatMoney(transaction.amount) : "-"}</td>
                    <td class="number-cell">${transaction.amount < 0 ? formatMoney(Math.abs(transaction.amount)) : "-"}</td>
                  </tr>
                `).join("") : '<tr><td colspan="5" class="empty-cell">No transactions match the filters.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>
  `;
}

function renderDetailHeader(periodKey, key, label, state, extraClass = "") {
  const isActive = state.sortKey === key;
  const direction = isActive ? (state.sortDir === "asc" ? "up" : "down") : "both";
  const marker = isActive ? (state.sortDir === "asc" ? "^" : "v") : "sort";

  return `
    <th class="${extraClass}">
      <button type="button" class="detail-sort ${isActive ? "active" : ""}" data-period-key="${escapeHtml(periodKey)}" data-detail-sort="${key}" aria-label="Sort ${escapeHtml(label)} ${direction}">
        <span>${escapeHtml(label)}</span>
        <span aria-hidden="true">${marker}</span>
      </button>
    </th>
  `;
}

function getDetailState(periodKey) {
  if (!detailPeriodStates.has(periodKey)) {
    const isCategoryDetail = periodKey.includes(":");
    detailPeriodStates.set(periodKey, {
      sortKey: isCategoryDetail ? "count" : "date",
      sortDir: isCategoryDetail ? "desc" : "asc",
      filters: {
        date: "",
        category: "",
        description: "",
        income: "",
        expense: "",
        lastDate: "",
        count: ""
      }
    });
  }

  return detailPeriodStates.get(periodKey);
}

function updateDetailSort(periodKey, sortKey) {
  const state = getDetailState(periodKey);
  if (state.sortKey === sortKey) {
    state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
  } else {
    state.sortKey = sortKey;
    state.sortDir = sortKey === "date" ? "asc" : "desc";
  }

  renderTable(latestGroups);
}

function updateDetailFilter(periodKey, filterKey, value) {
  const state = getDetailState(periodKey);
  state.filters[filterKey] = value.trim();
  renderTable(latestGroups);
}

function getVisibleDetailTransactions(transactions, state) {
  const filtered = transactions.filter(transaction => matchesDetailFilters(transaction, state.filters));
  const direction = state.sortDir === "asc" ? 1 : -1;

  return filtered.sort((a, b) => {
    const valueA = getDetailSortValue(a, state.sortKey);
    const valueB = getDetailSortValue(b, state.sortKey);

    if (typeof valueA === "number" && typeof valueB === "number") {
      return (valueA - valueB) * direction;
    }

    return String(valueA).localeCompare(String(valueB)) * direction;
  });
}

function aggregateCategoryTransactions(transactions) {
  const rows = new Map();

  for (const transaction of transactions) {
    const description = extractAggregateDescription(transaction.description);
    const existing = rows.get(description) || {
      description,
      firstDate: transaction.dateValue || startOfDay(new Date(0)),
      lastDate: transaction.dateValue || startOfDay(new Date(0)),
      income: 0,
      expense: 0,
      count: 0,
      transactions: []
    };

    if (transaction.dateValue && transaction.dateValue < existing.firstDate) {
      existing.firstDate = transaction.dateValue;
    }
    if (transaction.dateValue && transaction.dateValue > existing.lastDate) {
      existing.lastDate = transaction.dateValue;
    }
    if (transaction.amount > 0) {
      existing.income += transaction.amount;
    } else {
      existing.expense += Math.abs(transaction.amount);
    }
    existing.count += 1;
    existing.transactions.push(transaction);
    rows.set(description, existing);
  }

  return Array.from(rows.values()).map(row => ({
    ...row,
    transactions: row.transactions.sort((a, b) => {
      const dateA = a.dateValue ? a.dateValue.getTime() : 0;
      const dateB = b.dateValue ? b.dateValue.getTime() : 0;
      return dateA - dateB;
    })
  })).sort((a, b) => {
    const amountA = Math.max(a.income, a.expense);
    const amountB = Math.max(b.income, b.expense);
    return amountB - amountA;
  });
}

function extractAggregateDescription(description = "") {
  const text = description.replace(/\s+/g, " ").trim();
  const parts = text.split("-").map(part => part.trim()).filter(Boolean);
  const prefix = parts[0] ? parts[0].toUpperCase() : "";

  if (prefix.startsWith("UPI") && parts[1]) {
    return normalizeAggregateDescription(toTitleCase(parts[1]));
  }
  if ((prefix.startsWith("IMPS") || prefix.startsWith("NEFT") || prefix.startsWith("RTGS")) && parts.length > 2) {
    return normalizeAggregateDescription(toTitleCase(parts.slice(1).find(part => /[a-z]/i.test(part) && !/^[A-Z]{4}\d+|^\d+$|NETBANK|MUM/i.test(part)) || parts[2]));
  }
  if (/cash deposit/i.test(text)) {
    const cashName = text.replace(/^.*cash deposit\s+by\s*-?/i, "").split("-")[0] || text;
    return normalizeAggregateDescription(toTitleCase(cashName));
  }

  return normalizeAggregateDescription(toTitleCase(text
    .replace(/\b\d{8,}\b/g, "")
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+/gi, "")
    .replace(/\s*-\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "Other Details"));
}

function normalizeAggregateDescription(description) {
  const normalized = description
    .replace(/\s+/g, " ")
    .replace(/\b(Mr|Mrs|Ms|Dr)\.?\s+/gi, "")
    .trim();
  const comparable = normalized.toLowerCase().replace(/[^a-z]/g, " ").replace(/\s+/g, " ").trim();

  if (["nagul", "s nagul siddarth", "nagul siddarth s", "nagul siddarth"].includes(comparable) || comparable.startsWith("nagul ")) {
    return "Nagul Siddarth";
  }
  if (["sivaraj", "s sivaraj", "sivaraj subburaya", "subburaya sivaraj"].includes(comparable) || comparable.startsWith("sivaraj ")) {
    return "Sivaraj Subburaya";
  }

  return normalized;
}

function getVisibleAggregateDetails(rows, state) {
  const filtered = rows.filter(row => matchesAggregateFilters(row, state.filters));
  const direction = state.sortDir === "asc" ? 1 : -1;

  return filtered.sort((a, b) => {
    const valueA = getAggregateSortValue(a, state.sortKey);
    const valueB = getAggregateSortValue(b, state.sortKey);

    if (typeof valueA === "number" && typeof valueB === "number") {
      return (valueA - valueB) * direction;
    }

    return String(valueA).localeCompare(String(valueB)) * direction;
  });
}

function matchesAggregateFilters(row, filters) {
  return aggregateFieldValue(row, "description").includes((filters.description || "").toLowerCase())
    && aggregateFieldValue(row, "income").includes((filters.income || "").toLowerCase())
    && aggregateFieldValue(row, "expense").includes((filters.expense || "").toLowerCase())
    && aggregateFieldValue(row, "count").includes((filters.count || "").toLowerCase());
}

function aggregateFieldValue(row, key) {
  if (key === "description") return row.description.toLowerCase();
  if (key === "date") return formatDateLabel(row.firstDate).toLowerCase();
  if (key === "lastDate") return formatDateLabel(row.lastDate).toLowerCase();
  if (key === "income") return row.income ? String(row.income).toLowerCase() : "";
  if (key === "expense") return row.expense ? String(row.expense).toLowerCase() : "";
  if (key === "count") return String(row.count).toLowerCase();
  return "";
}

function getAggregateSortValue(row, key) {
  if (key === "description") return row.description;
  if (key === "date") return row.firstDate.getTime();
  if (key === "lastDate") return row.lastDate.getTime();
  if (key === "income") return row.income;
  if (key === "expense") return row.expense;
  if (key === "count") return row.count;
  return "";
}

function matchesDetailFilters(transaction, filters) {
  return detailFieldValue(transaction, "date").includes(filters.date.toLowerCase())
    && detailFieldValue(transaction, "category").includes(filters.category.toLowerCase())
    && detailFieldValue(transaction, "description").includes(filters.description.toLowerCase())
    && detailFieldValue(transaction, "income").includes(filters.income.toLowerCase())
    && detailFieldValue(transaction, "expense").includes(filters.expense.toLowerCase());
}

function detailFieldValue(transaction, key) {
  if (key === "date") return formatTransactionDate(transaction).toLowerCase();
  if (key === "category") return transaction.category.toLowerCase();
  if (key === "description") return transaction.description.toLowerCase();
  if (key === "income") return transaction.amount > 0 ? String(transaction.amount).toLowerCase() : "";
  if (key === "expense") return transaction.amount < 0 ? String(Math.abs(transaction.amount)).toLowerCase() : "";
  return "";
}

function getDetailSortValue(transaction, key) {
  if (key === "date") return transaction.dateValue ? transaction.dateValue.getTime() : 0;
  if (key === "income") return transaction.amount > 0 ? transaction.amount : 0;
  if (key === "expense") return transaction.amount < 0 ? Math.abs(transaction.amount) : 0;
  if (key === "category") return transaction.category;
  if (key === "description") return transaction.description;
  return "";
}

function drawChart(groups) {
  const periodHeight = currentBreakdown === "category" ? 470 : Math.max(470, groups.length * 42 + 78);
  canvas.style.height = `${periodHeight}px`;
  canvas.style.cursor = ["category", ...expandableBreakdowns].includes(currentBreakdown) && groups.length ? "pointer" : "default";
  periodHitboxes = [];

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const width = rect.width;
  const height = rect.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  if (!groups.length) {
    ctx.fillStyle = "#172033";
    ctx.font = "700 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No statement data yet", width / 2, height / 2 - 8);
    ctx.fillStyle = "#667085";
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillText("Upload a bank statement to generate income and expenditure analysis.", width / 2, height / 2 + 18);
    elements.chartLegend.innerHTML = "";
    return;
  }

  if (currentBreakdown !== "category") {
    drawPeriodChart(groups, width, height);
    return;
  }

  const topGroups = groups.slice(0, 10);
  const maxAmount = Math.max(...topGroups.map(group => group.amount));
  const chartLeft = width < 680 ? 126 : 190;
  const chartRight = width < 680 ? 18 : 34;
  const top = 34;
  const rowHeight = Math.min(42, (height - 64) / topGroups.length);
  const barHeight = 18;
  const amountSpace = width < 680 ? 76 : 118;
  const barMaxWidth = Math.max(70, width - chartLeft - chartRight - amountSpace);

  ctx.strokeStyle = "#eef2f7";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const x = chartLeft + (barMaxWidth / 4) * i;
    ctx.beginPath();
    ctx.moveTo(x, top - 8);
    ctx.lineTo(x, top + topGroups.length * rowHeight - 8);
    ctx.stroke();
  }

  ctx.font = "12px system-ui, sans-serif";
  ctx.fillStyle = "#667085";
  ctx.textAlign = "left";
  ctx.fillText("Top categories by total amount", 22, 24);

  topGroups.forEach((group, index) => {
    const y = top + index * rowHeight;
    const barWidth = maxAmount ? (group.amount / maxAmount) * barMaxWidth : 0;
    const color = group.type === "Income" ? "#187a63" : "#b6433f";
    const softColor = group.type === "Income" ? "#e8f6f0" : "#fbeceb";

    ctx.fillStyle = "#172033";
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(truncate(group.category, width < 680 ? 13 : 21), chartLeft - 12, y + 14);
    ctx.fillStyle = softColor;
    roundedRect(ctx, chartLeft, y, barMaxWidth, barHeight, 9);
    ctx.fill();
    ctx.fillStyle = color;
    roundedRect(ctx, chartLeft, y, Math.max(barWidth, 3), barHeight, 9);
    ctx.fill();
    ctx.fillStyle = "#445066";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(formatMoney(group.amount), chartLeft + barMaxWidth + 12, y + 14);

    periodHitboxes.push({
      key: group.key,
      x: 0,
      y: y - 7,
      width,
      height: rowHeight
    });
  });

  elements.chartLegend.innerHTML = `
    <span class="legend-item"><span class="legend-dot" style="background:#187a63"></span>Income</span>
    <span class="legend-item"><span class="legend-dot" style="background:#b6433f"></span>Expenditure</span>
    <span class="legend-item">Click a category to open its transactions</span>
  `;
}

function drawPeriodChart(periods, width, height) {
  const maxAmount = Math.max(...periods.map(period => Math.max(period.income, period.expense)));
  const chartLeft = width < 680 ? 104 : 138;
  const chartRight = width < 680 ? 18 : 34;
  const top = 38;
  const visiblePeriods = periods;
  const rowHeight = 42;
  const barHeight = 8;
  const amountSpace = width < 680 ? 70 : 112;
  const barMaxWidth = Math.max(70, width - chartLeft - chartRight - amountSpace);

  ctx.strokeStyle = "#eef2f7";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const x = chartLeft + (barMaxWidth / 4) * i;
    ctx.beginPath();
    ctx.moveTo(x, top - 8);
    ctx.lineTo(x, top + visiblePeriods.length * rowHeight - 6);
    ctx.stroke();
  }

  ctx.font = "12px system-ui, sans-serif";
  ctx.fillStyle = "#667085";
  ctx.textAlign = "left";
  ctx.fillText("Income and expenditure by period", 22, 24);

  visiblePeriods.forEach((period, index) => {
    const y = top + index * rowHeight;
    const incomeWidth = maxAmount ? (period.income / maxAmount) * barMaxWidth : 0;
    const expenseWidth = maxAmount ? (period.expense / maxAmount) * barMaxWidth : 0;

    ctx.fillStyle = "#172033";
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(truncate(period.period, width < 680 ? 11 : 16), chartLeft - 12, y + 16);

    ctx.fillStyle = "#e8f6f0";
    roundedRect(ctx, chartLeft, y + 3, barMaxWidth, barHeight, 4);
    ctx.fill();
    ctx.fillStyle = "#168166";
    roundedRect(ctx, chartLeft, y + 3, Math.max(incomeWidth, period.income ? 3 : 0), barHeight, 4);
    ctx.fill();

    ctx.fillStyle = "#fbeceb";
    roundedRect(ctx, chartLeft, y + 16, barMaxWidth, barHeight, 4);
    ctx.fill();
    ctx.fillStyle = "#bf4b45";
    roundedRect(ctx, chartLeft, y + 16, Math.max(expenseWidth, period.expense ? 3 : 0), barHeight, 4);
    ctx.fill();

    ctx.fillStyle = "#445066";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(formatMoney(period.net), chartLeft + barMaxWidth + 12, y + 16);

    if (expandableBreakdowns.includes(currentBreakdown)) {
      periodHitboxes.push({
        key: period.key,
        x: 0,
        y: y - 7,
        width,
        height: rowHeight
      });
    }
  });

  elements.chartLegend.innerHTML = `
    <span class="legend-item"><span class="legend-dot" style="background:#168166"></span>Income</span>
    <span class="legend-item"><span class="legend-dot" style="background:#bf4b45"></span>Expenditure</span>
    <span class="legend-item">${expandableBreakdowns.includes(currentBreakdown) ? "Click a period to open its transactions" : "Scroll the chart to review every period"}</span>
  `;
}

function roundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function setView(view) {
  const showGraph = view === "graph";
  graphView.classList.toggle("hidden", !showGraph);
  tableView.classList.toggle("hidden", showGraph);
  graphButton.classList.toggle("active", showGraph);
  tableButton.classList.toggle("active", !showGraph);
  if (showGraph) drawChart(latestGroups);
}

function setBreakdown(breakdown) {
  currentBreakdown = breakdown;
  expandedPeriodKeys.clear();
  breakdownButtons.forEach(button => {
    button.classList.toggle("active", button.dataset.breakdown === breakdown);
  });
  renderCurrentAnalysis();
}

function togglePeriod(key) {
  if (expandedPeriodKeys.has(key)) {
    expandedPeriodKeys.delete(key);
  } else {
    expandedPeriodKeys.add(key);
  }

  renderTable(latestGroups);
}

function toggleAggregate(key) {
  if (expandedAggregateKeys.has(key)) {
    expandedAggregateKeys.delete(key);
  } else {
    expandedAggregateKeys.add(key);
  }

  renderTable(latestGroups);
}

function setStatus(message) {
  parseStatus.textContent = message;
}

function formatMoney(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: activeCurrency,
    maximumFractionDigits: 2
  }).format(value || 0);
}

function toTitleCase(value) {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, char => char.toUpperCase())
    .trim();
}

function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function formatTransactionDate(transaction) {
  if (transaction.dateValue) {
    return formatDateLabel(transaction.dateValue);
  }

  return transaction.date || "-";
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

drawChart([]);
