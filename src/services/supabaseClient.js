import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ─────────────────────────────────────────────────────────────
// Fallback ("no-op") client
// Used only when the env variables are missing or createClient()
// fails. It mimics the parts of supabase-js the app uses, so the
// app does not crash with "supabase.from is not a function".
// Every query resolves to { data: null, error } so the UI shows a
// normal error state instead of throwing.
// ─────────────────────────────────────────────────────────────
const NOT_CONFIGURED_ERROR = new Error(
  "Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)."
);

const failedResult = () => ({ data: null, error: NOT_CONFIGURED_ERROR });

const CHAINABLE_METHODS = [
  "select",
  "insert",
  "update",
  "upsert",
  "delete",
  "eq",
  "neq",
  "in",
  "is",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "or",
  "not",
  "match",
  "filter",
  "contains",
  "containedBy",
  "textSearch",
  "order",
  "limit",
  "range",
  "single",
  "maybeSingle",
];

// Chainable + awaitable: supports .from().select().eq().order().limit() etc.
const createNoopQuery = () => {
  const query = {};
  CHAINABLE_METHODS.forEach((method) => {
    query[method] = () => query;
  });

  // Makes `await query` and Promise.all([...]) work.
  query.then = (resolve, reject) => Promise.resolve(failedResult()).then(resolve, reject);
  query.catch = (reject) => Promise.resolve(failedResult()).catch(reject);
  return query;
};

// Status is reported asynchronously (queueMicrotask). A synchronous callback
// can run before the caller's own `const` is initialized, which throws
// "Cannot access 'x' before initialization". Deferring avoids that.
const noopChannel = {
  on() {
    return noopChannel;
  },
  subscribe(callback) {
    if (typeof callback === "function") {
      queueMicrotask(() => callback("CHANNEL_ERROR"));
    }
    return noopChannel;
  },
  unsubscribe() {
    return Promise.resolve("ok");
  },
};

const noopClient = {
  from() {
    return createNoopQuery();
  },
  rpc() {
    return Promise.resolve(failedResult());
  },
  channel() {
    return noopChannel;
  },
  removeChannel() {
    return Promise.resolve("ok");
  },
};

// ─────────────────────────────────────────────────────────────
// Real client
// ─────────────────────────────────────────────────────────────
let client = noopClient;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "[supabaseClient] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. " +
      "Supabase features (notifications, realtime updates) are disabled. " +
      "On Render, add both variables to the static site service under Environment " +
      "and run Clear build cache & deploy (Vite reads them at build time)."
  );
} else {
  try {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: {
        params: {
          eventsPerSecond: 5,
        },
      },
    });
  } catch (e) {
    console.error(
      "[supabaseClient] createClient() failed. Supabase features are disabled:",
      e
    );
    client = noopClient;
  }
}

export const supabase = client;
export const isSupabaseConfigured = client !== noopClient;