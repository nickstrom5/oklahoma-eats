# Oklahoma sources and calibration (checked 2026-11-07)

## Official sources (Nick approved the PHIN pull and the ABLE lists on 2026-11-06: "Yes, all four", through the parent session)
| Source | What it has | Can a script read it? | Used |
|---|---|---|---|
| OSDH PHIN inspections (www.phin.state.ok.us/Inspections/) | every county's food service establishments (Oklahoma City-County's and Tulsa's too) and each one's inspections: a date and the violations noted ("No violations reported" when none); **no result, score or grade** | an ASP.NET postback search by county; no export, CAPTCHA or robots.txt | yes: all 77 county lists (24,419 establishments, 15 a page), then the details page of each establishment that matches a kept place (7,779), one request every 2.5 s with a generic client name; read 2026-11-06 to 2026-11-07 |
| ABLE Commission, "Listing of Licensees by License Type" (oklahoma.gov, monthly MHTML .xls; robots.txt allows all) | Mixed Beverage, Beer and Wine, Brew Pub, Hotel Beverage and the retail lists: license number, county, trade name, address, expiry | yes | yes: the October 2026 lists, 8,829 live licenses: 2,590 on-premises and 6,239 package (expired ones dropped); a licensee's personal name is never shown |
| Tulsa Health Department (ok.healthinspections.us/tulsa/) | an official "Inspection Result" per report (e.g. "Compliant"), from 2024 | search-only; inspector comments carry names and emails | no: PHIN covers Tulsa County |
| Oklahoma City-County (occhd.inspect2go33.com) | the most recent food inspection | exports disabled; undocumented JSON (don't script) | no: PHIN covers Oklahoma County |
| OSDH open records (51 O.S. § 24A) | inspections and the food-license list in bulk | a request Nick sends | no |
| Oklahoma County tax parcels; Tulsa County (INCOG) parcels | values and owner names | partly | no (terms unconfirmed; owner names never ship) |

PHIN's establishments and ABLE's licenses never add a place; they attach to the places they match (an address-and-name match), and
one business's records (its inspection and its license) are grouped. A place shows its latest inspection as PHIN lists it: the date
and the number of violations noted, labeled OSDH's, with OSDH's note ("An inspection is a snapshot in time. A review of the
inspection history is a better indicator of a food service establishments operational conditions."); never a grade, and no list is
ranked by it. The app's "OSDH Inspections" list sorts by date, distance or name. "Serves alcohol" is yes only for a matched ABLE
on-premises license (Mixed Beverage, Beer and Wine, Brew Pub, Hotel Beverage); otherwise unknown.

## Calibration
- The keep rule is the family's (Meta 0.95, or 0.90 with a website); a listing matched to a PHIN or ABLE record is kept as
  confirmed. `calibrate.py` gives every listing its county.
- No Google data anywhere (not even the private web build): listings.py's Google 2021 table is empty.
- Overture 2026-10-21.0: 18,592 eating and drinking listings in the Oklahoma box (864 marked closed by Overture). Matched to an
  official record: 8,732 listings (7,596 PHIN, 1,136 ABLE). The App Store build ships **10,404 places, 9,881 restaurants** in 77
  counties (Census CBP 2023: 7,955 NAICS 722 establishments): 7,560 restaurants show a PHIN inspection and 1,624 places an ABLE
  on-premises license. Records of one business group at the same number and street in the same zip or town (the lists
  disagree on zips: Takaramono is 73106 at ABLE, 73107 at PHIN).
- Website links: 7,158 checked, 4,360 OK after the check and the transient retry; 45 gambling or adult and 14 hacked pages dropped;
  5,140 places ship a website. No adult club in the data.
- Border towns checked against the outline: Guymon and Boise City (the Panhandle), Ponca City, Miami, Sallisaw, Poteau, Arkoma, West
  Siloam Springs, Idabel, Durant, Ardmore and Altus are inside; Fort Smith and Siloam Springs (Arkansas), Wichita Falls, Denison,
  Vernon and Dalhart (Texas), Arkansas City, Coffeyville and Liberal (Kansas), Joplin (Missouri) and Clayton (New Mexico) are out.

## Research sources (each place cites its own; every host passed check_sources.py)
- TravelOK, the Oklahoma Tourism and Recreation Department's site (current pages, ©2026, read 2026-11-06): "Hamburger Heaven: Burger
  Joints in Oklahoma" (16 places used; the Braum's and Ron's chains left out), "Chicken Fry Favorites" (7 used; Del Rancho has no town),
  "The Smoky Sixteen" barbecue (18 entries; Van's Pig Stand has three), "Top Diners, Cafés and Eateries Along Route 66", and the
  listings for Johnnie's Grill, Sid's Diner, Tucker's Onion Burgers, Chuck House and Cattlemen's Steakhouse.
- Visit OKC, "James Beard chefs and restaurants in OKC" (2026-06-19); jamesbeard.org's 2025 and 2026 semifinalists and nominees.
  No MICHELIN Guide covers Oklahoma.
- Blocked (robots): oklahoman.com, tulsapeople.com, kfor.com, koco.com, news9.com, kosu.org, okcfox.com, fox23.com, kswo.com;
  elreno.org didn't answer; onlyinyourstate.com and atlasobscura.com answer our fetcher 403.
- Leads (data/research/app/LEADS.md): Van's Pig Stand in Shawnee (two Shawnee listings; the source gives no address), Ray's
  Smokehouse BBQ (Norman; no listing), S&B's Burger Joint (two Oklahoma City branches), Birdie's (Edmond) and The Crown (two
  similarly named Oklahoma City listings) for the James Beard list. Eischen's Bar (Okarche, 1896) waits for a 2025-26 source. Back Porch Draft House (Lawton): TravelOK gives the town; its
  address is the one ABLE's October list and PHIN give ("Back Porch & Drafthouse", 1925 W Gore Blvd Ste C).
