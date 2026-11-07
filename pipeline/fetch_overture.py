"""Download the Overture Maps extracts that oklahoma.py reads -> data/ok/

- overture_ok_bbox.parquet     every place in Oklahoma's bounding box (name, category, address, point)
- overture_ok_sources.parquet  which datasets each Oklahoma eating/drinking listing came from (Meta, Foursquare, ...)
- ok_shapes.json               simplified state and county outlines for the map
- ok_state_detail.geojson      the state outline at full detail, for the in-state test

Reads the public Overture bucket over S3 with DuckDB (no account needed). Ported from ar-eats/pipeline/fetch_overture.py.
Oklahoma: land division areas; the "counties" are its 77 (Texas County, Guymon, is one of them). The script checks the towns on
and near its lines (Guymon and Boise City in the panhandle, Ponca City and Miami below Kansas, Arkoma, Pocola and Poteau by Fort Smith,
Idabel, Durant, Ardmore and Altus above Texas) so a Texas, New Mexico, Colorado, Kansas, Missouri or Arkansas listing stays out.
"""
import os, json, time
import duckdb
from shapely import wkb
from shapely.geometry import mapping, Polygon

RELEASE = "2026-10-21.0"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "ok")
# Oklahoma (33.62°N–37.0°N, 94.43°W–103.0°W) plus a margin for the border towns
BBOX = "bbox.xmin BETWEEN -103.15 AND -94.3 AND bbox.ymin BETWEEN 33.5 AND 37.1"
EAT = "('restaurant','casual_eatery','bar','fast_food_restaurant','coffee_shop','cafe','smoothie_juice_bar','brewery','food_court')"
os.makedirs(OUT, exist_ok=True)

con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';")
places = f"s3://overturemaps-us-west-2/release/{RELEASE}/theme=places/type=place/*.parquet"

t = time.time()
if not os.path.exists(f"{OUT}/overture_ok_bbox.parquet"):
    con.execute(f"""
COPY (
  SELECT id, names.primary AS name, basic_category AS cat, taxonomy.primary AS tax, taxonomy.hierarchy AS hier, confidence,
         operating_status AS status, brand.names.primary AS brand, addresses[1].freeform AS street, addresses[1].locality AS city,
         addresses[1].postcode AS zip, addresses[1].region AS region, ST_Y(geometry) AS lat, ST_X(geometry) AS lon, websites[1] AS web,
         phones[1] AS phone
  FROM read_parquet('{places}', hive_partitioning=1) WHERE {BBOX}
) TO '{OUT}/overture_ok_bbox.parquet' (FORMAT PARQUET)""")
    print("places in bbox", round(time.time() - t), "s", flush=True)
if not os.path.exists(f"{OUT}/overture_ok_sources.parquet"):
    con.execute(f"""
COPY (
  SELECT id, list_transform(sources, lambda x: x.dataset) AS ds, list_transform(sources, lambda x: x.update_time) AS ut,
         list_transform(sources, lambda x: x.record_id) AS rid,
         len(socials) AS n_soc, len(websites) AS n_web, len(phones) AS n_ph
  FROM read_parquet('{places}', hive_partitioning=1)
  WHERE {BBOX} AND basic_category IN {EAT}
) TO '{OUT}/overture_ok_sources.parquet' (FORMAT PARQUET)""")
    print("sources", round(time.time() - t), "s", flush=True)

areas = f"s3://overturemaps-us-west-2/release/{RELEASE}/theme=divisions/type=division_area/*.parquet"
rows = con.execute(f"""
  SELECT subtype, names.primary AS name, ST_AsWKB(geometry) AS g
  FROM read_parquet('{areas}', hive_partitioning=1)
  WHERE country = 'US' AND region = 'US-OK' AND subtype IN ('region', 'county') AND class = 'land'
    AND bbox.xmin > -103.2 AND bbox.xmax < -94.2 AND bbox.ymin > 33.4 AND bbox.ymax < 37.2""").fetchall()


def rings(geom, tol, min_area):
    geom = geom.simplify(tol, preserve_topology=True)
    polys = [p for p in getattr(geom, "geoms", [geom]) if p.geom_type == "Polygon" and p.area >= min_area]
    return [[[round(x, 3), round(y, 3)] for x, y in p.exterior.coords] for p in polys]


out = {"state": None, "counties": []}
for sub, name, g in rows:
    geom = wkb.loads(bytes(g)).buffer(0)
    if sub == "region":
        json.dump(mapping(geom.simplify(0.0005, preserve_topology=True)), open(f"{OUT}/ok_state_detail.geojson", "w"))
        out["state"] = [[r] for r in rings(geom, 0.002, 0.000005)]
    else:
        out["counties"].append({"name": name, "c": rings(geom, 0.004, 0.00002)})
# full-detail county polygons for assigning each place to a county (not shipped)
json.dump({name: mapping(wkb.loads(bytes(g)).buffer(0).simplify(0.0003, preserve_topology=True))
           for sub, name, g in rows if sub == "county"}, open(f"{OUT}/ok_counties_detail.geojson", "w"))
json.dump(out, open(f"{OUT}/ok_shapes.json", "w"), separators=(",", ":"))
print("outlines: state", len(out["state"] or []), "rings +", len(out["counties"]), "counties;", round(time.time() - t), "s total")
# border towns: each must fall on the right side of the detailed state outline
from shapely.geometry import shape, Point
st = shape(json.load(open(f"{OUT}/ok_state_detail.geojson")))
for nm, lon, lat, want in [("Guymon", -101.4816, 36.6828, True), ("Boise City", -102.5132, 36.7292, True), ("Ponca City", -97.0856, 36.7070, True),
                           ("Miami", -94.8775, 36.8745, True), ("Sallisaw", -94.7872, 35.4604, True), ("Poteau", -94.6236, 35.0537, True),
                           ("Idabel", -94.8264, 33.8957, True), ("Durant", -96.3708, 33.9940, True), ("Ardmore", -97.1436, 34.1743, True),
                           ("Altus", -99.3340, 34.6381, True), ("Arkoma", -94.4383, 35.3543, True), ("West Siloam Springs", -94.5677, 36.1859, True),
                           ("Tulsa", -95.9928, 36.1540, True), ("Oklahoma City", -97.5164, 35.4676, True),
                           ("Fort Smith, AR", -94.3985, 35.3859, False), ("Siloam Springs, AR", -94.5405, 36.1881, False), ("Wichita Falls, TX", -98.4934, 33.9137, False),
                           ("Denison, TX", -96.5367, 33.7557, False), ("Vernon, TX", -99.2651, 34.1543, False), ("Arkansas City, KS", -97.0384, 37.0620, False),
                           ("Coffeyville, KS", -95.6164, 37.0373, False), ("Liberal, KS", -100.9210, 37.0431, False), ("Joplin, MO", -94.5133, 37.0842, False),
                           ("Clayton, NM", -103.1841, 36.4517, False), ("Dalhart, TX", -102.5133, 36.0595, False)]:
    ok = st.contains(Point(lon, lat))
    print(f"  {nm}: {'inside' if ok else 'outside'}{'' if ok == want else '  <-- WRONG'}")
print("counties:", len(out["counties"]), sorted(c["name"] for c in out["counties"]))

# the neighbours' land (Texas, New Mexico, Colorado, Kansas, Missouri, Arkansas): listings.py widens Oklahoma's outline ~300 m, but only where no
# neighbour's land is, so a Fort Smith, Wichita Falls or Coffeyville listing across the line stays out
nb = con.execute(f"""
  SELECT region, ST_AsWKB(geometry) FROM read_parquet('{areas}', hive_partitioning=1)
  WHERE country = 'US' AND region IN ('US-TX', 'US-NM', 'US-CO', 'US-KS', 'US-MO', 'US-AR') AND subtype = 'region' AND class = 'land'""").fetchall()
from shapely.ops import unary_union
from shapely.geometry import box
near = box(-103.2, 33.4, -94.2, 37.2)
nbg = unary_union([wkb.loads(bytes(g)).buffer(0).intersection(near) for _, g in nb])
json.dump(mapping(nbg.simplify(0.0002, preserve_topology=True)), open(f"{OUT}/ok_neighbors.geojson", "w"))
print("neighbours:", sorted(r for r, _ in nb))
