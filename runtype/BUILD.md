# Mise — live Runtype build

This is the **as-built** record of the Runtype product (the specs live in
[agents.md](agents.md)). Everything below is deployed and smoke-tested on the account
`abhijitbetigeri29@gmail.com` (org `org_3Gh0WINGvbGW2609id6p5MXs3JP`).

> **Data backing:** the build uses **Runtype's native record store** (`{id, type, name,
> metadata}`) rather than InsForge — self-contained, so the demo has no external-service
> dependency. InsForge remains the intended production backend; swapping it in means
> re-pointing the record reads/writes at InsForge-backed tools.

## Resources

| Kind | Name | ID |
|------|------|----|
| Product | Mise | `prod_01kxvr3fcneskr35jfxqhekaj0` |
| Flow | Weekly Demand Forecast | `flow_01kxvr4cjsf6f941tg3n2mbnrb` |
| Flow | Promotion Sweep | `flow_01kxvr4d4ffakvvfxgpmrp1ajn` |
| Agent (opus-4-8) | Supply Chain Coordinator | `agent_01kxvr56tbfakvvfxthdht0js4` |
| Agent (sonnet-5) | Consumer Concierge | `agent_01kxvr5785e4d8tfpemr6tgf21` |
| Surface (chat) | Owner Console → Coordinator | `surf_01kxvr964ye4d8tfpy1yj8ksjy` |
| Surface (chat) | Diner Chat → Concierge | `surf_01kxvr96dzenc9yg72ymvhn8xm` |

Dashboard: https://use.runtype.com/products/prod_01kxvr3fcneskr35jfxqhekaj0

## Capabilities (all verified)

1. **weekly_forecast** (flow) — reads every `branch-state` + `catalog`, forecasts next-7-day
   servings per menu item per branch with a confidence, writes `forecast/latest`.
2. **rebalance_and_procure** (agent, the showpiece) — reads state, matches surplus↔shortage
   across branches (nearest branch / nearest expiry first), covers the rest at least cost from
   suppliers, persists `transfer` + `po` records, and returns one owner approval card.
3. **promotion_sweep** (flow) — finds genuine surplus / near-expiry stock (never low stock),
   features the menu item that clears it fastest, writes `promotion/latest`.
4. **consumer_concierge** (agent) — answers "is my dish available tonight?" from live inventory
   × BOM × forecast confidence; leads with a known diner's favorites; surfaces active specials.

## Record types (the data model)

- `catalog/trattoria-verde` — branches (lat/lon), products (shelf_life), menu items + BOM, suppliers + prices.
- `branch-state/{downtown,marina,mission}` — inventory rows (on_hand, par, reorder, earliest_expiry_days),
  recent `sales_avg_daily`, `weekend_lift`.
- `consumer/alex` — a demo diner with favorites.
- Written by the agents/flows: `forecast/latest`, `promotion/latest`, `transfer/*`, `po/*`.

The seed is rigged so the demo fires on the first run: Downtown is short ~36 kg tomatoes,
Marina holds ~10 kg surplus tomatoes expiring in 2 days, Mission holds ~1.9 kg surplus basil
expiring in 2 days.

## Run it (Runtype MCP tools, or the dashboard)

```
# 1. forecast (writes forecast/latest)
run_flow flow_01kxvr4cjsf6f941tg3n2mbnrb

# 2. the showpiece — rebalance + procurement approval card
execute_agent agent_01kxvr56tbfakvvfxthdht0js4  "Run this week's supply-chain cycle."
#   -> proposes: move 10 TOM-ROMA marina->downtown; buy 26 TOM-ROMA from Bay Foods @ $2.05 = $53.30
#   -> persists transfer/* and po/* records

# 3. promotions (writes promotion/latest)
run_flow flow_01kxvr4d4ffakvvfxgpmrp1ajn
#   -> Marina: Marinara 20% off (tomato surplus); Mission: Pesto Penne 20% off (basil surplus)

# 4. consumer availability
execute_agent agent_01kxvr5785e4d8tfpemr6tgf21  "Hi, I'm Alex. Is my usual available at Downtown tonight?"
```

Both chat surfaces have live client tokens; drop a Persona widget with
`generate_persona_embed_code` to embed the Owner Console / Diner Chat.

## Known gaps

- **Schedules** (weekly forecast + promotion cron) were rejected with `402 Frequency Not
  Allowed` — the account plan doesn't allow cron scheduling. The flows run on demand instead.
- Suppliers are modelled as catalog data, not live bidding agents (the Cotal RFQ/anycast loop
  in [../cotal.yaml](../cotal.yaml) is the future multi-agent layer).
