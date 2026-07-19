#!/usr/bin/env python3
"""Combine data/menu-intel/*.json into web/market-data.json for the Market UI.
Mirrors the InsForge mi_* tables + the mi_ingredient_frequency view.
Usage: python build_market_data.py data/menu-intel web/market-data.json"""
import sys, glob, os, json, datetime

CUISINE_ID = {"italian":"italian","american":"american","french":"french","chinese":"chinese",
              "burmese":"burmese","indian":"indian","middle eastern":"middle-eastern",
              "middle-eastern":"middle-eastern","mexican":"mexican"}

# canonicalize common variants so the demand signal groups them
CANON = {
    "chicken breast":"chicken","chicken thigh":"chicken","chicken thighs":"chicken","boneless chicken":"chicken",
    "ground beef":"beef","beef steak":"beef","ground pork":"pork",
    "green onion":"onion","green onions":"onion","scallion":"onion","scallions":"onion","spring onion":"onion","spring onions":"onion",
    "roma tomatoes":"tomato","cherry tomatoes":"tomato","sun-dried tomatoes":"tomato","diced tomatoes":"tomato",
    "fresh basil":"basil","fresh cilantro":"cilantro","fresh ginger":"ginger","fresh mint":"mint",
    "garlic clove":"garlic","garlic cloves":"garlic",
    "mozzarella cheese":"mozzarella","parmesan cheese":"parmesan","cheddar cheese":"cheddar",
}
def norm(n):  # normalize an ingredient for the frequency aggregate
    k = " ".join(n.strip().lower().split())
    return CANON.get(k, k)

def main(src, out):
    cuisines = []
    freq = {}  # key -> {dish_ids:set, restaurants:set, cuisines:set, label}
    for f in sorted(glob.glob(os.path.join(src, "*.json"))):
        d = json.load(open(f))
        cid = CUISINE_ID.get(d["cuisine"].strip().lower(), d["cuisine"].strip().lower())
        cuisines.append({"id": cid, "name": d["cuisine"], "restaurants": d["restaurants"]})
        for r in d["restaurants"]:
            for i, dish in enumerate(r.get("dishes", [])):
                dish_id = f"{cid}:{r['name']}:{i}"
                for ing in dish.get("ingredients", []):
                    k = norm(ing["name"])
                    e = freq.setdefault(k, {"label": k, "dishes": set(), "restaurants": set(), "cuisines": set()})
                    e["dishes"].add(dish_id); e["restaurants"].add(r["name"]); e["cuisines"].add(cid)

    # light plural merge: onion/onions, tomato/tomatoes
    for k in list(freq):
        for suf in ("es", "s"):
            if k.endswith(suf) and k[:-len(suf)] in freq and k in freq:
                base = freq[k[:-len(suf)]]
                base["dishes"] |= freq[k]["dishes"]; base["restaurants"] |= freq[k]["restaurants"]; base["cuisines"] |= freq[k]["cuisines"]
                del freq[k]; break

    frequency = sorted(
        ({"ingredient": e["label"], "dish_count": len(e["dishes"]),
          "restaurant_count": len(e["restaurants"]), "cuisine_count": len(e["cuisines"])}
         for e in freq.values()),
        key=lambda x: (-x["dish_count"], -x["cuisine_count"], x["ingredient"]))

    totals = {"cuisines": len(cuisines),
              "restaurants": sum(len(c["restaurants"]) for c in cuisines),
              "branches": sum(len(r.get("branches", [])) for c in cuisines for r in c["restaurants"]),
              "dishes": sum(len(r.get("dishes", [])) for c in cuisines for r in c["restaurants"]),
              "ingredients": len(frequency)}

    payload = {"generated": datetime.datetime.now(datetime.timezone.utc).isoformat(),
               "source": "InsForge mi_* tables (scraped by the Menu Intelligence flow)",
               "totals": totals, "cuisines": cuisines, "ingredient_frequency": frequency}
    json.dump(payload, open(out, "w"), indent=1)
    print("wrote", out, "|", totals, "| unique ingredients:", len(frequency))

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
