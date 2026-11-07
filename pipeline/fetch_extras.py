"""Overture address points for Oklahoma -> data/ok/addresses_ok.parquet

Places researched addresses
the map listings lack. Adapted from co-eats/pipeline/fetch_extras.py.
"""
import os, time
import duckdb

RELEASE = "2026-10-21.0"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "ok")
t = time.time()
con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';")
addr = f"s3://overturemaps-us-west-2/release/{RELEASE}/theme=addresses/type=address/*.parquet"
con.execute(f"""COPY (SELECT number, street, unit, postcode, postal_city, address_levels[1].value AS state, address_levels[-1].value AS muni,
  ST_Y(geometry) lat, ST_X(geometry) lon FROM read_parquet('{addr}', hive_partitioning=1)
  WHERE country = 'US' AND bbox.xmin BETWEEN -103.15 AND -94.3 AND bbox.ymin BETWEEN 33.5 AND 37.1)
  TO '{OUT}/addresses_ok.parquet' (FORMAT PARQUET)""")
print(con.execute(f"select count(*), count(*) filter (where state='OK') from '{OUT}/addresses_ok.parquet'").fetchall(), round(time.time() - t), "s")
