import { useEffect, useState } from "react";
import { fetchShipments, updateStatus } from "./api.js";

const STATUS_LABELS = {
  created: "Created",
  picked_up: "Picked up",
  in_transit: "In transit",
  delivered: "Delivered",
  failed: "Failed",
};

const FILTERS = ["all", "created", "picked_up", "in_transit", "delivered", "failed"];

export default function App() {
  const [shipments, setShipments] = useState(null);
  const [error, setError] = useState(null);
  const [busyRef, setBusyRef] = useState(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetchShipments().then(setShipments).catch((e) => setError(e.message));
  }, []);

  async function handleUpdate(reference, status) {
    setBusyRef(reference);
    setError(null);
    try {
      const updated = await updateStatus(reference, status);
      // Swap the one changed row in place — no reload, no full refetch.
      setShipments((rows) =>
        rows.map((r) => (r.reference === reference ? updated : r))
      );
    } catch (e) {
      setError(e.message);
      // On conflict/errors, resync from the server so the table matches the
      // DB without a full page reload (covers concurrent 409s).
      try {
        setShipments(await fetchShipments());
      } catch {
        // Keep the error banner; a failed refetch is secondary.
      }
    } finally {
      setBusyRef(null);
    }
  }

  return (
    <main className="page">
      <header className="header">
        <h1>Delivery Status Tracker</h1>
        <p className="subtitle">
          {shipments ? `${shipments.length} shipments` : "Loading…"}
        </p>
      </header>

      {error && (
        <div className="banner" role="alert">
          {error}
          <button className="banner-close" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}

      {shipments && (
        <nav className="filters">
          {FILTERS.map((f) => {
            const count =
              f === "all"
                ? shipments.length
                : shipments.filter((s) => s.status === f).length;
            return (
              <button
                key={f}
                className={`chip ${filter === f ? "chip-active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "All" : STATUS_LABELS[f]}
                <span className="chip-count">{count}</span>
              </button>
            );
          })}
        </nav>
      )}

      {shipments && (
        <table className="shipments">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Last updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shipments
              .filter((s) => filter === "all" || s.status === filter)
              .map((s) => (
              <tr key={s.reference}>
                <td className="ref">{s.reference}</td>
                <td>{s.customer_name}</td>
                <td>
                  <span className={`badge badge-${s.status}`}>
                    {STATUS_LABELS[s.status]}
                  </span>
                </td>
                <td className="muted">
                  {new Date(s.updated_at).toLocaleString()}
                </td>
                <td className="actions">
                  {s.allowed_next.length === 0 ? (
                    <span className="muted">—</span>
                  ) : (
                    s.allowed_next.map((next) => (
                      <button
                        key={next}
                        className={`btn ${next === "failed" ? "btn-danger" : "btn-primary"}`}
                        disabled={busyRef === s.reference}
                        onClick={() => handleUpdate(s.reference, next)}
                      >
                        {STATUS_LABELS[next]}
                      </button>
                    ))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
