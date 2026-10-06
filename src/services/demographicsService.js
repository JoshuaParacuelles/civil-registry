import { supabase } from "./supabaseClient";

const RESIDENTS_TABLE = "residents";
const ORDER_COLUMN = "resident_id";
const PAGE_SIZE = 1000;

export async function fetchResidents() {
  const rows = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from(RESIDENTS_TABLE)
      .select("*")
      .order(ORDER_COLUMN, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    rows.push(...data);

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}