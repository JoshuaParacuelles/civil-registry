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

// Chainable + awaitable: supports .from().select().eq().order().limit() etc.
const createNoopQuery = () => {
  const query = {};
  [
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
    "order",
    "limit",
    "range",
    "single",
    "maybeSingle",
  ].forEach((method) => {
    query[method] = () => query;
  });

  // Makes `await query` and Promise.all([...]) work.
  query.then = (resolve, reject) => Promise.resolve(failedResult()).then(resolve, reject);
  query.catch = (reject) => Promise.resolve(failedResult()).catch(reject);
  return query;
};

const noopChannel = {
  on() {
    return noopChannel;
  },
  subscribe(callback) {
    // Tell the caller the channel failed so the UI can show "error" status.
    if (typeof callback === "function") callback("CHANNEL_ERROR");
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
      "On Vercel, add both variables under Project Settings > Environment Variables " +
      "and redeploy (Vite reads them at build time)."
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