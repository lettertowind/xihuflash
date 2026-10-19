/* 世界编排：天气→地形→水面→植被→建筑地标→交通船，统一更新 */
window.World = (function () {
  const W = {};

  W.build = async function (scene, renderer, course, progress, opts) {
    opts = opts || {};
    const tier = opts.tier;
    const log = m => { try { console.log('STEP ' + m); } catch (e) { } };

    log('weather begin');
    progress('正在铺开烟雨…', 6);
    await frame();
    Weather.build(scene, renderer, tier);
    log('weather end');

    // extraIslands 数据补齐（湖心亭 / 阮公墩圆岛坐标）
    patchIslands(course);

    log('terrain begin');
    progress('正在塑山理水…', 16);
    await frame();
    Terrain.build(scene, course, tier);
    log('terrain end');

    log('water begin');
    progress('正在引水成湖…', 38);
    await frame();
    Water.build(scene, renderer, course, Terrain, tier);
    log('water end');

    log('shopspots begin');
    Landmarks.planWaterfront(course, Terrain);
    log('shopspots end');

    log('trees begin');
    progress('正在植柳栽桃…', 56);
    await frame();
    Trees.build(scene, course, Terrain, tier);
    log('trees end');

    log('landmarks begin');
    progress('正在营造亭台楼阁…', 74);
    await frame();
    Buildings.mats();
    Landmarks.build(scene, course, Terrain, tier);
    log('landmarks end');

    log('figures begin');
    progress('正在唤起游人…', 80);
    await frame();
    Figures.build(scene, course, Landmarks.list, Terrain, tier);
    log('figures end');

    log('traffic begin');
    progress('正在唤醒湖面船只…', 88);
    await frame();
    Traffic.build(scene, course, Terrain, tier, Landmarks);
    log('traffic end');

    log('birds begin');
    progress('正在放飞禽鸟…', 94);
    await frame();
    Birds.build(scene, course, Terrain, tier);
    log('birds end');

    progress('整备完毕', 100);
    await frame();

    W.obstacles = Landmarks.obstacles || [];
    W.dock = Landmarks.dock || null;
    return W;
  };

  function patchIslands(course) {
    const ext = course.extraIslands || [];
    if (!ext.length) return;
    const byName = {};
    (course.landmarks || []).forEach(l => byName[l.name] = l);
    // 数据顺序与 landmarks 一致：湖心亭在前、阮公墩在后
    const pairs = [byName['湖心亭'], byName['阮公墩']];
    for (let i = 0; i < ext.length; i++) {
      if (ext[i].p) continue;
      const lm = pairs[i] || pairs[0];
      if (lm) ext[i].p = [lm.x, lm.z];
      else ext[i].p = [0, 0];
    }
  }

  function frame() { return new Promise(r => setTimeout(r, 24)); }

  W.update = function (dt, camera, boats, player) {
    Weather.update(dt, camera);
    Water.update(dt, camera, boats);
    Trees.update(dt);
    Birds.update(dt, player);
    Figures.update(dt, player);
  };

  return W;
})();
