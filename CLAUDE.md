# Oklahoma Eats (ok-eats) — notes for Claude Code sessions

Built 2026-11-06 by a side session for Nick's "build the 17 states left" (group: Alabama, Mississippi, Arkansas, Oklahoma), ported from
`../ar-eats/` (itself from `../ms-eats/`, `../al-eats/` and `../wy-eats/`, the newest finished state of 2026-11-05: delivery-only
brands hidden, the website blocklist and `link_blocklist.py`, the Share link `Links.site + explore/#p=<id>`, over-the-air data,
adult-venue filtering, the Denny's delivery-brand rule, the `playbook/app-store/listing.json` format). Local only: git-ignored data, no
repo, no remote, nothing published, nothing in App Store Connect. Sources: `playbook/12-sources.md`. Brand: `playbook/05-naming.md` — **final** (Nick's decisions, 2026-11-07: "Oklahoma Eats: Restaurants", Home Screen "Oklahoma Eats"; an onion burger icon, concept
A, on sky blue; sky #00559B, red dirt #9C3D23, ink #1F2A36, shield amber #B9975B as a fill only, wheat #F4EBD6; a redbud header band).

## Status (2026-11-07)
- See the end of this file (updated last).

## Oklahoma is different
- **Two official lists (Nick's yes, 2026-11-06).** OSDH's PHIN inspection search (`fetch_official.py --go lists`: every county's
  establishment list, 15 a page; then `--go details` for the establishments that match a kept place, from
  `data/raw/official/phin/wanted.json`, which `OK_APP=1 OK_WANTED=1 oklahoma.py` writes) and the ABLE Commission's October 2026
  licensee lists (`--go able`). Both only attach to places they match; `official._group_biz` groups one business's records at the same number and street in the same zip or town
  (the lists disagree on zips). A place
  shows its latest PHIN inspection as PHIN lists it ("Latest inspection (OSDH) · date · 3 violations noted", OSDH's note word for
  word), never a grade; "OSDH Inspections" is one list among the guides, sorted by date, distance or name. "Serves alcohol" comes only
  from a matched ABLE on-premises license (unknown, never "no", otherwise). Tulsa's and Oklahoma City-County's own searches aren't
  read (PHIN covers both counties).
- **No Google data anywhere**, not even the private web build. `calibrate.py` measures nothing; the keep rule is the family's
  (Meta 0.95, or 0.90 with a website), and a listing matched to a PHIN or ABLE record is kept as confirmed.
- **PHIN writes suites after "#"** ("1925 W Gore # C"): `official.street_key` drops them (but keeps "Highway #49" a route), or the
  street key read "GORE C" and missed "Gore Blvd Ste C". ar-eats has the same key since 2026-11-07; ms-eats still keys the suite (12
  records).
- **No MICHELIN Guide covers Oklahoma**: the honors guide is "James Beard Honors"; the Bib Gourmand filter hides itself.
- **Hand-checked matching is strict** (from ms-eats and ar-eats): a statewide name match must be within 30 km of the checked town's
  centre, the checked town overrides a listing's town only when the source's address matched (Meers Store: Lawton -> Meers), and
  every research file's spellings count. Chains with several branches (Tucker's, S&B's) need the source's address.
- **Guides** (tags in `oklahoma.py` TAGS; bits 1..16): burgers (El Reno onion burgers and TravelOK's burger joints), cfs
  (chicken-fried steak), bbq (TravelOK's "Smoky Sixteen"), route66 (Route 66 diners and cafés), oldest (founded 1960 or earlier, by
  the source's year: Cattlemen's 1910, Clanton's and Hamburger King 1927, Bob's Pig Shop 1933, the Rock Cafe 1939, Happy Burger 1957).
  Research is hand-written in `data/research/app/*.json`; `build_research.py` only checks it and writes `LEADS.md`.
- **Honors**: James Beard: Florence's Restaurant (America's Classics 2022), Grey Sweater (Andrew Black, Best Chef: Southwest 2023),
  Country Bird Bakery (Cat Cox, Outstanding Pastry Chef or Baker 2025); 2025 and 2026 finalists and semifinalists (FarmBar, Nonesuch,
  Fait Maison, Sedalia's, Bar Sen, Later Bye, Noche, Naija Wife Kitchen, Plus254, Café Kacao). Restaurateur-only honors (McNellie's
  Group, 84 Hospitality) aren't put on a single place.
- **Venues**: the OU and OSU stadiums and arenas, Paycom Center, BOK Center, the ballparks, State Fair Park and Expo Square, the
  prisons and the bases (Tinker, Fort Sill, Vance, Altus, McAlester); airports by address (Will Rogers at 7100 Terminal Dr, Tulsa
  International at 7777 E Apache St). CASINO is no venue word.

## Rebuild
```bash
cd pipeline
../.venv/bin/python check_sources.py URL...   # a new host first
../.venv/bin/python fetch_overture.py && ../.venv/bin/python fetch_extras.py && ../.venv/bin/python fetch_official.py --go able lists   # ~4 h
../.venv/bin/python geocode_official.py && ../.venv/bin/python geocode_census.py && ../.venv/bin/python listings.py
../.venv/bin/python calibrate.py && ../.venv/bin/python oklahoma.py && ../.venv/bin/python build_research.py
OK_APP=1 OK_WANTED=1 ../.venv/bin/python oklahoma.py && ../.venv/bin/python fetch_official.py --go details   # ~5 h the first time; then the chain again
OK_APP=1 ../.venv/bin/python oklahoma.py && cd .. && cp data/app/places.json data/app/detail-*.json OklahomaEats/Resources/
.venv/bin/python pipeline/check_websites.py && .venv/bin/python pipeline/check_websites.py --retry-transient   # then re-export
.venv/bin/python scripts/make-site.py && .venv/bin/python scripts/publish_app_data.py && .venv/bin/python scripts/publish_app_data.py --check
.venv/bin/python scripts/qa-site.py && .venv/bin/python scripts/write-listing.py
```
The `.venv` is on the python.org framework Python 3.12 with md-eats' versions. `data/chain_auv.json` is a copy of wy-eats'.

## App, site, screenshots
- App: `OklahomaEats/` (XcodeGen `project.yml`, bundle `com.oklahomaeats.ios`, display "Oklahoma Eats"), tests in
  `OklahomaEatsTests/` (fixture, guides, inspections as PHIN lists them, never a grade, outline towns: Guymon, Boise City, Arkoma, Idabel in; Fort Smith,
  Wichita Falls, Coffeyville, Clayton out; data guards) and `OklahomaEatsUITests/`. Tests: `xcodebuild test -scheme OklahomaEats
  -destination id=<sim> -parallel-testing-enabled NO` with `DEVELOPER_DIR="/Applications/Xcode 1.app/Contents/Developer"` (no
  CODE_SIGNING_ALLOWED=NO: UI tests need a signed runner). Archive only with Xcode 1.app (27.2, 27B52). Run `xcodegen generate`
  whenever `Resources/*.json` changes.
- Site: `scripts/make-site.py` → `docs/` (no static inspections page: PHIN's inspections are one list in the web app, "OSDH inspections"); `scripts/explore.js` the web app; `scripts/qa-site.py`. URL for now:
  nickstrom5.github.io/oklahoma-eats (no CNAME). City pages from CITY_WANTED where a town has at least 4 listed places.
- Screenshots: `scripts/capture-screenshots.sh <sim> home burgers cfs bbq route66 detail map honors oldest inspections saved
  about`
  (ScreenshotMode pins Oklahoma City's Midtown; the map at a 9 km span from the Stockyards to Nichols Hills, five picks as single pins; El Reno for the detail, Sid's Diner), then `scripts/site-images.sh`, make-site,
  qa-site; App Store frames `scripts/appstore-screenshots.py` (iPhone: home burgers detail cfs bbq map route66 saved; iPad: home
  burgers cfs map bbq route66).

## Rules
No commits, pushes, public repos, App Store Connect or DNS changes without Nick's yes each time; never submit for review or accept
agreements; never publish Google-derived data. Support email nick@eatsranked.com. Commit author "Nick Soderstrom"
<329204362+nickstrom5@users.noreply.github.com> via `-c user.name -c user.email`.

## Status (2026-11-07, final)
- DONE: pipeline (Overture 2026-10-21.0, 77 counties, border towns checked), PHIN (every county's list, then 7,779 matched
  establishments' details, one request every 2.5 s, 2026-11-06 to 2026-11-07) and ABLE's October 2026 lists (Nick's yes,
  2026-11-06), research (65 entries, 60 matched; leads in LEADS.md), app export **10,404 places / 9,881 restaurants** in 377 towns
  (7,560 restaurants show PHIN's latest inspection as PHIN lists it; 1,624 places an ABLE on-premises license; 19 honored), website
  link check (4,360 OK), Swift app, icon concepts (all pass check.swift) + make-brand, site (14 pages) + web app, OTA local copy
  `--check` OK (2026-11-07.1), `listing.json` (lengths checked), 12-sources and 13-app-review-reply (3,907 characters) at the final
  counts.
- Tests (iOS 27.0 simulators, Xcode 1.app 27.2): iPad 13": all unit + UI tests pass (launch 4.7 s). iPhone 17 Pro Max: all unit +
  UI tests pass except testLaunchIsQuick, 6.77 s at load 15.5 (limit 6 s; it skips above 16.5). Rerun from a quiet start it
  skipped (8.4 s at load 32): the shared Mac never stayed quiet through a build and test. On a quiet Mac (the parent session's run, 2026-11-07) it
  passed on iPhone at 4.50 s. After the map-screenshot change the unit tests passed again on both.
- Screenshots: 12 iPhone + 6 iPad captures (the map on Oklahoma City's picks as single pins; the iPad map frame shows Nic's Grill,
  whose latest inspection has no violations, not Cattlemen's with nine), App Store frames in `playbook/app-store/{iphone,ipad}/`,
  site images; full `qa-site.py` (static + browser) passes.
- **Ready to publish**; nothing is public. Nick's decisions (2026-11-07): the name "Oklahoma Eats: Restaurants", the subtitle
  "Onion Burgers, BBQ & Route 66", icon A (the onion burger, on sky blue) and the palette are final. The launch-time test passed
  on a quiet Mac (iPhone 4.50 s, the parent session's run of 2026-11-07).
