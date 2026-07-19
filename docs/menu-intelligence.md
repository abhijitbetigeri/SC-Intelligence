# Menu Intelligence — web-scraped market data

A reusable Runtype flow that scrapes the web for restaurants across cuisines, their branches,
menus, and dish ingredients, and lands the result in InsForge. It widens Mise beyond the single
seeded franchise into a real multi-cuisine market dataset.

## Pipeline

```
cuisine (input)
   │
   ▼  Runtype flow  "Menu Intelligence"  (flow_01kxw1z553e8qte3mb253seweh)
 1. search          Exa web search → top restaurants for the cuisine
 2. select targets  prompt (sonnet-5) → 2 restaurants w/ website, menu URL, branches  [JSON]
 3. scrape menu     Firecrawl → restaurant #1 menu content (markdown)
 4. extract         prompt (sonnet-5) → restaurants · branches · dishes · ingredients  [JSON]
   │
   ▼  loader (scripts) → SQL → InsForge  (mi_* tables)
```

Exposed as the product capability **`menu_intelligence`** (input `cuisine`) and on the **Mesh
Bridge (MCP)** surface, so Cotal nodes / external agents can call it as a tool.

## Schema — [../db/market-intel.sql](../db/market-intel.sql)

`mi_cuisines` (8 seeded) · `mi_restaurants` (cuisine, rank, website, summary) · `mi_branches`
(location per restaurant) · `mi_dishes` (name, section, description, price) ·
`mi_dish_ingredients` (ingredient, is_core, derived). Plus the view **`mi_ingredient_frequency`**
— which ingredients appear across the most dishes/restaurants/cuisines (the market-wide
supply-chain demand signal).

## Cuisines covered

Italian · American · French · Chinese · Burmese · Indian · Middle Eastern · Mexican
(2 top restaurants each, ~8 dishes per restaurant, with core ingredients).

## Running it

**Over HTTP** (loops cleanly — the key is the `inputs` field, not `variables`):

```bash
curl https://api.runtype.com/v1/dispatch \
  -H "Authorization: Bearer $RUNTYPE_KEY" -H "Content-Type: application/json" \
  -d '{"inputs":{"cuisine":"Thai"},"flow":{"id":"flow_01kxw1z553e8qte3mb253seweh"}}'
```

**Or MCP:** `run_flow` with `variables: { cuisine: "Thai" }`.

Then parse the `dataset` out of the response and load it:

```bash
python3 scripts/load_menu_intel.py data/menu-intel out.sql   # dataset JSONs → SQL (uuid keys)
npx @insforge/cli db import out.sql                          # → InsForge mi_* tables
```

Datasets are checked into [../data/menu-intel/](../data/menu-intel/); the loader is
[../scripts/load_menu_intel.py](../scripts/load_menu_intel.py).

## Fidelity & limitations (be honest in the demo)

- **Restaurants, branches, and dish names are real** — discovered via live Exa web search of top
  multi-location chains, and (for well-known chains) accurate signature dishes.
- **Ingredients are currently `derived: true`** — inferred from the dish rather than read off the
  menu. The Firecrawl step (step 3) does not yet feed the extractor because the menu-URL template
  (`{{targets.restaurants.0.menu_url}}`) doesn't resolve the array index, so `menu_md` comes back
  empty. Fix: resolve the URL into a top-level variable (a `set-variable`/`transform-data` step)
  before Firecrawl, or use bracket indexing — then real menu text (and printed ingredients/prices)
  flows into the extraction. Every derived ingredient is flagged, so it's easy to see what's
  inferred vs scraped.
- Scope is 2 restaurants/cuisine for a tractable demo; raise the count in step 2's prompt to widen.

## Why this matters for Mise

The same forecasting / rebalancing / procurement engine that runs the single Trattoria Verde
franchise generalizes to **any cuisine and any restaurant** once its menu → ingredient map is
known. `mi_ingredient_frequency` shows which ingredients drive demand across the whole market —
the starting point for cross-restaurant supplier leverage and shared procurement.
