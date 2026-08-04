function formatDetail(detail) {
  if (detail == null) return null;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && item.msg) {
          const loc = Array.isArray(item.loc) ? item.loc.join(".") : "";
          return loc ? `${loc}: ${item.msg}` : item.msg;
        }
        return JSON.stringify(item);
      })
      .join("; ");
  }
  if (typeof detail === "object") return JSON.stringify(detail);
  return String(detail);
}

async function parseOrThrow(resp) {
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(
      formatDetail(body.detail) || `Request failed (${resp.status})`
    );
  }
  return body;
}

export async function fetchShipments() {
  return parseOrThrow(await fetch("/api/shipments"));
}

export async function updateStatus(reference, status) {
  return parseOrThrow(
    await fetch(`/api/shipments/${encodeURIComponent(reference)}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
  );
}

export async function fetchStatusEvents(reference) {
  return parseOrThrow(
    await fetch(`/api/shipments/${encodeURIComponent(reference)}/events`)
  );
}
