# Mise — Branch Operations UI

A branch-admin **inventory management dashboard** with the **[Persona](https://github.com/runtypelabs/persona)**
chat widget embedded for live projection analysis.

> **Live (hosted on InsForge):** https://k3trn3a2.insforge.site — the Persona chat is fully
> functional there (real HTTPS origin). Redeploy with `npx @insforge/cli deployments deploy web`.

- **File:** [index.html](index.html) — single self-contained page, no build step.
- **What it shows (per branch — Downtown / Marina / Mission):**
  - Inventory detail: on-hand vs par vs reorder, unit, and a status badge (SHORT / LOW / OK /
    SURPLUS) plus a NEAR-EXPIRY flag.
  - **Projection analysis:** days-of-cover = on-hand ÷ forecast daily burn, where daily burn =
    Σ over menu items using the ingredient of `(predicted_7d_qty / 7) × qty_per_serving`. Bars
    mark the 7-day horizon; waste-risk is flagged when near-expiry stock won't be consumed before
    it spoils.
  - Reorder-to-par suggestions with the cheapest supplier.
  - KPI strip (short / low / stock-out < 7d / surplus / waste-risk).
- **Chat:** the floating "Inventory Admin" launcher is the Persona widget wired to the Runtype
  `Inventory Admin` agent (`agent_01kxvyhr7deh585q7x2bprv2gk`) via a browser-safe client token.
  Ask it things like *"what runs out first at Marina?"* or *"reorder plan for Downtown"* and it
  answers from the live records.

The dashboard's numbers mirror the agent's own logic and the seeded demo state, so the visual view
and the chat agree (Downtown tomatoes ~0.3d cover / short; Marina tomato surplus and Mission basil
surplus both flagged waste-risk — the same signals that drive the rebalance transfer and the
"Pesto Night" promotion).

## Running it

The **dashboard renders fully offline** (data + projections are computed client-side). For the
**Persona chat** to connect, serve the page over HTTP so the browser sends a real origin (a
`file://` page sends a null origin the token can't match):

```bash
cd web && python3 -m http.server 8080
# open http://localhost:8080/
```

Or deploy it anywhere (the embedded client token is all-origins for the demo). It is hosted on
InsForge via `npx @insforge/cli deployments deploy web` — see [../INSFORGE.md](../INSFORGE.md).

## Notes

- The embedded `data-runtype-token` is a **browser-safe client token** (not the admin API key) —
  scoped to the Inventory Admin agent, rate-limited, and safe to ship in a public page. For
  production, mint a new token with `allowedOrigins` scoped to your real domain(s) instead of `*`.
- Persona is loaded from Runtype's CDN (`cdn.runtype.com/persona/latest/install.global.js`) per the
  official embed contract.
- Data source today is the seeded snapshot embedded in the page (kept in sync with Runtype records
  and the InsForge `db/` schema). To go fully live, swap the embedded objects for fetches against
  InsForge (tables are provisioned — see [../INSFORGE.md](../INSFORGE.md)) or a Runtype read flow.
