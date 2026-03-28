/**
 * Lightweight helpers for calling tRPC procedures directly over HTTP.
 *
 * These replace the former IPC-to-tRPC proxy handlers that were removed from
 * the desktop main process.  The backend port is discovered once at boot via
 * the `backend:getPort` IPC handler (a platform primitive that remains).
 */

let _backendPort: number | null = null

export function setBackendPort(port: number): void {
  _backendPort = port
}

function baseUrl(): string {
  if (!_backendPort) {
    throw new Error('Backend port not configured — call setBackendPort() first')
  }
  return `http://localhost:${_backendPort}/api/trpc`
}

/**
 * Call a tRPC query procedure (GET).
 */
export async function trpcQuery<T = unknown>(
  procedure: string,
  input?: unknown,
): Promise<T> {
  let url = `${baseUrl()}/${procedure}`
  if (input !== undefined) {
    url += `?input=${encodeURIComponent(JSON.stringify(input))}`
  }
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`tRPC query ${procedure} failed: HTTP ${res.status}`)
  const json = await res.json()
  return (json?.result?.data?.json ?? json?.result?.data ?? json) as T
}

/**
 * Call a tRPC mutation procedure (POST).
 */
export async function trpcMutate<T = unknown>(
  procedure: string,
  input?: unknown,
): Promise<T> {
  const res = await fetch(`${baseUrl()}/${procedure}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input !== undefined ? { json: input } : {}),
  })
  if (!res.ok) throw new Error(`tRPC mutation ${procedure} failed: HTTP ${res.status}`)
  const json = await res.json()
  return (json?.result?.data?.json ?? json?.result?.data ?? json) as T
}
