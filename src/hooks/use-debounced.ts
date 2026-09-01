import { useEffect, useState } from "react";

/**
 * Debounce a fast-changing value (typically a search box) so the database is
 * queried once the person stops typing rather than on every keystroke.
 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
