import placements from './analyzeCNC.js';

function numbersAlmostEqual(a, b, tolerance = 0.01) {
  return Math.abs(Number(a) - Number(b)) < tolerance;
}

const WIDTH_TOLERANCE = 0.05;
const POSITION_TOLERANCE = 0.05;
const COLUMN_TOLERANCE = 1;
const kerfValue = 5;

function determineInitialRefilo() {
  return null;
}

function buildVerticalCutPlanFromPlacementsOriginal({ getPlacedPiecesWithCoords }, { refiloPreferido = 0, uiTrim = null } = {}) {
  if (typeof getPlacedPiecesWithCoords !== 'function') return null;
  const placements = getPlacedPiecesWithCoords();
  if (!Array.isArray(placements) || placements.length === 0) return null;

  const franjasMap = new Map();

  for (const placement of placements) {
    const largo = Number(placement?.width);
    const alto = Number(placement?.height);
    const x = Number(placement?.x);
    const y = Number(placement?.y);
    if (!Number.isFinite(largo) || largo <= 0 || !Number.isFinite(alto) || alto <= 0 || !Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }

    let key = Array.from(franjasMap.keys()).find((k) =>
      numbersAlmostEqual(k.largo, largo, WIDTH_TOLERANCE) &&
      numbersAlmostEqual(k.x, x, POSITION_TOLERANCE)
    );

    if (key === undefined) {
      key = { largo, x };
      franjasMap.set(key, { largo, x, placements: [], isSobrante: false });
    }

    franjasMap.get(key).placements.push({ x, y, width: largo, height: alto });
  }

  if (franjasMap.size === 0) return null;

  const sortedFranjas = Array.from(franjasMap.values()).sort((a, b) => {
    const firstPieceAY = a.placements[0]?.y ?? Infinity;
    const firstPieceBY = b.placements[0]?.y ?? Infinity;
    return a.x - b.x || firstPieceAY - firstPieceBY;
  });

  const finalPhases = [];

  for (let i = 0; i < sortedFranjas.length; i++) {
    const franja = sortedFranjas[i];
    if (franja.isSobrante) continue;

    franja.placements.sort((a, b) => a.y - b.y);
    const cortesU = franja.placements.map((p) => p.height);
    let currentMainFranjaBottomY = 0;
    if (franja.placements.length > 0) {
      const lastPlacement = franja.placements[franja.placements.length - 1];
      currentMainFranjaBottomY = lastPlacement.y + lastPlacement.height;
    } else {
      continue;
    }

    let sobranteData = null;
    let firstSobranteY = -1;
    const combinedUVPairs = [];
    let lastProcessedBottomY = currentMainFranjaBottomY;

    for (let j = i + 1; j < sortedFranjas.length; j++) {
      const potential = sortedFranjas[j];
      if (potential.isSobrante) continue;

      potential.placements.sort((a, b) => a.y - b.y);
      const potentialUVGroups = [];
      let groupsValid = true;

      for (const placement of potential.placements) {
        const candidateHeight = Number(placement?.height);
        const candidateWidth = Number(placement?.width);
        if (!Number.isFinite(candidateHeight) || candidateHeight <= 0 || !Number.isFinite(candidateWidth) || candidateWidth <= 0) {
          groupsValid = false;
          break;
        }

        let group = null;
        for (const existing of potentialUVGroups) {
          if (numbersAlmostEqual(existing.ancho_u, candidateHeight, WIDTH_TOLERANCE)) {
            group = existing;
            break;
          }
        }
        if (!group) {
          group = { ancho_u: candidateHeight, cortes_v: [] };
          potentialUVGroups.push(group);
        }
        group.cortes_v.push(candidateWidth);
      }

      if (!groupsValid || !potentialUVGroups.length) {
        break;
      }

      const firstPieceY = potential.placements[0]?.y;
      const candidateTopY = Number(firstPieceY);
      const candidateTotalHeight = potential.placements.reduce((sum, placement) => {
        const h = Number(placement?.height);
        return Number.isFinite(h) && h > 0 ? sum + h : sum;
      }, 0);
      const candidateBottomY = Number.isFinite(candidateTopY) ? candidateTopY + candidateTotalHeight : NaN;
      const mainTopY = franja.placements[0]?.y ?? 0;
      const mainBottomY = currentMainFranjaBottomY;

      const similarLargo = numbersAlmostEqual(franja.largo, potential.largo, WIDTH_TOLERANCE);
      const similarX = numbersAlmostEqual(franja.x, potential.x, POSITION_TOLERANCE);
      const expectedY = lastProcessedBottomY + kerfValue;
      const startsBelow = firstPieceY !== undefined && (
        firstPieceY >= lastProcessedBottomY - kerfValue &&
        firstPieceY <= expectedY + kerfValue + POSITION_TOLERANCE
      );
      const overlapsCurrentFranja = Number.isFinite(candidateTopY) && Number.isFinite(candidateBottomY) &&
        candidateTopY <= mainBottomY + POSITION_TOLERANCE &&
        candidateBottomY >= mainTopY - POSITION_TOLERANCE;

      if (combinedUVPairs.length === 0) {
        if (!similarLargo && similarX && (startsBelow || overlapsCurrentFranja)) {
          firstSobranteY = firstPieceY;
          for (const group of potentialUVGroups) {
            combinedUVPairs.push({ ancho_u: group.ancho_u, cortes_v: group.cortes_v.slice() });
          }
          potential.isSobrante = true;
          const lastPlacement = potential.placements[potential.placements.length - 1];
          lastProcessedBottomY = lastPlacement.y + lastPlacement.height;
          continue;
        } else {
          break;
        }
      } else {
        const startsBelowRelaxed = firstPieceY !== undefined && (
          firstPieceY >= lastProcessedBottomY - kerfValue &&
          firstPieceY <= expectedY + kerfValue + POSITION_TOLERANCE
        );
        const startsAtSameY = numbersAlmostEqual(firstSobranteY, firstPieceY, POSITION_TOLERANCE);

        if ((similarX && startsBelowRelaxed) || startsAtSameY) {
          for (const group of potentialUVGroups) {
            let matched = null;
            for (let idx = combinedUVPairs.length - 1; idx >= 0; idx--) {
              if (numbersAlmostEqual(combinedUVPairs[idx].ancho_u, group.ancho_u, WIDTH_TOLERANCE)) {
                matched = combinedUVPairs[idx];
                break;
              }
            }
            if (matched) {
              matched.cortes_v.push(...group.cortes_v);
            } else {
              combinedUVPairs.push({ ancho_u: group.ancho_u, cortes_v: group.cortes_v.slice() });
            }
          }
          potential.isSobrante = true;
          if (similarX && startsBelowRelaxed) {
            const lastPlacement = potential.placements[potential.placements.length - 1];
            lastProcessedBottomY = lastPlacement.y + lastPlacement.height;
          }
          continue;
        }
      }

      break;
    }

    if (combinedUVPairs.length > 0) {
      sobranteData = combinedUVPairs;
    }

    const phaseRefiloU = 0;

    finalPhases.push({
      kind: 'vertical',
      width: franja.largo,
      quantity: 1,
      refiloX: phaseRefiloU,
      cuts: cortesU.slice(),
      largo: franja.largo,
      cantidad: 1,
      refiloU: phaseRefiloU,
      cortesU: cortesU,
      sobrante: sobranteData,
      x: franja.x,
    });
  }

  return finalPhases;
}

const plate = {
  getPlacedPiecesWithCoords() {
    return placements;
  }
};

const phasesOriginal = buildVerticalCutPlanFromPlacementsOriginal(plate, {});
console.log('Original phases count:', phasesOriginal.length);
for (const [idx, phase] of phasesOriginal.entries()) {
  console.log('orig', idx, phase.width, phase.cuts, phase.sobrante, 'x=', phase.x);
}

function buildVerticalCutPlanFromPlacementsRewritten({ getPlacedPiecesWithCoords }, { refiloPreferido = 0, uiTrim = null } = {}) {
  if (typeof getPlacedPiecesWithCoords !== 'function') return null;
  const placements = getPlacedPiecesWithCoords();
  if (!Array.isArray(placements) || placements.length === 0) return null;

  const userRefilo = Number(uiTrim?.mm) || 0;

  const columns = [];

  for (const placement of placements) {
    const width = Number(placement?.width);
    const height = Number(placement?.height);
    const x = Number(placement?.x);
    const y = Number(placement?.y);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0 || !Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }

    let column = null;
    for (const candidate of columns) {
      if (numbersAlmostEqual(candidate.x, x, COLUMN_TOLERANCE)) {
        column = candidate;
        break;
      }
    }
    if (!column) {
      column = { x, placements: [] };
      columns.push(column);
    }

    column.placements.push({ x, y, width, height });
  }

  if (!columns.length) return null;

  columns.sort((a, b) => {
    const aY = a.placements[0]?.y ?? Infinity;
    const bY = b.placements[0]?.y ?? Infinity;
    return a.x - b.x || aY - bY;
  });

  const finalPhases = [];

  for (const column of columns) {
    if (!Array.isArray(column.placements) || !column.placements.length) {
      continue;
    }

    column.placements.sort((a, b) => a.y - b.y);

    let mainWidth = 0;
    for (const placement of column.placements) {
      if (placement.width > mainWidth) {
        mainWidth = placement.width;
      }
    }

    if (mainWidth <= 0 && column.placements.length > 0) {
      mainWidth = column.placements[0].width;
    }

    const mainCuts = [];
    const leftoverGroups = [];

    const findGroupByHeight = (height) => {
      for (const group of leftoverGroups) {
        if (numbersAlmostEqual(group.ancho_u, height, WIDTH_TOLERANCE)) {
          return group;
        }
      }
      return null;
    };

    for (const placement of column.placements) {
      if (numbersAlmostEqual(placement.width, mainWidth, WIDTH_TOLERANCE)) {
        mainCuts.push(placement.height);
      } else {
        const targetHeight = placement.height;
        let group = findGroupByHeight(targetHeight);
        if (!group) {
          group = { ancho_u: targetHeight, cortes_v: [] };
          leftoverGroups.push(group);
        }
        group.cortes_v.push(placement.width);
      }
    }

    const sobranteData = leftoverGroups.length ? leftoverGroups : null;
    const hasCuts = mainCuts.length > 0;
    const phaseRefilo = hasCuts ? userRefilo : 0;

    finalPhases.push({
      kind: 'vertical',
      width: mainWidth,
      quantity: 1,
      refiloX: phaseRefilo,
      cuts: mainCuts.slice(),
      largo: mainWidth,
      cantidad: 1,
      refiloU: phaseRefilo,
      cortesU: mainCuts.slice(),
      sobrante: sobranteData,
      x: column.x,
    });
  }

  return finalPhases;
}

const phasesRewritten = buildVerticalCutPlanFromPlacementsRewritten(plate, {});
console.log('Rewritten phases count:', phasesRewritten.length);
for (const [idx, phase] of phasesRewritten.entries()) {
  console.log('new', idx, phase.width, phase.cuts, phase.sobrante, 'x=', phase.x);
}
