/** Optional frontend starter helper. Copy this into the frontend if useful. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | T | null;
  if (!response.ok) {
    const apiError = payload && typeof payload === "object" && "error" in payload
      ? (payload as { error?: { message?: string } }).error
      : undefined;
    const message = apiError?.message || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}
