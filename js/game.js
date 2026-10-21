/* 主控：输入、自由/竞速模式、全湖巡回航线、上下船、探访判定、计时结算 */
(function () {
  const C = window.COURSE;
  let scene, camera, renderer, world, boat;
  let state = 'loading';
  let last = 0, t0 = 0, raceTime = 0;
  let topSpeed = 0, visitedCount = 0, armed = false;
  let raceToken = 0;
  let tier = null, frameMs = 16, emaMs = 16, lookT = 0, snapBack = false;
  let walkSprintShown = false;

  /* 模式：free（自由探索，三档速度，无结算）/ race（竞速，固定快船 + 体力加速） */
  let mode = 'free';
  let stamina = CFG.race.staminaMax;
  let bestVisited = 0, bestRace = 0;
  try { bestVisited = parseInt(localStorage.getItem('lake_visited_v3') || '0', 10) || 0; } catch (e) { bestVisited = 0; }
  try { bestRace = parseFloat(localStorage.getItem('lake_race_v3') || '0') || 0; } catch (e) { bestRace = 0; }

  const keys = {};
  const input = { throttle: 0, steer: 0, cruiseFast: false, cruiseCap: null, boost: false };
  /* 触屏输入：
       steer   —— 摇杆水平分量（转向）
       throttle—— 纵向油门（向上推为前进，向下拉为倒船，v2 修正）
       forward —— 摇杆"前推"分量（0..1），三档巡航时单独用它提速
       boost   —— 竞速加速踏板 */
  const touch = { steer: 0, throttle: 0, forward: 0, boost: false };
  const isTouchUI = () => document.body.classList.contains('touch');

  let stuckT = 0, unstickT = 0, hardT = 0;   // hardT：连续低速计时，用于硬恢复兜底
  let lastHardIdx = -1;                      // 上次硬恢复所在航线索引（同一处反复卡 → 跳更远）
  let routeIdx = 0;

  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ==================================================================
     全湖巡回航线（v2）
     ------------------------------------------------------------------
     旧航线只在北半湖绕行，南岸的雷峰塔 / 净慈寺 / 花港观鱼 / 柳浪闻莺 /
     城隍阁 根本不在探访半径内，自动巡航永远走不全 23 景。
     这里在 12m 网格上用真实 Terrain 数据做一次 A*：
       ① 每个景点先找"最近的可航行水面"作为泊靠点；
       ② 按这些泊靠点在旧航线上的投影顺序排成环（保持地理次序）；
       ③ 相邻两点之间 A* 找水路（桥洞作为可通行走廊，并给"桥心"加权吸引，
          让路径主动从拱洞正中穿过）；
       ④ 拉普拉斯平滑（每步校验可航行，宁可不动也不上岸），再等距重采样。
     得到一条闭环 TOUR：自动巡航、竞速箭头、小地图都用它。
     ================================================================== */
  const TOUR = [];
  let tourReady = false;
  function planTour() {
    const T = window.Terrain;
    const lms = (window.Landmarks && Landmarks.list) || [];
    if (!T || lms.length < 2) return false;
    const t0p = performance.now();

    const CELL = 12;
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    C.water.forEach(p => {
      if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
      if (p[1] < minZ) minZ = p[1]; if (p[1] > maxZ) maxZ = p[1];
    });
    const x0 = Math.floor(minX / CELL) * CELL - 36;
    const z0 = Math.floor(minZ / CELL) * CELL - 36;
    const nx = Math.ceil((maxX - x0) / CELL) + 2;
    const nz = Math.ceil((maxZ - z0) / CELL) + 2;
    const N = nx * nz;
    const pass = new Uint8Array(N);
    const wcost = new Float32Array(N);
    const brs = window.__BRIDGES || [];

    /* --- 栅格：可航 + 岸距代价 + 桥心吸引 --- */
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * CELL, z = z0 + j * CELL;
        const idx = j * nx + i;
        const sd = T.shoreDist(x, z);
        /* 关键：栅格可航判定必须与【船体的 Terrain.navigable】一致。
           旧版只用 shoreDist + onCauseway，判定比船宽松，于是航线会穿过
           桥台带/岛岸缓冲带——航点自己"可航"，但船开过去被看不见的岸咬住，
           低速前进+倒车反复僵持（长测实测在 idx328 僵持 5 分钟）。
           现在直接问 navigable，航线天生落在船能走的水面上。 */
        let ok = (sd < -5.5) && T.navigable(x, z);
        if (!ok && brs.length) {
          /* 桥洞放宽：拱洞中线的栅格可能因 sd>0（堤身）被否掉，
             只要 navigable 说能穿就放行 */
          for (let k = 0; k < brs.length; k++) {
            const b = brs[k];
            const dx = x - b.x, dz = z - b.z;
            if (dx * dx + dz * dz > (b.span * 1.05) * (b.span * 1.05)) continue;
            if (T.navigable(x, z)) { ok = true; break; }
          }
        }
        /* 贴岸水面加一点代价：航线宁可走湖心，减少擦堤 */
        let w = 1;
        if (ok && sd > -18) w += (-sd - 5.5) * 0.28;
        /* 桥心吸引：越近桥心越便宜，路径自然会从拱洞正中穿过 */
        for (let k = 0; k < brs.length; k++) {
          const b = brs[k];
          const d = Math.hypot(x - b.x, z - b.z);
          if (d < 70) w *= 1 + 2.2 * (1 - d / 70);
        }
        pass[idx] = ok ? 1 : 0;
        wcost[idx] = w;
      }
    }

    /* --- 连通分量标记：西湖被苏堤/白堤切成好几块水面，
           但泊靠点必须落在"与起点同属一片"的主湖面上，否则 A* 永远失败 --- */
    const comp = new Int32Array(N);
    let nComp = 0;
    const csize = [0];
    const cstack = new Int32Array(N);
    for (let s0 = 0; s0 < N; s0++) {
      if (!pass[s0] || comp[s0]) continue;
      const id = ++nComp;
      let sp = 0, cnt = 0;
      cstack[sp++] = s0; comp[s0] = id;
      while (sp > 0) {
        const cur = cstack[--sp];
        cnt++;
        const ci = cur % nx, cj = (cur / nx) | 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const ni = ci + di, nj = cj + dj;
            if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
            const nk = nj * nx + ni;
            if (!pass[nk] || comp[nk]) continue;
            comp[nk] = id; cstack[sp++] = nk;
          }
        }
      }
      csize[id] = cnt;
    }
    let mainC = 0;
    {
      let sc = cellOf(C.start.x, C.start.z);
      if (sc < 0 || !pass[sc]) sc = snapCellIdx(C.start.x, C.start.z, 12);
      if (sc >= 0) mainC = comp[sc];
      /* 起点不在水里就退而取最大的一片 */
      if (!mainC) { let best = 0; for (let i = 1; i <= nComp; i++) if (csize[i] > best) { best = csize[i]; mainC = i; } }
    }
    /* 主湖面全部可通行格，供"最近泊靠点"检索 */
    let nMain = 0;
    for (let k = 0; k < N; k++) if (comp[k] === mainC) nMain++;
    const mainX = new Float32Array(nMain), mainZ = new Float32Array(nMain), mainK = new Int32Array(nMain);
    {
      let q = 0;
      for (let k = 0; k < N; k++) {
        if (comp[k] !== mainC) continue;
        mainK[q] = k;
        mainX[q] = x0 + (k % nx) * CELL;
        mainZ[q] = z0 + ((k / nx) | 0) * CELL;
        q++;
      }
    }

    /* 开阔度：8 方向 45m 内有几个可航点。汊底/窄港只有 2~4 个，
       开阔湖面 8 个全通。用于把泊靠点挡在死胡同外面。 */
    function openCount(x, z) {
      /* 用岸距 SDF 判开阔（比 navigable 便宜两个数量级，构建耗时 2s → 0.2s）：
         8 方向 45m 处岸距 < -18m 视为开阔水面 */
      let c = 0;
      for (let a = 0; a < 8; a++) {
        const th = a * Math.PI / 4;
        if (T.shoreDist(x + Math.cos(th) * 45, z + Math.sin(th) * 45) < -18) c++;
      }
      return c;
    }

    /* --- 泊靠点 = 主湖面上离景点最近、且水域开阔的一格 ---
       为什么要 "开阔"：泊靠点若落在死胡同汊底（或桥对岸的死水），A* 必然
       开进去再原路开出来，形成 180° 发卡弯；纯追踪在汊顶既没有速度转向、
       也没有空间掉头，实测会在那里无限僵持，整条环线跑不完。
       放宽到"够开阔"后，景点仍由环线在其附近通过（探访半径 158~280m），
       只是不再开进汊底。 */
    function nearestWater(lm) {
      let bi = -1, bd = 1e9, biAny = -1, bdAny = 1e9;
      for (let q = 0; q < nMain; q++) {
        const dx = mainX[q] - lm.x, dz = mainZ[q] - lm.z;
        const d = dx * dx + dz * dz;
        if (d < bdAny) { bdAny = d; biAny = q; }
        if (d >= bd) continue;
        if (openCount(mainX[q], mainZ[q]) < 6) continue;
        bd = d; bi = q;
      }
      if (bi < 0) { bi = biAny; bd = bdAny; }        // 全场都很窄时退回最近点
      if (bi < 0) return null;
      return [mainX[bi], mainZ[bi], Math.sqrt(bd)];
    }

    const stops = [];
    for (const lm of lms) {
      const p = nearestWater(lm);
      if (!p) { stops.push({ lm, x: C.start.x, z: C.start.z, ang: 0, far: true }); continue; }
      stops.push({ lm, x: p[0], z: p[1], approach: p[2] });
    }

    /* --- 按"绕湖心的方位角"排序：湖泊近似环状，这样得到的次序天然不自交 --- */
    let ccx = 0, ccz = 0;
    stops.forEach(s => { ccx += s.x; ccz += s.z; });
    ccx /= Math.max(1, stops.length); ccz /= Math.max(1, stops.length);
    stops.forEach(s => { s.ang = Math.atan2(s.z - ccz, s.x - ccx); });
    stops.sort((a, b) => a.ang - b.ang);

    /* --- A* --- */
    const gS = new Float32Array(N);
    const from = new Int32Array(N);
    const stamp = new Int32Array(N);
    const closed = new Int32Array(N);
    let stampId = 0;
    const heapI = new Int32Array(N * 4 + 16);
    const heapF = new Float32Array(N * 4 + 16);
    let heapN = 0;
    let reconCut = 0, heapOver = 0;

    function hpush(i, f) {
      if (heapN >= heapI.length - 2) { heapOver++; return; }
      let k = heapN++;
      heapI[k] = i; heapF[k] = f;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heapF[p] <= heapF[k]) break;
        const ti = heapI[p], tf = heapF[p];
        heapI[p] = heapI[k]; heapF[p] = heapF[k];
        heapI[k] = ti; heapF[k] = tf;
        k = p;
      }
    }
    function hpop() {
      const top = heapI[0];
      heapN--;
      if (heapN > 0) {
        heapI[0] = heapI[heapN]; heapF[0] = heapF[heapN];
        let k = 0;
        for (;;) {
          let l = k * 2 + 1, r = l + 1, m = k;
          if (l < heapN && heapF[l] < heapF[m]) m = l;
          if (r < heapN && heapF[r] < heapF[m]) m = r;
          if (m === k) break;
          const ti = heapI[m], tf = heapF[m];
          heapI[m] = heapI[k]; heapF[m] = heapF[k];
          heapI[k] = ti; heapF[k] = tf;
          k = m;
        }
      }
      return top;
    }
    function cellOf(x, z) {
      const i = Math.round((x - x0) / CELL), j = Math.round((z - z0) / CELL);
      if (i < 0 || j < 0 || i >= nx || j >= nz) return -1;
      return j * nx + i;
    }
    /* 把任意坐标吸附到附近最近的"可通行格"（岸边 1~2 格误差的兜底） */
    function snapCellIdx(x, z, rad) {
      const ci = Math.round((x - x0) / CELL), cj = Math.round((z - z0) / CELL);
      let best = -1, bd = 1e9;
      for (let j = cj - rad; j <= cj + rad; j++) {
        if (j < 0 || j >= nz) continue;
        for (let i = ci - rad; i <= ci + rad; i++) {
          if (i < 0 || i >= nx) continue;
          const k = j * nx + i;
          if (!pass[k]) continue;
          const d = (i - ci) * (i - ci) + (j - cj) * (j - cj);
          if (d < bd) { bd = d; best = k; }
        }
      }
      return best;
    }
    function astar(sx, sz, tx, tz) {
      let si = cellOf(sx, sz), ti = cellOf(tx, tz);
      if (si < 0 || ti < 0) return null;
      if (!pass[si]) si = snapCellIdx(sx, sz, 8);
      if (!pass[ti]) ti = snapCellIdx(tx, tz, 8);
      if (si < 0 || ti < 0) return null;
      stampId++;
      heapN = 0;
      gS[si] = 0; from[si] = -1; stamp[si] = stampId;
      const tci = ti % nx, tcj = (ti / nx) | 0;
      const H = i => {
        const ci = i % nx, cj = (i / nx) | 0;
        const dx = Math.abs(ci - tci), dz = Math.abs(cj - tcj);
        return (Math.max(dx, dz) + 0.4142 * Math.min(dx, dz)) * CELL;
      };
      hpush(si, H(si));
      let guard = 0;
      while (heapN > 0 && guard++ < N * 2) {
        const cur = hpop();
        if (closed[cur] === stampId) continue;
        closed[cur] = stampId;
        if (cur === ti) break;
        const ci = cur % nx, cj = (cur / nx) | 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const ni = ci + di, nj = cj + dj;
            if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
            const nk = nj * nx + ni;
            if (!pass[nk]) continue;
            /* 已关闭的节点不再改父指针：否则可能形成 A→B→A 的环，回溯时死循环 */
            if (closed[nk] === stampId) continue;
            const step = (di && dj ? 1.4142 : 1) * CELL * wcost[nk];
            const ng = gS[cur] + step;
            if (stamp[nk] !== stampId || ng < gS[nk]) {
              stamp[nk] = stampId; gS[nk] = ng; from[nk] = cur;
              hpush(nk, ng + H(nk));
            }
          }
        }
      }
      if (stamp[ti] !== stampId) return null;
      const out = [];
      let cur = ti, guard2 = 0, ok = false;
      while (cur >= 0 && guard2++ < N) {
        out.push([x0 + (cur % nx) * CELL, z0 + ((cur / nx) | 0) * CELL]);
        if (cur === si) { ok = true; break; }
        cur = from[cur];
      }
      if (!ok) { reconCut++; return null; }
      out.reverse();
      return out;
    }

    /* --- 从起点开始，依次串联各泊靠点 --- */
    function nearestCellPt(x, z) {
      let best = null, bd = 1e9;
      for (let j = 0; j < nz; j += 2) {
        for (let i = 0; i < nx; i += 2) {
          const k = j * nx + i;
          if (!pass[k] || comp[k] !== mainC) continue;
          const px = x0 + i * CELL, pz = z0 + j * CELL;
          const d = (px - x) * (px - x) + (pz - z) * (pz - z);
          if (d < bd) { bd = d; best = [px, pz]; }
        }
      }
      return best || [C.start.x, C.start.z];
    }
    const startPt = nearestCellPt(C.start.x, C.start.z);
    /* 起点最近的那个景点当第一站 */
    let minI = 0, minD = 1e9;
    stops.forEach((s, i) => {
      const d = Math.hypot(s.x - startPt[0], s.z - startPt[1]);
      if (d < minD) { minD = d; minI = i; }
    });
    const ordered = stops.slice(minI).concat(stops.slice(0, minI));

    const raw = [[startPt[0], startPt[1]]];
    const owners = [-1];                 // 每个 raw 顶点属于哪一站（-1=起点）
    let prev = startPt;
    let fail = 0;
    const failedNames = [];
    const legLens = [];
    for (let si = 0; si < ordered.length; si++) {
      const s = ordered[si];
      const leg = astar(prev[0], prev[1], s.x, s.z);
      legLens.push(leg ? leg.length : -1);
      if (leg) {
        for (let i = 1; i < leg.length; i++) { raw.push(leg[i]); owners.push(si); }
        prev = [s.x, s.z];
      } else {
        /* 水域不连通：这一站不进航线（稍后按"航线上最近点"作为远眺点） */
        fail++;
        failedNames.push(s.lm.name);
      }
    }
    const close = astar(prev[0], prev[1], startPt[0], startPt[1]);
    if (close) for (let i = 1; i < close.length; i++) { raw.push(close[i]); owners.push(ordered.length - 1); }

    /* --- 去重 + 平滑 + 等距重采样 --- */
    const dedup = [];
    for (const p of raw) {
      const lastP = dedup[dedup.length - 1];
      if (!lastP || Math.hypot(p[0] - lastP[0], p[1] - lastP[1]) > 5) dedup.push([p[0], p[1]]);
    }
    const n = dedup.length;
    /* 剪发卡弯 + 并碎点：A* 在窄水道会走出"进两步退一步"的折返（实测桥洞处
       转角 3.1rad、开放水面 2.6rad 各若干处），这种几何缺陷平滑救不了，
       后续曲率限速会算出 1m 半径把船压到爬行。直接改顶点：
       - 相邻 <3m 的碎点：与前一点合并；
       - 转角 >2.0rad 且段长 <30m 的发卡：顶点换成 pa-pb 中点（须过可航格校验）。
       一次只改一个顶点、循环到稳定，防止连环误删。 */
    {
      let guard = 0, nFix = 0;
      while (guard++ < 40) {
        let changed = false;
        const m = dedup.length;
        for (let i = 0; i < m; i++) {
          const p = dedup[i], pa = dedup[(i - 1 + m) % m], pb = dedup[(i + 1) % m];
          const d1 = Math.hypot(p[0] - pa[0], p[1] - pa[1]);
          const d2 = Math.hypot(pb[0] - p[0], pb[1] - p[1]);
          if (d1 < 3) {
            dedup[i] = [(pa[0] + p[0]) / 2, (pa[1] + p[1]) / 2];
            nFix++; changed = true; break;
          }
          if (Math.min(d1, d2) < 30) {
            const a1 = Math.atan2(p[1] - pa[1], p[0] - pa[0]);
            const a2 = Math.atan2(pb[1] - p[1], pb[0] - p[0]);
            let dt = a2 - a1;
            while (dt > Math.PI) dt -= Math.PI * 2;
            while (dt < -Math.PI) dt += Math.PI * 2;
            if (Math.abs(dt) > 2.0) {
              const mx = (pa[0] + pb[0]) / 2, mz = (pa[1] + pb[1]) / 2;
              const ci = cellOf(mx, mz);
              if (ci >= 0 && pass[ci]) { dedup[i] = [mx, mz]; nFix++; changed = true; break; }
            }
          }
        }
        if (!changed) break;
      }
      window.__HAIRPIN_FIX = nFix;
    }
    const sm = dedup.map(p => [p[0], p[1]]);
    const nearBridge = (x, z) => {
      for (let i = 0; i < brs.length; i++) if (Math.hypot(brs[i].x - x, brs[i].z - z) < 52) return true;
      return false;
    };
    /* v2.1 加强平滑：A* 原始折线在障碍附近有锯齿，5 轮 ±2 窗平均后仍会留下
       半径 ~1m 的尖刺（实测全环 12 处），自动巡航按曲率限速会被压到 9m/s。
       改为 9 轮 ±3 窗，把尖刺半径抬到可航行量级；桥区仍保持原点不动，
       由周围点被拉直来间接顺滑（桥洞 passage 本身是直的，无需平滑）。 */
    for (let it = 0; it < 9; it++) {
      const out = new Array(n);
      for (let i = 0; i < n; i++) {
        /* 桥区：完全冻结会把 A* 过桥锯齿原样保留（实测尖刺半径 ~1m 全部集中
           在桥 52m 圈内）。改为 ±1 小窗轻抹——不敢大改是防止 route 挤进桥台，
           但每个新点仍要过可航格校验，过不了就保持原点。 */
        if (nearBridge(sm[i][0], sm[i][1])) {
          const q0 = sm[(i - 1 + n) % n], q2 = sm[(i + 1) % n];
          const px = (q0[0] + sm[i][0] * 2 + q2[0]) / 4;
          const pz = (q0[1] + sm[i][1] * 2 + q2[1]) / 4;
          const ci = cellOf(px, pz);
          out[i] = (ci >= 0 && pass[ci]) ? [px, pz] : [sm[i][0], sm[i][1]];
          continue;
        }
        let sx = 0, sz = 0, sw = 0;
        for (let k = -3; k <= 3; k++) {
          const q = sm[(i + k + n) % n];
          const w = 1 / (1 + Math.abs(k));
          sx += q[0] * w; sz += q[1] * w; sw += w;
        }
        const px = sx / sw, pz = sz / sw;
        const ci = cellOf(px, pz);
        out[i] = (ci >= 0 && pass[ci]) ? [px, pz] : [sm[i][0], sm[i][1]];
      }
      for (let i = 0; i < n; i++) { sm[i][0] = out[i][0]; sm[i][1] = out[i][1]; }
    }

    /* 等距重采样（约 7m 一个点），保持闭环 —— 累计弧长法：
       旧算法在顶点/短段处会吐出 <2.5m 的碎点（实测 3 处），碎点是曲率噪声源，
       会让"单段转角/段长"算出 1m 半径的伪尖刺。累计弧长保证输出严格等距。 */
    const ring = sm.slice();
    const cum = [0];
    let total = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      total += Math.hypot(b[0] - a[0], b[1] - a[1]);
      cum.push(total);
    }
    const res = [];
    const GAP = 7;
    {
      const nOut = Math.max(64, Math.round(total / GAP));
      const step = total / nOut;
      let si = 0;
      for (let k = 0; k < nOut; k++) {
        const target = k * step;
        while (si < ring.length - 1 && cum[si + 1] < target) si++;
        const a = ring[si % ring.length], b = ring[(si + 1) % ring.length];
        const t = (target - cum[si]) / Math.max(1e-6, cum[si + 1] - cum[si]);
        res.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    TOUR.length = 0;
    res.forEach(p => TOUR.push(p));
    tourReady = TOUR.length > 30;

    /* ---- 剪掉"出-回"式发卡弯（关键）----
       环线没必要真的开进死胡同汊底/桥对岸：泊靠点 = 【环线上】离景点最近的点，
       剪掉支线后泊靠点自然落到支线口，探访判定照旧成立。
       不剪的后果：纯追踪在弯顶的"前视点"会反复跨到对侧支线，目标点来回换边，
       船在原地打转（实测 err 恒 115°、索引 431↔445 无限摇摆）。
       判据与前面一致：横向 <24m、弧距 35~420m、方向相反，且回溯配对 ≥4 段平行回撤。 */
    {
      const MH = 14;
      for (let pass = 0; pass < 10; pass++) {
        const m = TOUR.length;
        if (m < 60) break;
        let cut = null;
        const map = new Map();
        for (let i = 6; i < m && !cut; i++) {
          const p = TOUR[i];
          const gi = (p[0] / MH) | 0, gj = (p[1] / MH) | 0;
          for (let a = -2; a <= 2 && !cut; a++) {
            for (let b = -2; b <= 2 && !cut; b++) {
              const arr = map.get((gi + a) + ',' + (gj + b));
              if (!arr) continue;
              for (let q = 0; q < arr.length; q++) {
                const j = arr[q];
                const arc = i - j;
                if (arc < 5 || arc > 60) continue;
                const o = TOUR[j];
                if (Math.hypot(p[0] - o[0], p[1] - o[1]) > 24) continue;
                const j2 = TOUR[(j + 2) % m], i2 = TOUR[i - 2];
                const v1x = j2[0] - o[0], v1z = j2[1] - o[1];
                const v2x = p[0] - i2[0], v2z = p[1] - i2[1];
                const l1 = Math.hypot(v1x, v1z) || 1, l2 = Math.hypot(v2x, v2z) || 1;
                if ((v1x * v2x + v1z * v2z) / (l1 * l2) > -0.3) continue;
                let k = 0;
                while (k < 70) {
                  const ir = i + k, jl = j - k;
                  if (jl < 0 || ir >= m) break;
                  if (Math.hypot(TOUR[ir][0] - TOUR[jl][0], TOUR[ir][1] - TOUR[jl][1]) > 30) break;
                  k++;
                }
                if (k < 4) continue;
                if ((i + k) - (j - k) > 200) continue;
                cut = [j - k + 1, i + k - 1];
                break;
              }
            }
          }
          if (!cut) {
            const key = gi + ',' + gj;
            const bk = map.get(key);
            if (bk) bk.push(i); else map.set(key, [i]);
          }
        }
        if (!cut || cut[1] <= cut[0]) break;
        TOUR.splice(cut[0], cut[1] - cut[0]);
        if (window.__log) window.__log('tour: 剪掉发卡弯 ' + (cut[1] - cut[0]) + ' 点');
      }
      /* 剪完把接缝处抹顺（局部平滑 3 轮，仍校验可航） */
      const m2 = TOUR.length;
      for (let it = 0; it < 3; it++) {
        for (let i = 0; i < m2; i++) {
          const q0 = TOUR[(i - 1 + m2) % m2], q1 = TOUR[i], q2 = TOUR[(i + 1) % m2];
          const px = (q0[0] + q1[0] * 2 + q2[0]) / 4, pz = (q0[1] + q1[1] * 2 + q2[1]) / 4;
          if (T.navigable(px, pz)) TOUR[i] = [px, pz];
        }
      }
    }

    /* 环线是闭环，可以整体反向：若出发点的航线走向与船的出发朝向相反，
       就把环线倒过来，这样开局不必原地掉头（否则纯追踪会先冲过头再倒回来）。 */
    if (tourReady) {
      let bi = 0, bd = 1e9;
      for (let i = 0; i < TOUR.length; i++) {
        const dx = TOUR[i][0] - C.start.x, dz = TOUR[i][1] - C.start.z;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; bi = i; }
      }
      const i1 = (bi + 4) % TOUR.length, i2 = (bi + 9) % TOUR.length;
      const dx = TOUR[i2][0] - TOUR[i1][0], dz = TOUR[i2][1] - TOUR[i1][1];
      const L = Math.hypot(dx, dz) || 1;
      const dot = (dx / L) * Math.cos(C.heading) + (dz / L) * Math.sin(C.heading);
      if (dot < 0) TOUR.reverse();
    }
    /* ---- 桥洞对轴（关键）：A* 的 12m 栅格让过桥段经常偏在拱洞一侧，
       实测有 46 个航点落在 Terrain.navigable 判定的「桥台带」内——
       航点本身不可航，船开到桥前会被看不见的桥台挡住，自救倒车也出不来，
       自动巡航就此永久卡死（长测实测 idx154 处停住 340 秒）。 
       这里把桥附近的航点沿【堤向 u】平滑压到拱洞中线上，让"接近—穿洞—出洞"
       整段都落在通道里；只处理真正穿桥的路段（航向与桥轴夹角足够大），
       沿堤并行的路段不会被拉进桥洞。 ---- */
    if (tourReady && brs.length) {
      const m = TOUR.length;
      for (let k = 0; k < brs.length; k++) {
        const b = brs[k];
        const Rinf = b.span * 0.95 + 34;
        /* 穿桥方向（拱洞轴线）与堤向 */
        const vx = -b.uz, vz = b.ux;
        for (let i = 0; i < m; i++) {
          const dx = TOUR[i][0] - b.x, dz = TOUR[i][1] - b.z;
          if (dx * dx + dz * dz > Rinf * Rinf) continue;
          const pa = TOUR[(i - 2 + m) % m], pb = TOUR[(i + 2) % m];
          const rx = pb[0] - pa[0], rz = pb[1] - pa[1];
          const rl = Math.hypot(rx, rz) || 1;
          /* 航向与桥轴（穿桥方向）的夹角余弦：够大才认为这段是穿桥 */
          if (Math.abs((rx * vx + rz * vz) / rl) < 0.50) continue;
          const u = dx * b.ux + dz * b.uz;
          const v = dx * vx + dz * vz;
          /* 沿堤方向越远、收拢越弱（smoothstep），避免把整段堤线拽歪 */
          const w = 1 - Math.min(1, Math.abs(v) / Rinf);
          const ww = w * w * (3 - 2 * w);
          TOUR[i] = [dx - b.ux * u * ww + b.x, dz - b.uz * u * ww + b.z];
        }
      }
    }

    /* ---- 强制不变量：航线上的每个点都必须可航 ----
       桥洞对轴之后仍有残点落在不可航处（桥台带 / 岛岸 +2m 缓冲 / 水岸多边形
       与 SDF 不一致的岸边），船开过去就被"看不见的岸"咬住。这里把每个不可航
       航点就近搬到最近的可航水面（同心环搜索，优先少绕远的方位），
       保证 A* 航点与船体可航判定完全一致。 */
    let tourSnap = 0;
    if (tourReady) {
      const m = TOUR.length;
      for (let i = 0; i < m; i++) {
        if (T.navigable(TOUR[i][0], TOUR[i][1])) continue;
        const pa = TOUR[(i - 1 + m) % m], pb2 = TOUR[(i + 1) % m];
        let best = null, bd = 1e9;
        for (let r = 3; r <= 12 && !best; r += 3) {
          for (let a = 0; a < 24; a++) {
            const th = (a / 24) * Math.PI * 2;
            const x = TOUR[i][0] + Math.cos(th) * r;
            const z = TOUR[i][1] + Math.sin(th) * r;
            if (!T.navigable(x, z)) continue;
            /* 代价顾及前后邻点：避免搬出一个大折角 */
            const c = Math.hypot(x - pa[0], z - pa[1]) + Math.hypot(x - pb2[0], z - pb2[1]);
            if (c < bd) { bd = c; best = [x, z]; }
          }
        }
        if (best) { TOUR[i] = best; tourSnap++; }
      }
    }
    window.__TOUR_SNAP = tourSnap;

    window.__TOUR = TOUR;
    /* 标题页的"湖程"按真实巡游长度显示 */
    {
      const kmEl = document.getElementById('st-km');
      if (kmEl && tourReady) kmEl.textContent = (TOUR.length * GAP / 1000).toFixed(1);
    }

    /* 每处景点在航线上的"泊靠点"：自动巡航/竞速经过它就算探访。
       泊靠点已保证落在主湖面上（A* 一定能开到），所以探访半径只需固定一小圈；
       景点本体可能还在岸上/山上（城隍阁、保俶塔），玩家看到的是"临水观景点"。 */
    if (tourReady) {
      lms.forEach(lm => {
        let bi = 0, bd = 1e9;
        for (let i = 0; i < TOUR.length; i++) {
          const dx = TOUR[i][0] - lm.x, dz = TOUR[i][1] - lm.z;
          const d = dx * dx + dz * dz;
          if (d < bd) { bd = d; bi = i; }
        }
        lm.ax = TOUR[bi][0];
        lm.az = TOUR[bi][1];
        lm.approachD = Math.sqrt(bd);
        /* 泊靠点被收回支线口的景点离水道口更远，探访半径按实际距离放宽
           （上限 280m，防止"路过即探访"太松） */
        lm.visitR = Math.max(158, Math.min(280, lm.approachD + 30));
      });
    }

    window.__TOUR_INFO = {
      pts: TOUR.length, fail, failed: failedNames, ms: Math.round(performance.now() - t0p),
      reconCut, heapOver, legs: legLens, nComp, nMain, mainC,
      visits: lms.map(l => ({ n: l.name, r: Math.round(l.visitR), d: Math.round(l.approachD || 0) }))
    };
    if (window.__log) window.__log('TOUR ready ' + TOUR.length + ' pts / fail ' + fail + ' / ' + Math.round(performance.now() - t0p) + 'ms');
    return tourReady;
  }

  const routeLine = () => (tourReady && TOUR.length ? TOUR : C.center);

  /* 环线上离船最近的节点（先在上一帧位置附近开窗搜，离得太远再全量搜） */
  function nearestRouteIdx(x, z, hint) {
    const R = routeLine(), n = R.length;
    let best = ((hint | 0) % n + n) % n, bd = Infinity;
    const win = Math.min(90, n - 1);
    for (let k = -win; k <= win; k++) {
      const i = ((best + k) % n + n) % n;
      const dx = R[i][0] - x, dz = R[i][1] - z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    if (bd > 300 * 300) {
      for (let i = 0; i < n; i += 2) {
        const dx = R[i][0] - x, dz = R[i][1] - z;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
    }
    return best;
  }

  /* 航线索引【单调推进】：只在 [routeIdx-3, routeIdx+140] 窗口内找最近点。
     环线在码头附近首尾相贴（入港段与出港段仅隔几米），自由搜索会在两条
     几乎重合的航段间来回跳——目标点瞬间跑到身后，误差冲到 90°+，船减速
     打转后更找不到航线（实测 idx 在 2261↔2295 间反复横跳）。
     只允许前进（小幅回退 ≤3 点吸收横向误差）即可根治；进入巡航时已用
     nearestRouteIdx 全量初始化一次，不怕起点不在环线上。 */
  function advanceRouteIdx(x, z, n) {
    const R = routeLine();
    let best = routeIdx, bd = Infinity;
    for (let k = -3; k <= 140; k++) {
      const i = ((routeIdx + k) % n + n) % n;
      const dx = R[i][0] - x, dz = R[i][1] - z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /* 自动巡航：纯追踪（pure pursuit）——朝环线前方 look 米处的点打舵 */
  function autopilotSteer() {
    const R = routeLine();
    const b = boat.state, n = R.length, G = CFG.gears;
    routeIdx = advanceRouteIdx(b.x, b.z, n);

    /* 航线曲率（前瞻 ~84m）：提前量不够会在急弯冲出去 */
    const p1 = R[routeIdx];
    const p2 = R[(routeIdx + 6) % n];
    const p3 = R[(routeIdx + 12) % n];
    let curve = Math.atan2(p3[1] - p2[1], p3[0] - p2[0]) - Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
    while (curve > Math.PI) curve -= Math.PI * 2;
    while (curve < -Math.PI) curve += Math.PI * 2;
    curve = Math.abs(curve);

    /* 前方最小转弯半径 → 弯道限速。
       用「三点外接圆」测曲率（步长 3 点 ≈21m），对 7m 重采样噪声免疫；
       剔除 rr<8m 的孤立毛刺（纯追踪前视 42m+ 会自然切过小拐点）；
       侧向加速度取 8 m/s²，v=√(a·R)。
       ⚠ 必须放在桥洞对中【之前】——过桥分支是提前返回，若它不带 bendCap，
         game.js 里 Math.min(cap, undefined) = NaN → 速度 NaN → 航向 NaN →
         船永久冻结（NaN 让所有卡死检测失效），这是排查出的真凶。 */
    let minR = 1e9;
    {
      const S = 3;
      for (let k = 0; k < 8; k++) {
        const A = R[(routeIdx + k * S) % n];
        const B = R[(routeIdx + (k + 1) * S) % n];
        const C2 = R[(routeIdx + (k + 2) * S) % n];
        const ab = Math.hypot(B[0] - A[0], B[1] - A[1]);
        const bc = Math.hypot(C2[0] - B[0], C2[1] - B[1]);
        const ca = Math.hypot(A[0] - C2[0], A[1] - C2[1]);
        const area2 = Math.abs((B[0] - A[0]) * (C2[1] - A[1]) - (C2[0] - A[0]) * (B[1] - A[1]));
        if (area2 < 1e-3) continue;
        const rr = (ab * bc * ca) / (2 * area2);
        if (rr >= 8 && rr < minR) minR = rr;
      }
    }
    if (minR > 1e8) minR = 4000;
    const bendCap = clamp(Math.sqrt(8 * minR), 13, 999);

    /* 桥洞对中：离桥 70m 内直接朝桥洞中心打舵 */
    const brs = window.__BRIDGES;
    if (brs && brs.length) {
      let near = null, nd = 1e9;
      for (let i = 0; i < brs.length; i++) {
        const br = brs[i];
        const d = Math.hypot(br.x - b.x, br.z - b.z);
        if (d >= 95 || d <= 3 || d >= nd) continue;
        if (br._routeCross === undefined) {
          const vx = -br.uz, vz = br.ux;
          const ci = nearestRouteIdx(br.x, br.z, routeIdx);
          let pos = 0, neg = 0;
          for (let k = -18; k <= 18; k++) {
            const p = R[(ci + k + n) % n];
            const v = (p[0] - br.x) * vx + (p[1] - br.z) * vz;
            if (v > 2) pos++; else if (v < -2) neg++;
          }
          br._routeCross = pos > 0 && neg > 0;
        }
        if (br._routeCross) { near = br; nd = d; }
      }
      if (near) {
        const fwd = (near.x - b.x) * Math.cos(b.heading) + (near.z - b.z) * Math.sin(b.heading);
        if (fwd > 0) {
          const want = Math.atan2(near.z - b.z, near.x - b.x);
          let err = want - b.heading;
          while (err > Math.PI) err -= Math.PI * 2;
          while (err < -Math.PI) err += Math.PI * 2;
          return { steer: clamp(err * 2.7, -1, 1), err: Math.abs(err), errSigned: err, curve: curve, minR: minR, bendCap: bendCap };
        }
      }
    }

    const sp = Math.abs(b.speed);
    const look = clamp(sp * G.lookAhead, G.lookMin, G.lookMax);
    let j = routeIdx, acc = 0, guard = 0;
    while (acc < look && guard++ < 240) {
      const k = (j + 1) % n;
      acc += Math.hypot(R[k][0] - R[j][0], R[k][1] - R[j][1]);
      j = k;
    }
    const want = Math.atan2(R[j][1] - b.z, R[j][0] - b.x);
    let err = want - b.heading;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;

    window.__apTgt = { j: j, tx: R[j][0], tz: R[j][1], look: look, idx: routeIdx, n: n, minR: minR, bendCap: bendCap };
    const st = clamp(err * G.cruiseTurn, -1, 1);
    if (!isFinite(st) && !window.__steerNaN) {
      window.__steerNaN = { err: String(err), want: String(want), j: j, idx: routeIdx, n: n,
        Rj: R[j] ? [String(R[j][0]), String(R[j][1])] : 'undef',
        bx: String(b.x), bz: String(b.z), hd: String(b.heading) };
    }
    return { steer: st, err: Math.abs(err), errSigned: err, curve: curve, bendCap: bendCap };
  }

  /* ---------------- 模式切换（局内 M 键 / 手机「模式」按钮） ----------------
     切换后立刻回到出发点、清空本轮进度，避免"竞速里带着自由模式的账"。
     不做 3-2-1 倒计时（玩家是主动切模式，不是重新开一局）。 */
  function switchMode(m) {
    m = m === 'race' ? 'race' : 'free';
    if (m === mode) {
      HUD.toast('已在' + (m === 'race' ? '竞速' : '自由') + '模式', m === 'race' ? '按住 Shift / 加速键冲刺' : '靠岸可下船漫步');
      return;
    }
    mode = m;
    HUD.setMode(mode);
    HUD.setModeChoice(mode);
    if (state === 'menu') { HUD.toast(mode === 'race' ? '竞速模式' : '自由模式', '开始后可随时按 M 再切'); return; }
    raceToken++;                                  // 打断进行中的倒计时
    try { Walk.exit(); } catch (e) { }
    boat.state.moored = false;
    boat.reset(C.start.x, C.start.z, C.heading);
    boat.setView('first');
    visitedCount = 0; topSpeed = 0; raceTime = 0; armed = false;
    stuckT = 0; unstickT = 0; hardT = 0;
    Landmarks.list.forEach(l => { l.visited = false; });
    stamina = CFG.race.staminaMax;
    HUD.setStamina(1);
    HUD.showBoatBtn(null);
    HUD.hideLabels();
    HUD.refreshMap(); HUD.refreshRoute();
    HUD.setTime(0);
    HUD.setVisit(0, Landmarks.list.length);
    if (mode === 'race') {
      boat.setGear(2); HUD.setGear(2);
      try { Guide.setVisible(true); Guide.update(0); } catch (e) { }
    } else {
      boat.setGear(1); HUD.setGear(1);
      try { Guide.setVisible(false); } catch (e) { }
    }
    HUD.setSpeed(0, 0, mode === 'race' ? 2 : 1);
    state = 'cruise';
    t0 = performance.now(); last = performance.now();
    HUD.toast(mode === 'race' ? '切换到竞速模式' : '切换到自由模式',
      mode === 'race' ? '已回到出发点 · 集齐 23 景回码头计时结算' : '已回到出发点 · 三档船速，随处上岸');
    try { AudioFX.blip(mode === 'race' ? 784 : 588, 0.16, 0.10); } catch (e) { }
  }

  /* ---------------- 上下船（K 键 / 手机按钮） ---------------- */
  function toggleBoat() {
    if (state === 'walk') { board(); return; }
    if (state !== 'cruise') return;
    if (mode === 'race') {
      HUD.toast('竞速模式不能上岸', '按 M 切到自由模式再下船');
      return;
    }
    if (!berthSpot) berthSpot = Walk.findLandNear(boat.state.x, boat.state.z, CFG.walk.berthRange);
    if (!berthSpot) { HUD.toast('这里不能靠岸', '把船摇到岸边 14 米内再按 K'); return; }
    disembark();
  }

  function cycleGear(dir) {
    if (!boat || mode === 'race') return;
    const g = boat.cycleGear(dir || 1);
    HUD.setGear(g);
    let sub;
    if (g === 3) {
      sub = isTouchUI()
        ? '沿全湖航线自动航行 · 基础 71km/h，前拉摇杆提速至 195km/h 封顶'
        : '沿全湖航线自动航行 · 基础 71km/h，按 W 提速至 195km/h';
    } else {
      sub = g === 2 ? '全速快船 · 速度与船头分水拉满' : '慢速摇橹 · 更接近真实乌篷船';
    }
    HUD.toast(Boat.gearName(g), sub);
    if (g === 3) routeIdx = nearestRouteIdx(boat.state.x, boat.state.z, routeIdx);
    try {
      if (g === 2) { AudioFX.accel(); AudioFX.whoosh(); }
      AudioFX.blip(g === 3 ? 604 : (g === 2 ? 784 : 880), 0.2, 0.10);
    } catch (e) { }
  }

  /* ---------------- 渲染器三级回退 ---------------- */
  function makeRenderer(canvas) {
    const opts = [
      { antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false, preserveDrawingBuffer: true },
      { antialias: false, powerPreference: 'high-performance', alpha: false, preserveDrawingBuffer: true },
      { antialias: false, alpha: false, preserveDrawingBuffer: true }
    ];
    let lastErr = null;
    for (const o of opts) {
      try { return new THREE.WebGLRenderer(Object.assign({ canvas }, o)); }
      catch (e) { lastErr = e; }
    }
    throw (lastErr || new Error('WebGL 不可用'));
  }

  function fatal(msg) {
    const f = $('fatal');
    if (!f) { alert(msg); return; }
    $('fatalMsg').textContent = msg;
    f.style.display = 'flex';
    HUD.showLoading(false);
  }

  function applyTier(t) {
    if (!renderer) return;
    try {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, t.dpr));
      Weather.setRainCount(t.rain);
      Water.setReflect(!!t.reflect);
    } catch (e) { }
  }

  /* ---------------- 启动 ---------------- */
  async function boot() {
    const canvas = $('scene');
    HUD.showLoading(true);
    HUD.loading('正在点亮画布…', 2);

    try {
      renderer = makeRenderer(canvas);
    } catch (e) {
      fatal('无法创建 WebGL 上下文：' + e.message + '（请检查显卡驱动或改用 Chrome/Edge）');
      return;
    }
    renderer.setSize(Math.max(2, window.innerWidth), Math.max(2, window.innerHeight));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = CFG.render.exposure;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = false;

    const ro = new ResizeObserver(entries => {
      for (const en of entries) {
        const w = Math.max(2, Math.round(en.contentRect.width));
        const h = Math.max(2, Math.round(en.contentRect.height));
        if (renderer.domElement.width !== Math.round(w * renderer.getPixelRatio())) {
          renderer.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        }
      }
    });
    ro.observe(canvas);

    const tierIdx = Quality.detect(renderer);
    tier = CFG.quality.tiers[tierIdx];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.dpr) || 1);
    Quality.apply(tier);

    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      fatal('显卡上下文丢失，页面即将刷新…');
      setTimeout(() => location.reload(), 1600);
    }, false);

    scene = new THREE.Scene();
    window.__scene = scene;
    window.__renderer = renderer;
    camera = new THREE.PerspectiveCamera(CFG.render.fovBase, window.innerWidth / window.innerHeight, CFG.render.near, CFG.render.far);
    window.__camera = camera;

    bindUI();

    const wd = setTimeout(() => {
      if (state === 'loading') fatal('加载超时：世界构建未完成。可尝试加参数 ?safe=1 以低配模式启动。');
    }, 45000);

    try {
      world = await World.build(scene, renderer, C, (msg, pct) => { HUD.loading(msg, pct); window.__prog = { msg, pct, at: performance.now() }; }, { tier });
    } catch (e) {
      clearTimeout(wd);
      fatal('世界构建失败：' + (e && e.message ? e.message : e));
      if (window.__log) window.__log('world build: ' + (e && e.stack || e));
      return;
    }

    HUD.loading('正在推船下水…', 96);
    await new Promise(r => setTimeout(r, 30));
    try {
      boat = Boat.create(scene, tier);
      boat.reset(C.start.x, C.start.z, C.heading);
      boat.setView('third');
      Walk.build(scene, Terrain);
    } catch (e) {
      clearTimeout(wd);
      fatal('船只初始化失败：' + (e && e.message ? e.message : e));
      return;
    }

    HUD.init(C, Landmarks.list);
    HUD.showHUD(false);
    HUD.setMute(true);
    HUD.setGear(1);
    try { AudioFX.setMuted(true); } catch (e) { }
    const stv = $('st-visit'); if (stv) stv.textContent = Landmarks.list.length;
    const stk = $('st-km'); if (stk) stk.textContent = (C.total / 1000).toFixed(1);
    const sbv = $('st-best'); if (sbv) sbv.textContent = bestVisited || '—';

    /* 航线规划放在加载界面里做（12m 网格 A*，一次性，之后复用） */
    HUD.loading('正在规划环湖航线…', 97);
    await new Promise(r => setTimeout(r, 20));
    try { planTour(); } catch (e) { if (window.__log) window.__log('TOUR fail: ' + e.message); }
    try {
      Guide.build(scene, routeLine());
      Guide.setVisible(false);
    } catch (e) { if (window.__log) window.__log('GUIDE fail: ' + e.message); }
    HUD.refreshRoute();
    if (window.__log && window.__TOUR_INFO) window.__log('TOUR ' + JSON.stringify(window.__TOUR_INFO).slice(0, 200));

    clearTimeout(wd);
    HUD.loading('准备就绪', 100);
    await new Promise(r => setTimeout(r, 240));
    HUD.showLoading(false);
    state = 'menu';
    last = performance.now();
    requestAnimationFrame(frame);
  }

  /* ---------------- UI 绑定 ---------------- */
  function bindUI() {
    HUD.onStart(() => { startRun(); });
    HUD.onAgain(() => { startRun(); });
    HUD.onBack(() => { backToMenu(); });
    HUD.onDisembark(() => { disembark(); });
    HUD.onBoard(() => { board(); });
    HUD.onMode(m => {
      mode = m === 'race' ? 'race' : 'free';
      HUD.setModeChoice(mode);
      const km = $('st-km');
      if (km) km.textContent = (C.total / 1000).toFixed(1);
    });
    HUD.onMute(() => {
      try {
        AudioFX.init(); AudioFX.resume();
        const m = !AudioFX.muted;
        AudioFX.setMuted(m); HUD.setMute(m);
      } catch (e) { }
    });
    HUD.onWindTog(() => {
      const on = Wind.toggle();
      HUD.setWind(Wind.info());
      HUD.toast(on ? '风力已开启' : '风力已关闭', on ? '随机风向与强度 · 顺风更快、逆风更慢，侧风会吹偏航线' : '风平浪静 · 航行不再受风影响');
    });

    window.addEventListener('keydown', e => {
      keys[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyR' && (state === 'cruise' || state === 'done' || state === 'walk')) startRun();
      if (e.code === 'KeyF' && state === 'cruise') {
        if (mode === 'race') finish(true);
        else { HUD.toast('自由模式', '无结算 · 返回起点菜单'); backToMenu(); }
      }
      /* M：静音改到 N（v2.2 —— M 让位给"切换模式"） */
      if (e.code === 'KeyN' && !e.repeat) {
        try {
          AudioFX.init(); AudioFX.resume();
          const m = !AudioFX.muted;
          AudioFX.setMuted(m); HUD.setMute(m);
        } catch (err) { }
      }
      /* M：局内自由 / 竞速模式互切，切完自动回到出发点 */
      if (e.code === 'KeyM' && !e.repeat) switchMode(mode === 'race' ? 'free' : 'race');
      if (e.code === 'KeyG' && !e.repeat) {
        const on = Wind.toggle();
        HUD.setWind(Wind.info());
        HUD.toast(on ? '风力已开启' : '风力已关闭', on ? '顺风 / 逆风 / 侧风都会影响船' : '风平浪静');
      }
      /* K：上下船（靠岸时仍会自动弹出按钮，K 只是键盘快捷键） */
      if (e.code === 'KeyK' && !e.repeat) toggleBoat();
      if (e.code === 'KeyE' && !e.repeat) toggleBoat();       // 老键位保留
      /* 空格：上岸后跳跃 */
      if (e.code === 'Space' && !e.repeat && state === 'walk') {
        if (Walk.jump()) { try { AudioFX.blip(300, 0.09, 0.05); } catch (err) { } }
      }
      if (e.code === 'Enter' && state === 'menu') startRun();
      if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat &&
        (state === 'cruise' || state === 'count') && mode === 'free') {
        e.preventDefault();
        cycleGear(1);
      }
      if (e.code === 'KeyV' && (state === 'cruise' || state === 'count' || state === 'done')) {
        const v = boat.toggleView();
        HUD.toast(v === 'third' ? '第三人称' : '第一人称', v === 'third' ? '可看清自己的船家装扮 · 再按 V 切回' : '坐回船头 · 摇橹前行');
      }
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; });
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

    const rb = $('rotbtn');
    if (rb) rb.addEventListener('click', () => document.body.classList.add('rot-ok'));

    /* 视角：桌面鼠标移动即环视；触屏在摇杆/按钮之外拖动屏幕即环视 */
    const cvs = $('scene');
    let lastPX = 0, lastPY = 0, touchViewId = null, tX = 0, tY = 0;
    const VIEW_BLOCK = '#stick, #pedals, .pedal, #pgear, #pboost, #mute, #rotbtn, #windtog, #boatbtns, button, input, a';
    if (cvs) {
      cvs.addEventListener('pointerdown', e => {
        /* 上岸后视角完全由鼠标/滑屏控制，不再"松开/点击回正"（v2.2 需求 5） */
        if (state === 'walk') return;
        if (e.pointerType !== 'touch' && e.button === 0) snapBack = true;   // 桌面：左键点击立即回正
      });
    }
    function viewGrab(e) {
      if (e.pointerType !== 'touch') return;
      if (touchViewId !== null) return;
      const t = e.target;
      if (t && t.closest && t.closest(VIEW_BLOCK)) return;
      touchViewId = e.pointerId;
      tX = e.clientX; tY = e.clientY;
      snapBack = false;
      lookT = performance.now();
    }
    function viewRelease(e) {
      if (e.pointerType !== 'touch' || touchViewId !== e.pointerId) return;
      touchViewId = null;
      snapBack = true;                                        // 松手立即回正
      lookT = performance.now();
    }
    window.addEventListener('pointerdown', viewGrab, { passive: true });
    window.addEventListener('pointermove', e => {
      if (!boat) return;
      if (e.pointerType === 'touch') {
        /* 手机：向左滑动 → 视角向左；向下滑动 → 视角向下（v2 修正了上下颠倒） */
        if (touchViewId === e.pointerId) {
          snapBack = false;
          const dx = e.clientX - tX, dy = e.clientY - tY;
          if (state === 'walk') {
            Walk.look(dx * 0.0052, -dy * 0.0036);
          } else {
            boat.state.lookYaw = UTIL.clamp(boat.state.lookYaw + dx * 0.0052, -2.6, 2.6);
            boat.state.lookPitch = UTIL.clamp(boat.state.lookPitch - dy * 0.0036, -0.62, 0.62);
          }
          tX = e.clientX; tY = e.clientY;
          lookT = performance.now();
        }
        return;
      }
      // 桌面：鼠标移动即转视角
      const dx = e.movementX !== undefined ? e.movementX : (lastPX ? e.clientX - lastPX : 0);
      const dy = e.movementY !== undefined ? e.movementY : (lastPY ? e.clientY - lastPY : 0);
      if (dx || dy) snapBack = false;
      if (state === 'walk') {
        Walk.look(dx * 0.0026, -dy * 0.0022);
      } else {
        boat.state.lookYaw = UTIL.clamp(boat.state.lookYaw + dx * 0.0026, -2.6, 2.6);
        boat.state.lookPitch = UTIL.clamp(boat.state.lookPitch - dy * 0.0022, -0.62, 0.62);
      }
      lastPX = e.clientX; lastPY = e.clientY;
      lookT = performance.now();
    });
    window.addEventListener('pointerup', viewRelease);
    window.addEventListener('pointercancel', viewRelease);
    window.addEventListener('blur', () => { touchViewId = null; });
    window.addEventListener('contextmenu', e => e.preventDefault());

    // 触屏
    if (('ontouchstart' in window) || navigator.maxTouchPoints > 0) document.body.classList.add('touch');
    const stick = $('stick');
    if (stick) {
      /* 摇杆：
           水平分量 → 转向；
           向上推过虚线 → 前进（推得越深越快）；
           向下拉 → 倒船（v2 修正：以前只要幅度够大就当前进加速）。 */
      const knob = stick.querySelector('.knob');
      const R = 52;
      const ZONE_IN = 0.42, ZONE_OUT = 0.30;
      let stickId = null, running = false;

      const applyStick = (dx, dy) => {
        const len = Math.hypot(dx, dy);
        if (knob) {
          if (len > 0.5) {
            const l = Math.min(R, len), a = Math.atan2(dy, dx);
            knob.style.transform = 'translate(' + (Math.cos(a) * l).toFixed(1) + 'px,' + (Math.sin(a) * l).toFixed(1) + 'px)';
          } else {
            knob.style.transform = 'translate(0,0)';
          }
        }
        touch.steer = clamp(dx / (R * 0.6), -1, 1);
        const fwd = -dy / R;                    // >0 = 手指向上 = 前进
        if (fwd >= ZONE_IN) running = true;
        else if (fwd <= ZONE_OUT) running = false;
        if (running) {
          touch.throttle = clamp(0.30 + ((fwd - ZONE_OUT) / 0.60) * 0.70, 0.30, 1);
        } else if (fwd < -ZONE_IN) {
          touch.throttle = clamp(fwd * 0.55, -0.6, 0);     // 向后拉 = 倒船
        } else {
          touch.throttle = 0;
        }
        touch.forward = Math.max(0, fwd);
        stick.classList.toggle('run', running);
      };

      const stickCenter = e => {
        const rc = stick.getBoundingClientRect();
        return [e.clientX - rc.left - rc.width / 2, e.clientY - rc.top - rc.height / 2];
      };
      stick.addEventListener('pointerdown', e => {
        e.preventDefault();
        stickId = e.pointerId;
        try { stick.setPointerCapture(e.pointerId); } catch (err) { }
        const c = stickCenter(e); applyStick(c[0], c[1]);
      });
      stick.addEventListener('pointermove', e => {
        if (stickId !== e.pointerId) return;
        const c = stickCenter(e); applyStick(c[0], c[1]);
      });
      const endStick = e => {
        if (stickId !== e.pointerId) return;
        stickId = null; running = false;
        touch.steer = 0; touch.throttle = 0; touch.forward = 0;
        stick.classList.remove('run');
        if (knob) knob.style.transform = 'translate(0,0)';
      };
      stick.addEventListener('pointerup', endStick);
      stick.addEventListener('pointercancel', endStick);
      stick.addEventListener('lostpointercapture', endStick);
    }
    /* 换档踏板（自由）/ 加速踏板（竞速，按住生效） */
    const gb = $('pgear');
    if (gb) {
      gb.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        if ((state === 'cruise' || state === 'count') && mode === 'free') {
          cycleGear(1);
          gb.classList.add('on');
          setTimeout(() => gb.classList.remove('on'), 180);
        }
      });
    }
    const bb = $('pboost');
    if (bb) {
      const on = e => { e.preventDefault(); e.stopPropagation(); touch.boost = true; bb.classList.add('on'); };
      const off = e => { if (e) e.preventDefault(); touch.boost = false; bb.classList.remove('on'); };
      bb.addEventListener('pointerdown', on);
      bb.addEventListener('pointerup', off);
      bb.addEventListener('pointercancel', off);
      bb.addEventListener('pointerleave', off);
    }
    /* 手机端：模式切换 / 上下船 / 跳跃（v2.2） */
    const mb = $('pmode');
    if (mb) {
      mb.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        switchMode(mode === 'race' ? 'free' : 'race');
        mb.classList.add('on');
        setTimeout(() => mb.classList.remove('on'), 200);
      });
    }
    const kb = $('pkboat');
    if (kb) {
      kb.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        toggleBoat();
        kb.classList.add('on');
        setTimeout(() => kb.classList.remove('on'), 200);
      });
    }
    const jb = $('pjump');
    if (jb) {
      jb.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        if (state === 'walk' && Walk.jump()) { try { AudioFX.blip(300, 0.09, 0.05); } catch (err) { } }
        jb.classList.add('on');
        setTimeout(() => jb.classList.remove('on'), 160);
      });
    }
    /* 空气墙：走到地图边界时提示一次 */
    Walk.onWall = () => { HUD.toast('已抵地图边界', '前方是界外山林，沿湖岸走才能继续'); };
  }

  function backToMenu() {
    state = 'menu';
    raceToken++;
    HUD.showResult(null);
    HUD.showStart(true);
    HUD.showHUD(false);
    HUD.hideLabels();
    HUD.showBoatBtn(null);
    Guide.setVisible(false);
    try { Walk.exit(); } catch (e) { }
    document.body.classList.remove('walkmode');
    boat.state.moored = false;
    boat.reset(C.start.x, C.start.z, C.heading);
    boat.setView('third');
  }

  /* ---------------- 开始 ---------------- */
  function startRun() {
    if (!tourReady) {
      try { planTour(); } catch (e) { if (window.__log) window.__log('TOUR fail: ' + e.message); }
      try { Guide.setRoute(routeLine()); HUD.refreshRoute(); } catch (e) { }
    }
    try { AudioFX.init(); AudioFX.resume(); AudioFX.setMuted(false); HUD.setMute(false); } catch (e) { }
    HUD.showStart(false);
    HUD.showResult(null);
    HUD.showHUD(true);
    HUD.setMode(mode);
    HUD.setModeChoice(mode);
    HUD.showBoatBtn(null);
    try { Walk.exit(); } catch (e) { }
    document.body.classList.remove('walkmode');
    boat.state.moored = false;
    boat.reset(C.start.x, C.start.z, C.heading);
    boat.setView('first');
    visitedCount = 0; topSpeed = 0; raceTime = 0; armed = false;
    stuckT = 0; unstickT = 0; hardT = 0;
    Landmarks.list.forEach(l => { l.visited = false; });
    HUD.refreshMap();
    HUD.refreshRoute();
    HUD.setTime(0);
    HUD.setVisit(0, Landmarks.list.length);
    stamina = CFG.race.staminaMax;
    HUD.setStamina(1);
    if (mode === 'race') {
      boat.setGear(2);                 // 竞速：固定快档，不再换档
      HUD.setGear(2);
      Guide.setVisible(true);
      Guide.update(0);
    } else {
      boat.setGear(1);
      HUD.setGear(1);
      Guide.setVisible(false);
    }
    HUD.setSpeed(0, 0, mode === 'race' ? 2 : 1);

    state = 'count';
    const myToken = ++raceToken;
    let n = 3;
    HUD.countdown('3');
    AudioFX.blip(660, 0.2, 0.1);
    const tick = () => {
      if (myToken !== raceToken) return;
      n--;
      if (n > 0) {
        HUD.countdown(String(n));
        AudioFX.blip(660, 0.2, 0.1);
        setTimeout(tick, 1000);
      } else {
        if (myToken !== raceToken) return;
        HUD.countdown('启 航');
        AudioFX.start();
        state = 'cruise';
        t0 = performance.now();
        if (mode === 'race') {
          HUD.toast('竞速 · 全湖二十三景', '沿水面箭头航行 · 按住 Shift 加速 · 集齐 23 景回码头结算');
        } else {
          HUD.toast('自由探索', '环湖二十三景 · 靠岸可下船漫步 · 按 F 返回起点');
        }
      }
    };
    setTimeout(tick, 1000);
  }

  /* ---------------- 上下船 ---------------- */
  let berthSpot = null, berthT = 0;

  function updateBerth(dt) {
    if (state !== 'cruise' || mode === 'race') { HUD.showBoatBtn(null); berthSpot = null; return; }
    berthT -= dt;
    if (berthT > 0) return;
    berthT = 0.35;
    const sp = Math.abs(boat.state.speed);
    if (sp > 7) { berthSpot = null; HUD.showBoatBtn(null); return; }
    const p = Walk.findLandNear(boat.state.x, boat.state.z, CFG.walk.berthRange);
    berthSpot = p;
    HUD.showBoatBtn(p ? 'disembark' : null);
  }

  function disembark() {
    if (state !== 'cruise' || mode === 'race') return;
    if (!berthSpot) return;
    Walk.enter(berthSpot.x, berthSpot.z, boat.state.heading);
    boat.state.moored = true;
    boat.state.speed = 0;
    boat.state.throttle = 0;
    HUD.showBoatBtn(null);
    document.body.classList.add('walkmode');
    HUD.setStamina(stamina / CFG.race.staminaMax);
    HUD.setStaminaLabel(isTouchUI() ? '体力 · 摇杆前推冲刺' : '体力 · 冲刺 SHIFT');
    HUD.toast('上岸漫步', 'WASD 行走 · 空格跳跃 · 按住 Shift 冲刺 · 拖屏/移鼠标环视 · K 上船');
    try { AudioFX.bump(0.4); } catch (e) { }
    state = 'walk';
  }

  function board() {
    if (state !== 'walk') return;
    const d = Math.hypot(Walk.pos.x - boat.state.x, Walk.pos.z - boat.state.z);
    if (d > CFG.walk.boardDist) {
      HUD.toast('离船太远', '走回船边（' + Math.round(d) + 'm）才能上船');
      return;
    }
    Walk.exit();
    document.body.classList.remove('walkmode');
    HUD.setStaminaLabel(isTouchUI() ? '体力 · 加速踏板' : '体力 · 加速 SHIFT');
    boat.state.moored = false;
    boat.state.speed = 0;
    boat.setView('first');
    HUD.showBoatBtn(null);
    HUD.toast('回到船上', '继续逐浪');
    state = 'cruise';
    last = performance.now();
  }

  /* ---------------- 结算 ---------------- */
  function finish(manual) {
    if (state !== 'cruise' && state !== 'walk') return;
    try { Walk.exit(); } catch (e) { }
    document.body.classList.remove('walkmode');
    boat.state.moored = false;
    state = 'done';
    HUD.hideLabels();
    HUD.showBoatBtn(null);
    Guide.setVisible(false);
    AudioFX.finish();
    if (manual) HUD.toast('行程结束', '本段探索已结算');
    const total = Landmarks.list.length;
    const visited = Landmarks.list.filter(l => l.visited).length;
    let newBest = false;
    if (mode === 'race') {
      if (!bestRace || raceTime < bestRace) {
        bestRace = raceTime; newBest = true;
        try { localStorage.setItem('lake_race_v3', String(raceTime)); } catch (e) { }
      }
    } else if (visited > bestVisited) {
      bestVisited = visited; newBest = true;
      try { localStorage.setItem('lake_visited_v3', String(visited)); } catch (e) { }
    }
    HUD.showResult({
      time: raceTime,
      visited, total,
      distance: boat.state.distance,
      top: topSpeed,
      collisions: boat.state.collisions,
      newBest, mode
    });
  }

  /* ---------------- 主循环 ---------------- */
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    const fStart = performance.now();

    /* 风：随机换向 / 阵风；HUD 显示（每 6 帧刷新一次） */
    try { Wind.update(dt); } catch (e) { }
    if ((frameMs | 0) % 6 === 0) { try { HUD.setWind(Wind.info()); } catch (e) { } }

    if (state === 'menu') {
      const t = now * 0.0001;
      const bx = C.start.x, bz = C.start.z;
      const r = 17.5;
      camera.position.set(bx + Math.cos(t) * r, 4.6 + Math.sin(now * 0.0005) * 0.5, bz + Math.sin(t) * r);
      camera.fov = 50; camera.updateProjectionMatrix();
      camera.lookAt(bx, 0.9, bz);
      boat.group.position.set(bx, Math.sin(now * 0.0012) * 0.04, bz);
      boat.group.rotation.set(0, -C.heading + Math.sin(t * 0.7) * 0.05, 0);
    }

    // 船上的环视回正（count/cruise/done 通用）
    if (boat && (state === 'count' || state === 'cruise' || state === 'done')) {
      const kQ = keys['KeyQ'], kE = keys['KeyE'];
      if (kQ || kE) {
        boat.state.lookYaw = UTIL.clamp(boat.state.lookYaw + (kE ? 1 : -1) * dt * 1.5, -2.6, 2.6);
        lookT = performance.now();
      } else if (snapBack || performance.now() - lookT > 2600) {
        const k = Math.exp(-dt * (snapBack ? 5.5 : 1.7));
        boat.state.lookYaw *= k;
        boat.state.lookPitch *= k;
        if (Math.abs(boat.state.lookYaw) < 0.001 && Math.abs(boat.state.lookPitch) < 0.001) {
          boat.state.lookYaw = 0;
          boat.state.lookPitch = 0;
          snapBack = false;
        }
      }
    }

    if (state === 'count') {
      boat.update(dt, { throttle: 0, steer: 0, cruiseFast: false }, Terrain.navigable);
      boat.applyCamera(camera, dt);
    }

    if (state === 'cruise') {
      const gear = boat.state.gear;
      const keyThr = (keys['KeyW'] || keys['ArrowUp']) ? 1 : 0;
      const thr = Math.max(keyThr, touch.throttle);
      const kSteer = (keys['KeyA'] || keys['ArrowLeft'] ? -1 : 0) + (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0);

      if (mode === 'race') {
        /* 竞速：固定快船，Shift / 加速踏板 = 体力加速 */
        input.steer = clamp(kSteer + touch.steer, -1, 1);
        input.throttle = thr;
        input.cruiseFast = false;
        input.cruiseCap = null;
        const wantBoost = (keys['ShiftLeft'] || keys['ShiftRight'] || touch.boost) && thr > 0.05;
        const boosting = wantBoost && stamina > 2;
        if (boosting) stamina -= CFG.race.drain * dt;
        else stamina += CFG.race.regen * dt;
        stamina = clamp(stamina, 0, CFG.race.staminaMax);
        boat.state.boostFuel = stamina > 2 ? 1 : 0;
        input.boost = boosting;
        HUD.setStamina(stamina / CFG.race.staminaMax);
      } else if (gear === 3) {
        /* 三档：沿全湖巡回航线自动航行，玩家只管提速 */
        const ap = autopilotSteer();
        input.steer = ap.steer;
        input.throttle = ap.err > 0.85 ? 0.55 : 1;
        input.cruiseFast = false;
        input.boost = false;

        if (Math.abs(boat.state.speed) < 1.5) stuckT += dt;
        else stuckT = Math.max(0, stuckT - dt * 2.5);
        /* 卡住自救：必须真的"停住" 1.6s 以上才触发（起步阶段速度低是正常的） */
        if (stuckT > 1.6 && unstickT <= 0) { unstickT = 1.2; stuckT = 0; }
        if (unstickT > 0) {
          unstickT -= dt;
          input.throttle = -1;
          /* 倒车时朝航线方向打舵（而不是左右乱摆），倒出卡点后自然接回航线 */
          const back = Math.atan2(-Math.sin(boat.state.heading), -Math.cos(boat.state.heading));
          const T2 = routeLine();
          const nb = T2[(routeIdx + 14) % T2.length];
          let be = Math.atan2(nb[1] - boat.state.z, nb[0] - boat.state.x) - back;
          while (be > Math.PI) be -= Math.PI * 2;
          while (be < -Math.PI) be += Math.PI * 2;
          input.steer = clamp(be * 1.4, -1, 1);
        }
        /* 硬恢复兜底：倒车自救连续失败（累计低速 7s 以上）说明船被岸/桥台
           咬住了，纯操控脱不了困。把船摆回航线上最近的可航点、朝航线方向，
           给 6m/s 初速继续跑。自动巡航是"观光代驾"，宁可轻微回位也不能卡死。 */
        if (Math.abs(boat.state.speed) < 1.5) hardT += dt; else hardT = Math.max(0, hardT - dt * 3);
        if (hardT > 7) {
          hardT = 0;
          const T3 = routeLine(), n3 = T3.length;
          /* 必须【向前跳过受阻段】：把船放回当前索引等于原地不动（实测会活锁——
             船头正对航线但前方 25m 是岸，反复复位到同一点）。同一处连续卡死
             时跳跃距离翻倍，保证一定能脱困。 */
          const same = (lastHardIdx === routeIdx);
          const jump = same ? 60 : 14;
          lastHardIdx = routeIdx;
          let k = (routeIdx + jump) % n3, tries = 0;
          while (tries++ < 80) {
            const p = T3[k % n3], q = T3[(k + 3) % n3];
            const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
            const fx = Math.cos(Math.atan2(q[1] - p[1], q[0] - p[0]));
            const fz = Math.sin(Math.atan2(q[1] - p[1], q[0] - p[0]));
            if (Terrain.navigable(p[0], p[1]) && Terrain.navigable(mx, mz) &&
                Terrain.navigable(p[0] + fx * 22, p[1] + fz * 22)) break;
            k = (k + 1) % n3;
          }
          const pa = T3[(k + 6) % n3], pb = T3[k % n3];
          boat.state.x = pb[0];
          boat.state.z = pb[1];
          boat.state.heading = Math.atan2(pa[1] - pb[1], pa[0] - pb[0]);
          boat.state.speed = 6;
          boat.state.yawRate = 0;
          boat.state.steer = 0;
          routeIdx = k % n3;
          window.__hardRecover = (window.__hardRecover || 0) + 1;
          stuckT = 0; unstickT = 0;
          try { HUD.toast('自动巡航 · 航线复位', '脱离搁浅，继续环湖'); } catch (e) { }
        }
        if (isTouchUI()) {
          input.cruiseCap = (touch.forward > 0.32) ? CFG.gears.cruiseBoost : CFG.gears.cruiseSlow;
        } else {
          input.cruiseCap = keyThr ? CFG.gears.cruiseFast : CFG.gears.cruiseSlow;
        }
        /* 掉头助航：航线上有"出-回"式死胡同（泊靠点在窄汊/桥对岸），必须在汊底
           原地掉头。纯靠舵角+惯性转不过来：低速舵效不足、高速转弯半径又远大于
           可用水域，实测会在弯顶反复前进-倒车僵持。这里像首侧推一样直接接管航向，
           以有限角速度把船头转向航线目标点（不影响位置，所以不会转进岸里）。 */
        const errS = ap.errSigned !== undefined ? ap.errSigned : ap.err;
        if (Math.abs(errS) > 1.75 && Math.abs(boat.state.speed) < 9) {
          const dir = errS > 0 ? 1 : -1;
          const rate = 1.25 * Math.min(1, (Math.abs(errS) - 1.75) / 0.8 + 0.35);
          boat.state.heading += dir * rate * dt;
          boat.state.yawRate = 0;
          input.steer = 0;
          input.throttle = 0.35;         // 轻微前推，避免船贴在岸上磨
          if (window.__pivot) window.__pivot++; else window.__pivot = 1;
        }
        /* 弯道限速：按前方最小转弯半径换算（过桥不额外限速——通道已加宽并有自动对中） */
        input.cruiseCap = Math.min(input.cruiseCap, ap.bendCap);
        /* 偏离航线（目标在身后）时必须先减速再回正，否则会冲过头来回摆 */
        if (ap.err > 1.30) input.cruiseCap = Math.min(input.cruiseCap, 12);
        if (ap.err > 2.00) input.cruiseCap = Math.min(input.cruiseCap, 7);
        /* 横向偏离限速：离航线越远越慢。高速切角后船会贴着岸滑出去，
           偏离一旦放大，纯追踪的回正量又会被"前方是岸"的限速压住，
           于是越跑越偏、最后卡进凹兜。这里按偏距直接压上限。 */
        {
          const rr = routeLine(), nrp = rr.length;
          const rp = rr[routeIdx % nrp];
          const off = Math.hypot(boat.state.x - rp[0], boat.state.z - rp[1]);
          if (off > 45) input.cruiseCap = Math.min(input.cruiseCap, 12);
          else if (off > 22) input.cruiseCap = Math.min(input.cruiseCap, 22);
        }
        const hx = Math.cos(boat.state.heading), hz = Math.sin(boat.state.heading);
        const bx0 = boat.state.x, bz0 = boat.state.z;
        if (!Terrain.navigable(bx0 + hx * 45, bz0 + hz * 45)) input.cruiseCap = Math.min(input.cruiseCap, 26);
        if (!Terrain.navigable(bx0 + hx * 25, bz0 + hz * 25)) input.cruiseCap = Math.min(input.cruiseCap, 15);
        /* 岸线临近限速（SDF）：navigable 只看"是不是水"，贴到堤壁 3m 内仍然算水，
           于是高速切角会一头顶在石堤上停住（实测在苏堤壁贴停 7 秒等硬恢复）。
           这里用岸距提前减速，留出回正余量。 */
        {
          const sdAhead = Terrain.shoreDist(bx0 + hx * 30, bz0 + hz * 30);
          if (sdAhead > -9) input.cruiseCap = Math.min(input.cruiseCap, 11);
          else if (sdAhead > -16) input.cruiseCap = Math.min(input.cruiseCap, 20);
        }
        window.__apDebug = {
          err: +ap.err.toFixed(3), curve: +ap.curve.toFixed(3), cap: input.cruiseCap,
          thr: +input.throttle.toFixed(2), idx: routeIdx, sp: +boat.state.speed.toFixed(1),
          stuck: +stuckT.toFixed(2), unstick: +unstickT.toFixed(2)
        };
      } else {
        const kBrake = (keys['KeyS'] || keys['ArrowDown']) ? 1 : 0;
        input.throttle = thr - kBrake * 0.5;
        input.steer = clamp(kSteer + touch.steer, -1, 1);
        input.cruiseFast = false;
        input.cruiseCap = null;
        input.boost = false;
      }

      const before = boat.state.collisions;
      boat.update(dt, input, Terrain.navigable);
      if (boat.state.collisions > before) { HUD.flash(); }
      boat.applyCamera(camera, dt);

      raceTime = (now - t0) / 1000;
      if (boat.state.speed > topSpeed) topSpeed = boat.state.speed;
      AudioFX.setSpeed(Math.abs(boat.state.speed) * 3.6, boat.state.fovK);

      const impact = Traffic.update(dt, boat.state, world.obstacles);
      if (impact > 0) { HUD.flash(); }

      // 探访景点（以航线上的泊靠点为基准，山上的景点靠到最近水面即算"远眺"）
      const b = boat.state;
      for (const lm of Landmarks.list) {
        if (lm.visited) continue;
        const px = lm.ax !== undefined ? lm.ax : lm.x;
        const pz = lm.az !== undefined ? lm.az : lm.z;
        const d = Math.hypot(b.x - px, b.z - pz);
        if (d < (lm.visitR || 260)) {
          lm.visited = true;
          visitedCount++;
          HUD.toast('抵达 · ' + lm.name, lm.sub || '');
          AudioFX.visit();
          HUD.refreshMap();
        }
      }
      HUD.setVisit(visitedCount, Landmarks.list.length);

      // 靠岸：出现「下船」
      updateBerth(dt);

      const dStart = Math.hypot(b.x - C.start.x, b.z - C.start.z);
      if (!armed && dStart > CFG.explore.leftStart) armed = true;
      if (mode === 'race' && world.dock && armed && visitedCount >= Landmarks.list.length) {
        const dDock = Math.hypot(b.x - world.dock.x, b.z - world.dock.z);
        if (dDock < CFG.explore.dockRadius) {
          HUD.toast('回到码头', '竞速完成，结算中…');
          finish(false);
        }
      }

      HUD.setTime(raceTime);
      HUD.setSpeed(Math.abs(b.speed) * 3.6, b.fovK, b.gear);
      if (mode === 'free') HUD.setGear(b.gear);
      HUD.setCompass(b.heading);
    }

    if (state === 'walk') {
      const kF = ((keys['KeyW'] || keys['ArrowUp']) ? 1 : 0) - ((keys['KeyS'] || keys['ArrowDown']) ? 1 : 0);
      const kS = ((keys['KeyD'] || keys['ArrowRight']) ? 1 : 0) - ((keys['KeyA'] || keys['ArrowLeft']) ? 1 : 0);
      const fwd = clamp(kF + touch.throttle, -1, 1);
      /* 冲刺：电脑按住 Shift；手机把摇杆大幅前推（>= sprintTouch）
         体力与竞速模式共用一套（消耗 26/s、回复 8.5/s），见 CFG.race */
      const push = Math.max(touch.forward || 0, touch.throttle > 0 ? touch.throttle : 0);
      const wantSprint = isTouchUI() ? (push >= CFG.walk.sprintTouch) : !!(keys['ShiftLeft'] || keys['ShiftRight']);
      const moving = Math.abs(fwd) > 0.05 || Math.abs(kS) > 0;
      const sprinting = wantSprint && moving && stamina > 2 && fwd >= 0;
      if (sprinting) stamina -= CFG.race.drain * dt;
      else stamina += CFG.race.regen * dt;
      stamina = clamp(stamina, 0, CFG.race.staminaMax);
      if (sprinting !== walkSprintShown) {
        walkSprintShown = sprinting;
        if (sprinting) { try { AudioFX.blip(520, 0.1, 0.06); } catch (e) { } }
      }
      HUD.setStamina(stamina / CFG.race.staminaMax);
      const inp = {
        forward: fwd,
        strafe: kS,
        turn: touch.steer,
        sprint: sprinting
      };
      Walk.update(dt, inp);
      Walk.applyCamera(camera);
      boat.update(dt, { throttle: 0, steer: 0, cruiseFast: false }, Terrain.navigable);

      const d = Math.hypot(Walk.pos.x - boat.state.x, Walk.pos.z - boat.state.z);
      HUD.showBoatBtn(d < CFG.walk.boardDist ? 'board' : null);

      // 步行也能探访（走到景点门口算一次）
      for (const lm of Landmarks.list) {
        if (lm.visited) continue;
        const dd = Math.hypot(Walk.pos.x - lm.x, Walk.pos.z - lm.z);
        if (dd < Math.max(150, (lm.visitR || 260) * 0.8)) {
          lm.visited = true;
          visitedCount++;
          HUD.toast('抵达 · ' + lm.name, lm.sub || '');
          AudioFX.visit();
          HUD.refreshMap();
        }
      }
      HUD.setVisit(visitedCount, Landmarks.list.length);
      if (mode === 'race' && visitedCount >= Landmarks.list.length && world.dock) {
        const dDock = Math.hypot(Walk.pos.x - world.dock.x, Walk.pos.z - world.dock.z);
        if (dDock < CFG.explore.dockRadius && d < CFG.walk.boardDist) finish(false);
      }
    }

    if (state === 'done') {
      boat.update(dt, { throttle: 0, steer: 0, cruiseFast: false }, Terrain.navigable);
      boat.applyCamera(camera, dt);
      HUD.setSpeed(Math.abs(boat.state.speed) * 3.6, boat.state.fovK, boat.state.gear);
    }

    // 水面倒影与天气
    const boats = [{ x: boat.state.x, z: boat.state.z, heading: boat.state.heading, w: 1.0 }].concat(Traffic.list());
    Water.setBoats(boats);
    const playerRef = state === 'walk' ? { x: Walk.pos.x, z: Walk.pos.z, heading: Walk.pos.yaw, speed: 0 } : boat.state;
    world.update(dt, camera, boats, playerRef);
    Landmarks.update(dt);
    try { Guide.update(dt); } catch (e) { }

    if (state === 'cruise' || state === 'count' || state === 'walk') {
      HUD.updateLabels(camera, dt);
      HUD.updateToast(dt);
    }
    if (boat) {
      const onFoot = state === 'walk';
      const bp = { x: boat.state.x, z: boat.state.z, heading: boat.state.heading };
      HUD.drawMinimap(onFoot ? null : bp, [], world.dock, {
        gear: boat.state.gear, t: now / 1000,
        player: onFoot ? { x: Walk.pos.x, z: Walk.pos.z } : null,
        moored: onFoot ? bp : (boat.state.moored ? bp : null)
      });
    }

    if (camLock) {
      camera.fov = camLock.fov; camera.updateProjectionMatrix();
      camera.position.set(camLock.p[0], camLock.p[1], camLock.p[2]);
      camera.lookAt(camLock.t[0], camLock.t[1], camLock.t[2]);
    }

    renderer.render(scene, camera);

    const fms = performance.now() - fStart;
    frameMs = fms;
    emaMs = emaMs * 0.95 + fms * 0.05;
    if (state === 'cruise') {
      if (Quality.sample(frameMs)) applyTier(Quality.cfg());
    }
  }

  /* ---------------- 调试 ---------------- */
  let camLock = null;
  window.__cam = function (px, py, pz, tx, ty, tz, fov) {
    camLock = { p: [px, py, pz], t: [tx, ty, tz], fov: fov || 60 };
  };
  window.__camOff = function () { camLock = null; };
  window.__teleport = function (s) {
    let i = 0; while (i < C.cum.length - 1 && C.cum[i] < s) i++;
    const j = Math.min(C.center.length - 1, i + 10);
    boat.state.x = C.center[i][0]; boat.state.z = C.center[i][1];
    boat.state.heading = Math.atan2(C.center[j][1] - C.center[i][1], C.center[j][0] - C.center[i][0]);
    boat.state.speed = 30;
    boat.state.wakeHist.length = 0;
    boat.group.position.set(boat.state.x, 0, boat.state.z);
    boat.group.rotation.set(0, -boat.state.heading, 0);
  };
  window.__tp = function (x, z, h) {
    boat.state.x = x; boat.state.z = z;
    if (h !== undefined) boat.state.heading = h;
    boat.state.speed = 0; boat.state.wakeHist.length = 0;
    boat.group.position.set(x, 0, z);
    boat.group.rotation.set(0, -boat.state.heading, 0);
  };
  window.__state = () => ({
    state, mode, time: raceTime, visited: visitedCount, total: Landmarks.list.length,
    stamina: Math.round(stamina), boat: boat && boat.state, tier: tier && tier.name,
    wind: Wind.info(), walking: (typeof Walk.active === 'function' ? Walk.active() : Walk.active) ? { x: Walk.pos.x, z: Walk.pos.z } : null,
    bridge: (window.__BRIDGES || []).length
  });
  window.__course = C;
  window.__tour = () => TOUR;
  window.__tourInfo = () => window.__TOUR_INFO;
  window.__setDay = t => { Weather.dayT = t; };
  window.__setMode = m => { mode = m === 'race' ? 'race' : 'free'; HUD.setModeChoice(mode); };
  window.__disembark = () => { if (state === 'cruise') { berthSpot = Walk.findLandNear(boat.state.x, boat.state.z, CFG.walk.berthRange); disembark(); } };
  window.__board = () => board();
  window.__switchMode = m => switchMode(m);
  window.__jump = () => Walk.jump();
  window.__walkInfo = () => (Walk.pos ? {
    x: Walk.pos.x, z: Walk.pos.z, y: Walk.pos.y, yaw: Walk.pos.yaw, pitch: Walk.pos.pitch,
    air: Walk.pos.air, vy: Walk.pos.vy, speed: Walk.pos.speed, onGround: Walk.onGround()
  } : null);
  window.__wind = v => { Wind.toggle(v); HUD.setWind(Wind.info()); };
  window.__visitAll = () => { Landmarks.list.forEach(l => { if (!l.visited) { l.visited = true; visitedCount++; } }); HUD.refreshMap(); HUD.setVisit(visitedCount, Landmarks.list.length); };

  window.addEventListener('resize', () => {
    if (!renderer) return;
    const w = Math.max(2, window.innerWidth), h = Math.max(2, window.innerHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });

  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('touchmove', e => { if (e.target.closest && (e.target.closest('#stick') || e.target.closest('.pedal'))) e.preventDefault(); }, { passive: false });

  boot();
})();
