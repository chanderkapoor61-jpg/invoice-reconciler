import { useState, useCallback, useMemo, useRef } from "react";
import * as XLSX from "xlsx";

// ─── XLSX Parser ──────────────────────────────────────────
function parseXLSX(buffer) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  // Normalize: convert Date objects to strings, numbers stay as-is
  return rows.map((row) => {
    const obj = {};
    Object.keys(row).forEach((k) => {
      const v = row[k];
      if (v instanceof Date) {
        const y = v.getFullYear();
        const m = String(v.getMonth() + 1).padStart(2, "0");
        const d = String(v.getDate()).padStart(2, "0");
        obj[k] = `${y}-${m}-${d}`;
      } else {
        obj[k] = String(v);
      }
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
    const vals = [];
    let current = "";
    let inQuotes = false;
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

// ─── Field Mapper Modal ───────────────────────────────────
function FieldMapper({ headers, label, mapping, onMap, onConfirm, color }) {
  const fields = [
    { key: "invoiceNumber", label: "Invoice Number", required: true },
    { key: "amount", label: "Amount", required: true },
    { key: "date", label: "Date", required: false },
    { key: "customer", label: "Customer Name", required: false },
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
            <select
              value={mapping[f.key] || ""}
              onChange={(e) => onMap(f.key, e.target.value)}
              style={{
                width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)",
                background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font-body)", outline: "none"
              }}
            >
              <option value="">— select column —</option>
              {headers.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        ))}
      </div>
      <button
        disabled={!allRequiredMapped}
        onClick={onConfirm}
        style={{
          marginTop: 18, padding: "10px 28px", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 13,
          fontFamily: "var(--font-display)", letterSpacing: ".04em", cursor: allRequiredMapped ? "pointer" : "not-allowed",
          background: allRequiredMapped ? color : "var(--border)", color: allRequiredMapped ? "#fff" : "var(--text-muted)",
          transition: "all .2s"
        }}
      >
        Confirm Mapping
      </button>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────
function Stat({ label, value, accent, icon, sub }) {
  return (
    <div style={{
      background: "var(--card)", borderRadius: 14, padding: "22px 24px", border: "1px solid var(--border)",
      display: "flex", flexDirection: "column", gap: 6, position: "relative", overflow: "hidden"
    }}>
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
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
      background: s.bg, color: s.color, letterSpacing: ".02em", whiteSpace: "nowrap"
    }}>{s.text}</span>
  );
}

// ─── Sample Data Generator ────────────────────────────────
function generateSampleData() {
  const customers = ["Acme Corp", "Globex Inc", "Initech LLC", "Umbrella Co", "Stark Industries", "Wayne Enterprises", "Wonka Ltd", "Tyrell Corp"];
  const nsRows = [];
  const icrmRows = [];
  for (let i = 1; i <= 50; i++) {
    const inv = `INV-${String(1000 + i).padStart(5, "0")}`;
    const amt = (Math.random() * 50000 + 500).toFixed(2);
    const cust = customers[Math.floor(Math.random() * customers.length)];
    const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, "0");
    const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, "0");
    const dt = `2025-${month}-${day}`;
    // 70% matched, 10% amount mismatch, 10% only in NS, 10% only in ICRM
    const r = Math.random();
    if (r < 0.7) {
      nsRows.push({ "Invoice Number": inv, Amount: amt, Date: dt, Customer: cust, Status: "Posted" });
      icrmRows.push({ "Invoice No": inv, "Invoice Amount": amt, "Invoice Date": dt, "Client Name": cust, "Invoice Status": "Approved" });
    } else if (r < 0.8) {
      const diff = (parseFloat(amt) + (Math.random() * 200 - 100)).toFixed(2);
      nsRows.push({ "Invoice Number": inv, Amount: amt, Date: dt, Customer: cust, Status: "Posted" });
      icrmRows.push({ "Invoice No": inv, "Invoice Amount": diff, "Invoice Date": dt, "Client Name": cust, "Invoice Status": "Approved" });
    } else if (r < 0.9) {
      nsRows.push({ "Invoice Number": inv, Amount: amt, Date: dt, Customer: cust, Status: "Posted" });
    } else {
      icrmRows.push({ "Invoice No": inv, "Invoice Amount": amt, "Invoice Date": dt, "Client Name": cust, "Invoice Status": "Approved" });
    }
  }
  return { nsRows, icrmRows };
}

function rowsToCSV(rows) {
  if (!rows.length) return "";
  const h = Object.keys(rows[0]);
  return [h.join(","), ...rows.map((r) => h.map((k) => `"${r[k]}"`).join(","))].join("\n");
}

// ─── Main App ─────────────────────────────────────────────
export default function App() {
  const [step, setStep] = useState("upload"); // upload | map | results
  const [nsRaw, setNsRaw] = useState(null);
  const [icrmRaw, setIcrmRaw] = useState(null);
  const [nsHeaders, setNsHeaders] = useState([]);
  const [icrmHeaders, setIcrmHeaders] = useState([]);
  const [nsData, setNsData] = useState([]);
  const [icrmData, setIcrmData] = useState([]);
  const [nsMap, setNsMap] = useState({});
  const [icrmMap, setIcrmMap] = useState({});
  const [nsConfirmed, setNsConfirmed] = useState(false);
  const [icrmConfirmed, setIcrmConfirmed] = useState(false);
  const [results, setResults] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(0);
  const [expandedRow, setExpandedRow] = useState(null);
  const nsRef = useRef();
  const icrmRef = useRef();
  const PAGE_SIZE = 20;

  const COLORS = { ns: "#6366f1", icrm: "#ec4899", match: "#10b981", warn: "#f59e0b", err: "#ef4444" };

  // ─── Auto-map helper ─────────────────────────────────────
  const autoMapHeaders = (h, mapSetter) => {
    const auto = {};
    const invKeys = ["invoice number", "invoice no", "invoice_number", "invoice_no", "inv no", "inv number", "invoicenumber"];
    const amtKeys = ["amount", "invoice amount", "invoice_amount", "invoiceamount", "total", "total amount"];
    const dtKeys = ["date", "invoice date", "invoice_date", "invoicedate"];
    const custKeys = ["customer", "client", "customer name", "client name", "customer_name", "client_name"];
    const statusKeys = ["status", "invoice status", "invoice_status"];
    h.forEach((col) => {
      const lc = col.toLowerCase().trim();
      if (invKeys.includes(lc)) auto.invoiceNumber = col;
      if (amtKeys.includes(lc)) auto.amount = col;
      if (dtKeys.includes(lc)) auto.date = col;
      if (custKeys.includes(lc)) auto.customer = col;
      if (statusKeys.includes(lc)) auto.status = col;
    });
    mapSetter(auto);
  };

  // ─── File Handlers ──────────────────────────────────────
  const handleXLSX = (setter, headerSetter, dataSetter, mapSetter) => (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const buffer = new Uint8Array(ev.target.result);
      setter(file.name);
      const rows = parseXLSX(buffer);
      dataSetter(rows);
      if (rows.length) {
        const h = Object.keys(rows[0]);
        headerSetter(h);
        autoMapHeaders(h, mapSetter);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleCSV = (setter, headerSetter, dataSetter, mapSetter) => (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      setter(file.name);
      const rows = parseCSV(text);
      dataSetter(rows);
      if (rows.length) {
        const h = Object.keys(rows[0]);
        headerSetter(h);
        autoMapHeaders(h, mapSetter);
      }
    };
    reader.readAsText(file);
  };

  const loadSample = () => {
    const { nsRows, icrmRows } = generateSampleData();
    setNsRaw("sample_netsuite.xlsx");
    setIcrmRaw("sample_icrm.csv");
    setNsData(nsRows);
    setIcrmData(icrmRows);
    setNsHeaders(Object.keys(nsRows[0]));
    setIcrmHeaders(Object.keys(icrmRows[0]));
    setNsMap({ invoiceNumber: "Invoice Number", amount: "Amount", date: "Date", customer: "Customer", status: "Status" });
    setIcrmMap({ invoiceNumber: "Invoice No", amount: "Invoice Amount", date: "Invoice Date", customer: "Client Name", status: "Invoice Status" });
    setStep("map");
  };

  const proceedToMap = () => { if (nsRaw && icrmRaw) setStep("map"); };

  // ─── Reconciliation Engine ──────────────────────────────
  const runReconciliation = useCallback(() => {
    const normalize = (v) => (v || "").toString().trim().toUpperCase();
    const toNum = (v) => parseFloat((v || "0").toString().replace(/[^0-9.\-]/g, "")) || 0;

    const nsIndex = {};
    nsData.forEach((row) => {
      const key = normalize(row[nsMap.invoiceNumber]);
      if (key) nsIndex[key] = row;
    });
    const icrmIndex = {};
    icrmData.forEach((row) => {
      const key = normalize(row[icrmMap.invoiceNumber]);
      if (key) icrmIndex[key] = row;
    });

    const allKeys = new Set([...Object.keys(nsIndex), ...Object.keys(icrmIndex)]);
    const rows = [];

    allKeys.forEach((key) => {
      const ns = nsIndex[key];
      const icrm = icrmIndex[key];
      const rec = { invoiceNumber: key, issues: [] };

      if (ns && !icrm) {
        rec.type = "netsuite_only";
        rec.nsAmount = toNum(ns[nsMap.amount]);
        rec.icrmAmount = null;
        rec.diff = rec.nsAmount;
        rec.nsDate = ns[nsMap.date] || "";
        rec.icrmDate = "";
        rec.nsCustomer = ns[nsMap.customer] || "";
        rec.icrmCustomer = "";
        rec.issues.push("Missing in ICRM");
      } else if (!ns && icrm) {
        rec.type = "icrm_only";
        rec.nsAmount = null;
        rec.icrmAmount = toNum(icrm[icrmMap.amount]);
        rec.diff = -rec.icrmAmount;
        rec.nsDate = "";
        rec.icrmDate = icrm[icrmMap.date] || "";
        rec.nsCustomer = "";
        rec.icrmCustomer = icrm[icrmMap.customer] || "";
        rec.issues.push("Missing in NetSuite");
      } else {
        rec.nsAmount = toNum(ns[nsMap.amount]);
        rec.icrmAmount = toNum(icrm[icrmMap.amount]);
        rec.diff = +(rec.nsAmount - rec.icrmAmount).toFixed(2);
        rec.nsDate = ns[nsMap.date] || "";
        rec.icrmDate = icrm[icrmMap.date] || "";
        rec.nsCustomer = ns[nsMap.customer] || "";
        rec.icrmCustomer = icrm[icrmMap.customer] || "";

        if (Math.abs(rec.diff) > 0.01) rec.issues.push("Amount mismatch");
        if (nsMap.date && icrmMap.date && rec.nsDate && rec.icrmDate && normalize(rec.nsDate) !== normalize(rec.icrmDate))
          rec.issues.push("Date mismatch");
        if (nsMap.customer && icrmMap.customer && rec.nsCustomer && rec.icrmCustomer && normalize(rec.nsCustomer) !== normalize(rec.icrmCustomer))
          rec.issues.push("Customer mismatch");

        if (rec.issues.length === 0) rec.type = "matched";
        else if (rec.issues.length === 1) {
          if (rec.issues[0] === "Amount mismatch") rec.type = "amount_mismatch";
          else if (rec.issues[0] === "Date mismatch") rec.type = "date_mismatch";
          else rec.type = "customer_mismatch";
        } else rec.type = "multi_issue";
      }
      rows.push(rec);
    });

    setResults(rows);
    setStep("results");
    setPage(0);
    setFilter("all");
    setSearch("");
  }, [nsData, icrmData, nsMap, icrmMap]);

  // ─── Filtered + Sorted Results ──────────────────────────
  const filtered = useMemo(() => {
    if (!results) return [];
    let r = results;
    if (filter !== "all") r = r.filter((x) => filter === "discrepancies" ? x.type !== "matched" : x.type === filter);
    if (search) {
      const s = search.toUpperCase();
      r = r.filter((x) => x.invoiceNumber.includes(s) || (x.nsCustomer || "").toUpperCase().includes(s) || (x.icrmCustomer || "").toUpperCase().includes(s));
    }
    if (sortCol) {
      r = [...r].sort((a, b) => {
        let va = a[sortCol], vb = b[sortCol];
        if (typeof va === "number" && typeof vb === "number") return sortDir === "asc" ? va - vb : vb - va;
        va = (va || "").toString(); vb = (vb || "").toString();
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    return r;
  }, [results, filter, search, sortCol, sortDir]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const stats = useMemo(() => {
    if (!results) return {};
    const matched = results.filter((r) => r.type === "matched").length;
    const disc = results.length - matched;
    const totalDiff = results.reduce((s, r) => s + Math.abs(r.diff || 0), 0);
    const nsOnly = results.filter((r) => r.type === "netsuite_only").length;
    const icrmOnly = results.filter((r) => r.type === "icrm_only").length;
    const amtMis = results.filter((r) => r.type === "amount_mismatch" || r.issues?.includes("Amount mismatch")).length;
    return { total: results.length, matched, disc, totalDiff, nsOnly, icrmOnly, amtMis };
  }, [results]);

  const [copyStatus, setCopyStatus] = useState("idle"); // idle | copied

  const buildCSVText = () => {
    if (!filtered.length) return "";
    const headers = ["Invoice Number", "Status", "NetSuite Amount", "ICRM Amount", "Difference", "NS Date", "ICRM Date", "NS Customer", "ICRM Customer", "Issues"];
    const csvRows = filtered.map((r) =>
      [r.invoiceNumber, r.type, r.nsAmount ?? "", r.icrmAmount ?? "", r.diff, r.nsDate, r.icrmDate, r.nsCustomer, r.icrmCustomer, (r.issues || []).join("; ")].map((v) => `"${v}"`).join(",")
    );
    return [headers.join(","), ...csvRows].join("\n");
  };

  const exportCSV = () => {
    const csv = buildCSVText();
    if (!csv) return;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reconciliation_report.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyCSVToClipboard = async () => {
    const csv = buildCSVText();
    if (!csv) return;
    try {
      await navigator.clipboard.writeText(csv);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 2500);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = csv;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 2500);
    }
  };

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const fmt = (n) => n == null ? "—" : n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ─── Styles ─────────────────────────────────────────────
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700&display=swap');
    :root {
      --bg: #0c0e14; --card: #13151e; --card-hover: #1a1d2a; --border: #1f2233;
      --text: #e8e9ed; --text-muted: #6b7194; --font-display: 'DM Sans', sans-serif;
      --font-body: 'DM Sans', sans-serif; --font-mono: 'JetBrains Mono', monospace;
      --ns: #6366f1; --icrm: #ec4899; --match: #10b981; --warn: #f59e0b; --err: #ef4444;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: var(--bg); color: var(--text); font-family: var(--font-body); }
    ::selection { background: #6366f140; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #2a2d40; border-radius: 3px; }
    input[type="file"] { display: none; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
    .fade-in { animation: fadeIn .5s ease both; }
    .stagger-1 { animation-delay: .05s; } .stagger-2 { animation-delay: .1s; }
    .stagger-3 { animation-delay: .15s; } .stagger-4 { animation-delay: .2s; }
    .stagger-5 { animation-delay: .25s; } .stagger-6 { animation-delay: .3s; }
  `;

  // ─── Upload Step ────────────────────────────────────────
  if (step === "upload") {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "40px 20px" }}>
        <style>{css}</style>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          {/* Header */}
          <div className="fade-in" style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, #6366f1, #ec4899)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>⇄</div>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 900, letterSpacing: "-.02em", background: "linear-gradient(135deg, #6366f1, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                Invoice Reconciler
              </h1>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: 15, maxWidth: 500, margin: "0 auto" }}>
              Compare NetSuite ERP invoices (.xlsx) against ICRM records (.csv). Upload both files to begin reconciliation.
            </p>
          </div>

          {/* Upload Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 32 }}>
            {[
              { ref: nsRef, raw: nsRaw, data: nsData, color: COLORS.ns, label: "NetSuite", sub: "ERP Revenue Invoices (.xlsx)", accept: ".xlsx,.xls", handler: handleXLSX(setNsRaw, setNsHeaders, setNsData, setNsMap), uploadLabel: "Click to upload Excel (.xlsx)" },
              { ref: icrmRef, raw: icrmRaw, data: icrmData, color: COLORS.icrm, label: "ICRM", sub: "Backend Invoice Records (.csv)", accept: ".csv", handler: handleCSV(setIcrmRaw, setIcrmHeaders, setIcrmData, setIcrmMap), uploadLabel: "Click to upload CSV" },
            ].map((src, i) => (
              <div
                key={i}
                className={`fade-in stagger-${i + 1}`}
                onClick={() => !src.raw && src.ref.current?.click()}
                style={{
                  background: "var(--card)", borderRadius: 16, padding: 32, border: `1.5px dashed ${src.raw ? src.color : "var(--border)"}`,
                  cursor: src.raw ? "default" : "pointer", textAlign: "center", transition: "all .25s", position: "relative", overflow: "hidden"
                }}
              >
                {src.raw && (
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${src.color}, ${src.color}88)` }} />
                )}
                <input type="file" ref={src.ref} accept={src.accept} onChange={src.handler} />
                <div style={{ fontSize: 36, marginBottom: 12, opacity: src.raw ? 1 : 0.3 }}>{src.raw ? "✓" : "📄"}</div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16, color: src.color, marginBottom: 4 }}>{src.label}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>{src.sub}</div>
                {src.raw ? (
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text)", marginBottom: 4 }}>{src.raw}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{src.data.length} rows loaded</div>
                    <button onClick={(e) => { e.stopPropagation(); src.ref.current?.click(); }} style={{
                      marginTop: 10, padding: "5px 14px", borderRadius: 6, border: `1px solid ${src.color}44`, background: "transparent",
                      color: src.color, fontSize: 11, fontWeight: 600, cursor: "pointer"
                    }}>Replace</button>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{src.uploadLabel}</div>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="fade-in stagger-3" style={{ textAlign: "center" }}>
            <button
              disabled={!nsRaw || !icrmRaw}
              onClick={proceedToMap}
              style={{
                padding: "14px 48px", borderRadius: 12, border: "none", fontFamily: "var(--font-display)", fontWeight: 800,
                fontSize: 15, letterSpacing: ".02em", cursor: nsRaw && icrmRaw ? "pointer" : "not-allowed",
                background: nsRaw && icrmRaw ? "linear-gradient(135deg, #6366f1, #ec4899)" : "var(--border)",
                color: nsRaw && icrmRaw ? "#fff" : "var(--text-muted)", transition: "all .3s", boxShadow: nsRaw && icrmRaw ? "0 4px 24px #6366f130" : "none"
              }}
            >
              Map Columns →
            </button>
            <div style={{ marginTop: 20 }}>
              <button onClick={loadSample} style={{
                padding: "8px 20px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent",
                color: "var(--text-muted)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-display)"
              }}>
                Load Sample Data for Demo
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Mapping Step ───────────────────────────────────────
  if (step === "map") {
    const canRun = nsConfirmed && icrmConfirmed;
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "40px 20px" }}>
        <style>{css}</style>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          <button onClick={() => { setStep("upload"); setNsConfirmed(false); setIcrmConfirmed(false); }} style={{
            marginBottom: 20, padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border)",
            background: "transparent", color: "var(--text-muted)", fontSize: 12, cursor: "pointer"
          }}>← Back</button>
          <h2 className="fade-in" style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 900, marginBottom: 8, letterSpacing: "-.01em" }}>
            Map Your Columns
          </h2>
          <p className="fade-in stagger-1" style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 28 }}>
            Tell us which columns in each file correspond to the reconciliation fields. Invoice Number and Amount are required.
          </p>

          <div className="fade-in stagger-2">
            <FieldMapper
              headers={nsHeaders} label="NETSUITE" mapping={nsMap} color={COLORS.ns}
              onMap={(k, v) => setNsMap((p) => ({ ...p, [k]: v }))}
              onConfirm={() => setNsConfirmed(true)}
            />
          </div>
          <div className="fade-in stagger-3">
            <FieldMapper
              headers={icrmHeaders} label="ICRM" mapping={icrmMap} color={COLORS.icrm}
              onMap={(k, v) => setIcrmMap((p) => ({ ...p, [k]: v }))}
              onConfirm={() => setIcrmConfirmed(true)}
            />
          </div>

          <div className="fade-in stagger-4" style={{ textAlign: "center", marginTop: 20 }}>
            <button
              disabled={!canRun}
              onClick={runReconciliation}
              style={{
                padding: "14px 48px", borderRadius: 12, border: "none", fontFamily: "var(--font-display)", fontWeight: 800,
                fontSize: 15, cursor: canRun ? "pointer" : "not-allowed",
                background: canRun ? "linear-gradient(135deg, #6366f1, #ec4899)" : "var(--border)",
                color: canRun ? "#fff" : "var(--text-muted)", transition: "all .3s", boxShadow: canRun ? "0 4px 24px #6366f130" : "none"
              }}
            >
              Run Reconciliation ⚡
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Results Step ───────────────────────────────────────
  const filterTabs = [
    { key: "all", label: "All", count: stats.total },
    { key: "matched", label: "Matched", count: stats.matched },
    { key: "discrepancies", label: "Discrepancies", count: stats.disc },
    { key: "netsuite_only", label: "NetSuite Only", count: stats.nsOnly },
    { key: "icrm_only", label: "ICRM Only", count: stats.icrmOnly },
  ];

  const columns = [
    { key: "invoiceNumber", label: "Invoice #", width: "16%" },
    { key: "nsAmount", label: "NetSuite Amt", width: "15%", align: "right" },
    { key: "icrmAmount", label: "ICRM Amt", width: "15%", align: "right" },
    { key: "diff", label: "Difference", width: "13%", align: "right" },
    { key: "nsCustomer", label: "Customer", width: "18%" },
    { key: "type", label: "Status", width: "15%" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "32px 20px" }}>
      <style>{css}</style>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        {/* Header */}
        <div className="fade-in" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg, #6366f1, #ec4899)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⇄</div>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 900, letterSpacing: "-.02em" }}>Reconciliation Report</h1>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: 12 }}>{nsRaw} vs {icrmRaw} — {stats.total} invoices compared</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={exportCSV} style={{
              padding: "8px 18px", borderRadius: 8, border: "none",
              background: "linear-gradient(135deg, #10b981, #059669)",
              color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-display)"
            }}>Download CSV ↓</button>
            <button onClick={copyCSVToClipboard} style={{
              padding: "8px 18px", borderRadius: 8, border: "1px solid var(--border)",
              background: copyStatus === "copied" ? "#10b98120" : "var(--card)",
              color: copyStatus === "copied" ? "#10b981" : "var(--text)",
              fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-display)", transition: "all .3s",
              minWidth: 140
            }}>{copyStatus === "copied" ? "✓ Copied!" : "Copy to Clipboard"}</button>
            <button onClick={() => { setStep("upload"); setResults(null); setNsConfirmed(false); setIcrmConfirmed(false); }} style={{
              padding: "8px 18px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent",
              color: "var(--text-muted)", fontSize: 12, cursor: "pointer"
            }}>New Upload</button>
          </div>
        </div>

        {/* Stats */}
        <div className="fade-in stagger-1" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
          <Stat label="Total Invoices" value={stats.total} accent="var(--text)" icon="Σ" />
          <Stat label="Matched" value={stats.matched} accent={COLORS.match} icon="✓" sub={`${((stats.matched / stats.total) * 100).toFixed(1)}% match rate`} />
          <Stat label="Discrepancies" value={stats.disc} accent={COLORS.err} icon="!" sub={`${stats.amtMis} amount, ${stats.nsOnly} NS-only, ${stats.icrmOnly} ICRM-only`} />
          <Stat label="Total Variance" value={`₹${fmt(stats.totalDiff)}`} accent={COLORS.warn} icon="Δ" sub="Absolute difference sum" />
        </div>

        {/* Visual Bar */}
        <div className="fade-in stagger-2" style={{ background: "var(--card)", borderRadius: 12, padding: 16, marginBottom: 24, border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", height: 18, borderRadius: 9, overflow: "hidden", background: "var(--bg)" }}>
            {stats.total > 0 && (
              <>
                <div style={{ width: `${(stats.matched / stats.total) * 100}%`, background: COLORS.match, transition: "width .6s ease" }} title={`${stats.matched} matched`} />
                <div style={{ width: `${(stats.amtMis / stats.total) * 100}%`, background: COLORS.warn, transition: "width .6s ease" }} title={`${stats.amtMis} amount mismatches`} />
                <div style={{ width: `${(stats.nsOnly / stats.total) * 100}%`, background: COLORS.ns, transition: "width .6s ease" }} title={`${stats.nsOnly} NetSuite only`} />
                <div style={{ width: `${(stats.icrmOnly / stats.total) * 100}%`, background: COLORS.icrm, transition: "width .6s ease" }} title={`${stats.icrmOnly} ICRM only`} />
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 20, marginTop: 10, fontSize: 11, color: "var(--text-muted)" }}>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: COLORS.match, marginRight: 4 }} />Matched</span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: COLORS.warn, marginRight: 4 }} />Amount Mismatch</span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: COLORS.ns, marginRight: 4 }} />NetSuite Only</span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: COLORS.icrm, marginRight: 4 }} />ICRM Only</span>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="fade-in stagger-3" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 4, background: "var(--card)", borderRadius: 10, padding: 3, border: "1px solid var(--border)" }}>
            {filterTabs.map((t) => (
              <button
                key={t.key}
                onClick={() => { setFilter(t.key); setPage(0); }}
                style={{
                  padding: "6px 14px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  fontFamily: "var(--font-display)", transition: "all .2s",
                  background: filter === t.key ? (t.key === "discrepancies" ? COLORS.err : t.key === "matched" ? COLORS.match : "var(--border)") : "transparent",
                  color: filter === t.key ? "#fff" : "var(--text-muted)"
                }}
              >
                {t.label} <span style={{ opacity: 0.7 }}>({t.count})</span>
              </button>
            ))}
          </div>
          <input
            type="text" placeholder="Search invoice # or customer..."
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            style={{
              padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)",
              color: "var(--text)", fontSize: 13, fontFamily: "var(--font-body)", width: 260, outline: "none"
            }}
          />
        </div>

        {/* Table */}
        <div className="fade-in stagger-4" style={{ background: "var(--card)", borderRadius: 14, border: "1px solid var(--border)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    style={{
                      padding: "12px 16px", textAlign: col.align || "left", fontSize: 11, fontWeight: 700,
                      textTransform: "uppercase", letterSpacing: ".06em", color: "var(--text-muted)",
                      borderBottom: "1px solid var(--border)", cursor: "pointer", width: col.width, userSelect: "none",
                      fontFamily: "var(--font-display)"
                    }}
                  >
                    {col.label} {sortCol === col.key ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((row, i) => (
                <>
                  <tr
                    key={row.invoiceNumber}
                    onClick={() => setExpandedRow(expandedRow === row.invoiceNumber ? null : row.invoiceNumber)}
                    style={{
                      cursor: "pointer", transition: "background .15s",
                      background: expandedRow === row.invoiceNumber ? "var(--card-hover)" : i % 2 === 0 ? "transparent" : "#ffffff03"
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--card-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = expandedRow === row.invoiceNumber ? "var(--card-hover)" : i % 2 === 0 ? "transparent" : "#ffffff03")}
                  >
                    <td style={{ padding: "10px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, borderBottom: "1px solid var(--border)" }}>
                      {row.invoiceNumber}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 13, borderBottom: "1px solid var(--border)", color: COLORS.ns }}>
                      {row.nsAmount != null ? fmt(row.nsAmount) : "—"}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 13, borderBottom: "1px solid var(--border)", color: COLORS.icrm }}>
                      {row.icrmAmount != null ? fmt(row.icrmAmount) : "—"}
                    </td>
                    <td style={{
                      padding: "10px 16px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700,
                      borderBottom: "1px solid var(--border)", color: Math.abs(row.diff) > 0.01 ? COLORS.warn : "var(--text-muted)"
                    }}>
                      {row.diff > 0 ? "+" : ""}{fmt(row.diff)}
                    </td>
                    <td style={{ padding: "10px 16px", fontSize: 13, borderBottom: "1px solid var(--border)", color: "var(--text-muted)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.nsCustomer || row.icrmCustomer || "—"}
                    </td>
                    <td style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
                      <Badge type={row.type} />
                    </td>
                  </tr>
                  {expandedRow === row.invoiceNumber && (
                    <tr key={`${row.invoiceNumber}-detail`}>
                      <td colSpan={6} style={{ padding: "16px 24px", background: "#0d0f16", borderBottom: "1px solid var(--border)" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.ns, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>NetSuite Record</div>
                            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
                              <div>Amount: <span style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{row.nsAmount != null ? fmt(row.nsAmount) : "N/A"}</span></div>
                              <div>Date: <span style={{ color: "var(--text)" }}>{row.nsDate || "N/A"}</span></div>
                              <div>Customer: <span style={{ color: "var(--text)" }}>{row.nsCustomer || "N/A"}</span></div>
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.icrm, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>ICRM Record</div>
                            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
                              <div>Amount: <span style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{row.icrmAmount != null ? fmt(row.icrmAmount) : "N/A"}</span></div>
                              <div>Date: <span style={{ color: "var(--text)" }}>{row.icrmDate || "N/A"}</span></div>
                              <div>Customer: <span style={{ color: "var(--text)" }}>{row.icrmCustomer || "N/A"}</span></div>
                            </div>
                          </div>
                        </div>
                        {row.issues?.length > 0 && (
                          <div style={{ marginTop: 12, padding: "8px 12px", background: "#ef444410", borderRadius: 8, fontSize: 12, color: COLORS.err }}>
                            Issues: {row.issues.join(" • ")}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {paged.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>No invoices match your filters.</td></tr>
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                <button disabled={page === 0} onClick={() => setPage(page - 1)} style={{
                  padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent",
                  color: page === 0 ? "var(--border)" : "var(--text-muted)", fontSize: 12, cursor: page === 0 ? "default" : "pointer"
                }}>Prev</button>
                <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} style={{
                  padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent",
                  color: page >= totalPages - 1 ? "var(--border)" : "var(--text-muted)", fontSize: 12, cursor: page >= totalPages - 1 ? "default" : "pointer"
                }}>Next</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
