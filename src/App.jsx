import React, { useState, useEffect, useMemo, useRef } from "react";
import { Plus, CircleAlert, Search, X, IceCreamCone, ChevronRight, Camera, Loader2, RefreshCw } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL;
const APP_TOKEN = import.meta.env.VITE_APP_TOKEN;

const STAGES = ["Layer 1", "Layer 2", "Ready for Buttercream", "Ready for Pickup", "Picked Up"];

const STATUS_STYLE = {
  "Layer 1": { bg: "#E8A94A", text: "#3E2723", label: "Layer 1" },
  "Layer 2": { bg: "#DDA15E", text: "#3E2723", label: "Layer 2" },
  "Ready for Buttercream": { bg: "#7FCDBA", text: "#1F3D36", label: "Ready for Buttercream" },
  "Ready for Pickup": { bg: "#E8748A", text: "#fff", label: "Ready for Pickup" },
  "Picked Up": { bg: "#D8CFEA", text: "#4A3F6B", label: "Picked Up" },
};

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target - today) / 86400000);
}
function dayOfWeek(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short" });
}
function urgencyLabel(dateStr, status) {
  if (status === "Picked Up") return { text: "Picked up", color: "#8B8098" };
  const d = daysUntil(dateStr);
  if (d === null) return { text: "No date", color: "#8B8098" };
  if (d < 0) return { text: `Overdue ${Math.abs(d)}d`, color: "#C0392B" };
  if (d === 0) return { text: "Due today", color: "#C0392B" };
  if (d === 1) return { text: "Due tomorrow", color: "#D9822B" };
  if (d <= 3) return { text: `Due in ${d}d`, color: "#D9822B" };
  return { text: `Due in ${d}d`, color: "#2E7D5B" };
}

function TicketEdge({ flip }) {
  const teeth = 14;
  return (
    <svg viewBox={`0 0 ${teeth * 20} 10`} preserveAspectRatio="none" style={{ width: "100%", height: "10px", display: "block", transform: flip ? "rotate(180deg)" : "none" }}>
      {Array.from({ length: teeth }).map((_, i) => (
        <circle key={i} cx={i * 20 + 10} cy={flip ? 10 : 0} r="7" fill="#FBF4E8" />
      ))}
    </svg>
  );
}

function authHeaders(extra = {}) {
  return { "Content-Type": "application/json", ...(APP_TOKEN ? { "x-app-token": APP_TOKEN } : {}), ...extra };
}
async function apiGetOrders() {
  const res = await fetch(`${API_URL}/orders`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to load orders");
  return res.json();
}
async function apiCreateOrder(order) {
  const res = await fetch(`${API_URL}/orders`, { method: "POST", headers: authHeaders(), body: JSON.stringify(order) });
  if (!res.ok) throw new Error("Failed to create order");
  return res.json();
}
async function apiUpdateOrder(id, patch) {
  const res = await fetch(`${API_URL}/orders/${id}`, { method: "PUT", headers: authHeaders(), body: JSON.stringify(patch) });
  if (!res.ok) throw new Error("Failed to update order");
  return res.json();
}
async function apiScan(base64, mediaType) {
  const res = await fetch(`${API_URL}/scan`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ base64, mediaType }) });
  if (!res.ok) throw new Error("Scan failed");
  return res.json();
}

export default function App() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("Active");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const fileInputRef = useRef(null);

  async function loadOrders(silent) {
    try {
      const data = await apiGetOrders();
      data.sort((a, b) => (a.pickupDate || "").localeCompare(b.pickupDate || ""));
      setOrders(data);
      if (!silent) setError("");
    } catch (e) {
      if (!silent) setError("Couldn't reach the server. Check the backend is running and VITE_API_URL is correct.");
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!API_URL) {
      setError("VITE_API_URL is not set. Add it to your .env file and rebuild.");
      setLoading(false);
      return;
    }
    loadOrders();
    const interval = setInterval(() => loadOrders(true), 15000);
    return () => clearInterval(interval);
  }, []);

  async function handleCreate(order) {
    try {
      const created = await apiCreateOrder(order);
      setOrders((prev) => [...prev, created].sort((a, b) => (a.pickupDate || "").localeCompare(b.pickupDate || "")));
    } catch (e) {
      setError("Couldn't save that order. Check your connection and try again.");
    }
  }
  async function handleUpdate(order, patch) {
    try {
      const updated = await apiUpdateOrder(order.id, patch);
      setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
    } catch (e) {
      setError("Couldn't save that change. Check your connection and try again.");
    }
  }
  async function setStage(order, stage) {
    await handleUpdate(order, { status: stage });
  }

  async function handleFileSelected(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setScanning(true);
    setError("");
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error("read failed"));
        r.readAsDataURL(file);
      });
      const base64 = dataUrl.split(",")[1];
      const mediaType = file.type || "image/jpeg";
      const extracted = await apiScan(base64, mediaType);
      setPrefill(extracted);
      setEditingOrder(null);
      setShowForm(true);
    } catch (err) {
      setError("Couldn't read that form. Try a clearer, well-lit photo, or enter the order manually.");
    }
    setScanning(false);
  }

  const filtered = useMemo(() => {
    let list = orders;
    if (filter === "Active") list = list.filter((o) => o.status !== "Picked Up");
    else if (filter !== "All") list = list.filter((o) => o.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((o) => (o.customerName || "").toLowerCase().includes(q) || (o.flavorTop || "").toLowerCase().includes(q) || (o.flavorBottom || "").toLowerCase().includes(q));
    }
    return list;
  }, [orders, filter, search]);

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#FBF4E8", minHeight: "100vh", color: "#3E2723" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
        .fredoka { font-family: 'Fredoka', sans-serif; }
        .corkboard { background-color: #F0E4D0; background-image: radial-gradient(#E3D3B4 1px, transparent 1px); background-size: 14px 14px; }
        button { font-family: inherit; cursor: pointer; }
        button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 3px solid #7FCDBA; outline-offset: 2px; }
        .layerbox { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; background: #fff; border: 1px solid #E3D3B4; border-radius: 8px; padding: 6px 10px; }
        .chip { font-size: 11.5px; font-weight: 700; padding: 3px 8px; border-radius: 999px; background: #fff; border: 1px solid #E3D3B4; color: #5C4A44; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
      `}</style>

      <div style={{ background: "#3E2723", color: "#FBF4E8", padding: "18px 16px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <IceCreamCone size={26} color="#F5C24C" />
          <div className="fredoka" style={{ fontSize: 21, fontWeight: 600 }}>Cake Orders</div>
        </div>
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 2, marginLeft: 36 }}>Shared board · updates automatically every 15s</div>
      </div>

      {error && <div style={{ background: "#F6D6D0", color: "#7A2E22", padding: "10px 16px", fontSize: 13 }}>{error}</div>}

      <div className="corkboard" style={{ padding: "14px 16px 8px" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", background: "#fff", borderRadius: 10, padding: "8px 10px", boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }}>
            <Search size={16} color="#8B8098" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or flavor..." style={{ border: "none", outline: "none", marginLeft: 8, flex: 1, fontSize: 14, background: "transparent" }} />
          </div>
          <button onClick={() => loadOrders()} aria-label="Refresh" style={{ background: "#fff", border: "1px solid #E3D3B4", borderRadius: 10, padding: "8px 10px" }}>
            <RefreshCw size={16} />
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            disabled={scanning}
            style={{ flex: 1, background: "#fff", color: "#3E2723", border: "1px solid #E3D3B4", borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontWeight: 600, fontSize: 14 }}
          >
            {scanning ? <Loader2 size={17} className="spin" /> : <Camera size={17} />}
            {scanning ? "Reading form…" : "Scan paper order"}
          </button>
          <button
            onClick={() => { setEditingOrder(null); setPrefill(null); setShowForm(true); }}
            style={{ flex: 1, background: "#E8748A", color: "#fff", border: "none", borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontWeight: 600, fontSize: 14, boxShadow: "0 2px 4px rgba(0,0,0,0.15)" }}
          >
            <Plus size={17} /> New
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileSelected} style={{ display: "none" }} />
        </div>

        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
          {["Active", "All", ...STAGES].map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={{ whiteSpace: "nowrap", border: "none", borderRadius: 999, padding: "6px 13px", fontSize: 13, fontWeight: 600, background: filter === f ? "#3E2723" : "#fff", color: filter === f ? "#FBF4E8" : "#3E2723" }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="corkboard" style={{ padding: "10px 16px 100px", display: "flex", flexDirection: "column", gap: 16 }}>
        {loading && <div style={{ textAlign: "center", color: "#8B8098", padding: 30 }}>Loading orders…</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", color: "#8B8098", padding: "40px 10px", fontSize: 14 }}>No orders here yet. Scan a paper form or tap "New".</div>
        )}
        {filtered.map((order) => {
          const urgency = urgencyLabel(order.pickupDate, order.status);
          const st = STATUS_STYLE[order.status] || STATUS_STYLE["Layer 1"];
          return (
            <div key={order.id} style={{ borderRadius: 14, overflow: "hidden", boxShadow: "0 3px 8px rgba(62,39,35,0.15)" }}>
              <div style={{ background: "#FBF4E8" }}><TicketEdge /></div>
              <div style={{ background: "#FBF4E8", padding: "12px 16px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div className="fredoka" style={{ fontSize: 17, fontWeight: 600 }}>{order.customerName || "Unnamed order"}</div>
                    <div style={{ fontSize: 13.5, marginTop: 2, color: "#5C4A44" }}>
                      {order.size ? `${order.size} · ` : ""}{order.flavorTop || "?"}{order.center ? ` w/ ${order.center}` : ""}{order.flavorBottom ? ` + ${order.flavorBottom}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <span style={{ background: st.bg, color: st.text, fontSize: 11.5, fontWeight: 700, padding: "4px 9px", borderRadius: 999, whiteSpace: "nowrap", textAlign: "right" }}>{st.label}</span>
                    <div style={{ background: urgency.color, color: "#fff", borderRadius: 8, padding: "4px 9px", textAlign: "center", minWidth: 74 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.1 }}>
                        {order.pickupDate ? `${dayOfWeek(order.pickupDate)} ${order.pickupDate.slice(5)}` : "No date"}
                      </div>
                      {order.pickupTime && <div style={{ fontSize: 10.5, opacity: 0.9 }}>{order.pickupTime}</div>}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 12.5, color: "#5C4A44", flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 700, color: urgency.color, display: "flex", alignItems: "center", gap: 4 }}>
                    {urgency.color === "#C0392B" && <CircleAlert size={13} />}
                    {urgency.text}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {order.price && <span className="chip">${order.price}</span>}
                  <span className="chip" style={order.paid ? { background: "#DCEFE6", color: "#1F6B4A", borderColor: "#B7DCC9" } : {}}>{order.paid ? "Paid" : "Not paid"}</span>
                  {order.gelColor && <span className="chip">Gel: {order.gelColor}</span>}
                  {order.hasImageRef && <span className="chip">Has ref image</span>}
                  {order.takenBy && <span className="chip">Taken by {order.takenBy}</span>}
                </div>

                {order.message && <div style={{ marginTop: 8, fontSize: 12.5, color: "#8B7A72", fontStyle: "italic" }}>"{order.message}"</div>}
                {order.phone && <div style={{ marginTop: 4, fontSize: 12.5, color: "#8B7A72" }}>{order.phone}</div>}

                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
                  {order.status === "Layer 1" && (
                    <button onClick={() => setStage(order, "Layer 2")} style={{ fontSize: 12.5, fontWeight: 700, background: "#3E2723", color: "#FBF4E8", border: "none", borderRadius: 8, padding: "6px 12px", display: "flex", alignItems: "center", gap: 4 }}>
                      Layer 1 done, start Layer 2 <ChevronRight size={13} />
                    </button>
                  )}
                  {order.status === "Layer 2" && (
                    <button onClick={() => setStage(order, "Ready for Buttercream")} style={{ fontSize: 12.5, fontWeight: 700, background: "#3E2723", color: "#FBF4E8", border: "none", borderRadius: 8, padding: "6px 12px", display: "flex", alignItems: "center", gap: 4 }}>
                      Layer 2 done <ChevronRight size={13} />
                    </button>
                  )}
                  {order.status === "Ready for Buttercream" && (
                    <button onClick={() => setStage(order, "Ready for Pickup")} style={{ fontSize: 12.5, fontWeight: 700, background: "#3E2723", color: "#FBF4E8", border: "none", borderRadius: 8, padding: "6px 12px", display: "flex", alignItems: "center", gap: 4 }}>
                      Mark ready for pickup <ChevronRight size={13} />
                    </button>
                  )}
                  {order.status === "Ready for Pickup" && (
                    <button onClick={() => setStage(order, "Picked Up")} style={{ fontSize: 12.5, fontWeight: 700, background: "#3E2723", color: "#FBF4E8", border: "none", borderRadius: 8, padding: "6px 12px", display: "flex", alignItems: "center", gap: 4 }}>
                      Mark picked up <ChevronRight size={13} />
                    </button>
                  )}
                  <button onClick={() => { setEditingOrder(order); setPrefill(null); setShowForm(true); }} style={{ fontSize: 12.5, fontWeight: 600, background: "transparent", color: "#5C4A44", border: "1px solid transparent", borderRadius: 8, padding: "6px 10px" }}>
                    Edit
                  </button>
                </div>
              </div>
              <div style={{ background: "#FBF4E8" }}><TicketEdge flip /></div>
            </div>
          );
        })}
      </div>

      {showForm && (
        <OrderForm
          initial={editingOrder}
          prefill={prefill}
          onClose={() => { setShowForm(false); setPrefill(null); }}
          onSave={async (order) => {
            if (editingOrder) await handleUpdate(editingOrder, order);
            else await handleCreate(order);
            setShowForm(false);
            setPrefill(null);
          }}
        />
      )}
    </div>
  );
}

function OrderForm({ initial, prefill, onClose, onSave }) {
  const src = initial || prefill || {};
  const [customerName, setCustomerName] = useState(src.customerName || "");
  const [phone, setPhone] = useState(src.phone || "");
  const [size, setSize] = useState(src.size || "");
  const [price, setPrice] = useState(src.price || "");
  const [paid, setPaid] = useState(!!src.paid);
  const [pickupDate, setPickupDate] = useState(src.pickupDate || "");
  const [pickupTime, setPickupTime] = useState(src.pickupTime || "");
  const [takenBy, setTakenBy] = useState(src.takenBy || "");
  const [flavorTop, setFlavorTop] = useState(src.flavorTop || "");
  const [center, setCenter] = useState(src.center || "");
  const [flavorBottom, setFlavorBottom] = useState(src.flavorBottom || "");
  const [message, setMessage] = useState(src.message || "");
  const [gelColor, setGelColor] = useState(src.gelColor || "");
  const [hasImageRef, setHasImageRef] = useState(!!src.hasImageRef);
  const [saving, setSaving] = useState(false);

  const canSave = customerName.trim() && pickupDate;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    const order = {
      customerName: customerName.trim(),
      phone: phone.trim(),
      size: size.trim(),
      price: price.trim(),
      paid,
      pickupDate,
      pickupTime,
      takenBy: takenBy.trim(),
      flavorTop: flavorTop.trim(),
      center: center.trim(),
      flavorBottom: flavorBottom.trim(),
      message: message.trim(),
      gelColor: gelColor.trim(),
      hasImageRef,
      status: initial?.status || "Layer 1",
    };
    await onSave(order);
    setSaving(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(62,39,35,0.5)", display: "flex", alignItems: "flex-end", zIndex: 20 }}>
      <div style={{ background: "#FBF4E8", width: "100%", maxHeight: "90vh", overflowY: "auto", borderRadius: "18px 18px 0 0", padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div className="fredoka" style={{ fontSize: 18, fontWeight: 600, color: "#3E2723" }}>{initial ? "Edit order" : "New cake order"}</div>
          <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none" }}><X size={20} color="#3E2723" /></button>
        </div>
        {prefill && !initial && (
          <div style={{ fontSize: 12.5, color: "#2E7D5B", marginBottom: 12, fontWeight: 600 }}>Scanned from photo — check everything before saving.</div>
        )}

        <Field label="Customer name"><input style={inputStyle} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="e.g. Jenna Ortiz" /></Field>
        <Field label="Phone"><input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 555-201-3344" /></Field>

        <div style={{ display: "flex", gap: 10 }}>
          <Field label="Size" style={{ flex: 1 }}><input style={inputStyle} value={size} onChange={(e) => setSize(e.target.value)} placeholder='e.g. 8"' /></Field>
          <Field label="Price" style={{ flex: 1 }}><input style={inputStyle} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 45" /></Field>
          <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 10 }}>
            <label className="layerbox"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Paid</label>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <Field label="Pickup date" style={{ flex: 1 }}><input type="date" style={inputStyle} value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} /></Field>
          <Field label="Pickup time" style={{ flex: 1 }}><input type="time" style={inputStyle} value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} /></Field>
        </div>
        <Field label="Taken by"><input style={inputStyle} value={takenBy} onChange={(e) => setTakenBy(e.target.value)} placeholder="Your name" /></Field>

        <Field label="Layer 1 flavor"><input style={inputStyle} value={flavorTop} onChange={(e) => setFlavorTop(e.target.value)} placeholder="e.g. Chocolate" /></Field>
        <Field label="Center / filling"><input style={inputStyle} value={center} onChange={(e) => setCenter(e.target.value)} placeholder="e.g. Raspberry jam" /></Field>
        <Field label="Layer 2 flavor"><input style={inputStyle} value={flavorBottom} onChange={(e) => setFlavorBottom(e.target.value)} placeholder="e.g. Vanilla" /></Field>

        <Field label="Message on cake"><input style={inputStyle} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Happy Birthday Mia!" /></Field>

        <Field label="Gel color"><input style={inputStyle} value={gelColor} onChange={(e) => setGelColor(e.target.value)} placeholder="e.g. Pink" /></Field>

        <label className="layerbox" style={{ marginBottom: 14 }}>
          <input type="checkbox" checked={hasImageRef} onChange={(e) => setHasImageRef(e.target.checked)} /> Customer provided a reference image
        </label>

        <button onClick={handleSave} disabled={!canSave || saving} style={{ width: "100%", marginTop: 4, background: canSave ? "#E8748A" : "#D8CFC7", color: "#fff", border: "none", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 15 }}>
          {saving ? "Saving…" : initial ? "Save changes" : "Add order"}
        </button>
        {!canSave && <div style={{ fontSize: 12, color: "#8B7A72", marginTop: 6, textAlign: "center" }}>Customer name and pickup date are required.</div>}
      </div>
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <div style={{ marginBottom: 12, ...style }}>
      <label style={{ fontSize: 12.5, fontWeight: 600, color: "#5C4A44", display: "block", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = { width: "100%", padding: "10px 11px", borderRadius: 9, border: "1px solid #E3D3B4", fontSize: 14, fontFamily: "inherit", background: "#fff", boxSizing: "border-box", color: "#3E2723" };
