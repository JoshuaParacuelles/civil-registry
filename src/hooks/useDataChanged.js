import { useEffect, useRef } from "react";

export const DATA_CHANGED_EVENT = "civil-registry:data-changed";

// Gitawag sa GlobalRealtime kung naay change sa database table.
export function emitDataChanged(table) {
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { table } }));
}

/**
 * Nagtawag og onChange() kung naay change sa bisan asang table sa `tables`.
 * - `tables` kinahanglan module-level constant (dili inline array) aron stable.
 * - Debounce: daghang sunod-sunod nga change, usa ra ka tawag.
 */
export function useDataChanged(onChange, { tables = [], debounceMs = 750 } = {}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let timer = null;

    const handler = (e) => {
      const table = e.detail?.table;
      if (tables.length && !tables.includes(table)) return;

      clearTimeout(timer);
      timer = setTimeout(() => onChangeRef.current?.(), debounceMs);
    };

    window.addEventListener(DATA_CHANGED_EVENT, handler);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(DATA_CHANGED_EVENT, handler);
    };
  }, [debounceMs]); // eslint-disable-line react-hooks/exhaustive-deps
}