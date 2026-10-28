// Tata letak graph commit (seperti `git log --graph`): tiap commit dapat kolom (lane), plus garis
// yang lewat, yang masuk ke titik commit, dan yang keluar ke parent. Input urut topologis
// (anak sebelum parent), seperti keluaran `git log --topo-order`.

export interface GraphRow {
  /** Kolom titik commit ini. */
  lane: number;
  /** Kolom yang lewat lurus dari atas ke bawah baris ini. */
  through: number[];
  /** Kolom dari atas yang berakhir di titik commit ini (anak-anaknya). */
  into: number[];
  /** Kolom di bawah tempat parent commit ini berlanjut. */
  out: number[];
  /** Jumlah kolom yang terpakai (untuk lebar SVG). */
  width: number;
}

export function layoutGraph(commits: { sha: string; parents?: string[] }[]): GraphRow[] {
  // lanes[i] = sha yang ditunggu di kolom i.
  let lanes: (string | null)[] = [];
  const rows: GraphRow[] = [];
  for (const c of commits) {
    const into = lanes.map((s, i) => (s === c.sha ? i : -1)).filter((i) => i >= 0);
    let lane = into.length ? into[0] : lanes.indexOf(null);
    if (lane < 0) lane = lanes.length;
    const next = lanes.map((s) => (s === c.sha ? null : s));
    const through = next.map((s, i) => (s !== null ? i : -1)).filter((i) => i >= 0);
    const out: number[] = [];
    (c.parents ?? []).forEach((p, k) => {
      // Parent yang sudah ditunggu kolom lain: sambung ke sana (cabang bertemu).
      let pl = next.indexOf(p);
      if (pl < 0) {
        pl = k === 0 && next[lane] === null ? lane : next.indexOf(null);
        if (pl < 0) pl = next.length;
        next[pl] = p;
      }
      out.push(pl);
    });
    const width = Math.max(lanes.length, next.length, lane + 1);
    while (next.length && next[next.length - 1] === null) next.pop();
    rows.push({ lane, through, into, out, width });
    lanes = next;
  }
  return rows;
}
