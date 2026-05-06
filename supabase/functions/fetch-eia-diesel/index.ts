// =============================================================================
// fetch-eia-diesel — Supabase Edge Function (PLD Phase 2c)
// =============================================================================
// Fetches the US national-average on-highway diesel price from the EIA public
// API and upserts each weekly row into public.diesel_price_history.
//
// Trigger sources:
//   - pg_cron weekly schedule (Mondays 11:00 UTC = 7 AM ET) — see migration
//     v1.10.0-015 for the cron.schedule() call.
//   - Manual invocation from the Alamo "Reference Data → Diesel Prices" page
//     (Phase 2b admin UI) for ad-hoc back-fills.
//   - Manual curl during testing.
//
// Behavior:
//   - Pulls the last ~60 days of weekly observations from EIA (covers a few
//     extra weeks past the previous run for safety).
//   - Upserts each row keyed on effective_week_start. The table has a UNIQUE
//     constraint on that column, so duplicates are no-ops; new weeks insert.
//   - Returns a JSON summary: { fetched_count, upserted_count, weeks: [...] }.
//   - On error, returns 500 with { error, detail } so cron logs surface the
//     failure clearly.
//
// Environment variables required:
//   EIA_API_KEY              — register free at https://www.eia.gov/opendata/
//   SUPABASE_URL             — auto-injected by Supabase runtime
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase runtime
//
// EIA series:
//   product=EPD2D  → No. 2 Diesel Retail Sales (sulfur diesel, on-highway)
//   duoarea=NUS    → US National
//   frequency=weekly
//
// Schema reminder (public.diesel_price_history columns we write):
//   effective_week_start DATE   — period start, primary key for UNIQUE
//   effective_week_end   DATE   — period start + 6 days
//   national_avg_price   NUMERIC — $/gallon, EIA "value" field
//   source               TEXT   — defaults 'EIA' (let DB default fire)
//   source_url           TEXT   — EIA dashboard URL for human reference
//   notes                TEXT   — auto-fetch tag with run timestamp
// =============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

interface EiaRow {
  period: string;       // ISO date "YYYY-MM-DD"
  value: number | string;
}

interface EiaResponse {
  response?: {
    data?: EiaRow[];
  };
}

interface UpsertRow {
  effective_week_start: string;
  effective_week_end: string;
  national_avg_price: number;
  source_url: string;
  notes: string;
}

const EIA_DASHBOARD_URL = "https://www.eia.gov/petroleum/gasdiesel/";

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function lookbackStartIso(daysBack: number): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() - daysBack);
  return now.toISOString().slice(0, 10);
}

Deno.serve(async (_req: Request) => {
  const eiaApiKey = Deno.env.get("EIA_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!eiaApiKey) {
    return new Response(
      JSON.stringify({
        error: "EIA_API_KEY_MISSING",
        detail: "Set the EIA_API_KEY secret on this Supabase project before invoking. Register at https://www.eia.gov/opendata/.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({
        error: "SUPABASE_RUNTIME_VARS_MISSING",
        detail: "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY should be auto-injected by the Supabase runtime.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  // Pull the last 60 days of weekly observations. EIA returns ~8-9 rows for
  // that window; it covers gaps from prior runs without being wasteful.
  const startIso = lookbackStartIso(60);

  const eiaUrl = new URL("https://api.eia.gov/v2/petroleum/pri/gnd/data/");
  eiaUrl.searchParams.set("api_key", eiaApiKey);
  eiaUrl.searchParams.set("frequency", "weekly");
  eiaUrl.searchParams.append("data[0]", "value");
  eiaUrl.searchParams.append("facets[product][]", "EPD2D");
  eiaUrl.searchParams.append("facets[duoarea][]", "NUS");
  eiaUrl.searchParams.set("start", startIso);
  eiaUrl.searchParams.append("sort[0][column]", "period");
  eiaUrl.searchParams.append("sort[0][direction]", "desc");
  eiaUrl.searchParams.set("offset", "0");
  eiaUrl.searchParams.set("length", "20");

  let eiaJson: EiaResponse;
  try {
    const res = await fetch(eiaUrl.toString());
    if (!res.ok) {
      const body = await res.text();
      return new Response(
        JSON.stringify({
          error: "EIA_HTTP_ERROR",
          status: res.status,
          detail: body.slice(0, 500),
        }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }
    eiaJson = await res.json();
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "EIA_FETCH_FAILED",
        detail: err instanceof Error ? err.message : String(err),
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  const rows = eiaJson.response?.data ?? [];
  if (rows.length === 0) {
    return new Response(
      JSON.stringify({
        error: "EIA_EMPTY_RESPONSE",
        detail: "EIA returned no rows for the requested window. Check API key validity and series codes.",
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  const fetchedAt = new Date().toISOString();
  const upsertRows: UpsertRow[] = rows.map((r) => ({
    effective_week_start: r.period,
    effective_week_end: addDaysIso(r.period, 6),
    national_avg_price: typeof r.value === "string" ? parseFloat(r.value) : r.value,
    source_url: EIA_DASHBOARD_URL,
    notes: `Auto-fetched ${fetchedAt} via fetch-eia-diesel`,
  }));

  // Upsert. The table has UNIQUE(effective_week_start), so existing weeks
  // become no-ops (ignoreDuplicates=true). We don't overwrite a manually
  // entered week, which is the right policy — manual entries are typically
  // corrections.
  const { data, error } = await supabase
    .from("diesel_price_history")
    .upsert(upsertRows, {
      onConflict: "effective_week_start",
      ignoreDuplicates: true,
    })
    .select("effective_week_start");

  if (error) {
    return new Response(
      JSON.stringify({
        error: "DB_UPSERT_FAILED",
        detail: error.message,
        rows_attempted: upsertRows.length,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      fetched_count: upsertRows.length,
      upserted_count: data?.length ?? 0,
      lookback_start: startIso,
      weeks: upsertRows.map((r) => ({
        week: r.effective_week_start,
        price: r.national_avg_price,
      })),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
