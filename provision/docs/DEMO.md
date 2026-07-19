# Demo script

Roughly four minutes. Everything on screen is computed from records — nothing is hardcoded
copy — so it is safe to click around and follow whatever the data actually says.

## Setup

```sh
cd server && npm start          # serves the built SPA + API on :8788
```

Open http://localhost:8788, sign in as `maria@komodos.local` / `komodos`.

> If you want a clean slate: `rm -rf server/.data` and restart. The seed is fixed, so the
> same venue comes back.

## 1 · Overview — "what needs you" (40s)

The KPI strip and the insight feed are both computed. Point out that the header chip reads
**Demo · local data** — the app is honest about being disconnected.

Two insights worth reading aloud:

- **Stock risk** — *"Saint-Véran 2022 has 2 bottles left — 1.8 days of cover against a
  3-day lead time from Domaine Bourdon."* That sentence is arithmetic, not copy.
- **Sourcing** — *"Coastal Wholesale is cheaper on Hokkaido scallop … but 3 days slower."*
  A real trade surfaced, not a recommendation to blindly take.

Click the stock-risk card's CTA — insights route into the pillar that can act on them.

## 2 · Stock — the reorder loop (90s)

The **reorder rule** at the top is the autonomy dial: *notify me · auto-draft · auto-send
under $X*. Leave it on **notify** for the demo so nothing moves without a click.

In **Needs attention**, find *Saint-Véran 2022* and press **Reorder**. The modal is the
whole pitch:

- **12 bottles from Domaine Bourdon, $264**, arriving in 3 days
- **Why this order** — beat Cellar Direct on price, lead time and reliability; rounded to the
  supplier's 12-bottle minimum; refills to par
- **The forecast** — *"16 sold in the last 14 days (1.14/day); 5-day window covers lead time
  3d + 2d buffer"*
- **Suppliers compared** — both options with their numbers

Then the line that matters: **"Nothing has been sent. Requires operator approval."**

Press **Send to supplier**. The PO moves to `sent`, the item shows `+12 on order`, and the
channel reads **logged (demo)** — because no supplier channel is configured, the record is
the only artifact. Setting `SUPPLIER_ORDER_EMAIL` is what makes it actually leave.

**Worth showing:** reorder *Hokkaido scallop* instead. The draft picks Bay Seafood at $3.40
over Coastal at $2.85, and says why: *"Coastal Wholesale is cheaper at $2.85 but arrives in
4d — 2.3d of stock left."* The cheaper supplier loses on feasibility, and the app explains
itself rather than quietly picking.

## 3 · Tonight's guests — the other half (70s)

Four profiled guests on the book. Each card shows the likely order with confidence bars and
**how many of their visits it came from** — grounded in their own tickets, and the card says
so at the bottom.

Open **M. Tan**: the server script reads *"M. Tan usually starts with the Hokkaido scallop ·
hasn't tried the Hamachi loin — worth offering · Shellfish — dining guest, not the member."*
Three things a floor lead actually needs, in one line.

Note the **stock collision** KPI: when a guest's favourite is out of stock, the card flags it
in red. That is the two halves of the product meeting — the supply chain and the guest are
the same problem.

## 4 · Co-pilot + honesty (40s)

Open the co-pilot. Ask *"what is about to run out?"* — the answer is Markdown-rendered, and
every number in it comes from the same records on screen behind it. The badge reads
**grounded · connect Runtype for live AI**: the app never claims to be doing more than it is.

Finish on `GET /api/health` — every subsystem reports `local` vs connected, and
`GET /api/seams` shows what the app *would* have sent to InsForge, Runtype and Cotal.

## If someone asks "is this real or a mock?"

Neither, precisely. The **data** is simulated (deterministic, seeded). The **logic** is real:
records repository, forecasting, supplier ranking, PO lifecycle with audit, RBAC, and the
integration seams. Swapping the local JSON driver for InsForge Postgres changes no view and
no route — that is the whole design.
