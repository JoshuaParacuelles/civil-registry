import { createClient } from "@supabase/supabase-js";

// Used ONLY for realtime subscriptions (postgres_changes) in
// document_tracking.jsx, so the UI updates live without a manual
// refresh. All actual reads/writes (list, detail, assign, complete,
// flag, reject, comment, add person) still go through the existing
// Flask API via apiFetch() — this client never calls
// .from(...).select()/.insert()/.update() itself.
//
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are the project URL and
// PUBLIC anon key from Supabase (Project Settings -> API). The anon
// key is safe to ship to the browser — it has no privileges beyond
// what your Row Level Security policies grant it.
//
// REQUIRED for realtime to actually deliver events:
//   1. Realtime replication enabled for: documents, document_stages,
//      document_comments, document_assignments, document_personnel
//      (Supabase dashboard -> Database -> Replication).
//   2. A SELECT policy on each of those tables for the role this key
//      authenticates as (anon or authenticated) — RLS is enforced on
//      realtime events exactly like it is on normal queries. Without
//      a read policy, the subscription connects successfully but no
//      change event will ever arrive, with no error shown anywhere.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// A no-op stand-in used whenever real-time can't be set up (missing
// env vars, a bad URL, createClient() throwing, etc). Every method
// document_tracking.jsx actually calls on `supabase` — .channel(...)
// -> .on(...) -> .subscribe(), and .removeChannel(...) — is covered
// here as a harmless no-op, so the realtime effect simply never fires
// instead of crashing.
//
// THIS IS THE FIX for the blank white page: createClient() throws
// synchronously if the URL is missing/invalid, and that call used to
// run at module-import time — before React even mounts. Because
// document_tracking.jsx imports this module statically, that throw
// took down the ENTIRE app on load (not just Document Tracking),
// which is why the page was white with nothing in it rather than a
// normal in-component error. Wrapping the client creation below means
// a missing/incomplete .env now just disables live updates instead of
// breaking the whole site.
const noopChannel = {
  on() { return noopChannel; },
  subscribe() { return noopChannel; },
};
const noopClient = {
  channel() { return noopChannel; },
  removeChannel() {},
};

let client = noopClient;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "[supabaseClient] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set — " +
    "realtime updates in Document Tracking are disabled. The rest of the app " +
    "is unaffected; all data still loads through the Flask API as normal."
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
      "[supabaseClient] createClient() failed — realtime updates are disabled, " +
      "but the app will continue to work normally otherwise:",
      e
    );
    client = noopClient;
  }
}

export const supabase = client;