const GAME_DATA_BASE = process.env.GAME_DATA_URL || "http://game-data.local";

/** Fetch data from the game data server */
export async function fetchGameData(path: string): Promise<{
  data: unknown;
  success: boolean;
  error?: string;
}> {
  try {
    const url = `${GAME_DATA_BASE}${path.startsWith("/") ? path : `/${path}`}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });

    if (!response.ok) {
      return { data: null, success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("json")
      ? await response.json()
      : await response.text();

    return { data, success: true };
  } catch (err: any) {
    return { data: null, success: false, error: err.message };
  }
}

/** Fetch the current task board */
export async function fetchTasks(): Promise<unknown[]> {
  const result = await fetchGameData("/tasks");
  return (result.success && Array.isArray(result.data)) ? result.data : [];
}

/** Fetch market data feed */
export async function fetchMarketData(): Promise<unknown> {
  const result = await fetchGameData("/market-feed");
  return result.success ? result.data : null;
}
