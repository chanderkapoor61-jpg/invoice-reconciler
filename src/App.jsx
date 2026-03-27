import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

// ─── XLSX Parser ──────────────────────────────────────────
// Uses raw:true to read actual stored values (e.g., 12 not "Rs. 12.00")
// Custom display formats like "Rs." are just visual — the real value is the number.
function parseXLSX(buffer) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });

  let sheetName = workbook.SheetNames[0];
  let sheet = workbook.Sheets[sheetName];
  for (const name of workbook.SheetNames) {
    const s = workbook.Sheets[name];
    if (s && s["!ref"]) { sheetName = name; sheet = s; break; }
  }

  const ref = sheet["!ref"];
  if (!ref) return [];

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });

  return rows.map((row) => {
    const obj = {};
    Object.keys(row).forEach((k) => {
      obj[k] = String(row[k] ?? "");
    });
    return obj;
  });
}

// ─── CSV Parser ───────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const vals = []; let current = ""; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') inQuotes = !inQuotes;
      else if (line[i] === "," && !inQuotes) { vals.push(current.trim()); current = ""; }
      else current += line[i];
    }
    vals.push(current.trim());
    const obj = {};
    headers.forEach((h, i) => (obj[h] = vals[i] || ""));
    return obj;
  });
}

// ─── Saved Mappings (localStorage) ────────────────────────
const STORAGE_KEY = "invoice_reconciler_mappings";
function saveMappings(nsMap, icrmMap, icrm2Map, nsFilterCol, nsFilterVal) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ nsMap, icrmMap, icrm2Map, nsFilterCol, nsFilterVal, savedAt: Date.now() })); } catch {}
}
function loadMappings() {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function clearMappings() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

// ─── Field Mapper with Filter ─────────────────────────────
function FieldMapper({ headers, label, mapping, onMap, onConfirm, color, showFilter, filterCol, filterVal, filterOptions, onFilterCol, onFilterVal }) {
  const fields = [
    { key: "invoiceNumber", label: "Invoice Number", required: true },
    { key: "amount", label: "Amount", required: true },
    { key: "date", label: "Date", required: false },
    { key: "customer", label: "Customer Name", required: false },
    { key: "companyId", label: "Company ID", required: false },
    { key: "status", label: "Status", required: false },
  ];
  const allRequiredMapped = fields.filter((f) => f.required).every((f) => mapping[f.key]);
  return (
    <div style={{ background: "var(--card)", borderRadius: 14, padding: 28, border: `1.5px solid ${color}22`, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
        <span style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, letterSpacing: ".03em", color }}>{label}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px" }}>
        {fields.map((f) => (
          <div key={f.key}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>
              {f.label}{f.required && <span style={{ color: "#ef4444" }}> *</span>}
            </label>
            <select value={mapping[f.key] || ""} onChange={(e) => onMap(f.key, e.target.value)}
              style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font-body)", outline: "none" }}>
              <option value="">— select column —</option>
              {headers.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        ))}
      </div>

      {showFilter && (
        <div style={{ marginTop: 16, padding: 16, background: "var(--bg)", borderRadius: 10, border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>
            Row Filter — Only include rows where:
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Column</label>
              <select value={filterCol || ""} onChange={(e) => onFilterCol(e.target.value)}
                style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font-body)", outline: "none" }}>
                <option value="">— no filter —</option>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Equals</label>
              {filterCol && filterOptions.length > 0 ? (
                <select value={filterVal || ""} onChange={(e) => onFilterVal(e.target.value)}
                  style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font-body)", outline: "none" }}>
                  <option value="">— select value —</option>
                  {filterOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              ) : (
                <input type="text" value={filterVal || ""} onChange={(e) => onFilterVal(e.target.value)} placeholder="e.g. Customer Invoice"
                  style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font-body)", outline: "none" }} />
              )}
            </div>
          </div>
          {filterCol && filterVal && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#10b981" }}>
              Will only include rows where "{filterCol}" = "{filterVal}"
            </div>
          )}
        </div>
      )}

      <button disabled={!allRequiredMapped} onClick={onConfirm}
        style={{ marginTop: 18, padding: "10px 28px", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 13, fontFamily: "var(--font-display)", letterSpacing: ".04em", cursor: allRequiredMapped ? "pointer" : "not-allowed", background: allRequiredMapped ? color : "var(--border)", color: allRequiredMapped ? "#fff" : "var(--text-muted)", transition: "all .2s" }}>
        Confirm Mapping
      </button>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────
function Stat({ label, value, accent, icon, sub }) {
  return (
    <div style={{ background: "var(--card)", borderRadius: 14, padding: "22px 24px", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -14, right: -10, fontSize: 64, opacity: 0.06, fontWeight: 900 }}>{icon}</div>
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontSize: 32, fontWeight: 800, fontFamily: "var(--font-display)", color: accent, lineHeight: 1 }}>{value}</span>
      {sub && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{sub}</span>}
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────
function Badge({ type }) {
  const map = {
    matched: { bg: "#10b98120", color: "#10b981", text: "Matched" },
    amount_mismatch: { bg: "#f59e0b20", color: "#f59e0b", text: "Amount Mismatch" },
    netsuite_only: { bg: "#6366f120", color: "#6366f1", text: "NetSuite Only" },
    icrm_only: { bg: "#ec489920", color: "#ec4899", text: "ICRM Only" },
    date_mismatch: { bg: "#8b5cf620", color: "#8b5cf6", text: "Date Mismatch" },
    customer_mismatch: { bg: "#0ea5e920", color: "#0ea5e9", text: "Customer Mismatch" },
    multi_issue: { bg: "#ef444420", color: "#ef4444", text: "Multiple Issues" },
  };
  const s = map[type] || map.matched;
  return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, letterSpacing: ".02em", whiteSpace: "nowrap" }}>{s.text}</span>;
}

// ─── Sample Data ──────────────────────────────────────────
function generateSampleData() {
  const customers = ["Acme Corp", "Globex Inc", "Initech LLC", "Umbrella Co", "Stark Industries", "Wayne Enterprises", "Wonka Ltd", "Tyrell Corp"];
  const types = ["Customer Invoice", "Credit Memo", "Customer Invoice", "Customer Invoice", "Journal Entry", "Customer Invoice"];
  const nsRows = []; const icrmRows = [];
  for (let i = 1; i <= 60; i++) {
    const inv = `INV-${String(1000 + i).padStart(5, "0")}`;
    const amt = (Math.random() * 50000 + 500).toFixed(2);
    const cust = customers[Math.floor(Math.random() * customers.length)];
    const type = types[Math.floor(Math.random() * types.length)];
    const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, "0");
    const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, "0");
    const dt = `2025-${month}-${day}`;
    const r = Math.random();
    if (r < 0.65) {
      nsRows.push({ "Invoice Number": inv, Amount: amt, Date: dt, Customer: cust, Status: "Posted", Type: type });
      if (type === "Customer Invoice") icrmRows.push({ "Invoice No": inv, "Invoice Amount": amt, "Invoice Date": dt, "Client Name": cust, "Invoice Status": "Approved" });
    } else if (r < 0.75) {
      nsRows.push({ "Invoice Number": inv, Amount: amt, Date: dt, Customer: cust, Status: "Posted", Type: "Customer Invoice" });
      icrmRows.push({ "Invoice No": inv, "Invoice Amount": (parseFloat(amt) + (Math.random() * 200 - 100)).toFixed(2), "Invoice Date": dt, "Client Name": cust, "Invoice Status": "Approved" });
    } else if (r < 0.85) {
      nsRows.push({ "Invoice Number": inv, Amount: amt, Date: dt, Customer: cust, Status: "Posted", Type: "Customer Invoice" });
    } else {
      icrmRows.push({ "Invoice No": inv, "Invoice Amount": amt, "Invoice Date": dt, "Client Name": cust, "Invoice Status": "Approved" });
    }
  }
  return { nsRows, icrmRows };
}

// ─── Custom Tooltip ───────────────────────────────────────
function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: "#1a1d2a", border: "1px solid #2a2d40", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
      <div style={{ color: d.color || d.fill || "#e8e9ed", fontWeight: 700 }}>{d.name}</div>
      <div style={{ color: "#6b7194" }}>{d.value || d.count} invoices{d.pct ? ` (${d.pct}%)` : ""}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════
export default function App() {
  const [step, setStep] = useState("upload");
  const [nsRaw, setNsRaw] = useState(null);
  const [icrmRaw, setIcrmRaw] = useState(null);
  const [nsHeaders, setNsHeaders] = useState([]);
  const [icrmHeaders, setIcrmHeaders] = useState([]);
  const [nsData, setNsData] = useState([]);
  const [icrmData, setIcrmData] = useState([]);
  const [nsMap, setNsMap] = useState({});
  const [icrmMap, setIcrmMap] = useState({});
  const [icrm2Raw, setIcrm2Raw] = useState(null);
  const [icrm2Headers, setIcrm2Headers] = useState([]);
  const [icrm2Data, setIcrm2Data] = useState([]);
  const [icrm2Map, setIcrm2Map] = useState({});
  const [icrm2Confirmed, setIcrm2Confirmed] = useState(false);
  const [nsConfirmed, setNsConfirmed] = useState(false);
  const [icrmConfirmed, setIcrmConfirmed] = useState(false);
  const [results, setResults] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(0);
  const [expandedRow, setExpandedRow] = useState(null);
  const [copyStatus, setCopyStatus] = useState("idle");
  const [nsFilterCol, setNsFilterCol] = useState("");
  const [nsFilterVal, setNsFilterVal] = useState("");
  const [hasSavedMapping, setHasSavedMapping] = useState(false);
  const [showCharts, setShowCharts] = useState(true);
  const nsRef = useRef();
  const icrmRef = useRef();
  const icrm2Ref = useRef();
  const PAGE_SIZE = 20;
  const COLORS = { ns: "#6366f1", icrm: "#ec4899", match: "#10b981", warn: "#f59e0b", err: "#ef4444" };

  useEffect(() => { if (loadMappings()) setHasSavedMapping(true); }, []);

  const nsFilterOptions = useMemo(() => {
    if (!nsFilterCol || !nsData.length) return [];
    const vals = new Set();
    nsData.forEach((row) => { if (row[nsFilterCol]) vals.add(row[nsFilterCol]); });
    return [...vals].sort();
  }, [nsData, nsFilterCol]);

  const autoMapHeaders = (h, mapSetter, source) => {
    const saved = loadMappings();
    if (saved) {
      const savedMap = source === "ns" ? saved.nsMap : source === "icrm" ? saved.icrmMap : saved.icrm2Map;
      const valid = {};
      Object.entries(savedMap || {}).forEach(([k, v]) => { if (h.includes(v)) valid[k] = v; });
      if (Object.keys(valid).length > 0) {
        mapSetter(valid);
        if (source === "ns" && saved.nsFilterCol && h.includes(saved.nsFilterCol)) {
          setNsFilterCol(saved.nsFilterCol);
          setNsFilterVal(saved.nsFilterVal || "");
        }
        return;
      }
    }
    const auto = {};
    const invKeys = ["invoice number", "invoice no", "invoice_number", "invoice_no", "inv no", "inv number", "invoicenumber"];
    const amtKeys = ["amount", "invoice amount", "invoice_amount", "invoiceamount", "total", "total amount"];
    const dtKeys = ["date", "invoice date", "invoice_date", "invoicedate"];
    const custKeys = ["customer", "client", "customer name", "client name", "customer_name", "client_name"];
    const companyIdKeys = ["company id_erp", "company id", "company_id", "companyid", "client id", "client_id", "clientid", "entity id", "entity_id"];
    const statusKeys = ["status", "invoice status", "invoice_status"];
    h.forEach((col) => {
      const lc = col.toLowerCase().trim();
      if (invKeys.includes(lc)) auto.invoiceNumber = col;
      if (amtKeys.includes(lc)) auto.amount = col;
      if (dtKeys.includes(lc)) auto.date = col;
      if (custKeys.includes(lc)) auto.customer = col;
      if (companyIdKeys.includes(lc)) auto.companyId = col;
      if (statusKeys.includes(lc)) auto.status = col;
    });
    mapSetter(auto);
  };

  const [loading, setLoading] = useState(null); // null | "ns" | "icrm"

  const handleSmartFile = (setter, headerSetter, dataSetter, mapSetter, source) => (e) => {
    const file = e.target.files[0]; if (!file) return;
    const isCSV = file.name.toLowerCase().endsWith(".csv");
    setLoading(source);
    setter(file.name + " (loading...)");

    const reader = new FileReader();
    reader.onload = (ev) => {
      setTimeout(() => {
        try {
          let rows;
          if (isCSV) {
            rows = parseCSV(ev.target.result);
          } else {
            rows = parseXLSX(new Uint8Array(ev.target.result));
          }

          // For NetSuite files: auto cleanup and derived columns
          if (source === "ns") {
            rows = rows.map((row) => {
              const cleaned = {};
              Object.keys(row).forEach((k) => {
                cleaned[k] = row[k].replace(/Rs\.\s?/gi, "");
              });

              // Auto-create "Company ID_ERP" from any "Entity (Line)" or "Entity (Lin" column
              // Extracts the part before the first space: "4536126 SUSHANT TYAGI" → "4536126"
              const entityCol = Object.keys(cleaned).find((k) =>
                k.toLowerCase().startsWith("entity (lin")
              );
              if (entityCol && cleaned[entityCol]) {
                const val = cleaned[entityCol].trim();
                const firstSpace = val.indexOf(" ");
                cleaned["Company ID_ERP"] = firstSpace > 0 ? val.substring(0, firstSpace) : val;
              } else {
                cleaned["Company ID_ERP"] = "";
              }

              return cleaned;
            });
          }

          setter(file.name);
          dataSetter(rows);
          if (rows.length) {
            const h = Object.keys(rows[0]);
            headerSetter(h);
            autoMapHeaders(h, mapSetter, source);
          } else {
            setter(file.name + " (0 rows found)");
          }
        } catch (err) {
          console.error("Parse error:", err);
          setter(file.name + " (parse error — try CSV)");
          dataSetter([]);
        }
        setLoading(null);
      }, 50);
    };
    reader.onerror = () => { setter(file.name + " (read error)"); setLoading(null); };

    if (isCSV) reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  };

  const loadSample = () => {
    const { nsRows, icrmRows } = generateSampleData();
    setNsRaw("sample_netsuite.xlsx"); setIcrmRaw("sample_icrm.csv");
    setNsData(nsRows); setIcrmData(icrmRows);
    setNsHeaders(Object.keys(nsRows[0])); setIcrmHeaders(Object.keys(icrmRows[0]));
    setNsMap({ invoiceNumber: "Invoice Number", amount: "Amount", date: "Date", customer: "Customer", status: "Status" });
    setIcrmMap({ invoiceNumber: "Invoice No", amount: "Invoice Amount", date: "Invoice Date", customer: "Client Name", status: "Invoice Status" });
    setNsFilterCol("Type"); setNsFilterVal("Customer Invoice");
    setStep("map");
  };

  const proceedToMap = () => { if (nsRaw && icrmRaw) setStep("map"); };

  // ─── Reconciliation Engine ──────────────────────────────
  const runReconciliation = useCallback(() => {
    saveMappings(nsMap, icrmMap, icrm2Map, nsFilterCol, nsFilterVal);
    setHasSavedMapping(true);
    const normalize = (v) => (v || "").toString().trim().toUpperCase();

    // Robust number parser: handles "Rs.12.00", "Rs. 14.59", "₹1,748.08", "(14.59)", "-Rs.14.59", "$1,200.00", etc.
    const parseNum = (v) => {
      if (v == null) return 0;
      let s = v.toString().trim();
      if (!s) return 0;
      // Detect negative: leading minus, or wrapped in parentheses like (14.59)
      let negative = false;
      if (s.startsWith("(") && s.endsWith(")")) { negative = true; s = s.slice(1, -1); }
      if (s.includes("-")) { negative = true; }
      // Strip known currency prefixes FIRST (before general cleanup)
      // This prevents "Rs." dot from being treated as a decimal point
      s = s.replace(/^[^0-9()\-]*/, ""); // strip any leading non-numeric chars (Rs., $, ₹, EUR, etc.)
      s = s.replace(/[^0-9.,]/g, "");    // then strip remaining non-numeric except dots and commas
      // Handle Indian/international comma format: 1,00,000.00 or 1,000,000.00
      const lastDot = s.lastIndexOf(".");
      const lastComma = s.lastIndexOf(",");
      if (lastDot > lastComma) {
        s = s.replace(/,/g, "");
      } else if (lastComma > lastDot) {
        const afterComma = s.length - lastComma - 1;
        if ((s.match(/,/g) || []).length === 1 && afterComma <= 2) {
          s = s.replace(",", ".");
        } else {
          s = s.replace(/,/g, "");
        }
      }
      const num = parseFloat(s) || 0;
      return negative ? -num : num;
    };

    const normalizeDate = (dateStr) => {
      if (!dateStr) return "";
      const s = dateStr.toString().trim(); if (!s) return "";
      const iso = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
      if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
      const dmy4 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (dmy4) return `${dmy4[3]}-${dmy4[2].padStart(2, "0")}-${dmy4[1].padStart(2, "0")}`;
      const short = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
      if (short) {
        const yr = parseInt(short[3]) > 50 ? `19${short[3]}` : `20${short[3]}`;
        let m, d;
        if (parseInt(short[1]) > 12) { d = short[1]; m = short[2]; }
        else if (parseInt(short[2]) > 12) { m = short[1]; d = short[2]; }
        else { m = short[1]; d = short[2]; }
        return `${yr}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
      return s;
    };

    let filteredNsData = nsData;
    if (nsFilterCol && nsFilterVal) {
      filteredNsData = nsData.filter((row) => normalize(row[nsFilterCol] || "") === normalize(nsFilterVal));
    }

    // Aggregate NetSuite line items: sum amounts per invoice, keep first row for date/customer
    const nsIndex = {};
    filteredNsData.forEach((row) => {
      const key = normalize(row[nsMap.invoiceNumber]);
      if (!key) return;
      if (!nsIndex[key]) {
        nsIndex[key] = { ...row, _totalAmount: Math.abs(parseNum(row[nsMap.amount])), _lineCount: 1 };
      } else {
        nsIndex[key]._totalAmount += Math.abs(parseNum(row[nsMap.amount]));
        nsIndex[key]._lineCount += 1;
      }
    });

    // Aggregate ICRM line items from BOTH files into one combined index
    const icrmIndex = {};
    // Process ICRM File 1
    icrmData.forEach((row) => {
      const key = normalize(row[icrmMap.invoiceNumber]);
      if (!key) return;
      if (!icrmIndex[key]) {
        icrmIndex[key] = { _date: row[icrmMap.date] || "", _customer: row[icrmMap.customer] || "", _companyId: row[icrmMap.companyId] || "", _totalAmount: Math.abs(parseNum(row[icrmMap.amount])), _lineCount: 1 };
      } else {
        icrmIndex[key]._totalAmount += Math.abs(parseNum(row[icrmMap.amount]));
        icrmIndex[key]._lineCount += 1;
      }
    });
    // Process ICRM File 2 (if uploaded) — uses its own mapping
    if (icrm2Raw && icrm2Data.length > 0 && icrm2Map.invoiceNumber && icrm2Map.amount) {
      icrm2Data.forEach((row) => {
        const key = normalize(row[icrm2Map.invoiceNumber]);
        if (!key) return;
        if (!icrmIndex[key]) {
          icrmIndex[key] = { _date: row[icrm2Map.date] || "", _customer: row[icrm2Map.customer] || "", _companyId: row[icrm2Map.companyId] || "", _totalAmount: Math.abs(parseNum(row[icrm2Map.amount])), _lineCount: 1 };
        } else {
          icrmIndex[key]._totalAmount += Math.abs(parseNum(row[icrm2Map.amount]));
          icrmIndex[key]._lineCount += 1;
        }
      });
    }

    const toNum = (row) => row._totalAmount || 0;

    const allKeys = new Set([...Object.keys(nsIndex), ...Object.keys(icrmIndex)]);
    const rows = [];

    allKeys.forEach((key) => {
      const ns = nsIndex[key]; const icrm = icrmIndex[key];
      const rec = { invoiceNumber: key, issues: [] };
      if (ns && !icrm) {
        Object.assign(rec, { type: "netsuite_only", nsAmount: toNum(ns), icrmAmount: null, nsDate: ns[nsMap.date] || "", icrmDate: "", nsCustomer: ns[nsMap.customer] || "", icrmCustomer: "", nsCompanyId: ns[nsMap.companyId] || "", icrmCompanyId: "", nsLines: ns._lineCount, icrmLines: 0 });
        rec.diff = rec.nsAmount; rec.issues.push("Missing in ICRM");
      } else if (!ns && icrm) {
        Object.assign(rec, { type: "icrm_only", nsAmount: null, icrmAmount: toNum(icrm), nsDate: "", icrmDate: icrm._date || "", nsCustomer: "", icrmCustomer: icrm._customer || "", nsCompanyId: "", icrmCompanyId: icrm._companyId || "", nsLines: 0, icrmLines: icrm._lineCount });
        rec.diff = rec.icrmAmount; rec.issues.push("Missing in NetSuite");
      } else {
        rec.nsAmount = toNum(ns); rec.icrmAmount = toNum(icrm);
        rec.nsLines = ns._lineCount; rec.icrmLines = icrm._lineCount;
        rec.diff = +(rec.nsAmount - rec.icrmAmount).toFixed(2);
        rec.nsDate = ns[nsMap.date] || ""; rec.icrmDate = icrm._date || "";
        rec.nsCustomer = ns[nsMap.customer] || ""; rec.icrmCustomer = icrm._customer || "";
        rec.nsCompanyId = ns[nsMap.companyId] || ""; rec.icrmCompanyId = icrm._companyId || "";
        if (Math.abs(rec.diff) > 0.01) rec.issues.push("Amount mismatch");
        if (rec.nsDate && rec.icrmDate && normalizeDate(rec.nsDate) !== normalizeDate(rec.icrmDate)) rec.issues.push("Date mismatch");
        if (rec.nsCustomer && rec.icrmCustomer && normalize(rec.nsCustomer) !== normalize(rec.icrmCustomer)) rec.issues.push("Customer mismatch");
        if (rec.nsCompanyId && rec.icrmCompanyId && normalize(rec.nsCompanyId) !== normalize(rec.icrmCompanyId)) rec.issues.push("Company ID mismatch");
        if (rec.issues.length === 0) rec.type = "matched";
        else if (rec.issues.length === 1) { rec.type = rec.issues[0] === "Amount mismatch" ? "amount_mismatch" : rec.issues[0] === "Date mismatch" ? "date_mismatch" : "customer_mismatch"; }
        else rec.type = "multi_issue";
      }
      rows.push(rec);
    });
    setResults(rows); setStep("results"); setPage(0); setFilter("all"); setSearch("");
  }, [nsData, icrmData, icrm2Data, nsMap, icrmMap, icrm2Map, icrm2Raw, nsFilterCol, nsFilterVal]);

  // ─── Computed ───────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!results) return [];
    let r = results;
    if (filter !== "all") r = r.filter((x) => filter === "discrepancies" ? x.type !== "matched" : x.type === filter);
    if (search) { const s = search.toUpperCase(); r = r.filter((x) => x.invoiceNumber.includes(s) || (x.nsCustomer || "").toUpperCase().includes(s) || (x.icrmCustomer || "").toUpperCase().includes(s)); }
    if (sortCol) { r = [...r].sort((a, b) => { let va = a[sortCol], vb = b[sortCol]; if (typeof va === "number" && typeof vb === "number") return sortDir === "asc" ? va - vb : vb - va; return sortDir === "asc" ? String(va || "").localeCompare(String(vb || "")) : String(vb || "").localeCompare(String(va || "")); }); }
    return r;
  }, [results, filter, search, sortCol, sortDir]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const stats = useMemo(() => {
    if (!results) return {};
    const matched = results.filter((r) => r.type === "matched").length;
    const nsOnly = results.filter((r) => r.type === "netsuite_only").length;
    const icrmOnly = results.filter((r) => r.type === "icrm_only").length;
    const amtMis = results.filter((r) => r.issues?.includes("Amount mismatch")).length;
    const dateMis = results.filter((r) => r.issues?.includes("Date mismatch")).length;
    const multiIssue = results.filter((r) => r.type === "multi_issue").length;
    return { total: results.length, matched, disc: results.length - matched, totalDiff: results.reduce((s, r) => s + Math.abs(r.diff || 0), 0), nsOnly, icrmOnly, amtMis, dateMis, multiIssue };
  }, [results]);

  const pieData = useMemo(() => {
    if (!stats.total) return [];
    return [
      { name: "Matched", value: stats.matched, color: "#10b981" },
      { name: "Amt Mismatch", value: stats.amtMis, color: "#f59e0b" },
      { name: "NS Only", value: stats.nsOnly, color: "#6366f1" },
      { name: "ICRM Only", value: stats.icrmOnly, color: "#ec4899" },
      { name: "Date Mismatch", value: stats.dateMis, color: "#8b5cf6" },
      { name: "Multi Issue", value: stats.multiIssue, color: "#ef4444" },
    ].filter((d) => d.value > 0).map((d) => ({ ...d, pct: ((d.value / stats.total) * 100).toFixed(1) }));
  }, [stats]);

  const barData = useMemo(() => {
    if (!stats.total) return [];
    return [
      { name: "Matched", count: stats.matched, fill: "#10b981" },
      { name: "Amt Mis.", count: stats.amtMis, fill: "#f59e0b" },
      { name: "NS Only", count: stats.nsOnly, fill: "#6366f1" },
      { name: "ICRM Only", count: stats.icrmOnly, fill: "#ec4899" },
      { name: "Date Mis.", count: stats.dateMis, fill: "#8b5cf6" },
      { name: "Multi", count: stats.multiIssue, fill: "#ef4444" },
    ].filter((d) => d.count > 0);
  }, [stats]);

  const buildCSVText = () => {
    if (!filtered.length) return "";
    const h = ["Invoice Number", "Status", "NetSuite Amount", "ICRM Amount", "Difference", "NS Date", "ICRM Date", "NS Customer", "ICRM Customer", "NS Company ID", "ICRM Company ID", "Issues"];
    return [h.join(","), ...filtered.map((r) => [r.invoiceNumber, r.type, r.nsAmount ?? "", r.icrmAmount ?? "", r.diff, r.nsDate, r.icrmDate, r.nsCustomer, r.icrmCustomer, r.nsCompanyId || "", r.icrmCompanyId || "", (r.issues || []).join("; ")].map((v) => `"${v}"`).join(","))].join("\n");
  };
  const exportCSV = () => { const csv = buildCSVText(); if (!csv) return; const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "reconciliation_report.csv"; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); };
  const copyCSV = async () => { const csv = buildCSVText(); if (!csv) return; try { await navigator.clipboard.writeText(csv); } catch { const ta = document.createElement("textarea"); ta.value = csv; ta.style.cssText = "position:fixed;left:-9999px"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); } setCopyStatus("copied"); setTimeout(() => setCopyStatus("idle"), 2500); };
  const handleSort = (col) => { if (sortCol === col) setSortDir(sortDir === "asc" ? "desc" : "asc"); else { setSortCol(col); setSortDir("asc"); } };
  const fmt = (n) => n == null ? "—" : n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700&display=swap');
    :root { --bg: #0c0e14; --card: #13151e; --card-hover: #1a1d2a; --border: #1f2233; --text: #e8e9ed; --text-muted: #6b7194; --font-display: 'DM Sans', sans-serif; --font-body: 'DM Sans', sans-serif; --font-mono: 'JetBrains Mono', monospace; }
    * { margin: 0; padding: 0; box-sizing: border-box; } body { background: var(--bg); color: var(--text); font-family: var(--font-body); }
    ::selection { background: #6366f140; } ::-webkit-scrollbar { width: 6px; height: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #2a2d40; border-radius: 3px; }
    input[type="file"] { display: none; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
    .fade-in { animation: fadeIn .5s ease both; }
    .stagger-1 { animation-delay: .05s; } .stagger-2 { animation-delay: .1s; } .stagger-3 { animation-delay: .15s; } .stagger-4 { animation-delay: .2s; } .stagger-5 { animation-delay: .25s; }
  `;

  // ═══════════════════════════════════════════════════════════
  // UPLOAD
  // ═══════════════════════════════════════════════════════════
  if (step === "upload") {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "40px 20px" }}><style>{css}</style>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          <div className="fade-in" style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <div>
                <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 900, letterSpacing: "-.02em", color: "var(--text)" }}>Interco Reconciliation</h1>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".08em", color: "#8b5cf6", textTransform: "uppercase" }}>Shiprocket · Finance & Accounts</div>
              </div>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: 15, maxWidth: 520, margin: "0 auto" }}>Reconcile NetSuite ERP data against ICRM records. Supports .csv files only.</p>
            {hasSavedMapping && (
              <div style={{ marginTop: 12, padding: "8px 16px", background: "#10b98115", borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: "#10b981" }}>
                ✓ Previous column mappings saved — they'll auto-apply on upload
                <button onClick={() => { clearMappings(); setHasSavedMapping(false); }} style={{ background: "none", border: "none", color: "#6b7194", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>Clear</button>
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 32 }}>
            {[{ ref: nsRef, raw: nsRaw, data: nsData, color: COLORS.ns, label: "NetSuite ERP", sub: "Revenue Data (.csv)", accept: ".csv", handler: handleSmartFile(setNsRaw, setNsHeaders, setNsData, setNsMap, "ns"), uploadLabel: "Click to upload CSV", loadingKey: "ns" },
              { ref: icrmRef, raw: icrmRaw, data: icrmData, color: COLORS.icrm, label: "ICRM File 1", sub: "ICRM Records (.csv)", accept: ".csv", handler: handleSmartFile(setIcrmRaw, setIcrmHeaders, setIcrmData, setIcrmMap, "icrm"), uploadLabel: "Click to upload CSV", loadingKey: "icrm" },
              { ref: icrm2Ref, raw: icrm2Raw, data: icrm2Data, color: "#8b5cf6", label: "ICRM File 2", sub: "Optional (.csv)", accept: ".csv", handler: handleSmartFile(setIcrm2Raw, setIcrm2Headers, setIcrm2Data, setIcrm2Map, "icrm2"), uploadLabel: "Click to upload (optional)", loadingKey: "icrm2" }
            ].map((src, i) => (
              <div key={i} className={`fade-in stagger-${i + 1}`} onClick={() => !src.raw && src.ref.current?.click()}
                style={{ background: "var(--card)", borderRadius: 16, padding: 28, border: `1.5px dashed ${src.raw ? src.color : "var(--border)"}`, cursor: src.raw ? "default" : "pointer", textAlign: "center", transition: "all .25s", position: "relative", overflow: "hidden" }}>
                {src.raw && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${src.color}, ${src.color}88)` }} />}
                <input type="file" ref={src.ref} accept={src.accept} onChange={src.handler} />
                <div style={{ fontSize: 32, marginBottom: 10, opacity: src.raw ? 1 : 0.3 }}>{src.raw ? "✓" : "📄"}</div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 15, color: src.color, marginBottom: 4 }}>{src.label}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>{src.sub}</div>
                {src.raw ? (<div><div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text)", marginBottom: 4, wordBreak: "break-all" }}>{src.raw}</div><div style={{ fontSize: 11, color: "var(--text-muted)" }}>{loading === src.loadingKey ? "⏳ Parsing..." : `${src.data.length} rows`}</div><button onClick={(e) => { e.stopPropagation(); src.ref.current?.click(); }} style={{ marginTop: 8, padding: "4px 12px", borderRadius: 6, border: `1px solid ${src.color}44`, background: "transparent", color: src.color, fontSize: 10, fontWeight: 600, cursor: "pointer" }}>Replace</button></div>
                ) : (<div style={{ fontSize: 12, color: "var(--text-muted)" }}>{src.uploadLabel}</div>)}
              </div>
            ))}
          </div>
          <div className="fade-in stagger-3" style={{ textAlign: "center" }}>
            <button disabled={!nsRaw || !icrmRaw} onClick={proceedToMap} style={{ padding: "14px 48px", borderRadius: 12, border: "none", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 15, cursor: nsRaw && icrmRaw ? "pointer" : "not-allowed", background: nsRaw && icrmRaw ? "linear-gradient(135deg, #6C3FBF, #8B5CF6)" : "var(--border)", color: nsRaw && icrmRaw ? "#fff" : "var(--text-muted)", transition: "all .3s" }}>Map Columns →</button>
            <div style={{ marginTop: 20 }}><button onClick={loadSample} style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Load Sample Data</button></div>
          </div>
          <div style={{ textAlign: "center", marginTop: 48, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: 11 }}>
              Shiprocket · Finance & Accounts · Internal Tool
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // MAPPING
  // ═══════════════════════════════════════════════════════════
  if (step === "map") {
    const canRun = nsConfirmed && icrmConfirmed && (!icrm2Raw || icrm2Confirmed);
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "40px 20px" }}><style>{css}</style>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          <button onClick={() => { setStep("upload"); setNsConfirmed(false); setIcrmConfirmed(false); setIcrm2Confirmed(false); }} style={{ marginBottom: 20, padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontSize: 12, cursor: "pointer" }}>← Back</button>
          <h2 className="fade-in" style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 900, marginBottom: 8 }}>Map Your Columns</h2>
          <p className="fade-in stagger-1" style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 28 }}>Map columns for each CSV file. ICRM files can have completely different structures — map each separately.</p>
          <div className="fade-in stagger-2">
            <FieldMapper headers={nsHeaders} label="NETSUITE" mapping={nsMap} color={COLORS.ns} onMap={(k, v) => setNsMap((p) => ({ ...p, [k]: v }))} onConfirm={() => setNsConfirmed(true)} showFilter={true} filterCol={nsFilterCol} filterVal={nsFilterVal} filterOptions={nsFilterOptions} onFilterCol={setNsFilterCol} onFilterVal={setNsFilterVal} />
          </div>
          <div className="fade-in stagger-3">
            <FieldMapper headers={icrmHeaders} label="ICRM FILE 1" mapping={icrmMap} color={COLORS.icrm} onMap={(k, v) => setIcrmMap((p) => ({ ...p, [k]: v }))} onConfirm={() => setIcrmConfirmed(true)} showFilter={false} filterCol="" filterVal="" filterOptions={[]} onFilterCol={() => {}} onFilterVal={() => {}} />
          </div>
          {icrm2Raw && (
            <div className="fade-in stagger-4">
              <FieldMapper headers={icrm2Headers} label="ICRM FILE 2" mapping={icrm2Map} color="#8b5cf6" onMap={(k, v) => setIcrm2Map((p) => ({ ...p, [k]: v }))} onConfirm={() => setIcrm2Confirmed(true)} showFilter={false} filterCol="" filterVal="" filterOptions={[]} onFilterCol={() => {}} onFilterVal={() => {}} />
            </div>
          )}
          <div className="fade-in stagger-5" style={{ textAlign: "center", marginTop: 20 }}>
            <button disabled={!canRun} onClick={runReconciliation} style={{ padding: "14px 48px", borderRadius: 12, border: "none", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 15, cursor: canRun ? "pointer" : "not-allowed", background: canRun ? "linear-gradient(135deg, #6C3FBF, #8B5CF6)" : "var(--border)", color: canRun ? "#fff" : "var(--text-muted)" }}>Run Reconciliation ⚡</button>
            {nsFilterCol && nsFilterVal && <div style={{ marginTop: 12, fontSize: 12, color: "#f59e0b" }}>Filtering: only "{nsFilterCol}" = "{nsFilterVal}"</div>}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════════════════════════
  const filterTabs = [
    { key: "all", label: "All", count: stats.total }, { key: "matched", label: "Matched", count: stats.matched },
    { key: "discrepancies", label: "Discrepancies", count: stats.disc }, { key: "netsuite_only", label: "NS Only", count: stats.nsOnly },
    { key: "icrm_only", label: "ICRM Only", count: stats.icrmOnly },
  ];
  const columns = [
    { key: "invoiceNumber", label: "Invoice #", width: "16%" }, { key: "nsAmount", label: "NetSuite Amt", width: "15%", align: "right" },
    { key: "icrmAmount", label: "ICRM Amt", width: "15%", align: "right" }, { key: "diff", label: "Difference", width: "13%", align: "right" },
    { key: "nsCustomer", label: "Customer", width: "18%" }, { key: "type", label: "Status", width: "15%" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "32px 20px" }}><style>{css}</style>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div className="fade-in" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 900 }}>Reconciliation Report</h1>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: 12 }}>{nsRaw} vs {icrmRaw}{icrm2Raw ? ` + ${icrm2Raw}` : ""} — {stats.total} invoices{nsFilterCol && nsFilterVal && <span style={{ color: "#f59e0b" }}> (filtered: {nsFilterVal})</span>}</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={exportCSV} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-display)" }}>Download CSV ↓</button>
            <button onClick={copyCSV} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid var(--border)", background: copyStatus === "copied" ? "#10b98120" : "var(--card)", color: copyStatus === "copied" ? "#10b981" : "var(--text)", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all .3s", minWidth: 130 }}>{copyStatus === "copied" ? "✓ Copied!" : "Copy CSV"}</button>
            <button onClick={() => { setStep("upload"); setResults(null); setNsConfirmed(false); setIcrmConfirmed(false); setIcrm2Confirmed(false); }} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontSize: 12, cursor: "pointer" }}>New Upload</button>
          </div>
        </div>

        <div className="fade-in stagger-1" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
          <Stat label="Total Invoices" value={stats.total} accent="var(--text)" icon="Σ" />
          <Stat label="Matched" value={stats.matched} accent={COLORS.match} icon="✓" sub={`${((stats.matched / stats.total) * 100).toFixed(1)}% match rate`} />
          <Stat label="Discrepancies" value={stats.disc} accent={COLORS.err} icon="!" sub={`${stats.amtMis} amt, ${stats.nsOnly} NS, ${stats.icrmOnly} ICRM`} />
          <Stat label="Total Variance" value={`₹${fmt(stats.totalDiff)}`} accent={COLORS.warn} icon="Δ" sub="Absolute difference sum" />
        </div>

        {/* Charts */}
        <div className="fade-in stagger-2" style={{ marginBottom: 24 }}>
          <button onClick={() => setShowCharts(!showCharts)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 12, cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ transform: showCharts ? "rotate(90deg)" : "rotate(0)", transition: "transform .2s", display: "inline-block" }}>▶</span> {showCharts ? "Hide Charts" : "Show Charts"}
          </button>
          {showCharts && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: "var(--card)", borderRadius: 14, padding: 20, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>Status Distribution</div>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="value" stroke="none">
                    {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie><Tooltip content={<ChartTooltip />} /><Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{v}</span>} /></PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ background: "var(--card)", borderRadius: 14, padding: 20, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>Issue Breakdown</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={barData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <XAxis dataKey="name" tick={{ fill: "#6b7194", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#6b7194", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "#ffffff08" }} />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>{barData.map((d, i) => <Cell key={i} fill={d.fill} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="fade-in stagger-3" style={{ background: "var(--card)", borderRadius: 12, padding: 16, marginBottom: 24, border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", height: 18, borderRadius: 9, overflow: "hidden", background: "var(--bg)" }}>
            {stats.total > 0 && (<><div style={{ width: `${(stats.matched / stats.total) * 100}%`, background: COLORS.match, transition: "width .6s" }} /><div style={{ width: `${(stats.amtMis / stats.total) * 100}%`, background: COLORS.warn, transition: "width .6s" }} /><div style={{ width: `${(stats.nsOnly / stats.total) * 100}%`, background: COLORS.ns, transition: "width .6s" }} /><div style={{ width: `${(stats.icrmOnly / stats.total) * 100}%`, background: COLORS.icrm, transition: "width .6s" }} /></>)}
          </div>
          <div style={{ display: "flex", gap: 20, marginTop: 10, fontSize: 11, color: "var(--text-muted)", flexWrap: "wrap" }}>
            {[["Matched", COLORS.match], ["Amount Mismatch", COLORS.warn], ["NetSuite Only", COLORS.ns], ["ICRM Only", COLORS.icrm]].map(([l, c]) => (
              <span key={l}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: c, marginRight: 4 }} />{l}</span>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="fade-in stagger-4" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 4, background: "var(--card)", borderRadius: 10, padding: 3, border: "1px solid var(--border)", flexWrap: "wrap" }}>
            {filterTabs.map((t) => (
              <button key={t.key} onClick={() => { setFilter(t.key); setPage(0); }} style={{ padding: "6px 14px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-display)", transition: "all .2s", background: filter === t.key ? (t.key === "discrepancies" ? COLORS.err : t.key === "matched" ? COLORS.match : "var(--border)") : "transparent", color: filter === t.key ? "#fff" : "var(--text-muted)" }}>{t.label} ({t.count})</button>
            ))}
          </div>
          <input type="text" placeholder="Search invoice # or customer..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13, width: 260, outline: "none" }} />
        </div>

        {/* Table */}
        <div className="fade-in stagger-5" style={{ background: "var(--card)", borderRadius: 14, border: "1px solid var(--border)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{columns.map((col) => (
              <th key={col.key} onClick={() => handleSort(col.key)} style={{ padding: "12px 16px", textAlign: col.align || "left", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--text-muted)", borderBottom: "1px solid var(--border)", cursor: "pointer", width: col.width, userSelect: "none", fontFamily: "var(--font-display)" }}>
                {col.label} {sortCol === col.key ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>))}</tr></thead>
            <tbody>
              {paged.map((row, i) => (<>
                <tr key={row.invoiceNumber} onClick={() => setExpandedRow(expandedRow === row.invoiceNumber ? null : row.invoiceNumber)} style={{ cursor: "pointer", transition: "background .15s", background: expandedRow === row.invoiceNumber ? "var(--card-hover)" : i % 2 === 0 ? "transparent" : "#ffffff03" }} onMouseEnter={(e) => (e.currentTarget.style.background = "var(--card-hover)")} onMouseLeave={(e) => (e.currentTarget.style.background = expandedRow === row.invoiceNumber ? "var(--card-hover)" : i % 2 === 0 ? "transparent" : "#ffffff03")}>
                  <td style={{ padding: "10px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, borderBottom: "1px solid var(--border)" }}>{row.invoiceNumber}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 13, borderBottom: "1px solid var(--border)", color: COLORS.ns }}>{row.nsAmount != null ? fmt(row.nsAmount) : "—"}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 13, borderBottom: "1px solid var(--border)", color: COLORS.icrm }}>{row.icrmAmount != null ? fmt(row.icrmAmount) : "—"}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, borderBottom: "1px solid var(--border)", color: Math.abs(row.diff) > 0.01 ? COLORS.warn : "var(--text-muted)" }}>{row.diff > 0 ? "+" : ""}{fmt(row.diff)}</td>
                  <td style={{ padding: "10px 16px", fontSize: 13, borderBottom: "1px solid var(--border)", color: "var(--text-muted)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.nsCustomer || row.icrmCustomer || "—"}</td>
                  <td style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}><Badge type={row.type} /></td>
                </tr>
                {expandedRow === row.invoiceNumber && (
                  <tr key={`${row.invoiceNumber}-d`}><td colSpan={6} style={{ padding: "16px 24px", background: "#0d0f16", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.ns, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>NetSuite Record</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
                          <div>Amount (total): <span style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{row.nsAmount != null ? fmt(row.nsAmount) : "N/A"}</span></div>
                          {row.nsLines > 1 && <div>Line Items: <span style={{ color: "#f59e0b", fontWeight: 600 }}>{row.nsLines} lines aggregated</span></div>}
                          <div>Date: <span style={{ color: "var(--text)" }}>{row.nsDate || "N/A"}</span></div>
                          <div>Customer: <span style={{ color: "var(--text)" }}>{row.nsCustomer || "N/A"}</span></div>
                          <div>Company ID: <span style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{row.nsCompanyId || "N/A"}</span></div>
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.icrm, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>ICRM Record</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
                          <div>Amount (total): <span style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{row.icrmAmount != null ? fmt(row.icrmAmount) : "N/A"}</span></div>
                          {row.icrmLines > 1 && <div>Line Items: <span style={{ color: "#f59e0b", fontWeight: 600 }}>{row.icrmLines} lines aggregated</span></div>}
                          <div>Date: <span style={{ color: "var(--text)" }}>{row.icrmDate || "N/A"}</span></div>
                          <div>Customer: <span style={{ color: "var(--text)" }}>{row.icrmCustomer || "N/A"}</span></div>
                          <div>Company ID: <span style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{row.icrmCompanyId || "N/A"}</span></div>
                        </div>
                      </div>
                    </div>
                    {row.issues?.length > 0 && <div style={{ marginTop: 12, padding: "8px 12px", background: "#ef444410", borderRadius: 8, fontSize: 12, color: COLORS.err }}>Issues: {row.issues.join(" • ")}</div>}
                  </td></tr>
                )}
              </>))}
              {paged.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>No invoices match your filters.</td></tr>}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
              <div style={{ display: "flex", gap: 4 }}>
                <button disabled={page === 0} onClick={() => setPage(page - 1)} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: page === 0 ? "var(--border)" : "var(--text-muted)", fontSize: 12, cursor: page === 0 ? "default" : "pointer" }}>Prev</button>
                <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: page >= totalPages - 1 ? "var(--border)" : "var(--text-muted)", fontSize: 12, cursor: page >= totalPages - 1 ? "default" : "pointer" }}>Next</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
