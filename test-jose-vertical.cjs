const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dataPath = path.join(__dirname, 'test-cases', 'jose-vertical.json');
const dataset = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

function loadSolver() {
  const solverPath = path.join(__dirname, 'solver-worker.js');
  const solverCode = fs.readFileSync(solverPath, 'utf8');
  const sandbox = {
    module: { exports: {} },
    exports: {},
    console,
    Math,
    process,
    setTimeout,
    clearTimeout,
    self: {
      postMessage: () => {}
    }
  };
  vm.runInNewContext(solverCode, sandbox, { filename: 'solver-worker.js' });
  return sandbox.module.exports;
}

const { solveCutLayoutWorker } = loadSolver();

function cloneTrim(trim) {
  if (!trim || typeof trim !== 'object') {
    return { mm: 0, top: false, right: false, bottom: false, left: false };
  }
  return {
    mm: Number.isFinite(trim.mm) ? trim.mm : 0,
    top: !!trim.top,
    right: !!trim.right,
    bottom: !!trim.bottom,
    left: !!trim.left
  };
}

function createPieces(rows) {
  const pieces = [];
  let total = 0;
  rows.forEach((row, rowIdx) => {
    const qty = Number(row.qty);
    const w = Number(row.w);
    const h = Number(row.h);
    if (!(qty > 0 && w > 0 && h > 0)) {
      return;
    }
    const rot = !!row.rot;
    const rawW = rot ? h : w;
    const rawH = rot ? w : h;
    const baseId = total;
    for (let i = 0; i < qty; i++) {
      const id = `${rowIdx}-${baseId + i}`;
      pieces.push({
        id,
        rowIdx,
        rawW,
        rawH,
        color: '#888888',
        rot,
        sourceRow: rowIdx
      });
    }
    total += qty;
  });
  return { pieces, totalRequested: total };
}

function createInstances(count) {
  const plate = dataset.plates[0];
  return Array.from({ length: count }, () => ({
    sw: plate.sw,
    sh: plate.sh,
    trim: cloneTrim(plate.trim)
  }));
}

const allowAutoRotate = dataset.autoRotate !== false;
const kerf = Number(dataset.kerfMm) || 0;
const { pieces, totalRequested } = createPieces(dataset.rows || []);

const instances = createInstances(3);

const result = solveCutLayoutWorker({
  instances,
  pieces,
  totalRequested,
  allowAutoRotate,
  kerf
});

console.log('used plates', result.placementsByPlate.filter(p => p && p.length).length);
console.log('leftovers', result.leftovers.length);
console.log('leftover ids', result.leftovers.map(p => p.id));
