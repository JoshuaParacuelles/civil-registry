import { useEffect } from "react";
import { supabase, isSupabaseConfigured } from "../services/supabaseClient";
import { emitDataChanged } from "../hooks/useDataChanged";

const ALL_TABLES = [
  "birth_records",
  "marriage_records",
  "death_records",
  "birth_payments",
  "marriage_transactions",
  "death_transactions",
];

export default function GlobalRealtime() {
  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;

    const channel = supabase.channel("global-data-changes");

    ALL_TABLES.forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        emitDataChanged(table);
      });
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return null;
}