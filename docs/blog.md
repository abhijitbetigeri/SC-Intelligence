# Agent Mesh for Zero Waste

### How we built a restaurant supply chain that restocks itself — and won AGI Summit 2026

Somewhere right now, a restaurant is throwing out a case of tomatoes that are about to turn.
Two miles away, another branch of the *same franchise* just 86'd the marinara because it ran out.
Nobody did anything wrong. There's just no one — and nothing — whose job is to notice that the
surplus and the shortage belong to the same company.

That gap is the whole problem. And it's why we built **Mise**.

## Inventory is a distributed system with no shared brain

The instinct is to treat this as a forecasting problem: predict demand better, order better. But the
deeper issue is *structural*. A franchise isn't one mind. It's N branches and M suppliers, each
seeing only its own shelf, each ordering in isolation. So the system simultaneously over-orders in
one place (waste, spoilage, cash tied up) and stocks out in another. The obvious fix — move surplus
between branches before buying anything new — never happens, because there's no coordination layer,
and a single central planner doesn't scale to every location and vendor.

Reframe it and the answer gets interesting: **make each branch and supplier an agent, and let them
coordinate.** Not one omniscient optimizer. A negotiation.

## The moment that wins the room

Here's the scenario we demo, and it's the whole thesis in ninety seconds.

Heading into the weekend, the **Downtown** branch is **36 kg short on tomatoes**. A naive system
buys 36 kg. Mise doesn't. First it looks *inside the franchise*: **Marina** is sitting on surplus
that expires in two days. So Marina claims the shortage and transfers **10 kg branch-to-branch** —
zero cost, spoilage avoided. Only the **net 26 kg** escalates to a supplier auction, where two
vendor agents bid; **Bay Foods wins at $2.05/kg** over NorCal's $2.20. The owner gets exactly one
decision: **a $53.30 purchase order.**

One shortage in. One decision out. Least waste, least cost. Nobody's in charge, yet the right thing
happens. That last sentence is the feeling we were chasing — and it's what you can't fake with a
single prompt returning a plan. You have to *show* the agents talking.

## Three layers, each doing what it's best at

We deliberately didn't build one giant agent. We split the system by what each part is actually good
at:

- **Cotal — coordination.** Branches and suppliers are agent nodes on a mesh. A shortage is
  broadcast on a `#rebalance` channel, and **anycast** routes it to whoever holds surplus; the
  nearest branch with the nearest-expiry lot claims it. Only the *net* franchise shortage escalates
  to a `#procurement` auction. No central planner. This is the layer that decides *who talks to whom,
  and when.*
- **Runtype — reasoning.** Six capabilities (agents and flows): demand forecasting, the
  rebalance-and-procure decision (on `claude-opus-4-8`, because it's genuinely multi-constraint),
  promotions, a consumer concierge, an inventory admin, and a web scraper. They're exposed over an
  **MCP bridge**, so a mesh node calls them as tools. This layer decides *what the smart move is.*
- **InsForge — state and hosting.** Postgres holds inventory, transfers, RFQs, bids, purchase
  orders, and forecasts, and it serves the frontend. This layer *remembers.*

Cotal decides who talks. Runtype decides the move. InsForge remembers. That one line got us further
in conversations than any diagram.

## The honest engineering

A few things we learned that are worth writing down:

**Reach for one better-scoped agent before a team of agents.** The rebalance and procurement logic
*share context* — you can't cleanly split "match transfers" from "buy the remainder," because the
remainder depends on the transfers. So they live in one agent with a tight tool set, not two agents
passing messages. Multi-agent is the right frame for the *branches negotiating*; it's the wrong
frame for a single decision.

**Pin the good behavior with evals.** Every capability ships with an eval suite seeded from real
runs, so the verified $53.30 outcome can't silently regress when we tweak a prompt. An AI judge
independently confirmed the agent "covered the shortage with a transfer first, then bought the
remainder from the cheaper supplier, and never bought what a transfer could cover." That's the kind
of check that lets you move fast without breaking the demo.

**The boring bugs are real.** Driving the scraper flow over HTTP, the input field is `inputs`, not
`variables` — one word, and it's the difference between a bound `{{cuisine}}` and a silently empty
one. We hit an execution-rate cap mid-build. A backend host went slow for hours, then quietly
recovered. None of it is glamorous; all of it is the actual work.

## Beyond the franchise: scraping the market

The same engine generalizes past one restaurant. A **menu-intelligence flow** (search → scrape →
LLM-extract) pulled real restaurants and menus across **eight cuisines** — 16 restaurants, 128
dishes — into the same backend, and surfaced a cross-cuisine **ingredient-demand signal**: chicken,
onion, garlic, tomato top the list across cuisines. That's where shared procurement leverage lives.
It hints at the bigger version of Mise: not one franchise rebalancing tomatoes, but a mesh across a
whole market.

## What shipped

Mise is live: a hosted product with three views — a **Mesh Console** where you watch the agents
negotiate, a **Branch Operations** dashboard with a real embedded AI assistant, and **Market
Intelligence** over the scraped data — in light and dark. The reasoning runs as live Runtype agents;
the Cotal mesh is the coordination design plus a working connector, and the console faithfully
replays the negotiation. We were careful to say exactly that on stage: model the branches as agents,
run the reasoning live, and don't claim more than is true.

It won the **Multi-Agent Systems & Coordination** track at AGI Summit 2026. But the reason we're
proud of it isn't the trophy — it's that the interesting frontier in agents right now isn't a
smarter single model. It's *coordination*: getting many autonomous, partially-informed agents to
produce a good collective decision without a central brain. A restaurant supply chain turned out to
be the perfect place to show it, because the failure is so tangible. Everyone's seen good food get
thrown away.

Mise is French kitchen shorthand — *mise en place*, everything in its place, ready before service.
That's the promise: the right ingredients, in the right branch, at the right time. Ready before
demand hits.

---

*Live demo, code, and the full architecture: see the [README](../README.md).*
