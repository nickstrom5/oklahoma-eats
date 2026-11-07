"""Oklahoma's official records -> data/raw/official/ (git-ignored, never public). Nick approved both sources on 2026-11-06 ("Yes, all
four", through the parent session).

1. PHIN inspections: OSDH's "Oklahoma Food Service Establishment Inspections" search (www.phin.state.ok.us/Inspections/), an
   ASP.NET postback form searched by county. Phase "lists": every county's establishment list (name, street, city, zip, county; 15 a
   page), each page saved with its form state. Phase "details": for the establishments that match a place in the app
   (data/raw/official/phin/wanted.json, written by oklahoma.py's matcher), the "Details" page: every inspection date with the
   violations noted ("No violations reported" when none). PHIN gives no score or grade; nothing here makes one. No robots.txt (404).
2. ABLE licensee lists: the ABLE Commission's monthly "Listing of Licensees by License Type" (oklahoma.gov allows all in robots.txt),
   October 2026: Mixed Beverage, Beer and Wine, Brew Pub and Hotel Beverage (on-premises) and the three retail lists.

One request at a time, PAUSE seconds apart, a generic client name and no email in the User-Agent; GETs and the form's own postbacks.
Each county list and each batch of details is saved as it finishes, so a stopped run resumes.
Usage: ../.venv/bin/python fetch_official.py --go lists | details | able
"""
import datetime, html, json, os, re, sys, time
import requests

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "raw", "official")
PHIN = os.path.join(OUT, "phin")
ABLE = os.path.join(OUT, "able")
URL = "https://www.phin.state.ok.us/Inspections/"
ABLE_BASE = ("https://oklahoma.gov/content/dam/ok/en/able-commission/documents/brand-registration/brand-registration-reports/"
             "listing-of-licensees-by-license-type/2026/october-(2)/")
ABLE_FILES = ["Mixed_Beverage", "Beer_and_Wine", "Brew_Pub", "Hotel_Beverage", "Retail_Spirits_Store", "Retail_Wine", "Retail_Beer"]
UA = "Mozilla/5.0 (compatible; EatsRankedDataCheck/1.0)"
PAUSE = 2.5
TODAY = datetime.date.today()

S = requests.Session()
S.headers["User-Agent"] = UA


def hidden(s):
    return {m.group(1): html.unescape(m.group(2)) for m in re.finditer(r'<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"', s)}


def text(s):
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s or ""))).strip()


def request(data=None):
    for attempt in range(4):
        try:
            r = S.get(URL, timeout=120) if data is None else S.post(URL, data=data, timeout=180)
            if r.status_code == 200:
                if re.search(r"(?i)captcha|access denied|unusual traffic", r.text[:5000]):
                    sys.exit("PHIN answered with a challenge: stopping (nothing more is requested)")
                return r.text
            print("  http", r.status_code, flush=True)
        except requests.RequestException as e:
            print("  error", e, flush=True)
        time.sleep(15 * (attempt + 1))
    sys.exit("PHIN didn't answer after 4 tries: stopping")


def list_rows(page):
    out = []
    for m in re.finditer(r'(?s)<tr[^>]*>\s*<td>([^<]*)</td><td>([^<]*)</td><td>([^<]*)</td><td>([^<]*)</td><td>([^<]*)</td>\s*<td>\s*<a [^>]*__doPostBack\(&#39;(dgRestaurants\$ctl\d+\$lbDetails)&#39;', page):
        out.append({"name": text(m.group(1)), "addr": text(m.group(2)), "city": text(m.group(3)), "zip": text(m.group(4)),
                    "county": text(m.group(5)), "target": m.group(6)})
    return out


def next_target(page, n):
    """The pager link to page n + 1: its number, or the '...' after the current block."""
    links = re.findall(r"__doPostBack\(&#39;(dgRestaurants\$ctl\d+\$ctl\d+)&#39;,&#39;&#39;\)\">([^<]*)<", page)
    for t, label in links:
        if label.strip() == str(n + 1):
            return t
    dots = [t for t, label in links if label.strip() == "..."]
    if dots and (n % 10 == 0):
        return dots[-1]
    return None


def lists():
    os.makedirs(PHIN, exist_ok=True)
    first = request()
    m = re.search(r'<select[^>]*name="cmbCounties"[^>]*>(.*?)</select>', first, re.S)
    counties = [(v, text(n)) for v, n in re.findall(r'<option[^>]*value="(\d+)"[^>]*>([^<]*)<', m.group(1)) if v != "0"]
    print(f"PHIN lists: {len(counties)} counties", flush=True)
    for cid, cname in counties:
        path = os.path.join(PHIN, f"county-{cid}.json")
        if os.path.exists(path):
            continue
        time.sleep(PAUSE)
        page = request()
        f = hidden(page); f.update({"cmbCounties": cid, "txtSearch": "", "cmdSearch": "Search"})
        time.sleep(PAUSE)
        page = request(f)
        pages, n = [], 1
        while True:
            st = hidden(page)
            pages.append({"n": n, "state": {k: st[k] for k in ("__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION") if k in st},
                          "rows": list_rows(page)})
            t = next_target(page, n)
            if not t:
                break
            f = dict(pages[-1]["state"]); f.update({"__EVENTTARGET": t, "__EVENTARGUMENT": "", "cmbCounties": cid, "txtSearch": ""})
            time.sleep(PAUSE)
            page = request(f)
            n += 1
        json.dump({"county": cname, "id": cid, "fetched": str(TODAY), "pages": pages}, open(path, "w"))
        print(f"  {cname}: {sum(len(p['rows']) for p in pages)} establishments, {n} pages", flush=True)


def detail_items(page):
    """Each inspection on a details page: [date, [violations]] ('No violations reported' -> [])."""
    body = page.split("Establishment Name:", 1)[-1]
    body = re.sub(r"(?s)<script.*?</script>", "", body)
    parts = re.split(r"Inspection Date:\s*", body)
    out = []
    for p in parts[1:]:
        d = re.match(r"\s*(\d{1,2}/\d{1,2}/\d{4})", text(p))
        if not d:
            continue
        cells = [text(c) for c in re.findall(r"(?s)<td[^>]*>(.*?)</td>", p)]
        notes = [c for c in cells if c and not c.startswith(d.group(1)) and c != "No violations reported" and len(c) > 3]
        out.append([d.group(1), notes[:20]])
    return out


def details():
    wanted = json.load(open(os.path.join(PHIN, "wanted.json")))   # [{"county": id, "page": n, "target": ..., "id": ...}]
    done_path = os.path.join(PHIN, "details.json")
    done = json.load(open(done_path)) if os.path.exists(done_path) else {}
    states = {}
    todo = [w for w in wanted if w["id"] not in done]
    print(f"PHIN details: {len(todo)} to fetch ({len(done)} already)", flush=True)
    for i, w in enumerate(todo):
        key = (w["county"], w["page"])
        if key not in states:
            c = json.load(open(os.path.join(PHIN, f"county-{w['county']}.json")))
            for p in c["pages"]:
                states[(w["county"], p["n"])] = p["state"]
        f = dict(states[key]); f.update({"__EVENTTARGET": w["target"], "__EVENTARGUMENT": "", "cmbCounties": w["county"], "txtSearch": ""})
        time.sleep(PAUSE)
        page = request(f)
        done[w["id"]] = detail_items(page)
        if i % 25 == 0:
            json.dump(done, open(done_path, "w"))
            print(f"  {i + 1}/{len(todo)}", flush=True)
    json.dump(done, open(done_path, "w"))
    json.dump({"fetched": str(TODAY), "source": URL, "details": len(done)}, open(os.path.join(PHIN, "meta.json"), "w"), indent=1)


def able():
    os.makedirs(ABLE, exist_ok=True)
    for f in ABLE_FILES:
        path = os.path.join(ABLE, f + "_Licensee_List.xls")
        if not os.path.exists(path):
            r = S.get(ABLE_BASE + f + "_Licensee_List.xls", timeout=120)
            r.raise_for_status()
            open(path, "wb").write(r.content)
            time.sleep(PAUSE)
    json.dump({"list": "October 2026", "base": ABLE_BASE, "fetched": str(TODAY)}, open(os.path.join(ABLE, "meta.json"), "w"), indent=1)
    print("ABLE:", len(ABLE_FILES), "lists")


if __name__ == "__main__":
    print("plan: PHIN lists (77 counties, ~15 establishments a page), then details for matched places; ABLE lists (7 files);",
          f"{PAUSE} s between requests")
    if "--go" not in sys.argv:
        sys.exit(0)
    if "able" in sys.argv:
        able()
    if "lists" in sys.argv:
        lists()
    if "details" in sys.argv:
        details()
