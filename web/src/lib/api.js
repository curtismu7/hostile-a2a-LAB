// Thin fetch wrappers for the demo API. Copied from hostile-mcp (web/src/lib/api.js) and adapted for the card endpoints.
async function request(path, init) {
  const r = await fetch(path, init);
  if (!r.ok) {
    let message = `HTTP ${r.status}`;
    try { message = (await r.json()).message || message; } catch { /* keep the status */ }
    throw new Error(message);
  }
  return r.status === 204 ? null : r.json();
}
const post = (path, body = {}) => request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const getCatalog = () => request("/api/catalog");
export const getInfo = () => request("/api/info");
export const setMode = (source) => post("/api/mode", { source });
export const runVictim = ({ task, mode, stage, variant, requireSignatures }) => post("/api/run-victim", { task, mode, stage, variant, ...(requireSignatures ? { requireSignatures: true } : {}) });
export const newSession = (variant, requireSignatures) => post("/api/card-session/new", { variant, ...(requireSignatures ? { requireSignatures: true } : {}) });
export const approve = (id) => post(`/api/card-session/${id}/approve`);
export const compare = (id) => post(`/api/card-session/${id}/compare`);
export const endSession = (id) => request(`/api/card-session/${id}`, { method: "DELETE" }).catch(() => {});
export const resetSessions = () => post("/api/reset");
