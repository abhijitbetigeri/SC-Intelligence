"""Feasibility-first supplier ranking.

The procurement rule in ``runtype/agents.md`` is "choose the lowest landed cost
(unit_price x qty) that arrives by needed_by". That has a hole: ``rfqs.needed_by`` is
nullable and nothing in the spec computes it, so in practice the deadline term is absent
and the rule collapses to *lowest unit price*.

The as-built coordinator already exhibits this. ``runtype/BUILD.md`` records its output:

    buy 26 TOM-ROMA from Bay Foods @ $2.05 = $53.30

Bay Foods is $0.15/kg cheaper than NorCal and one day slower. Downtown has 4.0 kg of
tomatoes against a burn of ~14.3 kg/day -- about **6.7 hours** of cover. The order saves
$3.90 and arrives roughly a day and a half after the shelf is empty.

The fix is to rank *feasibility before price*: a supplier that cannot arrive before you
run out never outranks one that can, whatever it costs. And when **no** supplier can make
it in time, say so explicitly rather than presenting the PO as if it closed the loop --
there is currently no state in the model that means "ordered, and you will still stock out".

Run this file to see the worked example:

    python3 src/mise/supplier_rank.py

Pure stdlib, no dependencies, no I/O -- so it can be imported by a Runtype custom tool, an
InsForge edge function, or called from the planner before the LLM ever sees the options.
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class SupplierOption:
    """One supplier's terms for one product (a row of supplier_products + suppliers)."""

    supplier_id: str
    name: str
    unit_price: float
    lead_time_days: int
    min_order: float = 0.0
    # Share of POs delivered complete and on time. There is no column for this yet
    # (see the PR notes); default 0.9 keeps the term neutral until it is measured.
    reliability: float = 0.9

    # populated by rank_suppliers()
    feasible: bool = field(default=False, init=False)
    score: float = field(default=0.0, init=False)
    note: Optional[str] = field(default=None, init=False)


def days_of_cover(qty_on_hand: float, daily_burn: float) -> float:
    """Days until the shelf is empty at the current burn rate.

    ``daily_burn`` comes from sales x BOM -- see ``db/views.sql`` (``v_stock_cover``).
    Returns infinity when nothing is moving, so an idle product is never "urgent".
    """
    if daily_burn <= 0:
        return float("inf")
    return qty_on_hand / daily_burn


def rank_suppliers(options: list[SupplierOption], cover_days: float) -> list[SupplierOption]:
    """Rank supplier options for a product, feasibility first.

    Within a feasibility class the options are scored 0.45 cost / 0.30 lead time /
    0.25 reliability, each normalised across the candidate set. But the classes never
    interleave: every option that can arrive in time sorts above every option that cannot.

    When **nothing** can arrive in time the objective changes and the score stops being
    the right question. You are no longer buying at least cost before a deadline -- the
    deadline is already gone -- you are minimising how long the shelf stays empty. So the
    ranking falls back to fastest-first. Without this branch the rule quietly degenerates
    into the very bug it was written to fix: with both options infeasible the cost-weighted
    score wins again and picks the slower supplier.

    ``cover_days`` is how long the stock lasts -- from ``days_of_cover()``.
    """
    if not options:
        return []

    prices = [o.unit_price for o in options]
    leads = [o.lead_time_days for o in options]
    span_cost = (max(prices) - min(prices)) or 1.0
    span_lead = (max(leads) - min(leads)) or 1

    for o in options:
        cost_score = 1 - (o.unit_price - min(prices)) / span_cost   # 1 == cheapest
        lead_score = 1 - (o.lead_time_days - min(leads)) / span_lead  # 1 == fastest
        o.score = round(0.45 * cost_score + 0.30 * lead_score + 0.25 * o.reliability, 4)
        o.feasible = o.lead_time_days <= cover_days
        o.note = None if o.feasible else (
            f"arrives in {o.lead_time_days}d - {cover_days:.1f}d of stock left"
        )

    if not any(o.feasible for o in options):
        # every option lands after the stockout -> shortest gap wins, ties on score
        return sorted(options, key=lambda o: (o.lead_time_days, -o.score))
    return sorted(options, key=lambda o: (not o.feasible, -o.score))


def order_qty(required: float, on_hand: float, on_order: float, par: float, min_order: float) -> float:
    """Cover the forecast, refill to par, respect the supplier minimum."""
    gap = max(0.0, par - on_hand - on_order)
    needed = max(gap, required - on_hand)
    return max(needed, min_order, 0.0)


def recommend(
    product: str,
    unit: str,
    qty_on_hand: float,
    daily_burn: float,
    required: float,
    par: float,
    options: list[SupplierOption],
    on_order: float = 0.0,
) -> dict:
    """Full recommendation: who to buy from, how much, and every number behind it.

    The returned ``why`` list and ``late`` flag are the payload an agent should be handed
    *already computed* -- leaving the model to write the sentence, not to do the
    constrained optimisation. Note ``why`` describes the runner-up by why it actually
    lost: claiming "cheaper" about a pricier option is the kind of confidently wrong
    sentence that discredits the whole recommendation.
    """
    cover = days_of_cover(qty_on_hand, daily_burn)
    ranked = rank_suppliers(options, cover)
    best = ranked[0]
    qty = order_qty(required, qty_on_hand, on_order, par, best.min_order)

    late = not best.feasible
    # Only claim "fastest" when it is in fact the fastest -- when nothing is feasible the
    # ranking is fastest-first, so it holds; never assert it merely because the order is late.
    is_fastest = best.lead_time_days == min(o.lead_time_days for o in ranked)
    why = [
        f"{best.name} - ${best.unit_price}/{unit}, {best.lead_time_days}-day lead"
        f"{' (fastest available)' if late and is_fastest else ''}"
    ]
    if len(ranked) > 1:
        runner = ranked[1]
        if runner.unit_price < best.unit_price:
            # the runner-up lost on time, not on price -- say which
            why.append(
                f"{runner.name} is cheaper at ${runner.unit_price} but "
                + (runner.note or f"is slower ({runner.lead_time_days}d)")
            )
        elif runner.lead_time_days < best.lead_time_days:
            why.append(f"{runner.name} is faster ({runner.lead_time_days}d) but costs ${runner.unit_price}")
        else:
            why.append(f"beat {runner.name} (${runner.unit_price}, {runner.lead_time_days}d)")
    else:
        why.append("only supplier carrying this item")
    gap = max(0.0, par - qty_on_hand - on_order)
    if qty == best.min_order and best.min_order > required - qty_on_hand:
        why.append(f"rounded up to the supplier minimum of {best.min_order}")
    elif gap >= required - qty_on_hand and gap > 0:
        why.append(f"refills to par ({par:g} {unit})")
    else:
        why.append(f"covers the {required:g} {unit} shortfall")

    return {
        "product": product,
        "supplier": best.name,
        "supplier_id": best.supplier_id,
        "qty": round(qty, 3),
        "unit_price": best.unit_price,
        "total": round(qty * best.unit_price, 2),
        "eta_days": best.lead_time_days,
        "days_of_cover": round(cover, 2),
        "late": late,
        "late_note": (
            f"Even {best.name}'s {best.lead_time_days}-day lead lands after the "
            f"{cover:.1f} days of stock left. Plan a substitute for the gap."
        ) if late else None,
        "why": why,
        "ranked": ranked,
    }


# ── worked example: Downtown tomatoes, from db/seed.sql ──────────────────────
if __name__ == "__main__":
    # Burn is derived from the seed: base servings/day x branch multiplier (Downtown 1.4)
    # x weekend blend (1.257) x BOM qty_per_serving, summed over the tomato dishes.
    DOWNTOWN_TOMATO_BURN = 14.26   # kg/day
    ON_HAND = 4.0                  # kg  (db/seed.sql, Downtown tomatoes)
    NET_SHORTAGE = 26.0            # kg  after Marina's 10 kg transfer (BUILD.md)

    options = [
        SupplierOption("d0...001", "NorCal Produce", 2.20, 1, min_order=5),
        SupplierOption("d0...002", "Bay Foods Wholesale", 2.05, 2, min_order=10),
    ]

    rec = recommend(
        product="Roma tomatoes",
        unit="kg",
        qty_on_hand=ON_HAND,
        daily_burn=DOWNTOWN_TOMATO_BURN,
        required=NET_SHORTAGE,
        par=40.0,
        options=options,
    )

    print("Downtown / Roma tomatoes")
    print(f"  on hand {ON_HAND} kg, burning {DOWNTOWN_TOMATO_BURN} kg/day")
    print(f"  -> {rec['days_of_cover']} days of cover ({rec['days_of_cover'] * 24:.1f} hours)\n")

    print("  ranked options:")
    for i, o in enumerate(rec["ranked"]):
        mark = "->" if i == 0 else "  "
        flag = "" if o.feasible else f"   [{o.note}]"
        print(f"  {mark} {o.name:<22} ${o.unit_price}/kg  {o.lead_time_days}d  score={o.score}{flag}")

    print(f"\n  recommendation: {rec['qty']} kg from {rec['supplier']} = ${rec['total']}")
    for line in rec["why"]:
        print(f"    - {line}")

    if rec["late"]:
        print(f"\n  !! {rec['late_note']}")

    lowest_cost = min(options, key=lambda o: o.unit_price)
    delta = round((rec["unit_price"] - lowest_cost.unit_price) * rec["qty"], 2)
    gap_now = rec["eta_days"] - rec["days_of_cover"]
    gap_cheap = lowest_cost.lead_time_days - rec["days_of_cover"]
    print(
        f"\n  the current rule picks {lowest_cost.name} @ ${lowest_cost.unit_price}"
        f" = ${round(lowest_cost.unit_price * rec['qty'], 2)} -- BUILD.md records exactly this."
        f"\n  it saves ${delta} and leaves Downtown dry for {gap_cheap:.1f} days;"
        f" this ranking leaves it dry for {gap_now:.1f} days."
    )
    print(
        f"\n  neither supplier can beat the stockout, so the win here is {gap_cheap - gap_now:.1f} fewer"
        f"\n  days of empty shelf -- and an approval card that says so instead of implying the PO fixed it."
    )
