import { useCallback, useEffect, useState } from 'react';

// Fetch a view's data, exposing { data, loading, error, reload }. Views that mutate (a
// reorder, an approval) call reload() so the board reflects the new record immediately —
// the server is the source of truth, never local optimistic state.
export function useApiData(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const run = useCallback(() => {
    let on = true;
    setLoading(true);
    Promise.resolve()
      .then(fetcher)
      .then((d) => { if (on) { setData(d); setError(null); } })
      .catch((e) => { if (on) setError(e.message || String(e)); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(run, [run]);
  return { data, loading, error, reload: run };
}
