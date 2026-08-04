async function parseOrThrow(resp) {
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(body.detail || `Request failed (${resp.status})`);
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
