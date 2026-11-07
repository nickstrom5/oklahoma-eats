// Oklahoma Eats web app: the iPhone app's guides, search, filters, map and place details, in the browser.
// Keep its guide rules in step with OklahomaEats/Models/Guide.swift and its search with OklahomaEats/Models/Search.swift.
// Same data as the app, split by scripts/make-site.py into data/core.json (list, search and map columns), data/ids.json (each place's
// stable id, fetched at the first tap, key, scroll or hover, so a visit that only looks doesn't download it; saved places and #p= links
// wait for it) and data/detail-<county>.json (phones, websites, notes, and county records or inspection results where a state has them), fetched per
// county when a place there is opened. Every data file carries the version of the core.json it was built with (core.json "ver",
// detail "_v", ids "v"): files from another build are fetched again, and never mixed in, because ids and details are keyed by row. No cookies, no trackers; saved places and the last guide live in this browser's localStorage only
// (keys start with okeats-: other state sites share the nickstrom5.github.io origin).
// The page runs under a strict Content-Security-Policy (hash-pinned inline script and style): never add inline event handlers or
// inline style attributes to the HTML built here; set properties from code instead.
(() => {
  "use strict";
  const BASE = document.documentElement.dataset.base || "";
  const $ = (s) => document.querySelector(s);
  // every value that goes into innerHTML passes through esc(), numbers included (the data file is trusted, but not that much)
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const own = (o, k) => typeof k === "string" && Object.prototype.hasOwnProperty.call(o, k);   // Object.hasOwn, for older Safari too
  const PREFIX = "okeats-";
  const store = {
    get(k, d) { try { const v = localStorage.getItem(PREFIX + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  // only http(s) links leave the page; bare hosts ("example.com/menu") get https://
  const safeUrl = (u) => {
    u = String(u ?? "").trim();
    if (/^https?:\/\/[^\s"'<>\\]+$/i.test(u)) return u;
    if (/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}(?:[/?#][^\s"'<>\\]*)?$/i.test(u)) return "https://" + u;
    return null;
  };
  const num = (x) => (x == null || x === "" || !Number.isFinite(Number(x)) ? null : Number(x));
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmtDate = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? "")); return m ? `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}` : String(s ?? ""); };
  // OSDH's PHIN inspection search (every county; by search only, no score or grade): linked from each place
  const DPH_URL = "https://www.phin.state.ok.us/Inspections/";
  const SCORE_LIST = {};

  // ---------------------------------------------------------------- search (a port of OklahomaEats/Models/Search.swift)
  // pikes are street types too, and "state st" is a street, not the state
  const typeSyn = { avenue: "ave", av: "ave", street: "st", boulevard: "blvd", road: "rd", drive: "dr", place: "pl", court: "ct",
    parkway: "pkwy", highway: "hwy", lane: "ln", trail: "trl", circle: "cir", terrace: "ter", pike: "pike", pk: "pike", pke: "pike" };
  // directions and road names: "north main" finds "N Main St", "interstate 40" finds "I-40"
  const syn = { ...typeSyn, north: "n", south: "s", east: "e", west: "w", northwest: "nw", northeast: "ne", southwest: "sw", southeast: "se",
    saint: "st", mount: "mt", fort: "ft", interstate: "i", ih: "i", freeway: "fwy", expressway: "expy" };
  const abbrs = new Set(Object.values(syn)), typeAbbrs = new Set(Object.values(typeSyn));
  const DIRS = new Set(["n", "s", "e", "w", "ne", "nw", "se", "sw"]);
  // the bit order is pipeline/oklahoma.py's TAGS
  const BURGERS = 1, CFS = 2, BBQ = 4, ROUTE66 = 8, OLDEST = 16;
  // a dish ("gumbo", "pig ear sandwich") is not a tag: it's in each hand-checked place's search text, so it finds the places serving it
  const tagPhrases = [["onion burgers", BURGERS], ["onion burger", BURGERS], ["burger joints", BURGERS], ["chicken fried steak", CFS],
    ["chicken fry", CFS], ["cfs", CFS], ["barbecue", BBQ], ["bbq", BBQ], ["bar b q", BBQ], ["route 66", ROUTE66], ["route66", ROUTE66]];
  // letters with no accent to strip (NFD keeps them): "pho tay do" must find Phở Tây Đô (Ohio's 2026-10-24 fix)
  const UNACCENTED = { "ø": "o", "æ": "ae", "œ": "oe", "đ": "d", "ł": "l", "ß": "ss", "þ": "th", "ı": "i" };
  function normalize(s) {
    let t = String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[øæœđłßþı]/g, (c) => UNACCENTED[c]);
    // initials keep together, so "jr crickets" finds J.R. Crickets (St. and E. Main St stay as they are)
    t = t.replace(/\b([a-z])\.(?=[a-z]\b)/g, "$1");
    t = t.replace(/\b([a-z0-9])\s*&\s*([a-z0-9])\b/g, "$1$2").replace(/&/g, " and ").replace(/['’`]/g, "");
    return t.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }
  const normAddr = (s) => normalize(s).split(" ").map((w) => (own(syn, w) ? syn[w] : w)).join(" ");

  function parse(text) {
    const q = { tokens: [], town: null, townPhrase: null, tag: 0, tagPhrase: null, tagStem: null, townNeedle: null, streetNeedle: null };
    let raw = normalize(text).split(" ").filter(Boolean);
    if (!raw.length) return q;
    let mapped = raw.map((w) => (own(syn, w) ? syn[w] : w));
    const find = (phrase) => {
      const p = phrase.split(" ");
      for (let i = 0; i + p.length <= mapped.length; i++) if (p.every((w, k) => mapped[i + k] === w)) return [i, i + p.length];
      return null;
    };
    const cut = ([a, b]) => { const words = raw.slice(a, b).join(" "); raw.splice(a, b - a); mapped.splice(a, b - a); return words; };
    for (const [phrase, tag] of tagPhrases) { const r = find(normalize(phrase)); if (r) { q.tag = tag; q.tagPhrase = cut(r); break; } }
    if (q.tagPhrase) { const stem = normalize(q.tagPhrase).replace(/s$/, ""); q.tagStem = stem ? " " + stem : null; }
    // the longest town named in the query wins, unless a street type follows it ("houston st" is a street)
    for (const key of TOWN_KEYS_BY_LENGTH) {
      const r = find(key);
      if (r && !(r[1] < mapped.length && typeAbbrs.has(mapped[r[1]]))) {
        // a direction word right before the town ("north shreveport") may mean the street as well as the town
        if (r[0] > 0 && DIRS.has(mapped[r[0] - 1])) q.streetNeedle = " " + mapped.slice(r[0] - 1, r[1]).join(" ") + " ";
        q.town = TOWN_KEYS[key]; q.townPhrase = cut(r); q.townNeedle = " " + normalize(q.townPhrase); break;
      }
    }
    const stop = new Set(["the", "and", "of", "a", "in", "near", "me"]);   // "barbecue near me" isn't a place named "Me"
    let idx = raw.map((_, i) => i);
    // stop words stay only when they're all there is ("the"); next to a guide or a town ("lemon pepper near me") they go
    if (q.tag || q.town || idx.some((i) => !stop.has(mapped[i]))) idx = idx.filter((i) => !stop.has(mapped[i]));
    idx.forEach((i, n) => {
      const token = raw[i], isLast = n === idx.length - 1;
      if (own(syn, token)) { q.tokens.push([` ${syn[token]} `, ` ${token}`]); return; }
      const whole = (abbrs.has(token) && (!isLast || token.length > 1)) || (token.length <= 2 && !isLast);
      const needles = [" " + token + (whole ? " " : "")];
      if (isLast && token.length >= 3) for (const [word, abbr] of Object.entries(typeSyn)) if (word !== token && word.startsWith(token)) needles.push(` ${abbr} `);
      q.tokens.push(needles);
    });
    // "brady st": a finished street type sticks to the word before it
    if (q.tokens.length >= 2 && idx.length && typeAbbrs.has(mapped[idx[idx.length - 1]])) {
      const last = idx[idx.length - 1], prev = idx[idx.length - 2];
      q.tokens.splice(-2, 2, [` ${mapped[prev]} ${mapped[last]} `, ` ${raw[prev]} ${raw[last]}`]);
    }
    return q;
  }
  const qEmpty = (q) => !q.tokens.length && !q.town && !q.tag;
  function matches(p, q) {
    if (q.tag && !(p.g & q.tag)) { if (!q.tagStem || !p.nameText.includes(q.tagStem)) return false; }
    if (q.town && p.c !== q.town) {
      if (!(q.townNeedle && p.nameText.includes(q.townNeedle)) && !(q.streetNeedle && p.search.includes(q.streetNeedle))) return false;
    }
    return q.tokens.every((needles) => needles.some((n) => p.search.includes(n)));
  }
  const nameMatches = (p, q) => q.tokens.length && q.tokens.every((needles) => needles.some((n) => p.nameText.includes(n)));

  // ---------------------------------------------------------------- guides (OklahomaEats/Models/Guide.swift)
  const hcTag = (t) => (p) => p.hc && Boolean(p.g & t);
  const HC_SORTS = ["featured", "nearest", "name"];
  const GUIDES = {
    burgers: { title: "Onion Burgers & Burger Joints", sub: "Hand-checked El Reno onion burgers and the state's classic burger joints", inc: hcTag(BURGERS), sorts: HC_SORTS },
    cfs: { title: "Chicken-Fried Steak", sub: "Hand-checked chicken-fried steak, the heart of the state meal", inc: hcTag(CFS), sorts: HC_SORTS },
    bbq: { title: "Oklahoma Barbecue", sub: "Hand-checked barbecue, from Bob's Pig Shop to Tulsa's Pearl District", inc: hcTag(BBQ), sorts: HC_SORTS },
    route66: { title: "Route 66 Stops", sub: "Hand-checked diners and cafés on Oklahoma's Route 66", inc: hcTag(ROUTE66), sorts: HC_SORTS },
    honors: { title: "James Beard Honors", sub: "James Beard Foundation honorees", inc: (p) => p.mi > 0 || p.jb, sorts: ["iconic", "nearest"] },
    scores: { title: "OSDH Inspections", sub: "The Oklahoma State Department of Health's latest inspection, as PHIN lists it", inc: (p) => p.sd != null, sorts: ["recent", "nearest", "name"] },
    oldest: { title: "Oldest Places", sub: "Founding years from the source, oldest first", inc: (p) => p.f != null && p.hc && Boolean(p.g & OLDEST), sorts: ["oldest"], ranked: true },
    all: { title: "All Restaurants", sub: "Restaurants, cafés, bars and bakeries statewide", inc: () => true, sorts: ["name", "nearest"] },
    saved: { title: "Saved", sub: "Places you saved in this browser", inc: (p) => saved.has(p.id), sorts: ["name", "nearest"] },
  };
  const HC_GUIDES = ["burgers", "cfs", "bbq", "route66"];
  const SORT_LABEL = { featured: "Featured first", nearest: "Nearest", oldest: "Oldest first", name: "A to Z", iconic: "Honor, then name",
    recent: "Latest inspection first" };
  const MI = ["", "MICHELIN Recommended", "Bib Gourmand", "1 MICHELIN Star", "2 MICHELIN Stars", "3 MICHELIN Stars"];
  const CHIP = [[BURGERS, "Burger joint"], [CFS, "Chicken-fried steak"], [BBQ, "Barbecue"], [ROUTE66, "Route 66"]];

  // ---------------------------------------------------------------- state
  let P = [], CAL = {}, TOWN_KEYS = {}, TOWN_KEYS_BY_LENGTH = [], GENERATED = "", META = {};
  let here = null, shown = 100, current = [], view = "list";
  const savedRaw = store.get("saved", []);
  const saved = new Set(Array.isArray(savedRaw) ? savedRaw.filter((x) => typeof x === "string" && x.length < 64) : []);
  const st = { g: "burgers", q: "", sort: "", town: "", cuisine: "", chains: false, bib: false, p: "" };
  let bibCount = 0;   // Bib Gourmand places (non-restaurants left out): the box shows only when there are some

  const miles = (a, b) => {
    const r = Math.PI / 180, dLa = (b.la - a.la) * r, dLo = (b.lo - a.lo) * r;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.la * r) * Math.cos(b.la * r) * Math.sin(dLo / 2) ** 2;
    return 3958.8 * 2 * Math.asin(Math.sqrt(h));
  };
  const milesText = (m) => (m < 10 ? m.toFixed(1) : Math.round(m)) + " mi";

  function order() {
    const g = GUIDES[st.g];
    let o = st.sort && g.sorts.includes(st.sort) ? st.sort : HC_GUIDES.includes(st.g) && here ? "nearest" : g.sorts[0];
    if (o === "nearest" && !here) o = g.sorts.find((s) => s !== "nearest") || o;   // no location yet: say what the list is really sorted by
    return o;
  }

  function allows(p) {
    if (st.town && p.c !== st.town) return false;
    if (st.cuisine && p.cu !== st.cuisine) return false;
    if (st.chains && p.ch >= 5) return false;
    if (st.bib && p.mi !== 2) return false;      // MICHELIN Bib Gourmand only, as the app's Filters switch
    return true;
  }

  function list() {
    const g = GUIDES[st.g], q = parse(st.q), o = order();
    if (qEmpty(q) && st.q.trim()) return [];   // typed something, but nothing searchable ("🍕", "!!!")
    let out = P.filter((p) => g.inc(p) && allows(p) && (qEmpty(q) || matches(p, q)));
    const byName = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.i - b.i);
    if (o === "nearest" && here) {
      const dist = new Map(out.map((p) => [p, p.la != null ? miles(here, p) : Infinity]));
      out.sort((a, b) => dist.get(a) - dist.get(b) || byName(a, b));
    }
    else if (o === "featured") out.sort((a, b) => (b.ip ?? -1) - (a.ip ?? -1) || (a.f ?? 9999) - (b.f ?? 9999) || byName(a, b));
    else if (o === "oldest") out.sort((a, b) => (a.f ?? 9999) - (b.f ?? 9999) || byName(a, b));
    else if (o === "recent") out.sort((a, b) => (b.sd ?? -1) - (a.sd ?? -1) || byName(a, b));   // the inspection date; the score never orders a list
    else if (o === "iconic") {   // MICHELIN distinction, then the James Beard honor, then name (the app's order)
      const jb = (p) => (p.h & 1 ? 4 : p.h & 2 ? 3 : p.h & 4 ? 2 : p.h & 8 ? 1 : 0);
      out.sort((a, b) => (b.mi || 0) - (a.mi || 0) || jb(b) - jb(a) || byName(a, b));
    }
    else out.sort(byName);
    if (q.tokens.length && !g.ranked) {       // name matches first when searching
      const named = out.filter((p) => nameMatches(p, q));
      if (named.length && named.length < out.length) { const ids = new Set(named); out = named.concat(out.filter((p) => !ids.has(p))); }
    }
    return out;
  }

  // ---------------------------------------------------------------- rendering
  const jbLabel = (p) => (p.h & 1 ? "America's Classic" : p.h & 2 ? "James Beard winner" : p.h & 4 ? "James Beard finalist" : p.h & 8 ? "James Beard semifinalist" : p.jb ? "James Beard (restaurateur)" : null);
  function chips(p, max) {
    const c = [];
    if (p.mi && MI[p.mi]) c.push(`<span class="tag tag-mi">${esc(MI[p.mi])}</span>`);
    const jb = jbLabel(p);
    if (jb) c.push(`<span class="tag tag-jb">${esc(jb)}</span>`);
    if (p.hc) for (const [t, label] of CHIP) if (p.g & t) c.push(`<span class="tag">${label}</span>`);
    if (p.hc && p.g & OLDEST && p.f) c.push(`<span class="tag tag-plain">Since ${esc(p.f)}</span>`);
    if (p.ch >= 5) c.push(`<span class="tag tag-plain">Chain · ${esc(p.ch)}</span>`);
    if (p.t === 0 && !p.h && !p.mi && !p.hc) c.push('<span class="tag tag-dash">Listing only</span>');
    return (max ? c.slice(0, max) : c).join("");
  }

  function metric(p, o) {
    if (o === "nearest" && here && p.la != null) return [milesText(miles(here, p)), "away"];
    if (p.f && st.g !== "all") return [String(p.f), "since"];
    return null;
  }

  function render() {
    const g = GUIDES[st.g], o = order();
    if (st.g === "saved" && !idsReady) loadIds().then(() => { if (st.g === "saved") render(); });
    current = list();
    document.querySelectorAll(".ex-guides button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.g === st.g)));
    $("#ex-sub").textContent = g.sub;
    const sortSel = $("#ex-sort");
    sortSel.innerHTML = g.sorts.map((s) => `<option value="${esc(s)}"${s === o ? " selected" : ""}>${esc(SORT_LABEL[s])}</option>`).join("");
    sortSel.disabled = g.sorts.length < 2;
    const filters = [st.town && `in ${st.town}`, st.cuisine && st.cuisine, st.chains && "no chains", st.bib && "Bib Gourmand"].filter(Boolean);
    $("#ex-count").textContent = `${current.length.toLocaleString()} ${current.length === 1 ? "place" : "places"} · ${SORT_LABEL[o]}` + (filters.length ? ` · ${filters.join(", ")}` : "");
    $("#ex-clear").hidden = !filters.length;
    // Near me stays: each tap asks for a fresh fix (people move), and it's how to retry after a timeout
    if (view === "list") renderList(o); else drawMap();
    saveHash();
  }

  // typing searches only the open guide (the page opens on Lemon Pepper Wings): when that finds little, the same words across every
  // restaurant, with the same filters, so a famous place outside the guide isn't a dead end
  const FEW = 5;
  function elsewhereCount() {
    const q = parse(st.q);
    if (st.g === "all" || qEmpty(q) || current.length >= FEW) return 0;
    let n = 0;
    for (const p of P) if (allows(p) && matches(p, q)) n++;
    return n > current.length ? n : 0;
  }
  const allButton = (n) => `<button type="button" class="ex-small" id="ex-all">Search all restaurants (${esc(n.toLocaleString())} ${n === 1 ? "match" : "matches"})</button>`;
  function wireAll() {
    const b = $("#ex-all");
    if (b) b.onclick = () => { st.g = "all"; st.sort = ""; shown = 100; render(); const r = $(".ex-row"); if (r) r.focus(); };
  }

  function renderList(o) {
    const ol = $("#ex-list");
    const g = GUIDES[st.g];
    const elsewhere = elsewhereCount();
    if (!current.length) {
      ol.innerHTML = `<li class="ex-empty">${st.g === "saved" && !idsReady ? "Loading your saved places…" : st.g === "saved" && idsFailed && saved.size ? "Your saved places couldn't load: you may be offline, or the site was just updated. Reload the page to try again." : elsewhere ? `Nothing in ${esc(g.title)} matches that. ${allButton(elsewhere)}` : st.g === "saved" ? "Nothing saved yet. Open a place and tap Save to keep it here, in this browser." : "No places match. Try fewer words or clear the filters."}</li>`;
      wireAll();
      $("#ex-more").hidden = true;
      return;
    }
    ol.innerHTML = current.slice(0, shown).map((p, i) => {
      const m = metric(p, o);
      const rank = g.ranked ? `<span class="ex-rank${i < 3 ? " top" : ""}" aria-label="Rank ${i + 1}">${i + 1}</span>` : "";
      const where = [p.c, p.cu].filter(Boolean).join(" · ");
      const big = m ? `<b>${esc(m[0])}</b>` : "";
      return `<li><button class="ex-row" data-i="${esc(p.i)}">${rank}<span class="ex-main"><b>${esc(p.n)}</b><span class="ex-town">${esc(where)}</span><span class="ex-chips">${chips(p, 4)}</span></span>${m ? `<span class="ex-metric">${big}<small>${esc(m[1])}</small></span>` : ""}</button></li>`;
    }).join("") + (elsewhere ? `<li class="ex-empty">Only ${esc(current.length)} in ${esc(g.title)}. ${allButton(elsewhere)}</li>` : "");
    wireAll();
    const left = current.length - shown;
    $("#ex-more").hidden = left <= 0;
    $("#ex-more").textContent = `Show more (${left.toLocaleString()} left)`;
  }

  // ---------------------------------------------------------------- place panel
  const TIER = { 2: "On an official list", 1: "High-confidence listing", 0: "Listing only" };   // "High-confidence", not "confirmed" (Nick, 2026-10-13)

  // the state's alcohol licenses are the only statewide official list, and only places serving alcohol hold one, so its match rates are a
  // floor for comparing kinds of listings, not a rate to quote per place (the app shows none either)
  function howWeKnow(p) {
    const src = SOURCES[p.s] || "meta";
    if (src === "research") return "On our hand-checked list (checked against a 2025 or 2026 source). The open map data didn't list it as a place to eat, so it's placed from its own map listing or street address.";
    if (p.t === 2) return src === "official"
      ? "From the state's alcohol license list. The open map data didn't have it, so it's placed on its licensed street address."
      : "Matched to an active state alcohol license.";
    return (p.t === 1 ? "A high-confidence listing in Overture's open map data." : "A single listing in Overture's open map data, so it may be closed or misfiled.")
      + (p.hc ? " It's also on our hand-checked list, checked against a 2025 or 2026 source." : "");
  }

  const kv = (k, v) => (v == null || v === "" ? "" : `<div class="ex-kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>`);
  const section = (t, body) => `<section class="ex-sec"><h3>${esc(t)}</h3>${body}</section>`;
  let listAtPush = null;   // the list's URL state when a place was opened with pushState (Back then closes the panel)

  // the open place is a modal dialog at every width (a bottom sheet on phones, a side sheet on wider screens, which would otherwise
  // cover Near me and the List/Map buttons): everything behind it is inert, and a click on the dimmed backdrop closes it
  function panelMode() {
    const panel = $("#ex-panel"), modal = !panel.hidden;
    if (modal) { panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); }
    else { panel.removeAttribute("role"); panel.removeAttribute("aria-modal"); }
    $("#ex-backdrop").hidden = !modal;
    const behind = [...document.querySelectorAll("body > .skip, .wrap > header, .wrap > nav, .wrap > footer, #main > *")].filter((el) => el !== panel && el.id !== "ex-backdrop");
    behind.forEach((el) => { el.inert = modal; });
  }

  // PHIN lists each inspection's violations and gives no score or grade: the latest is shown as PHIN lists it, dated, labeled OSDH's,
  // with PHIN's own note; never a grade of ours, and no list is ordered by it
  const inspectionSection = (d, p) => {
    const ins = Array.isArray(d.ins) && d.ins.length >= 3 ? d.ins : null;
    const note = `<p class="ex-fine">How many violations the Oklahoma State Department of Health's PHIN search notes for the inspection. OSDH gives no score or grade, and this site computes none. PHIN: "An inspection is a snapshot in time. A review of the inspection history is a better indicator of a food service establishments operational conditions."</p>`;
    const link = `<p><a href="${DPH_URL}" rel="noopener" target="_blank">Search PHIN's inspection reports</a></p>`;
    if (ins) return section("Health inspections", kv("Latest inspection (OSDH)", `${fmtDate(ins[1])} · ${ins[0]}`) + note + link);
    return section("Health inspections", `<p class="ex-fine">The Oklahoma State Department of Health licenses every food establishment. This place isn't matched to an inspection in its PHIN search, so none is shown.</p>` + link);
  };

  function openPlace(p, push = true) {
    const panel = $("#ex-panel");
    const wasOpen = !panel.hidden;
    // the place opens at once; its id (for Save, the #p= link and the Back step) follows when ids.json arrives, which the first tap
    // only starts, so a tap never waits on it. If ids.json can't load (offline, or a build changed under us), the place stays open
    // without Save and without a link.
    const waiting = p.id == null && !idsReady;
    if (waiting && (push || !wasOpen)) loadIds().then(() => { if (!panel.hidden && panel.dataset.i === String(p.i)) openPlace(p, push); });
    const noId = p.id == null, pid = p.id ?? "";
    // a re-render (the county's details just arrived) replaces the panel's buttons: remember where keyboard focus was, to put it back
    const focused = wasOpen && panel.contains(document.activeElement) ? document.activeElement : null;
    const refocus = focused && (focused.id ? `#${focused.id}` : focused.textContent.trim());
    st.p = pid;
    const loaded = DETAIL_LOADED.has(p.co), failed = DETAIL_FAILED.has(p.co);
    const d = DETAIL.get(p.i) || {};
    const la = num(p.la), lo = num(p.lo);
    const addr = [p.a, [p.c, p.z].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    const apple = la != null && lo != null
      ? `https://maps.apple.com/?q=${encodeURIComponent(p.n)}&ll=${la},${lo}`
      : `https://maps.apple.com/?q=${encodeURIComponent(p.n + ", " + addr)}`;
    const dirs = la != null && lo != null ? `https://maps.apple.com/?daddr=${la},${lo}&dirflg=d` : apple;
    const site = safeUrl(d.w);
    const tel = d.ph ? String(d.ph).replace(/[^\d+]/g, "") : "";
    let html = `<button class="ex-close" id="ex-close" aria-label="Close">×</button>
      <p class="ex-kicker">${esc([p.c || "Oklahoma", p.county && p.county !== "Oklahoma" ? p.county : ""].filter(Boolean).join(" · ").toUpperCase())}</p>
      <h2 id="ex-pname">${esc(p.n)}</h2>
      <p class="ex-addr">${esc([addr, p.cu].filter(Boolean).join(" · "))}</p>
      ${here && la != null ? `<p class="ex-dist">${esc(milesText(miles(here, p)))} away</p>` : ""}
      <p class="ex-chips">${chips(p)}</p>
      <div class="ex-actions">
        <a class="btn ex-apple" href="${esc(apple)}" rel="noopener" target="_blank">Ratings, hours &amp; photos · Apple Maps</a>
        <div class="ex-act-row">
          <a href="${esc(dirs)}" rel="noopener" target="_blank">Directions</a>
          ${tel ? `<a href="tel:${esc(tel)}">Call</a>` : ""}
          ${site ? `<a href="${esc(site)}" rel="noopener nofollow" target="_blank">Website</a>` : ""}
          ${waiting ? '<button id="ex-save" aria-pressed="false" disabled>Save</button>' : noId ? "" : `<button id="ex-save" aria-pressed="${saved.has(pid)}">${saved.has(pid) ? "Saved" : "Save"}</button>`}
        </div>
      </div>`;
    if (!loaded) html += `<p class="ex-fine">Loading details…</p>`;
    if (p.hc && (d.note || p.dish || p.f || d.seas)) {
      html += section("Hand-checked", (d.note ? `<p>${esc(d.note)}</p>` : "") + kv("On the menu", p.dish ? String(p.dish).split("; ").join(", ") : "")
        + kv("Open here since", p.f) + (d.fn ? `<p class="ex-fine">${esc(d.fn)}</p>` : "") + kv("Season", d.seas)
        + `<p class="ex-fine">Checked against a 2025 or 2026 source: Visit Oklahoma's own pages, the MICHELIN Guide, or a dated local story. Menus and hours change, so check before you go.</p>`);
    }
    if (p.mi || d.jbf) {
      const lines = [...(p.mi && MI[p.mi] ? [MI[p.mi]] : []),
        ...(d.jbf ? String(d.jbf).split("; ").map((x) => "James Beard: " + x) : [])];
      html += section("Honors", `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul><p class="ex-fine">Honors are facts, not ratings. MICHELIN is a trademark of Michelin. James Beard Foundation and James Beard Award are trademarks of the James Beard Foundation.</p>`);
    }
    if (failed) html += `<p class="ex-fine">This place's details (county records, phone, website) didn't load: you may be offline, or the site was just updated. Reload the page to try again.</p>`;
    else if (loaded) {
      const lic = Array.isArray(d.lic) ? d.lic.filter(Array.isArray) : [];
      html += section("Official records", (lic.length ? lic.map((l) => kv(String(l[0] || "Record"), [l[2], l[1] ? "No. " + l[1] : ""].filter(Boolean).join(" · ") || "On the list")).join("")
          : kv("License record", "—"))
        + kv("Serves alcohol", p.lq ? "Licensed to serve on the premises" : "—")
        + `<p class="ex-fine">Alcohol licenses are from the ABLE Commission's monthly licensee lists (October 2026). A place without a matched on-premises license shows —: unknown, never "no".</p>`);
    }
    html += loaded ? inspectionSection(d, p) : "";
    html += section("How we know it's here", kv("Listed as", TIER[p.t])
      + (p.ch >= 2 ? kv("Locations in Oklahoma", p.ch.toLocaleString()) : "") + `<p class="ex-fine">${esc(howWeKnow(p))}</p>`);
    const store_url = safeUrl(window.APP_STORE_URL);   // set in the page footer script once the App Store listing exists
    html += store_url
      ? `<p class="ex-app">Save it on your phone: <a href="${esc(store_url)}" rel="noopener">get the free iPhone app</a></p>`
      : `<p class="ex-app">The iPhone app is coming soon. <a href="${BASE}/#download">Ask for early access</a></p>`;
    panel.innerHTML = html;
    panel.dataset.id = pid;
    panel.dataset.i = String(p.i);
    panel.hidden = false;
    document.body.classList.add("ex-open");
    panelMode();
    $("#ex-close").onclick = () => closePlace();
    if (!noId) $("#ex-save").onclick = (e) => {
      if (saved.has(p.id)) saved.delete(p.id); else saved.add(p.id);
      store.set("saved", [...saved]);
      e.target.textContent = saved.has(p.id) ? "Saved" : "Save";
      e.target.setAttribute("aria-pressed", String(saved.has(p.id)));
      if (st.g === "saved") render();
    };
    const samePlace = wasOpen && panel.dataset.shown === String(p.i);   // a re-render: details or the id just arrived
    if (!samePlace) panel.scrollTop = 0;
    panel.dataset.shown = String(p.i);
    if (!samePlace) $("#ex-close").focus();
    else if (refocus) {
      const same = refocus.startsWith("#") ? panel.querySelector(refocus)
        : [...panel.querySelectorAll("a, button")].find((el) => el.textContent.trim() === refocus);
      (same || $("#ex-close")).focus();
    }
    if (push && !noId) {
      if (panel.dataset.pushed) saveHash();   // one Back step per panel, not per place looked at
      else { listAtPush = listHash(); saveHash(true); panel.dataset.pushed = "1"; }
    }
    if (!loaded) loadDetail(p.co).then(() => { if (panel.dataset.i === String(p.i) && !panel.hidden) openPlace(p, false); });
  }

  // fromHistory: the Back button (or a hash link) already moved the URL, so don't touch history again
  function closePlace(fromHistory = false) {
    st.p = "";
    const panel = $("#ex-panel");
    const wasI = panel.dataset.i;   // the row the panel belonged to: focus goes back there
    panel.hidden = true;
    delete panel.dataset.id;
    delete panel.dataset.i;
    delete panel.dataset.shown;
    delete panel.dataset.pushed;
    document.body.classList.remove("ex-open");
    panelMode();
    if (!fromHistory) {
      // the list hasn't changed since the panel opened: step back over the entry openPlace pushed, so Back isn't a dead click
      if (history.state && history.state.okeats === "place" && listHash() === listAtPush) history.back();
      else saveHash();
    }
    listAtPush = null;
    const row = wasI && document.querySelector(`.ex-row[data-i="${Number(wasI)}"]`);
    if (row) row.focus();
  }

  // ---------------------------------------------------------------- map (canvas: county outlines + a dot per place)
  let SHAPES = null, cam = null;
  // Oklahoma's own frame (set per state: a port's leftover numbers once framed the wrong state, QA 2026-11-03)
  const LAT0 = 35.3, KX = Math.cos(LAT0 * Math.PI / 180);
  const proj = (lo, la) => [(lo - (-98.7)) * KX, -(la - LAT0)];

  function fitCam(w, h) {
    const [x0, y0] = proj(-103.0, 37.0), [x1, y1] = proj(-94.43, 33.62);   // the state's west/north and east/south edges
    const k = Math.min(w / (x1 - x0), h / (y1 - y0)) * 0.95;
    return { k, x: (w - (x1 - x0) * k) / 2 - x0 * k, y: (h - (y1 - y0) * k) / 2 - y0 * k };
  }

  // calls f on every ring, however deeply it's nested (the state is [polygon[ring[point]]], each county [ring[point]])
  const eachRing = (g, f) => {
    if (!Array.isArray(g) || !g.length) return;
    if (Array.isArray(g[0]) && typeof g[0][0] === "number") f(g); else g.forEach((x) => eachRing(x, f));
  };

  const classic = (p) => Boolean((p.hc && p.g) || p.mi);
  async function drawMap() {
    const cv = $("#ex-map"), wrap = $("#ex-mapwrap");
    const w = wrap.clientWidth, h = wrap.clientHeight, dpr = window.devicePixelRatio || 1;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    if (!cam) cam = fitCam(w, h);
    if (!SHAPES) SHAPES = await fetchJSON(`${BASE}/data/ok_shapes.json`).catch(() => ({ state: [], counties: [] }));
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const X = (lo, la) => { const [x, y] = proj(lo, la); return [x * cam.k + cam.x, y * cam.k + cam.y]; };
    const ring = (r) => { r.forEach(([lo, la], i) => { const [x, y] = X(lo, la); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); };
    c.fillStyle = "#f4ebd6";   // the map stays light in dark mode (its frame is light too), so the dots keep their contrast
    c.beginPath(); eachRing(SHAPES.state, ring); c.fill("evenodd");
    c.strokeStyle = "rgba(14,26,48,.22)"; c.lineWidth = 0.8;
    for (const co of SHAPES.counties || []) { c.beginPath(); eachRing(co.c, ring); c.stroke(); }
    const pts = current.filter((p) => p.la != null);
    const r = Math.max(2.2, Math.min(5, 1.6 + cam.k / 120));
    // plain places: one batch of small squares (tens of thousands draw fast that way); hand-checked and honored places: dots on top
    c.fillStyle = "#00559b";   // sky blue
    const sq = pts.length > 3000 ? Math.max(1.6, r - 0.6) : r * 1.6;
    for (const p of pts) {
      if (classic(p)) continue;
      const [x, y] = X(p.lo, p.la);
      if (x < -5 || y < -5 || x > w + 5 || y > h + 5) continue;
      if (pts.length > 3000) c.fillRect(x - sq / 2, y - sq / 2, sq, sq);
      else { c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill(); }
    }
    c.fillStyle = "#9c3d23"; c.strokeStyle = "#ffffff"; c.lineWidth = 1;   // the guide picks in red dirt
    for (const p of pts) {
      if (!classic(p)) continue;
      const [x, y] = X(p.lo, p.la);
      if (x < -5 || y < -5 || x > w + 5 || y > h + 5) continue;
      c.beginPath(); c.arc(x, y, r + 1, 0, 6.2832); c.fill(); c.stroke();
    }
    $("#ex-maphint").textContent = pts.length ? `${pts.length.toLocaleString()} ${pts.length === 1 ? "place" : "places"} · tap a dot` : "No places to show";
  }

  function nearestDot(px, py) {
    let best = null, bd = 14 * 14;
    for (const p of current) {
      if (p.la == null) continue;
      const [x0, y0] = proj(p.lo, p.la), x = x0 * cam.k + cam.x, y = y0 * cam.k + cam.y;
      const d = (x - px) ** 2 + (y - py) ** 2;
      if (d < bd || (d === bd && classic(p))) { bd = d; best = p; }
    }
    return best;
  }

  function zoomAt(f, px, py) {
    const k = Math.min(Math.max(cam.k * f, 40), 60000);
    const s = k / cam.k;
    cam = { k, x: px - (px - cam.x) * s, y: py - (py - cam.y) * s };
    drawMap();
  }

  function mapEvents() {
    const cv = $("#ex-map");
    const ptrs = new Map();
    let moved = false, pinch0 = null;
    cv.addEventListener("wheel", (e) => { e.preventDefault(); const b = cv.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - b.left, e.clientY - b.top); }, { passive: false });
    cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = false; pinch0 = null; });
    cv.addEventListener("pointermove", (e) => {
      if (!ptrs.has(e.pointerId)) return;
      const prev = ptrs.get(e.pointerId);
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const r = cv.getBoundingClientRect();
        if (pinch0) zoomAt(d / pinch0, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top);
        pinch0 = d; moved = true; return;
      }
      const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      cam.x += dx; cam.y += dy; drawMap();
    });
    const up = (e) => {
      ptrs.delete(e.pointerId);
      if (!moved && ptrs.size === 0) {
        const b = cv.getBoundingClientRect(), p = nearestDot(e.clientX - b.left, e.clientY - b.top);
        if (p) openPlace(p);
      }
      if (ptrs.size < 2) pinch0 = null;
    };
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", (e) => ptrs.delete(e.pointerId));
    $("#ex-zin").onclick = () => zoomAt(1.6, cv.clientWidth / 2, cv.clientHeight / 2);
    $("#ex-zout").onclick = () => zoomAt(0.625, cv.clientWidth / 2, cv.clientHeight / 2);
    window.addEventListener("resize", () => { if (view === "map") drawMap(); });
  }

  function centerOn(pt) {
    const cv = $("#ex-map"), w = cv.clientWidth, h = cv.clientHeight;
    const k = 4000, [x, y] = proj(pt.lo, pt.la);
    cam = { k, x: w / 2 - x * k, y: h / 2 - y * k };
  }

  // ---------------------------------------------------------------- data, URL state, controls
  let SOURCES = [], DETAIL_FILES = [];
  async function fetchJSON(url, opts) { const r = await fetch(url, opts); if (!r.ok) throw new Error(r.status + " " + url); return r.json(); }
  // the build this page's data comes from: the page names it (so a cached core.json from an older build isn't used), core.json confirms it
  const PAGE_VER = ($("#ex-app") && $("#ex-app").dataset.ver) || "";
  let DV = "";
  const vq = (v) => (v ? "?v=" + encodeURIComponent(v) : "");
  // a data file from another build (a cache that outlived a deploy) is fetched once more, then refused: its rows wouldn't line up
  async function fetchCurrent(url, verOf) {
    let d = await fetchJSON(url + vq(DV));
    if (DV && verOf(d) !== DV) d = await fetchJSON(url + vq(DV), { cache: "reload" });
    if (DV && verOf(d) !== DV) throw new Error("another build: " + url);
    return d;
  }
  const DETAIL = new Map(), DETAIL_LOADED = new Set(), DETAIL_FAILED = new Set(), detailPromises = new Map();
  // a county's detail file (phones, websites, notes, alcohol licenses) is fetched only once someone reaches for a place there
  function loadDetail(co) {
    // a county with no extras has no file (null in dfiles): nothing to fetch
    if (!Number.isInteger(co) || co < 0 || co >= DETAIL_FILES.length || !DETAIL_FILES[co]) { DETAIL_LOADED.add(co); return Promise.resolve(); }
    if (!detailPromises.has(co)) {
      detailPromises.set(co, fetchCurrent(`${BASE}/data/detail-${encodeURIComponent(DETAIL_FILES[co])}.json`, (d) => d && d._v).then((d) => {
        if (d && typeof d === "object") for (const k of Object.keys(d)) { const i = Number(k); if (Number.isInteger(i) && d[k] && typeof d[k] === "object") DETAIL.set(i, d[k]); }
      }).catch(() => { DETAIL_FAILED.add(co); /* offline or another build: the panel says so, and asks for a reload */ })
        .finally(() => DETAIL_LOADED.add(co)));
    }
    return detailPromises.get(co);
  }

  // ids.json: one stable id per place, in core order (saved places, #p= links and the panel's history entry use them)
  let idsPromise = null, idsReady = false, idsFailed = false;
  function loadIds() {
    idsPromise ||= fetchCurrent(`${BASE}/data/ids.json`, (d) => d && d.v).then((d) => {
      const ids = d && typeof d.ids === "string" ? d.ids.split(",") : [];   // one comma-separated string: smaller than a JSON array
      if (ids.length !== P.length) throw new Error("ids.json doesn't match core.json");
      ids.forEach((x, i) => { P[i].id = x; });
    }).catch(() => { idsFailed = true; /* offline or another build: saving and links wait for a reload, and the page says so */ })
      .finally(() => { idsReady = true; });
    return idsPromise;
  }

  async function load() {
    let d = await fetchJSON(`${BASE}/data/core.json${vq(PAGE_VER)}`);
    // a core.json with no version predates versioning (a cache that ignored ?v=): its rows would meet this build's ids and county
    // files unchecked, so fetch it once more past the cache, then stop with the reload message rather than mix two builds
    if (PAGE_VER && typeof d.ver !== "string") d = await fetchJSON(`${BASE}/data/core.json${vq(PAGE_VER)}`, { cache: "reload" });
    if (PAGE_VER && typeof d.ver !== "string") throw new Error("core.json from before versioning");
    DV = typeof d.ver === "string" ? d.ver : "";
    GENERATED = d.generated; CAL = d.calibration || {}; SOURCES = d.srcs || []; DETAIL_FILES = d.dfiles || [];
    META = { permits: d.permits_updated };
    const n = d.n, towns = new Map(), C = { ...d.cols };
    for (const [k, pairs] of Object.entries(d.sparse || {})) {   // mostly-empty columns arrive as [[index, value], ...]
      const col = new Array(n).fill(null);
      if (Array.isArray(pairs)) for (const pr of pairs) if (Array.isArray(pr) && Number.isInteger(pr[0]) && pr[0] >= 0 && pr[0] < n) col[pr[0]] = pr[1];
      C[k] = col;
    }
    for (const k of ["n", "c", "co", "cu", "t", "s", "a", "z", "b", "ch", "g", "hc", "ip", "f", "h", "mi", "dish", "lq", "dla", "dlo", "jb", "sd"])
      if (!Array.isArray(C[k]) || C[k].length !== n) C[k] = new Array(n).fill(null);
    P = new Array(n);
    let la = 0, lo = 0;   // coordinates come as steps of 0.0001° from the previous place
    for (let i = 0; i < n; i++) {
      let pla = null, plo = null;
      if (C.dla[i] != null && C.dlo[i] != null) { la += C.dla[i]; lo += C.dlo[i]; pla = la / 10000; plo = lo / 10000; }
      const city = C.c[i] == null ? null : d.cities[C.c[i]], cu = d.cuisines[C.cu[i]], brand = C.b[i] == null ? null : d.brands[C.b[i]];
      const county = C.co[i] == null ? null : d.counties[C.co[i]];
      const p = { i, id: null, n: String(C.n[i] ?? ""), c: city, cu, t: C.t[i], s: C.s[i], a: C.a[i], z: C.z[i], la: pla, lo: plo,
        ch: num(C.ch[i]) || 1, g: C.g[i] || 0, hc: C.hc[i] === 1, ip: C.ip[i], f: num(C.f[i]), h: C.h[i] || 0,
        mi: num(C.mi[i]) || 0, jb: C.jb[i] === 1, dish: C.dish[i], co: C.co[i], county, lq: C.lq[i] === 1, sd: num(C.sd[i]) };
      p.search = " " + normalize([p.n, city, county, p.z, cu, brand, p.dish].filter(Boolean).join(" ")) + " " + normAddr(p.a || "") + " ";
      p.nameText = " " + normalize([p.n, brand].filter(Boolean).join(" ")) + " ";
      p.key = normalize(p.n);
      P[i] = p;
      if (city) towns.set(city, (towns.get(city) || 0) + 1);
    }
    const byCount = [...towns.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    for (const [name] of byCount) { const k = normAddr(name); if (!own(TOWN_KEYS, k)) TOWN_KEYS[k] = name; }   // biggest town wins a shared spelling
    TOWN_KEYS_BY_LENGTH = Object.keys(TOWN_KEYS).sort((a, b) => b.length - a.length);
    $("#ex-town").innerHTML = '<option value="">All towns</option>' + [...towns.keys()].sort((a, b) => a.localeCompare(b)).map((t) => `<option>${esc(t)}</option>`).join("");
    const cuis = new Map();
    for (const p of P) cuis.set(p.cu, (cuis.get(p.cu) || 0) + 1);
    $("#ex-cuisine").innerHTML = '<option value="">All kinds</option>' + [...cuis.entries()].sort((a, b) => b[1] - a[1]).map(([c, k]) => `<option value="${esc(c)}">${esc(c)} (${esc(k.toLocaleString())})</option>`).join("");
    bibCount = P.filter((p) => !p.v && p.mi === 2).length;
    $("#ex-bibwrap").hidden = !bibCount;
    $("#ex-bibn").textContent = `(${bibCount.toLocaleString()})`;
    if (!bibCount) st.bib = false;
  }

  const guideOk = (g) => own(GUIDES, g);
  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    const last = store.get("guide", "burgers");
    // a returning visitor gets the guide they used last, unless it's an empty Saved list
    st.g = guideOk(h.get("g")) ? h.get("g") : guideOk(last) && !(last === "saved" && !saved.size) ? last : "burgers";
    st.q = h.get("q") || ""; st.town = h.get("town") || ""; st.cuisine = h.get("kind") || ""; st.chains = h.get("chains") === "1"; st.bib = h.get("bib") === "1";
    st.sort = h.get("sort") || ""; st.p = h.get("p") || "";
  }
  function hashOf(withPlace) {
    const h = new URLSearchParams();
    h.set("g", st.g);
    if (st.q) h.set("q", st.q); if (st.town) h.set("town", st.town); if (st.cuisine) h.set("kind", st.cuisine);
    if (st.chains) h.set("chains", "1"); if (st.bib) h.set("bib", "1"); if (st.sort) h.set("sort", st.sort); if (withPlace && st.p) h.set("p", st.p);
    return "#" + h.toString();
  }
  const listHash = () => hashOf(false);
  // filter changes replace the current history entry; opening a place pushes one, so Back closes the panel
  function saveHash(push = false) {
    const url = hashOf(true);
    if (push) history.pushState({ okeats: "place" }, "", url);
    else history.replaceState(st.p ? { okeats: "place" } : null, "", url);
    store.set("guide", st.g);
  }

  // a coarse Oklahoma outline (OklahomaEats/Services/LocationService.swift's OklahomaOutline): a bounding box would count the neighbours' border towns
  const OK_RINGS = [[[-103.002,37.0],[-102.759,37.0],[-102.698,36.995],[-102.042,36.993],[-100.089,37.002],[-98.219,36.998],[-94.618,36.999],[-94.618,36.499],[-94.58,36.262],[-94.431,35.394],[-94.435,35.389],[-94.432,35.369],[-94.457,34.638],[-94.486,33.638],[-94.498,33.636],[-94.51,33.643],[-94.521,33.645],[-94.542,33.637],[-94.551,33.636],[-94.554,33.633],[-94.549,33.623],[-94.554,33.619],[-94.56,33.619],[-94.573,33.631],[-94.563,33.641],[-94.543,33.643],[-94.54,33.649],[-94.541,33.655],[-94.549,33.662],[-94.563,33.659],[-94.568,33.66],[-94.571,33.674],[-94.578,33.681],[-94.584,33.679],[-94.592,33.664],[-94.603,33.661],[-94.608,33.666],[-94.606,33.681],[-94.618,33.688],[-94.63,33.669],[-94.641,33.662],[-94.645,33.665],[-94.642,33.677],[-94.644,33.685],[-94.657,33.694],[-94.702,33.685],[-94.72,33.694],[-94.731,33.712],[-94.73,33.729],[-94.736,33.738],[-94.753,33.737],[-94.765,33.721],[-94.769,33.719],[-94.782,33.726],[-94.782,33.745],[-94.794,33.754],[-94.832,33.742],[-94.858,33.742],[-94.865,33.749],[-94.864,33.762],[-94.867,33.768],[-94.878,33.771],[-94.895,33.768],[-94.901,33.772],[-94.906,33.794],[-94.902,33.806],[-94.907,33.81],[-94.915,33.813],[-94.922,33.803],[-94.927,33.802],[-94.929,33.805],[-94.924,33.817],[-94.942,33.817],[-94.957,33.823],[-94.947,33.842],[-94.949,33.849],[-94.956,33.858],[-94.96,33.859],[-94.977,33.85],[-94.987,33.868],[-94.997,33.868],[-95.005,33.861],[-95.016,33.858],[-95.029,33.862],[-95.038,33.869],[-95.049,33.868],[-95.054,33.872],[-95.054,33.893],[-95.066,33.9],[-95.068,33.913],[-95.072,33.917],[-95.078,33.919],[-95.091,33.906],[-95.103,33.906],[-95.11,33.911],[-95.115,33.927],[-95.125,33.936],[-95.145,33.934],[-95.17,33.946],[-95.22,33.963],[-95.227,33.962],[-95.251,33.938],[-95.249,33.912],[-95.257,33.891],[-95.264,33.889],[-95.263,33.903],[-95.266,33.91],[-95.28,33.911],[-95.285,33.908],[-95.28,33.897],[-95.278,33.878],[-95.289,33.873],[-95.305,33.874],[-95.316,33.887],[-95.326,33.891],[-95.338,33.876],[-95.356,33.874],[-95.361,33.868],[-95.38,33.871],[-95.399,33.863],[-95.423,33.873],[-95.43,33.867],[-95.438,33.865],[-95.45,33.872],[-95.454,33.882],[-95.463,33.889],[-95.479,33.878],[-95.504,33.876],[-95.504,33.894],[-95.509,33.899],[-95.533,33.882],[-95.544,33.881],[-95.551,33.89],[-95.548,33.907],[-95.554,33.928],[-95.567,33.934],[-95.579,33.933],[-95.593,33.944],[-95.598,33.933],[-95.609,33.931],[-95.621,33.922],[-95.63,33.906],[-95.638,33.905],[-95.655,33.911],[-95.662,33.91],[-95.684,33.892],[-95.702,33.886],[-95.715,33.886],[-95.73,33.896],[-95.751,33.895],[-95.763,33.879],[-95.762,33.872],[-95.752,33.862],[-95.756,33.852],[-95.768,33.847],[-95.8,33.862],[-95.82,33.859],[-95.822,33.855],[-95.819,33.841],[-95.83,33.836],[-95.84,33.837],[-95.857,33.851],[-95.87,33.854],[-95.897,33.873],[-95.926,33.886],[-95.935,33.882],[-95.943,33.862],[-95.981,33.855],[-96.014,33.844],[-96.018,33.846],[-96.016,33.862],[-96.022,33.865],[-96.03,33.863],[-96.032,33.847],[-96.039,33.84],[-96.051,33.842],[-96.067,33.838],[-96.092,33.858],[-96.096,33.853],[-96.088,33.841],[-96.09,33.837],[-96.108,33.839],[-96.119,33.828],[-96.14,33.824],[-96.166,33.809],[-96.17,33.771],[-96.176,33.763],[-96.188,33.757],[-96.227,33.751],[-96.261,33.767],[-96.292,33.771],[-96.299,33.763],[-96.31,33.742],[-96.307,33.728],[-96.313,33.707],[-96.329,33.698],[-96.339,33.689],[-96.347,33.687],[-96.353,33.688],[-96.36,33.696],[-96.361,33.711],[-96.41,33.754],[-96.422,33.776],[-96.444,33.782],[-96.466,33.782],[-96.489,33.774],[-96.502,33.774],[-96.513,33.785],[-96.516,33.806],[-96.529,33.823],[-96.573,33.819],[-96.596,33.832],[-96.629,33.845],[-96.627,33.855],[-96.612,33.869],[-96.589,33.881],[-96.585,33.889],[-96.589,33.895],[-96.628,33.894],[-96.658,33.916],[-96.668,33.916],[-96.674,33.91],[-96.681,33.895],[-96.686,33.859],[-96.698,33.84],[-96.715,33.831],[-96.762,33.825],[-96.771,33.83],[-96.782,33.862],[-96.796,33.869],[-96.832,33.875],[-96.84,33.868],[-96.842,33.852],[-96.85,33.847],[-96.859,33.849],[-96.872,33.858],[-96.883,33.868],[-96.896,33.897],[-96.899,33.933],[-96.903,33.943],[-96.917,33.958],[-96.923,33.959],[-96.973,33.935],[-96.979,33.942],[-96.981,33.956],[-96.993,33.95],[-96.996,33.943],[-96.984,33.895],[-96.996,33.873],[-97.018,33.85],[-97.041,33.838],[-97.046,33.84],[-97.055,33.855],[-97.063,33.86],[-97.073,33.86],[-97.089,33.853],[-97.09,33.842],[-97.054,33.834],[-97.049,33.829],[-97.048,33.82],[-97.079,33.813],[-97.094,33.804],[-97.096,33.791],[-97.086,33.763],[-97.087,33.743],[-97.096,33.73],[-97.108,33.721],[-97.123,33.718],[-97.134,33.719],[-97.165,33.73],[-97.172,33.745],[-97.189,33.757],[-97.188,33.78],[-97.203,33.795],[-97.205,33.816],[-97.202,33.823],[-97.175,33.831],[-97.166,33.843],[-97.165,33.849],[-97.17,33.864],[-97.176,33.87],[-97.177,33.874],[-97.171,33.884],[-97.174,33.891],[-97.187,33.899],[-97.205,33.916],[-97.221,33.913],[-97.233,33.917],[-97.249,33.907],[-97.25,33.899],[-97.246,33.878],[-97.261,33.862],[-97.287,33.861],[-97.294,33.879],[-97.301,33.886],[-97.309,33.888],[-97.31,33.882],[-97.304,33.872],[-97.305,33.869],[-97.318,33.863],[-97.328,33.872],[-97.334,33.871],[-97.339,33.857],[-97.352,33.849],[-97.353,33.835],[-97.361,33.826],[-97.379,33.83],[-97.393,33.821],[-97.421,33.819],[-97.45,33.828],[-97.46,33.838],[-97.461,33.845],[-97.45,33.875],[-97.452,33.896],[-97.457,33.902],[-97.488,33.919],[-97.501,33.92],[-97.507,33.919],[-97.516,33.912],[-97.529,33.912],[-97.535,33.904],[-97.543,33.9],[-97.564,33.898],[-97.579,33.906],[-97.591,33.903],[-97.593,33.906],[-97.587,33.915],[-97.598,33.921],[-97.6,33.927],[-97.589,33.944],[-97.59,33.953],[-97.604,33.96],[-97.611,33.971],[-97.625,33.974],[-97.629,33.982],[-97.637,33.988],[-97.65,33.993],[-97.666,33.993],[-97.69,33.987],[-97.694,33.984],[-97.709,33.956],[-97.728,33.939],[-97.76,33.936],[-97.76,33.926],[-97.773,33.926],[-97.779,33.922],[-97.782,33.916],[-97.795,33.912],[-97.798,33.895],[-97.808,33.879],[-97.832,33.862],[-97.847,33.855],[-97.871,33.851],[-97.887,33.855],[-97.935,33.879],[-97.951,33.878],[-97.967,33.882],[-97.978,33.89],[-97.985,33.901],[-97.979,33.911],[-97.964,33.912],[-97.955,33.923],[-97.954,33.932],[-97.972,33.937],[-97.975,33.941],[-97.957,33.96],[-97.948,33.988],[-97.952,33.991],[-97.968,33.988],[-97.982,34.003],[-98.009,33.995],[-98.039,33.993],[-98.089,34.006],[-98.108,34.036],[-98.09,34.046],[-98.108,34.056],[-98.118,34.067],[-98.121,34.075],[-98.119,34.094],[-98.104,34.112],[-98.107,34.132],[-98.104,34.149],[-98.115,34.155],[-98.131,34.148],[-98.154,34.123],[-98.171,34.114],[-98.203,34.117],[-98.239,34.133],[-98.26,34.129],[-98.273,34.133],[-98.29,34.132],[-98.334,34.152],[-98.371,34.155],[-98.383,34.138],[-98.381,34.13],[-98.392,34.129],[-98.4,34.123],[-98.398,34.121],[-98.398,34.103],[-98.401,34.099],[-98.411,34.1],[-98.41,34.092],[-98.414,34.085],[-98.42,34.082],[-98.43,34.086],[-98.44,34.084],[-98.449,34.073],[-98.465,34.074],[-98.471,34.066],[-98.484,34.062],[-98.494,34.07],[-98.504,34.072],[-98.539,34.108],[-98.546,34.108],[-98.556,34.116],[-98.566,34.127],[-98.568,34.135],[-98.591,34.145],[-98.598,34.152],[-98.614,34.149],[-98.622,34.152],[-98.625,34.158],[-98.642,34.163],[-98.654,34.162],[-98.663,34.147],[-98.699,34.127],[-98.744,34.118],[-98.759,34.124],[-98.763,34.122],[-98.769,34.129],[-98.78,34.134],[-98.798,34.139],[-98.811,34.139],[-98.826,34.145],[-98.844,34.143],[-98.85,34.15],[-98.858,34.147],[-98.871,34.148],[-98.881,34.155],[-98.89,34.152],[-98.89,34.148],[-98.896,34.147],[-98.901,34.155],[-98.895,34.161],[-98.901,34.172],[-98.914,34.171],[-98.925,34.185],[-98.93,34.182],[-98.933,34.184],[-98.934,34.193],[-98.948,34.197],[-98.958,34.21],[-98.973,34.203],[-98.983,34.216],[-98.989,34.22],[-98.999,34.218],[-99.013,34.203],[-99.022,34.206],[-99.02,34.204],[-99.022,34.2],[-99.03,34.196],[-99.038,34.201],[-99.042,34.197],[-99.052,34.202],[-99.063,34.202],[-99.07,34.209],[-99.082,34.213],[-99.091,34.209],[-99.101,34.211],[-99.1,34.205],[-99.124,34.202],[-99.129,34.205],[-99.137,34.218],[-99.161,34.208],[-99.175,34.212],[-99.176,34.223],[-99.179,34.226],[-99.183,34.219],[-99.189,34.216],[-99.193,34.221],[-99.192,34.233],[-99.197,34.246],[-99.193,34.259],[-99.208,34.26],[-99.195,34.272],[-99.196,34.279],[-99.207,34.283],[-99.211,34.289],[-99.208,34.295],[-99.198,34.293],[-99.193,34.296],[-99.194,34.302],[-99.2,34.301],[-99.204,34.305],[-99.195,34.324],[-99.208,34.324],[-99.209,34.331],[-99.217,34.342],[-99.213,34.348],[-99.221,34.344],[-99.232,34.347],[-99.236,34.351],[-99.237,34.366],[-99.248,34.365],[-99.247,34.374],[-99.258,34.372],[-99.264,34.379],[-99.275,34.385],[-99.275,34.388],[-99.262,34.393],[-99.261,34.397],[-99.264,34.401],[-99.281,34.401],[-99.296,34.414],[-99.321,34.408],[-99.321,34.416],[-99.356,34.441],[-99.361,34.456],[-99.378,34.458],[-99.394,34.442],[-99.395,34.427],[-99.391,34.422],[-99.396,34.419],[-99.394,34.415],[-99.397,34.409],[-99.389,34.41],[-99.385,34.406],[-99.394,34.4],[-99.397,34.377],[-99.403,34.373],[-99.409,34.373],[-99.426,34.382],[-99.429,34.371],[-99.435,34.37],[-99.453,34.388],[-99.457,34.381],[-99.461,34.38],[-99.466,34.394],[-99.487,34.397],[-99.504,34.411],[-99.549,34.412],[-99.573,34.417],[-99.58,34.415],[-99.583,34.408],[-99.583,34.395],[-99.587,34.386],[-99.609,34.369],[-99.697,34.378],[-99.713,34.388],[-99.72,34.405],[-99.759,34.424],[-99.801,34.458],[-99.824,34.484],[-99.834,34.501],[-99.853,34.512],[-99.887,34.549],[-99.917,34.568],[-99.924,34.575],[-99.955,34.578],[-99.959,34.571],[-99.972,34.562],[-100.0,34.561],[-100.0,36.5],[-103.002,36.5],[-103.002,37.0]]];
  function inRing(ring, la, lo) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > la) !== (yj > la) && lo < (xj - xi) * (la - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  const inOklahoma = (la, lo) => OK_RINGS.some((r) => inRing(r, la, lo));

  function locate() {
    if (!navigator.geolocation) { $("#ex-locmsg").textContent = "This browser can't share its location."; return; }
    $("#ex-locmsg").textContent = "Finding you…";
    navigator.geolocation.getCurrentPosition((pos) => {
      here = { la: pos.coords.latitude, lo: pos.coords.longitude };
      const inGA = inOklahoma(here.la, here.lo);
      $("#ex-locmsg").textContent = inGA ? "Sorted by distance from you. Your location stays in this browser." : "You're outside Oklahoma: distances are from where you are. Your location stays in this browser.";
      st.sort = GUIDES[st.g].sorts.includes("nearest") ? "nearest" : st.sort;
      if (view === "map" && inGA) centerOn(here);
      shown = 100; render();
    }, (err) => {
      $("#ex-locmsg").textContent = err && err.code === 1 ? "Location is off for this site. Allow it in your browser settings to sort by distance."
        : "Couldn't get a location fix just now. Tap Near me to try again.";
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 });   // a fresh fix on every tap, never one from minutes ago
  }

  function setView(v) {
    view = v;
    document.querySelectorAll(".ex-view button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
    $("#ex-listwrap").hidden = v !== "list";
    $("#ex-mapwrap").hidden = v !== "map";
    render();
    // the map often starts below the fold (on phones, and on laptop-height screens): bring it into view
    if (v === "map" && $("#ex-mapwrap").getBoundingClientRect().top > innerHeight * 0.5) $("#ex-mapwrap").scrollIntoView({ block: "nearest" });
  }

  // the URL moved under us: Back/Forward (popstate) or a link to another #hash (hashchange). Both can fire for one step.
  function fromURL() {
    const before = listHash();
    readHash();
    if (listHash() !== before) { syncInputs(); shown = 100; render(); }
    if (st.p && !idsReady) { loadIds().then(fromURL); return; }
    const p = st.p && P.find((x) => x.id === st.p);
    const panel = $("#ex-panel");
    if (p) {
      if (panel.hidden || panel.dataset.id !== p.id) {
        openPlace(p, false);
        // Forward to a place opened earlier: its entry was pushed after the list's, so closing it steps back, as after a tap
        if (history.state && history.state.okeats === "place") { listAtPush = listHash(); panel.dataset.pushed = "1"; }
      }
    }
    else { if (!panel.hidden) closePlace(true); linkMissing(); }
  }

  // a #p= link whose place isn't here: ids.json didn't load, or the place has left the list since the link was made
  function linkMissing() {
    if (!st.p) return;
    $("#ex-locmsg").textContent = idsFailed ? "The place in this link couldn't load: you may be offline, or the site was just updated. Reload the page to try again."
      : "The place in this link isn't on the list anymore (it may have closed or moved).";
  }

  function controls() {
    document.querySelectorAll(".ex-guides button").forEach((b) => b.onclick = () => { if (guideOk(b.dataset.g)) st.g = b.dataset.g; st.sort = ""; shown = 100; render(); });
    let t = null;
    $("#ex-q").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value; shown = 100; render(); }, 120); });
    $("#ex-sort").onchange = (e) => { st.sort = e.target.value; if (st.sort === "nearest" && !here) locate(); shown = 100; render(); };
    $("#ex-town").onchange = (e) => { st.town = e.target.value; shown = 100; render(); };
    $("#ex-cuisine").onchange = (e) => { st.cuisine = e.target.value; shown = 100; render(); };
    $("#ex-chains").onchange = (e) => { st.chains = e.target.checked; shown = 100; render(); };
    $("#ex-bib").onchange = (e) => { st.bib = e.target.checked; shown = 100; render(); };
    $("#ex-clear").onclick = () => { st.town = st.cuisine = ""; st.chains = st.bib = false; syncInputs(); shown = 100; render(); };
    $("#ex-locate").onclick = locate;
    $("#ex-more").onclick = () => { shown += 200; renderList(order()); };
    document.querySelectorAll(".ex-view button").forEach((b) => b.onclick = () => setView(b.dataset.v));
    $("#ex-list").addEventListener("click", (e) => { const b = e.target.closest(".ex-row"); if (b && P[+b.dataset.i]) openPlace(P[+b.dataset.i]); });
    // warm the region file of the row under the pointer (or keyboard focus), so the panel opens with its details
    for (const ev of ["pointerover", "focusin"]) $("#ex-list").addEventListener(ev, (e) => { const b = e.target.closest && e.target.closest(".ex-row"); if (b && P[+b.dataset.i]) { loadIds(); loadDetail(P[+b.dataset.i].co); } });
    // the ids (a few hundred KB) wait for the first sign of use, so a visit that only looks doesn't download them
    const WARM = ["pointerdown", "keydown", "wheel", "scroll", "touchstart"];
    const warmIds = () => { WARM.forEach((ev) => removeEventListener(ev, warmIds, true)); loadIds(); };
    WARM.forEach((ev) => addEventListener(ev, warmIds, { capture: true, passive: true }));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#ex-panel").hidden) closePlace(); });
    window.addEventListener("popstate", fromURL);
    window.addEventListener("hashchange", fromURL);
    $("#ex-backdrop").addEventListener("click", () => { if (st.p || !$("#ex-panel").hidden) closePlace(); });
    mapEvents();
  }
  function syncInputs() {
    $("#ex-q").value = st.q; $("#ex-town").value = st.town; $("#ex-cuisine").value = st.cuisine; $("#ex-chains").checked = st.chains; $("#ex-bib").checked = st.bib;
  }

  (async () => {
    $("#ex-loading").hidden = false;   // hidden in the HTML, so a browser without JavaScript shows only the <noscript> note
    readHash();
    try { await load(); } catch (e) { $("#ex-loading").textContent = "The restaurant list couldn't load. Refresh to try again."; return; }
    syncInputs(); controls();
    $("#ex-app").hidden = false;
    $("#ex-loading").hidden = true;
    render();
    if (st.p) {
      await loadIds();
      const open = P.find((p) => p.id === st.p);
      if (open) { await loadDetail(open.co); openPlace(open, false); }
      else linkMissing();
    }
  })();
})();
