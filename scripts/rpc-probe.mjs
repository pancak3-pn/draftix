// Reproduce the browser request with full browser headers.
const url = "https://esyhxbtxyblhyphhgybs.supabase.co/rest/v1/rpc/draftix_admin_stats";
const key = "sb_publishable_gW0qb_sViypwxDi3qScwiQ_pbji_-19";

async function probe(label, headers) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}`, ...headers },
    body: JSON.stringify({ p_token: "probe" }),
  });
  const body = await res.text();
  console.log(`[${label}] status=${res.status} body=${body.slice(0, 300)}`);
  for (const h of ["x-kong-proxy-latency", "server", "sb-gateway-version", "content-type"]) {
    const v = res.headers.get(h);
    if (v) console.log(`   ${h}: ${v}`);
  }
}

await probe("plain", {});
await probe("browser-headers", {
  Origin: "http://127.0.0.1:5173",
  Referer: "http://127.0.0.1:5173/",
  Accept: "*/*",
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "cross-site",
  "accept-language": "en-US,en;q=0.9",
  "x-client-info": "supabase-js-web/2.112.4",
});
