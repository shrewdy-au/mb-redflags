// Derived geometry: concave hulls of G-NAF address points per SAL / SA1 / mesh block for the Greater Sydney LGAs.
// We have no ABS boundary files loaded; hulls of the addresses are enough for suburb-wide GeoJSON clips and choropleths.
import { q } from '../lib/db.mjs';
import { step } from '../lib/state.mjs';

export const SRC = 'derived';
// The 33 Greater Sydney councils = every LGA with mesh blocks in the ABS GCCSA "Greater Sydney", minus Central Coast
// (whole LGAs, so the Hawkesbury / Blue Mountains / Wollondilly parts outside the GCCSA are included).
export async function ingest() {
  await step(SRC, 'sydney_lga_mb', async () => {
    await q(`CREATE TABLE IF NOT EXISTS sydney_mb AS SELECT mb_code, sal_name, sa1_code, sa2_code, lga_name FROM asgs_mb WHERE false`);
    await q('TRUNCATE sydney_mb');
    await q(`INSERT INTO sydney_mb SELECT mb_code, sal_name, sa1_code, sa2_code, lga_name FROM asgs_mb
             WHERE lga_name IN (SELECT lga_name FROM asgs_mb WHERE gccsa_name = 'Greater Sydney' AND lga_name NOT ILIKE 'Central Coast%' AND lga_name NOT ILIKE 'No usual address%' AND lga_name NOT ILIKE 'Unincorporated%' GROUP BY lga_name HAVING count(*) >= 50)`);
    await q('CREATE INDEX IF NOT EXISTS sydney_mb_pk ON sydney_mb (mb_code)');
    return `${(await q('SELECT count(*)::int n FROM sydney_mb')).rows[0].n} mesh blocks in the 33 LGAs`;
  });
  await step(SRC, 'hulls', async () => {
    await q('TRUNCATE area_hull');
    // Mesh blocks first (convex hull of a block's addresses + 30 m; concave hulls were far too slow at 55k blocks),
    // then SA1 and SAL as unions of their mesh-block hulls.
    await q(`INSERT INTO area_hull (kind, code, name, geom)
             SELECT 'mb', m.mb_code, NULL, ST_Multi(ST_Buffer(ST_ConvexHull(ST_Collect(a.geom::geometry))::geography, 30)::geometry)
             FROM address a JOIN sydney_mb m ON m.mb_code = a.mb_2021 GROUP BY m.mb_code`);
    await q(`INSERT INTO area_hull (kind, code, name, geom)
             SELECT 'sa1', m.sa1_code, NULL, ST_Multi(ST_Buffer(ST_Union(h.geom)::geography, 20)::geometry)
             FROM area_hull h JOIN sydney_mb m ON m.mb_code = h.code WHERE h.kind = 'mb' GROUP BY m.sa1_code`);
    await q(`INSERT INTO area_hull (kind, code, name, geom)
             SELECT 'sal', m.sal_name, m.sal_name, ST_Multi(ST_Buffer(ST_Union(h.geom)::geography, 40)::geometry)
             FROM area_hull h JOIN sydney_mb m ON m.mb_code = h.code WHERE h.kind = 'mb' GROUP BY m.sal_name`);
    await q('ANALYZE area_hull');
    return `${(await q('SELECT count(*)::int n FROM area_hull')).rows[0].n} hulls`;
  });
  // Per-address hazard flags (set-based spatial joins, a few minutes for ~1.9 M addresses). Rebuilt by `make refresh-weekly`.
  await step(SRC, 'address_flags', async () => {
    await q('TRUNCATE address_flags');
    await q(`INSERT INTO address_flags (gnaf_pid, mb, sal_name, sa1_code, lga_name)
             SELECT a.gnaf_pid, a.mb_2021, m.sal_name, m.sa1_code, m.lga_name FROM address a JOIN sydney_mb m ON m.mb_code = a.mb_2021`);
    // Polygon layers: subdivide (RFS bushfire polygons have thousands of vertices), index, then one gist probe per address.
    const polyFlag = async (col, sources, valueExpr = null) => {
      await q('DROP TABLE IF EXISTS flag_sub');
      await q(`CREATE UNLOGGED TABLE flag_sub AS SELECT props, ST_Subdivide(geom, 128) AS geom FROM features WHERE source = ANY($1)`, [sources]);
      await q('CREATE INDEX flag_sub_gix ON flag_sub USING gist (geom); ANALYZE flag_sub');
      if (valueExpr) {
        await q(`UPDATE address_flags f SET ${col} = s.v FROM (
                   SELECT f2.gnaf_pid, ${valueExpr} v FROM address_flags f2 JOIN address a ON a.gnaf_pid = f2.gnaf_pid
                   JOIN flag_sub x ON ST_Intersects(x.geom, a.geom::geometry) GROUP BY f2.gnaf_pid) s WHERE s.gnaf_pid = f.gnaf_pid`);
      } else {
        await q(`UPDATE address_flags f SET ${col} = true FROM address a WHERE a.gnaf_pid = f.gnaf_pid
                 AND EXISTS (SELECT 1 FROM flag_sub x WHERE ST_Intersects(x.geom, a.geom::geometry))`);
      }
      await q('DROP TABLE IF EXISTS flag_sub');
      console.log(`  ${col} flagged`);
    };
    await polyFlag('bushfire', ['rfs_bfpl']);
    await polyFlag('flood', ['epi_flood']);
    await polyFlag('mine', ['mine_subsidence']);
    await polyFlag('ass_class', ['epi_ass'], `min(x.props->>'LAY_CLASS')`);
    await polyFlag('anef_code', ['epi_anef', 'wsa_anec'], `max(x.props->>'ANEF_CODE')`);
    // EPA sites are ~1,900 points: for each site, pull the addresses within 250 / 500 m through the address geography index.
    for (const [col, d] of [['contam250', 250], ['contam500', 500]]) {
      await q(`UPDATE address_flags f SET ${col} = true WHERE f.gnaf_pid IN (
                 SELECT a.gnaf_pid FROM features x JOIN address a ON ST_DWithin(a.geom, x.geom::geography, ${d}) WHERE x.source = 'epa_contaminated')`);
      console.log(`  ${col} flagged`);
    }
    // "assessed" = an open map exists for this address: LEP ANEF for its LGA, or within 15 km of the WSA ANEC map; LEP flood layer for its LGA or a SEPP flood map within 3 km.
    await q(`UPDATE address_flags f SET anef_assessed = true WHERE anef_code IS NOT NULL OR EXISTS (SELECT 1 FROM features x WHERE x.source='epi_anef' AND upper(x.props->>'LGA_NAME') = upper(regexp_replace(f.lga_name, '\\s*\\(.*\\)\\s*$','')))`);
    // Proximity gates use the bounding box of a buffered layer (index-only via geography &&): precise enough for "an open map exists near here".
    await q(`UPDATE address_flags f SET anef_assessed = true WHERE NOT anef_assessed AND gnaf_pid IN (
               SELECT a.gnaf_pid FROM (SELECT ST_Buffer(ST_Union(geom)::geography, 15000) g FROM features WHERE source = 'wsa_anec') x JOIN address a ON a.geom && x.g)`);
    await q(`UPDATE address_flags f SET flood_assessed = true WHERE flood OR EXISTS (SELECT 1 FROM features x WHERE x.source='epi_flood' AND upper(x.props->>'LGA_NAME') = upper(regexp_replace(f.lga_name, '\\s*\\(.*\\)\\s*$','')))`);
    await q(`UPDATE address_flags f SET flood_assessed = true WHERE NOT flood_assessed AND gnaf_pid IN (
               SELECT a.gnaf_pid FROM (SELECT ST_Buffer(geom::geography, 3000) g FROM features WHERE source = 'epi_flood' AND coalesce(props->>'LGA_NAME','') = '') x JOIN address a ON a.geom && x.g)`);
    await q('ANALYZE address_flags');
    await q('DELETE FROM api_cache');
    const r = (await q(`SELECT count(*)::int n, count(*) FILTER (WHERE bushfire)::int bf, count(*) FILTER (WHERE contam250)::int c250, count(*) FILTER (WHERE anef_assessed)::int an FROM address_flags`)).rows[0];
    return `${r.n} addresses flagged (bushfire ${r.bf}, contam≤250m ${r.c250}, anef assessed ${r.an})`;
  });
}
