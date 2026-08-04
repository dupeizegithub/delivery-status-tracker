import { Fragment, useEffect, useState } from "react";
import { fetchShipments, fetchStatusEvents, updateStatus } from "./api.js";

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
  const [expandedRef, setExpandedRef] = useState(null);
  const [historyByRef, setHistoryByRef] = useState({});
  const [historyBusy, setHistoryBusy] = useState(null);

  useEffect(() => {
    fetchShipments().then(setShipments).catch((e) => setError(e.message));
  }, []);

  async function loadHistory(reference, { clearError = false } = {}) {
    setHistoryBusy(reference);
    // Do not clear by default: the 409 failure path calls this after
    // setError(...), and wiping the banner here would hide the conflict.
    if (clearError) setError(null);
    try {
      const events = await fetchStatusEvents(reference);
      setHistoryByRef((prev) => ({ ...prev, [reference]: events }));
    } catch (e) {
      setError(e.message);
    } finally {
      setHistoryBusy(null);
    }
  }

  async function toggleHistory(reference) {
    if (expandedRef === reference) {
      setExpandedRef(null);
      return;
    }
    setExpandedRef(reference);
    if (!historyByRef[reference]) {
      await loadHistory(reference, { clearError: true });
    }
  }

  async function handleUpdate(reference, status) {
    setBusyRef(reference);
    setError(null);
    try {
      const updated = await updateStatus(reference, status);
      setShipments((rows) =>
        rows.map((r) => (r.reference === reference ? updated : r))
      );
      if (expandedRef === reference || historyByRef[reference]) {
        await loadHistory(reference);
      }
    } catch (e) {
      setError(e.message);
      try {
        setShipments(await fetchShipments());
      } catch {
        // Keep the error banner; a failed refetch is secondary.
      }
      // Keep an open/cached history panel aligned after concurrent 409s.
      if (expandedRef === reference || historyByRef[reference]) {
        try {
          await loadHistory(reference);
        } catch {
          // Banner already shows the primary error.
        }
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
                <Fragment key={s.reference}>
                  <tr>
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
                      <button
                        className="btn btn-ghost"
                        disabled={historyBusy === s.reference}
                        onClick={() => toggleHistory(s.reference)}
                      >
                        {expandedRef === s.reference ? "Hide history" : "History"}
                      </button>
                      {s.allowed_next.length === 0
                        ? null
                        : s.allowed_next.map((next) => (
                            <button
                              key={next}
                              className={`btn ${next === "failed" ? "btn-danger" : "btn-primary"}`}
                              disabled={busyRef === s.reference}
                              onClick={() => handleUpdate(s.reference, next)}
                            >
                              {STATUS_LABELS[next]}
                            </button>
                          ))}
                    </td>
                  </tr>
                  {expandedRef === s.reference && (
                    <tr className="history-row">
                      <td colSpan={5}>
                        {historyBusy === s.reference &&
                        !historyByRef[s.reference] ? (
                          <p className="muted">Loading history…</p>
                        ) : (historyByRef[s.reference] || []).length === 0 ? (
                          <p className="muted">No history yet.</p>
                        ) : (
                          <ol className="history-list">
                            {historyByRef[s.reference].map((ev, i) => (
                              <li key={`${ev.occurred_at}-${i}`}>
                                <span className="history-step">
                                  {ev.from_status
                                    ? `${STATUS_LABELS[ev.from_status]} → ${STATUS_LABELS[ev.to_status]}`
                                    : `Entered as ${STATUS_LABELS[ev.to_status]}`}
                                </span>
                                <span className="muted">
                                  {new Date(ev.occurred_at).toLocaleString()}
                                </span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
