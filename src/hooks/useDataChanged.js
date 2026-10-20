import { useEffect, useRef } from "react";

export const DATA_CHANGED_EVENT = "civil-registry:data-changed";

// Gitawag sa GlobalRealtime kung naay change sa database table.
export function emitDataChanged(table) {
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { table } }));
}

/**
 * Nagtawag og onChange() kung naay change sa bisan asang table sa `tables`.
 * - Debounce: daghang sunod-sunod nga change, usa ra ka tawag.
 */
export function useDataChanged(onChange, { tables = [], debounceMs = 750 } = {}) {
  const onChangeRef = useRef(onChange);

  // Keep the latest callback without re-subscribing. Written in an effect, not during render.
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // A string key keeps the dependency stable even when the caller passes an inline array.
  const tablesKey = tables.join("|");

  useEffect(() => {
    const watched = tablesKey ? tablesKey.split("|") : [];
    let timer = null;

    const handler = (e) => {
      const table = e.detail?.table;
      if (watched.length && !watched.includes(table)) return;

      clearTimeout(timer);
      timer = setTimeout(() => onChangeRef.current?.(), debounceMs);
    };

    window.addEventListener(DATA_CHANGED_EVENT, handler);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(DATA_CHANGED_EVENT, handler);
    };
  }, [tablesKey, debounceMs]);
}