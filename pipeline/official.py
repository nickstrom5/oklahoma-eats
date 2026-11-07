"""Official records for Oklahoma -> one table (playbook/12-sources.md). Nick approved both sources on 2026-11-06.

- PHIN (OSDH's "Oklahoma Food Service Establishment Inspections", every county, with Oklahoma City-County's and Tulsa's inspections):
  every establishment on the county lists, and for those that match a place, each inspection's date and the violations PHIN notes.
  PHIN gives no score or grade; a place shows its latest inspection's date and how many violations PHIN lists, as PHIN lists them.
  PHIN's rows only attach to the places they match; they never add one.
- ABLE Commission's monthly licensee lists (October 2026): the live on-premises licenses (mixed beverage, beer and wine, brew pub,
  hotel beverage) say a place serves alcohol; the retail lists mark package stores.

load() returns: jur, lic (our id), name, keys (name keys), addr, city, zip, num, street, lat, lon, kind, active, ltype, insp, biz.
"""
import os, re, json, datetime, glob
import numpy as np, pandas as pd
from common import norm_name, RAW, name_sim, _stems, GENERIC, canon_city, nice

OFF = os.path.join(RAW, "official")
DIRS = {"N": "N", "S": "S", "E": "E", "W": "W", "NORTH": "N", "SOUTH": "S", "EAST": "E", "WEST": "W"}
TYPES = set("ST STREET AVE AV AVENUE BLVD BOULEVARD RD ROAD DR DRIVE LN LANE CT COURT PL PLACE PKWY PARKWAY TER TRL TRAIL WAY HWY CIR "
            "CIRCLE PLZ SQ MALL BND PASS XING RUN ROW WALK RDG LOOP FWY FREEWAY EXPY EXPRESSWAY PIKE PK PKE".split())


def road(a):
    """One spelling for numbered roads. Oklahoma writes one road as 'Route 100', 'US 7', 'Rt 2', 'OK 100' or 'OK Route 100', so every
    numbered US or state route is 'SH n' (as in ri-eats); 'N INTERSTATE 95' = 'I-95'; 'COUNTY ROAD 5' = 'CR 5'."""
    a = re.sub(r"(\d)\s*&\s*(\d)", r"\1-\2", a.upper())
    a = re.sub(r"\b(US|OK|SR|SH|CR|I|IH|RT|RTE)-(\w)", r"\1 \2", a)
    a = re.sub(r"\b(?:INTERSTATE(?: HIGHWAY| HWY)?|IH|I H)\s*(?=\d)", "I ", a)
    a = re.sub(r"\b(?:US|U S)\s+(?:HIGHWAY|HWY)\b", "US", a)
    a = re.sub(r"\b(?:FARM[- ]TO[- ]MARKET(?: ROAD| RD)?|FARM (?:ROAD|RD)|F M)\b", "FM", a)
    a = re.sub(r"\b(?:RANCH[- ]TO[- ]MARKET(?: ROAD| RD)?|RANCH (?:ROAD|RD)|RR|RM)\b(?=\s*\d)", "RM", a)
    a = re.sub(r"\b(?:STATE (?:HIGHWAY|HWY|ROAD|RD|ROUTE|RTE)|SR|SH|WEST VIRGINIA (?:ROUTE|RTE|HIGHWAY|HWY)|OK (?:ROUTE|RTE|RT|HIGHWAY|HWY)|OK|"
               r"US (?:ROUTE|RTE|RT)|US|ROUTE|RTE|RT|HWY|HIGHWAY)\b\.?(?=\s*\d)", "SH", a)
    a = re.sub(r"\b(?:COUNTY (?:HIGHWAY|HWY|ROAD|RD)|CO RD|CTY (?:HWY|RD)|CR)\b", "CR", a)
    a = re.sub(r"\bHIGHWAY\b", "HWY", a)
    return re.sub(r"\b(US|SH|CR|HWY|FM|RM|I) (\w+)\s*-\s*\w+", r"\1 \2", a)


ORD = {"FIRST": "1ST", "SECOND": "2ND", "THIRD": "3RD", "FOURTH": "4TH", "FIFTH": "5TH", "SIXTH": "6TH", "SEVENTH": "7TH",
       "EIGHTH": "8TH", "NINTH": "9TH", "TENTH": "10TH", "ELEVENTH": "11TH", "TWELFTH": "12TH"}


def street_key(a):
    """'2505 Monroe St' -> ('2505', 'MONROE'); '1000 OSAGE STREET' -> ('1000', 'OSAGE'); 'E Colfax Ave' keeps 'COLFAX'."""
    if not isinstance(a, str):
        return None, None
    # "1925 W Gore # C", "3339 W Main #335": PHIN writes a suite after "#"; it isn't part of the street ("GORE C" missed "Gore Blvd Ste C")
    a = re.sub(r"(?i)\b(US|HWY|HIGHWAY|ROUTE|RTE|RT|SH|I)\s*#\s*(?=\d)", r"\1 ", a)   # "Highway #49" is a route number, not a suite
    a = re.sub(r"(?<=\w)\s*#\s*[A-Za-z0-9-]+\b", " ", road(a))
    a = re.sub(r"[.,#]", " ", a)
    # "20940-A North Frederick Ave": a hyphenated unit letter is part of the number (Maryland's Montgomery County wrote them so)
    m = re.match(r"^\s*(\d+)(?:-?[A-Z])?(?:\s*-\s*\d+[A-Z]?)?\s+(.*)$", a)
    if not m:
        return None, None
    words = [w for w in m.group(2).split() if w]
    if len(words) > 1 and words[0] in DIRS:
        words = words[1:]
    core = []
    for w in words:
        if w in TYPES and core:
            break
        core.append(w)
    # "Hwy 45 North" = "Highway 45 N": a direction word after the street is its letter (Columbus's Mugshots was listed twice)
    core = [ORD.get(w, DIRS.get(w, w)) for w in core]
    return m.group(1), " ".join(core[:3]) or None


def street_compat(a, b):
    """Same street, or one is a whole-word prefix of the other: Boulder's 2025 set sometimes truncates ("1206 CENTAUR" = Centaur Village Dr)."""
    if not isinstance(a, str) or not isinstance(b, str) or not a or not b:
        return False
    return a == b or a.startswith(b + " ") or b.startswith(a + " ")


def street_nums(a):
    """'157-159 W Main St' -> {'157', '159'}; '2505 Monroe St' -> {'2505'}."""
    if not isinstance(a, str):
        return set()
    a = road(a)
    m = re.match(r"^\s*(\d+)[A-Z]?(?:\s*-\s*(\d+)[A-Z]?)?\s", a.upper() + " ")
    if not m:
        return set()
    lo = int(m.group(1)); hi = int(m.group(2)) if m.group(2) else lo
    if hi < lo:   # "1500-02"
        hi = int(str(lo)[: len(str(lo)) - len(m.group(2))] + m.group(2)) if m.group(2) else lo
    return {str(x) for x in range(lo, hi + 1, 2 if (hi - lo) % 2 == 0 else 1)} if 0 <= hi - lo <= 12 else {str(lo)}


def _names(*vals):
    out = []
    for v in vals:
        if not isinstance(v, str):
            continue
        v = re.sub(r"\s*\((?:MOBILE|MOBILE UNIT|COMMISSARY|CATERING|SPECIAL EVENT|SPEC EVENT|TEMP(?:ORARY)? EVENT|CP|INSIDE [^)]*)\)\s*$", "", v, flags=re.I)
        for part in re.split(r"\s*/\s*|\s+\bdba\b\s+|\s+&\s+(?=[A-Z][a-z])", v, flags=re.I):
            k = norm_name(re.sub(r"\b(?:LLC|INC|CORP|CORPORATION|LTD|CO)\b\.?", "", part, flags=re.I))
            if k and k not in out:
                out.append(k)
    return out



PHIN_DIR = os.path.join(OFF, "phin")
ABLE_DIR = os.path.join(OFF, "able")
META = json.load(open(os.path.join(PHIN_DIR, "meta.json"))) if os.path.exists(os.path.join(PHIN_DIR, "meta.json")) else {}
ABLE_META = json.load(open(os.path.join(ABLE_DIR, "meta.json"))) if os.path.exists(os.path.join(ABLE_DIR, "meta.json")) else {}
LIST_DATE = META.get("fetched")     # PHIN's details were read on this day (its records run to the day before)
MONT_PAGE = "https://oklahoma.gov/able-commission/brand-registration/brand-registration-reports/listing-of-licensees-by-license-type.html"
PERMITS_POSTED = "2026-11-01"       # the October 2026 lists' page, updated November 1, 2026
# OSDH's PHIN inspection search, every county (checked 2026-11-06: 200, no robots.txt, no CAPTCHA)
INSPECTIONS_URL = "https://www.phin.state.ok.us/Inspections/"
DISCLAIMER = ("An inspection is a snapshot in time. A review of the inspection history is a better indicator of a food service "
              "establishments operational conditions.")
# PHIN's own notes for each inspection: how many violations it lists (no score or grade). Index = count, capped at 40.
RESULTS = tuple(["No violations reported"] + [f"{n} violation" + ("s" if n > 1 else "") + " noted" for n in range(1, 41)])
ONPREM_T = ("Oklahoma ABLE on-premises license",)
RETAIL_T = "Oklahoma ABLE package license"
ABLE_ONPREM = {"Mixed_Beverage": ["beer", "wine", "liquor"], "Beer_and_Wine": ["beer", "wine"], "Brew_Pub": ["beer"],
               "Hotel_Beverage": ["beer", "wine", "liquor"]}
ABLE_RETAIL = ("Retail_Spirits_Store", "Retail_Wine", "Retail_Beer")


def liq_kind(t):
    """A license type as shown -> on-premises or retail."""
    if not isinstance(t, str):
        return None
    return "onprem" if t in ONPREM_T else "retail" if t == RETAIL_T else None


COLUMNS = ["jur", "lic", "name", "dba", "holder", "keys", "addr", "city", "zip", "num", "street", "lat", "lon", "kind", "active", "ltype",
           "insp", "issued", "biz", "drinks", "county"]


def _zip(z):
    z = re.sub(r"\D", "", str(z or ""))
    return z[:5] if len(z) >= 5 else ""


def _title(a):
    a = re.sub(r"\s+", " ", str(a or "")).strip()
    return re.sub(r"\b([A-Z][A-Z']+)\b", lambda m: m.group(1).capitalize(), a) if a.isupper() else a


def _city(c):
    return canon_city(" ".join(w.capitalize() for w in str(c or "").split())) if isinstance(c, str) and c.strip() else None


def _mhtml_rows(path):
    import email, html as _html
    m = email.message_from_bytes(open(path, "rb").read())
    for part in m.walk():
        if part.get_content_type() == "text/html":
            s = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", "replace")
            out = []
            for tr in re.findall(r"(?is)<tr[^>]*>(.*?)</tr>", s):
                cells = [_html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", c))).strip() for c in re.findall(r"(?is)<t[dh][^>]*>(.*?)</t[dh]>", tr)]
                if cells:
                    out.append(cells)
            return out
    return []


def load_able():
    """One row per live ABLE license (the expiry, an Excel day number, not yet past) on the on-premises and retail lists."""
    today = (datetime.date.today() - datetime.date(1899, 12, 30)).days
    rows = []
    for f in list(ABLE_ONPREM) + list(ABLE_RETAIL):
        path = os.path.join(ABLE_DIR, f + "_Licensee_List.xls")
        if not os.path.exists(path):
            continue
        t = _mhtml_rows(path)
        head = next((i for i, r in enumerate(t) if r and r[0].startswith("License")), None)
        if head is None:
            continue
        cols = [c.upper() for c in t[head]]
        for r in t[head + 1:]:
            if len(r) < len(cols):
                continue
            d = dict(zip(cols, r))
            try:
                if int(float(d.get("DATE EXPIRATION") or 0)) < today:
                    continue
            except ValueError:
                pass
            name = _title(d.get("DBA NAME"))
            if not name:
                continue
            addr = _title(d.get("FULL ADDRESS") or d.get("STREET NBR"))
            num, st = street_key(addr)
            on = f in ABLE_ONPREM
            rows.append({"jur": "able", "lic": f"able-{d.get('LICENSE #')}", "name": name, "dba": name, "holder": None, "keys": _names(name),
                         "addr": addr, "city": _city(d.get("CITY")), "zip": _zip(d.get("ZIP")), "num": num, "street": st, "lat": None,
                         "lon": None, "kind": "liquor", "active": True, "ltype": ONPREM_T[0] if on else RETAIL_T, "insp": [], "issued": None,
                         "drinks": ABLE_ONPREM.get(f), "county": (d.get("COUNTY") or "").strip().title() + " County" if (d.get("COUNTY") or "").strip() else None})
    return rows


def _md(d):
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", d or "")
    return f"{m.group(3)}-{int(m.group(1)):02d}-{int(m.group(2)):02d}" if m else None


def load_phin():
    """One row per PHIN establishment (every county's list); its inspections come from the details read for the matched ones:
    [date, PHIN's count of violations as words, None, our key], newest first. PHIN's rows never add a place."""
    details = json.load(open(os.path.join(PHIN_DIR, "details.json"))) if os.path.exists(os.path.join(PHIN_DIR, "details.json")) else {}
    rows = []
    for f in sorted(glob.glob(os.path.join(PHIN_DIR, "county-*.json"))):
        c = json.load(open(f))
        for p in c["pages"]:
            for r in p["rows"]:
                ident = f"{c['id']}-{p['n']}-{r['target'].split('$')[1]}"
                insp = [[_md(d), RESULTS[min(len(v), 40)], None, f"{ident}-{_md(d)}"] for d, v in details.get(ident, [])]
                insp = sorted([i for i in insp if i[0]], key=lambda i: i[0], reverse=True)
                name = _title(r["name"])
                addr = _title(r["addr"])
                num, st = street_key(addr)
                rows.append({"jur": "phin", "lic": f"phin-{ident}", "name": name, "dba": name, "holder": None, "keys": _names(name),
                             "addr": addr, "city": _city(r["city"]), "zip": _zip(r["zip"]), "num": num, "street": st, "lat": None, "lon": None,
                             "kind": "inspection", "active": True, "ltype": "OSDH food service establishment", "insp": insp, "issued": None,
                             "drinks": None, "county": (r.get("county") or "").title() + " County" if r.get("county") else None,
                             "phin": {"county": c["id"], "page": p["n"], "target": r["target"], "id": ident}})
    return rows


def load():
    """ABLE's live on-premises and retail licenses and PHIN's establishments with their inspections (see the docstring)."""
    rows = load_able() + load_phin()
    df = pd.DataFrame(rows) if rows else pd.DataFrame({c: pd.Series(dtype=object) for c in COLUMNS})
    for c_ in COLUMNS:
        if c_ not in df.columns:
            df[c_] = None
    df["lat"] = df["lat"].astype(float); df["lon"] = df["lon"].astype(float); df["active"] = df["active"].astype(bool)
    df["biz"] = _group_biz(df)
    return df


def _group_biz(df):
    """One business, several records (an inspected establishment and its alcohol license): records at the same street number
    and street, in the same zip or the same town, whose names agree share a business number, so a place shows all of them. Zip or
    town, not zip first: the lists disagree on zips (Doe's in Little Rock is 72207 on DFA's permit list and 72201 at ADH)."""
    parent = list(range(len(df)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    groups = {}
    for i, (n, s_, z, c) in enumerate(zip(df.num, df.street, df.zip, df.city)):
        if isinstance(n, str) and n and isinstance(s_, str) and s_:
            if isinstance(z, str) and z:
                groups.setdefault((n, s_, "zip", z), []).append(i)
            if c:
                groups.setdefault((n, s_, "town", str(c).lower()), []).append(i)
    keys = list(df["keys"])
    for idx in groups.values():
        if len(idx) < 2 or len(idx) > 40:
            continue
        for x in range(len(idx)):
            for y in range(x + 1, len(idx)):
                a, b = idx[x], idx[y]
                if any(name_sim(ka, kb) >= 80 or bool((_stems(ka) - GENERIC) & (_stems(kb) - GENERIC))
                       for ka in (keys[a] or []) for kb in (keys[b] or [])):
                    parent[find(a)] = find(b)
    return [find(i) for i in range(len(df))]
