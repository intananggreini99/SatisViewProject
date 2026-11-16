// Query & pembentukan data untuk dashboard.
// Setiap tabel adalah cermin satu file CSV hasil analisis di HDFS
// (lihat contracts/data_contract.json): nama tabel = <nama>_<responden>,
// mis. kpi_ringkasan_mahasiswa, prioritas_aspek_dosen.
import { config } from '../config.js';
import { listTables, query } from '../db.js';

export const SEMUA = 'Semua';
/** Nilai filter topik untuk komentar yang tidak terdeteksi aspeknya oleh kamus kata kunci tim. */
export const TANPA_ASPEK = '__tanpa_aspek__';

const num = (value) => (value === null || value === undefined || value === '' ? null : Number(value));
const text = (value) => (value === null || value === undefined ? null : String(value));
const ident = (name) => `"${String(name).replace(/"/g, '""')}"`;

/** Nama tabel analisis untuk kelompok responden (satu file CSV = satu tabel). */
export const tableName = (group, name) => `${name}_${group.key}`;
const tbl = (group, name) => ident(tableName(group, name));

/** "saran_perbaikan" -> "Saran perbaikan" (jenis pertanyaan teks terbuka dari notebook tim). */
export function humanize(value) {
  const textValue = String(value ?? '').replace(/_/g, ' ').trim();
  return textValue ? textValue[0].toUpperCase() + textValue.slice(1) : null;
}

async function tableComment(database, table) {
  try {
    const rows = await query(database, "SELECT obj_description(to_regclass($1), 'pg_class') AS comment", [
      `public.${ident(table)}`,
    ]);
    const match = /diingest=([^;]+)/.exec(rows[0]?.comment ?? '');
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

async function rawCount(group) {
  try {
    const rows = await query(config.rawDb, `SELECT count(*)::int AS n FROM ${ident(group.rawTable)}`);
    return rows[0]?.n ?? 0;
  } catch {
    return null; // tabel raw belum ada
  }
}

async function readSummary(group, segment, tables) {
  if (!tables.has(tableName(group, 'kpi_ringkasan'))) return { status: 'no_data' };
  const rows = await query(group.database, `SELECT * FROM ${tbl(group, 'kpi_ringkasan')} WHERE segmen = $1`, [segment]);
  if (rows.length && num(rows[0].n_responden) > 0) return { status: 'ready', row: rows[0] };
  // Catatan: tabel dari CSV kosong bertipe TEXT semua, jadi hindari perbandingan angka di SQL.
  const total = await query(group.database, `SELECT count(*)::int AS n FROM ${tbl(group, 'kpi_ringkasan')}`);
  return { status: total[0].n === 0 ? 'empty' : 'not_found' };
}

/** Label tampilan aspek (kolom label/singkatan/kelompok di kpi_aspek). */
async function aspectLabels(group, tables, segment = SEMUA) {
  const map = new Map();
  if (!tables.has(tableName(group, 'kpi_aspek'))) return map;
  const rows = await query(
    group.database,
    `SELECT aspek, label, singkatan, kelompok, urutan, segmen FROM ${tbl(group, 'kpi_aspek')}
     WHERE segmen = $1 OR segmen = $2 ORDER BY (segmen = $1) DESC`,
    [segment, SEMUA],
  );
  for (const r of rows) {
    if (map.has(r.aspek)) continue;
    map.set(r.aspek, {
      key: text(r.aspek),
      label: text(r.label) ?? text(r.aspek),
      short: text(r.singkatan) ?? text(r.aspek),
      group: text(r.kelompok),
      order: num(r.urutan),
    });
  }
  return map;
}

const labelOf = (labels, aspek) =>
  labels.get(aspek) ?? { key: text(aspek), label: text(aspek), short: text(aspek), group: null, order: null };

const stressOf = (row) =>
  row ? { value: num(row.stress1), interpretation: text(row.interpretasi), respondents: num(row.n_responden) } : null;

// ----------------------------------------------------------------- ringkasan
export async function getGroupOverview(group) {
  const tables = await listTables(group.database);
  const base = {
    key: group.key,
    label: group.label,
    segmentLabel: group.segmentLabel,
    rawResponses: await rawCount(group),
  };
  const kpi = tableName(group, 'kpi_ringkasan');
  if (!tables.has(kpi)) {
    return { ...base, status: 'no_data', respondents: 0, index: null, updatedAt: null };
  }
  const rows = await query(group.database, `SELECT * FROM ${ident(kpi)} WHERE segmen = $1`, [SEMUA]);
  const ingestedAt = await tableComment(group.database, kpi);
  if (!rows.length || !(num(rows[0].n_responden) > 0)) {
    return { ...base, status: 'empty', respondents: 0, index: null, updatedAt: ingestedAt };
  }
  const row = rows[0];
  return {
    ...base,
    segmentLabel: text(row.dimensi_segmen) ?? group.segmentLabel,
    status: 'ready',
    respondents: num(row.n_responden),
    index: num(row.indeks_total),
    grade: text(row.mutu),
    updatedAt: text(row.tanggal_analisis) ?? ingestedAt,
  };
}

export async function getSegments(group) {
  const tables = await listTables(group.database);
  if (!tables.has(tableName(group, 'kpi_ringkasan'))) {
    return { status: 'no_data', segmentLabel: group.segmentLabel, segments: [] };
  }
  const rows = (
    await query(
      group.database,
      `SELECT segmen, n_responden, dimensi_segmen FROM ${tbl(group, 'kpi_ringkasan')}
       ORDER BY (segmen <> $1), lower(segmen)`,
      [SEMUA],
    )
  ).filter((row) => num(row.n_responden) > 0);
  return {
    status: rows.length ? 'ready' : 'empty',
    segmentLabel: text(rows[0]?.dimensi_segmen) ?? group.segmentLabel,
    segments: rows.map((row) => ({ value: row.segmen, respondents: num(row.n_responden) })),
  };
}

// ------------------------------------------------------------------------ KPI
export async function getKpi(group, segment) {
  const tables = await listTables(group.database);
  const summary = await readSummary(group, segment, tables);
  if (summary.status !== 'ready') return { status: summary.status, segment };
  const row = summary.row;

  const aspects = tables.has(tableName(group, 'kpi_aspek'))
    ? await query(group.database, `SELECT * FROM ${tbl(group, 'kpi_aspek')} WHERE segmen = $1 ORDER BY urutan, aspek`, [segment])
    : [];
  const items = tables.has(tableName(group, 'kpi_item'))
    ? await query(
        group.database,
        `SELECT * FROM ${tbl(group, 'kpi_item')} WHERE segmen = $1 ORDER BY urutan_aspek, urutan_item, item_kode`,
        [segment],
      )
    : [];
  const priority = tables.has(tableName(group, 'prioritas_aspek'))
    ? await query(group.database, `SELECT * FROM ${tbl(group, 'prioritas_aspek')} WHERE segmen = $1 ORDER BY ranking`, [segment])
    : [];
  const labels = await aspectLabels(group, tables, segment);

  const itemsByAspect = {};
  for (const item of items) {
    (itemsByAspect[text(item.aspek)] ??= []).push({
      code: text(item.item_kode),
      order: num(item.urutan_item),
      text: text(item.pertanyaan),
      mean: num(item.rata_rata),
      index: num(item.indeks),
      responses: num(item.n_responden),
    });
  }

  return {
    status: 'ready',
    segment,
    summary: {
      segmentLabel: text(row.dimensi_segmen) ?? group.segmentLabel,
      respondents: num(row.n_responden),
      aspectCount: num(row.jumlah_aspek),
      mean: num(row.rata_rata_total),
      index: num(row.indeks_total),
      grade: text(row.mutu),
      performance: text(row.kinerja),
      highest: { label: text(row.aspek_tertinggi), index: num(row.indeks_tertinggi) },
      lowest: { label: text(row.aspek_terendah), index: num(row.indeks_terendah) },
      scaleMin: num(row.skala_min),
      scaleMax: num(row.skala_maks),
      comments: num(row.jumlah_komentar),
      priorityRespondents: num(row.jumlah_pengisi_prioritas),
      updatedAt: text(row.tanggal_analisis),
    },
    aspects: aspects.map((a) => ({
      key: text(a.aspek),
      label: text(a.label) ?? text(a.aspek),
      short: text(a.singkatan) ?? text(a.aspek),
      group: text(a.kelompok),
      order: num(a.urutan),
      mean: num(a.rata_rata),
      index: num(a.indeks),
      grade: text(a.mutu),
      performance: text(a.kinerja),
      rank: num(a.peringkat),
      itemCount: num(a.jumlah_item),
      responses: num(a.n_responden),
    })),
    items: itemsByAspect,
    // Priority analysis tim: skor = 1/3 ketidakpuasan + 1/3 % dipilih + 1/3 frekuensi komentar (min-max).
    priority: priority.map((p) => ({
      ...labelOf(labels, p.aspek),
      rank: num(p.ranking),
      score: num(p.skor_prioritas),
      level: text(p.level_prioritas),
      quadrant: text(p.kuadran),
      satisfaction: num(p.skor_kepuasan),
      chosen: num(p.jumlah_dipilih),
      chosenPct: num(p.persen_dipilih),
      comments: num(p.frekuensi_komentar),
      components: {
        dissatisfaction: num(p.norm_ketidakpuasan),
        choice: num(p.norm_pilihan),
        comments: num(p.norm_komentar),
      },
    })),
  };
}

// ------------------------------------------------------------- Mapping (MDS)
export async function getMapping(group, segment) {
  const tables = await listTables(group.database);
  if (!tables.has(tableName(group, 'mds_titik_aspek'))) return { status: 'no_data', segment };
  const summary = await readSummary(group, segment, tables);
  if (summary.status !== 'ready') return { status: summary.status, segment };

  const [rows2d, rows3d, stressRows, kpiAspects] = await Promise.all([
    query(group.database, `SELECT * FROM ${tbl(group, 'mds_titik_aspek')} WHERE segmen = $1`, [segment]),
    tables.has(tableName(group, 'mds_titik_aspek_3d'))
      ? query(group.database, `SELECT * FROM ${tbl(group, 'mds_titik_aspek_3d')} WHERE segmen = $1`, [segment])
      : [],
    tables.has(tableName(group, 'mds_stress'))
      ? query(group.database, `SELECT * FROM ${tbl(group, 'mds_stress')} WHERE segmen = $1 OR segmen = $2`, [segment, SEMUA])
      : [],
    tables.has(tableName(group, 'kpi_aspek'))
      ? query(group.database, `SELECT aspek, indeks, rata_rata, n_responden FROM ${tbl(group, 'kpi_aspek')} WHERE segmen = $1`, [segment])
      : [],
  ]);
  const labels = await aspectLabels(group, tables, segment);
  const kpiByAspect = new Map(kpiAspects.map((a) => [a.aspek, a]));
  const stressBy = (seg, name) => stressRows.find((s) => s.segmen === seg && s.analisis === name);
  const byOrder = (a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name);

  // Peta responden (biplot) hanya dihitung untuk seluruh responden, seperti notebook tim.
  let respondentMap = null;
  if (tables.has(tableName(group, 'mds_responden'))) {
    const [points, vectors] = await Promise.all([
      query(group.database, `SELECT response_id, dim1, dim2, segmen_responden FROM ${tbl(group, 'mds_responden')} ORDER BY response_id`),
      tables.has(tableName(group, 'mds_vektor_aspek'))
        ? query(group.database, `SELECT * FROM ${tbl(group, 'mds_vektor_aspek')} WHERE segmen = $1`, [SEMUA])
        : [],
    ]);
    if (points.length) {
      respondentMap = {
        stress: stressOf(stressBy(SEMUA, 'mds_responden_2d')),
        points: points.map((p) => ({ id: text(p.response_id), x: num(p.dim1), y: num(p.dim2), segment: text(p.segmen_responden) })),
        vectors: vectors
          .map((v) => ({ ...labelOf(labels, v.aspek), name: text(v.aspek), x: num(v.korelasi_dim1), y: num(v.korelasi_dim2) }))
          .sort(byOrder),
      };
    }
  }

  if (!rows2d.length) {
    // MDS segmen ini dilewati pipeline (responden lengkap < SATISVIEW_MIN_RESPONDEN_MDS).
    return {
      status: 'skipped',
      segment,
      respondents: num(summary.row.n_responden),
      minRespondents: config.minRespondenMds,
      respondentMap,
    };
  }

  const toPoint = (r) => {
    const kpi = kpiByAspect.get(r.aspek);
    return {
      ...labelOf(labels, r.aspek),
      name: text(r.aspek),
      x: num(r.dim1),
      y: num(r.dim2),
      z: num(r.dim3),
      index: num(kpi?.indeks),
      mean: num(kpi?.rata_rata),
      responses: num(kpi?.n_responden),
    };
  };
  const ownStress = stressBy(segment, 'mds_aspek_2d');

  return {
    status: 'ready',
    segment,
    respondents: num(ownStress?.n_responden) ?? num(summary.row.n_responden),
    aspectCount: rows2d.length,
    stress: {
      aspects2d: stressOf(ownStress),
      aspects3d: stressOf(stressBy(segment, 'mds_aspek_3d')),
    },
    points: rows2d.map(toPoint).sort(byOrder),
    points3d: rows3d.map(toPoint).sort(byOrder),
    respondentMap,
  };
}

// --------------------------------------------------------------- Text analytics
export async function getTopics(group, segment) {
  const tables = await listTables(group.database);
  if (!tables.has(tableName(group, 'frekuensi_aspek'))) return { status: 'no_data', segment, topics: [] };
  const summary = await readSummary(group, segment, tables);
  if (summary.status !== 'ready') return { status: summary.status, segment, topics: [] };

  const segFilter = segment === SEMUA ? '' : 'WHERE segmen_responden = $1';
  const segParams = segment === SEMUA ? [] : [segment];
  const [rows, words, totals] = await Promise.all([
    query(group.database, `SELECT * FROM ${tbl(group, 'frekuensi_aspek')} WHERE segmen = $1 ORDER BY ranking`, [segment]),
    tables.has(tableName(group, 'kata_teratas'))
      ? query(
          group.database,
          `SELECT kata, frekuensi FROM ${tbl(group, 'kata_teratas')} WHERE segmen = $1 ORDER BY frekuensi DESC, kata LIMIT 30`,
          [segment],
        )
      : [],
    tables.has(tableName(group, 'teks_bersih'))
      ? query(
          group.database,
          `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE aspek IS NULL OR aspek = '')::int AS tanpa_aspek
           FROM ${tbl(group, 'teks_bersih')} ${segFilter}`,
          segParams,
        )
      : [{ total: 0, tanpa_aspek: 0 }],
  ]);
  const labels = await aspectLabels(group, tables, segment);
  return {
    status: 'ready',
    segment,
    total: num(totals[0]?.total) ?? 0,
    withoutAspect: num(totals[0]?.tanpa_aspek) ?? 0,
    topics: rows.map((r) => ({
      ...labelOf(labels, r.aspek),
      count: num(r.frekuensi),
      pct: num(r.persen_komentar),
      rank: num(r.ranking),
    })),
    words: words.map((w) => ({ word: text(w.kata), count: num(w.frekuensi) })),
  };
}

export async function getComments(group, { segment, topic, search, limit, offset }) {
  const tables = await listTables(group.database);
  const teks = tableName(group, 'teks_bersih');
  if (!tables.has(teks)) return { status: 'no_data', total: 0, items: [] };
  const where = [];
  const params = [];
  if (segment && segment !== SEMUA) {
    params.push(segment);
    where.push(`segmen_responden = $${params.length}`);
  }
  if (topic === TANPA_ASPEK) {
    where.push("(aspek IS NULL OR aspek = '')");
  } else if (topic && tables.has(tableName(group, 'aspek_komentar'))) {
    params.push(topic);
    where.push(`id_komentar IN (SELECT id_komentar FROM ${tbl(group, 'aspek_komentar')} WHERE aspek = $${params.length})`);
  }
  if (search) {
    params.push(`%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where.push(`teks_komentar ILIKE $${params.length}`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [{ n }] = await query(group.database, `SELECT count(*)::int AS n FROM ${ident(teks)} ${clause}`, params);
  const rows = await query(
    group.database,
    `SELECT id_komentar, segmen_responden, jenis_pertanyaan, aspek, teks_komentar FROM ${ident(teks)} ${clause}
     ORDER BY id_komentar LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );
  const labels = await aspectLabels(group, tables);
  return {
    status: 'ready',
    total: n,
    limit,
    offset,
    items: rows.map((r) => ({
      id: text(r.id_komentar),
      segment: text(r.segmen_responden),
      question: humanize(r.jenis_pertanyaan),
      aspects: (text(r.aspek) ?? '')
        .split(';')
        .map((a) => a.trim())
        .filter(Boolean)
        .map((a) => {
          const l = labelOf(labels, a);
          return { key: l.key, label: l.label, short: l.short };
        }),
      text: text(r.teks_komentar),
    })),
  };
}
