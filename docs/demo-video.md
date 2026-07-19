# Mise — demo video plan (< 3 min)

Goal: show the product **in action**, lead with the multi-agent coordination (our track), land the
verified `$53.30` moment, and close on breadth. Target run time **~2:40**.

Tool: **Recordly** (open-source screen recorder). Use its **zoom suggestions** on the negotiation
feed and the approval card, **cursor smoothing**, and the **extra audio track** for narration.
Export **MP4, 1080p**.

## Pre-flight checklist
- Open the live site **https://k3trn3a2.insforge.site** in a clean browser window (no bookmarks
  bar, no extra tabs). Zoom the page to ~110–125% so text is legible in the recording.
- **Pick one theme and stay in it** the whole video (light = most legible on a projector; dark =
  more dramatic for the Mesh Console). Toggle is top-right.
- Have three tabs ready in order: `/mesh.html` · `/branch.html` · `/market.html` (or just click the
  top-nav between them).
- **Pre-warm the Branch chat once** before recording (ask the assistant anything so the first real
  answer in the take comes back fast). Agent replies take ~5–15s; if it lags on the take, use a
  Recordly **speed region** to compress the wait.
- On `/mesh.html`, set **Tempo to 1×** (or 2× if you want it snappier). Reset the cycle so it starts idle.
- Do a 20s test capture to check mic level and that the auto-zoom lands on the feed.

## Script (scene · action · narration)

**1 · Hook — Landing (0:00–0:15)**
*Action:* start on the landing hero.
> "Restaurants run on guesswork. Order too much and it spoils; too little and you're out of the
> dish someone came for. A franchise makes it worse — one branch dumps surplus tomatoes while
> another two miles away runs out. Mise fixes this: every branch and supplier becomes an agent."

**2 · The showpiece — Mesh Console (0:15–1:15)**  ← the centerpiece, let it breathe
*Action:* go to Mesh Console, click **Run rebalance cycle**. Let the feed play; zoom on the
`#rebalance` claim, the supplier `BID`s, and the `$53.30` outcome card.
> "This is the coordination layer — each branch and supplier is a node on a mesh. I'll run a weekly
> cycle. Downtown is short 36 kilos of tomatoes. Instead of just buying, the branches negotiate:
> Marina is holding surplus that's about to expire, so it claims the shortage and transfers 10
> kilos branch-to-branch — zero cost, no waste. Only the net 26-kilo shortage escalates to a
> supplier auction; two suppliers bid, Bay Foods wins on price. The owner gets one clean decision:
> a fifty-three-thirty purchase order. One shortage in, one decision out. Nobody's in charge, yet
> the right thing happens."

**3 · Operator view — Branch Operations (1:15–2:00)**
*Action:* open Branch Ops (Downtown). Point at the SHORT tomato row and the "runs out in ~7h"
projection. Open the assistant, type **"what runs out first at Marina?"**, show the reply.
> "That's the operator's view: live stock, and a forecast-driven projection — Downtown's tomatoes
> run out in under a day. It builds the reorder plan and flags waste risk. And there's a real AI
> assistant..." *(ask, let the answer render)* "...answering from the live data."

**4 · Breadth — Market Intelligence (2:00–2:25)**
*Action:* open Market Intelligence; scroll the ingredient-demand bars; expand one restaurant's dishes.
> "The same engine generalizes. A scraper pulls real restaurants and menus across eight cuisines
> into the backend, and surfaces the cross-cuisine ingredient-demand signal — where shared
> procurement leverage lives."

**5 · Close (2:25–2:40)**
*Action:* cut to the architecture diagram (`docs/architecture-diagram.html`) or back to the landing.
> "Coordination on Cotal, reasoning on Runtype, state on InsForge. That's Mise — restaurants that
> restock themselves. It's live; link's below."

## Recording tips
- **Let scene 2 run without talking over the key beat** — pause narration for a second when the
  `$53.30` card appears, so it lands.
- Keep the cursor still while narrating; move deliberately when pointing.
- If the Branch assistant reply is slow, **don't cut to a black wait** — speed-ramp it in Recordly.
- One continuous take is fine; Recordly's timeline lets you trim dead air and add the zooms after.

## Honesty guardrail (say it this way)
The Runtype agents are **live and verified** (the $53.30 plan is real agent output). The Cotal mesh
is the coordination design + a working MCP connector; the **Mesh Console is a faithful replay** of
that negotiation. Phrase it as *"each branch and supplier is modeled as an agent; the reasoning
runs as live Runtype agents, and this console replays the negotiation."* Never claim the mesh is
running in production.
