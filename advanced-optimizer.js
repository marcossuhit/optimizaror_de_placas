/**
 * OPTIMIZADOR AVANZADO DE CORTES GUILLOTINA
 * ==========================================
 * 
 * Implementa:
 * 1. Two-Stage Guillotine Cutting (Strip Packing)
 * 2. Shelf Packing dentro de cada strip
 * 3. First-Fit Decreasing (FFD) y Best-Fit Decreasing (BFD)
 * 4. Simulated Annealing para optimización
 * 
 * Objetivo: Minimizar desperdicio y generar secuencia de cortes válida
 */

const EPSILON = 0.0001;

/**
 * Strip (tira vertical) en el empaquetado
 */
class Strip {
  constructor(x, y, width, maxHeight, kerf) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.maxHeight = maxHeight;
    this.kerf = kerf;
    this.shelves = []; // Filas horizontales dentro del strip
    this.currentHeight = 0;
    this.pieces = [];
  }

  /**
   * Intenta agregar una pieza al strip usando shelf packing
   */
  addPiece(piece) {
    // Verificar si la pieza cabe en ancho
    if (piece.width > this.width + EPSILON) {
      return false;
    }

    // Buscar un shelf existente donde quepa
    for (const shelf of this.shelves) {
      if (shelf.addPiece(piece)) {
        this.pieces.push({
          piece,
          x: this.x + shelf.currentWidth - piece.width,
          y: shelf.y,
          width: piece.width,
          height: piece.height
        });
        return true;
      }
    }

    // Si no cabe en ningún shelf, crear uno nuevo
    const shelfY = this.y + this.currentHeight;
    const remainingHeight = this.maxHeight - this.currentHeight;

    if (piece.height > remainingHeight + EPSILON) {
      return false; // No hay altura suficiente
    }

    const newShelf = new Shelf(
      this.x,
      shelfY,
      this.width,
      piece.height,
      this.kerf
    );

    if (newShelf.addPiece(piece)) {
      this.shelves.push(newShelf);
      this.currentHeight += piece.height + (this.shelves.length > 1 ? this.kerf : 0);
      
      this.pieces.push({
        piece,
        x: this.x,
        y: shelfY,
        width: piece.width,
        height: piece.height
      });
      
      return true;
    }

    return false;
  }

  get usedArea() {
    return this.pieces.reduce((sum, p) => sum + p.width * p.height, 0);
  }

  get utilization() {
    const totalArea = this.width * this.maxHeight;
    return totalArea > 0 ? (this.usedArea / totalArea) * 100 : 0;
  }
}

/**
 * Shelf (fila horizontal) dentro de un strip
 */
class Shelf {
  constructor(x, y, maxWidth, height, kerf) {
    this.x = x;
    this.y = y;
    this.maxWidth = maxWidth;
    this.height = height;
    this.kerf = kerf;
    this.currentWidth = 0;
    this.pieces = [];
  }

  addPiece(piece) {
    // Limitar a una sola pieza por shelf para evitar apilar lateralmente
    if (this.pieces.length > 0) {
      return false;
    }

    if (piece.height > this.height + EPSILON) {
      return false;
    }

    if (piece.width > this.maxWidth + EPSILON) {
      return false;
    }

    this.pieces.push(piece);
    this.currentWidth = piece.width;
    return true;
  }
}

/**
 * Solución de empaquetado para una placa usando Strip + Shelf Packing
 */
class PlateSolution {
  constructor(plateWidth, plateHeight, trimLeft = 0, trimTop = 0, kerf = 0) {
    this.plateWidth = plateWidth;
    this.plateHeight = plateHeight;
    this.trimLeft = trimLeft;
    this.trimTop = trimTop;
    this.kerf = kerf;
    
    this.usableWidth = plateWidth - trimLeft;
    this.usableHeight = plateHeight - trimTop;
    
    this.strips = [];
    this.currentX = trimLeft;
    this.placedPieces = [];
  }

  /**
   * Intenta colocar una pieza en la placa
   */
  place(piece) {
    // Intentar en strips existentes
    for (const strip of this.strips) {
      if (strip.addPiece(piece)) {
        this.placedPieces.push({ piece, strip });
        return true;
      }
    }

    // Crear un nuevo strip
    const remainingWidth = this.usableWidth - (this.currentX - this.trimLeft);
    
    if (piece.width > remainingWidth + EPSILON) {
      return false; // No hay ancho suficiente para un nuevo strip
    }

    const newStrip = new Strip(
      this.currentX,
      this.trimTop,
      piece.width,
      this.usableHeight,
      this.kerf
    );

    if (newStrip.addPiece(piece)) {
      this.strips.push(newStrip);
      this.currentX += piece.width + (this.strips.length > 1 ? this.kerf : 0);
      this.placedPieces.push({ piece, strip: newStrip });
      return true;
    }

    return false;
  }

  /**
   * Calcula el área utilizada
   */
  get usedArea() {
    return this.strips.reduce((sum, strip) => sum + strip.usedArea, 0);
  }

  /**
   * Calcula el área total de la placa
   */
  get totalArea() {
    return this.plateWidth * this.plateHeight;
  }

  /**
   * Calcula el porcentaje de utilización
   */
  get utilization() {
    return (this.usedArea / this.totalArea) * 100;
  }

  /**
   * Obtiene la secuencia de cortes guillotina
   */
  getCutSequence() {
    const verticalCuts = [];
    const horizontalCuts = [];

    // Cortes verticales entre strips
    let currentX = this.trimLeft;
    for (let i = 0; i < this.strips.length; i++) {
      const strip = this.strips[i];
      
      if (i > 0) {
        verticalCuts.push({
          type: 'vertical-cut',
          position: currentX,
          x: currentX,
          y: this.trimTop,
          width: 0,
          height: this.usableHeight
        });
      }

      // Cortes horizontales dentro del strip (entre shelves)
      let currentY = this.trimTop;
      for (let j = 0; j < strip.shelves.length; j++) {
        const shelf = strip.shelves[j];
        
        if (j > 0) {
          horizontalCuts.push({
            type: 'horizontal-cut',
            position: currentY,
            x: strip.x,
            y: currentY,
            width: strip.width,
            height: 0
          });
        }

        currentY += shelf.height + (j < strip.shelves.length - 1 ? this.kerf : 0);
      }

      currentX += strip.width + (i < this.strips.length - 1 ? this.kerf : 0);

      const stripRight = strip.x + strip.width;
      const maxUsableX = this.trimLeft + this.usableWidth;
      if (stripRight > this.trimLeft + EPSILON && stripRight <= maxUsableX + EPSILON) {
        const alreadyAdded = verticalCuts.some(cut => Math.abs(cut.position - stripRight) < EPSILON);
        if (!alreadyAdded) {
          verticalCuts.push({
            type: 'vertical-cut',
            position: stripRight,
            x: stripRight,
            y: this.trimTop,
            width: 0,
            height: this.usableHeight
          });
        }
      }
    }

    return {
      vertical: verticalCuts,
      horizontal: horizontalCuts,
      sequence: [...verticalCuts, ...horizontalCuts]
    };
  }

  /**
   * Obtiene las piezas colocadas con coordenadas
   */
  getPlacedPiecesWithCoords() {
    const result = [];
    for (const strip of this.strips) {
      result.push(...strip.pieces);
    }
    return result;
  }
}

/**
 * Ordena piezas por diferentes criterios
 */
function sortPieces(pieces, strategy = 'area-desc') {
  const sorted = [...pieces];
  
  switch (strategy) {
    case 'area-desc':
      sorted.sort((a, b) => (b.width * b.height) - (a.width * a.height));
      break;
    case 'width-desc':
      sorted.sort((a, b) => b.width - a.width || b.height - a.height);
      break;
    case 'height-desc':
      sorted.sort((a, b) => b.height - a.height || b.width - a.width);
      break;
    case 'perimeter-desc':
      sorted.sort((a, b) => (2*b.width + 2*b.height) - (2*a.width + 2*a.height));
      break;
    default:
      // area-desc por defecto
      sorted.sort((a, b) => (b.width * b.height) - (a.width * a.height));
  }
  
  return sorted;
}

/**
 * First-Fit Decreasing: coloca cada pieza en la primera placa que quepa
 */
function firstFitDecreasing(pieces, plateSpec, options = {}) {
  const {
    kerf = 5,
    trimLeft = 13,
    trimTop = 13,
    allowRotation = true
  } = options;

  const sorted = sortPieces(pieces, 'area-desc');
  const plates = [];
  const remaining = [];

  for (const piece of sorted) {
    let placed = false;

    // Intentar con orientación de entrada
    const orientations = [
      { ...piece } // Usar la pieza tal como viene
    ];

    if (allowRotation && Math.abs(piece.width - piece.height) > EPSILON) {
      // Añadir la orientación opuesta
      orientations.push({
        ...piece,
        width: piece.height,
        height: piece.width,
        rotated: !piece.rotated
      });
    }

    // Intentar colocar en placas existentes
    for (const plate of plates) {
      for (const orientation of orientations) {
        if (plate.place(orientation)) {
          placed = true;
          break;
        }
      }
      if (placed) break;
    }

    // Si no cabe en ninguna, crear nueva placa
    if (!placed) {
      const newPlate = new PlateSolution(
        plateSpec.width,
        plateSpec.height,
        trimLeft,
        trimTop,
        kerf
      );

      let placedInNew = false;
      for (const orientation of orientations) {
        if (newPlate.place(orientation)) {
          placedInNew = true;
          break;
        }
      }

      if (placedInNew) {
        plates.push(newPlate);
      } else {
        // No cabe ni en placa nueva -> pieza demasiado grande
        remaining.push(piece);
      }
    }
  }

  return { plates, remaining };
}

/**
 * Best-Fit Decreasing: coloca cada pieza en la placa con menos espacio sobrante
 */
function bestFitDecreasing(pieces, plateSpec, options = {}) {
  const {
    kerf = 5,
    trimLeft = 13,
    trimTop = 13,
    allowRotation = true
  } = options;

  const sorted = sortPieces(pieces, 'area-desc');
  const plates = [];
  const remaining = [];

  for (const piece of sorted) {
    let placed = false;
    let bestPlate = null;
    let bestOrientation = null;
    let bestWaste = Infinity;

    // Intentar con orientación de entrada
    const orientations = [
      { ...piece } // Usar la pieza tal como viene
    ];

    if (allowRotation && Math.abs(piece.width - piece.height) > EPSILON) {
      // Añadir la orientación opuesta
      orientations.push({
        ...piece,
        width: piece.height,
        height: piece.width,
        rotated: !piece.rotated
      });
    }

    // Buscar la mejor placa existente
    for (const plate of plates) {
      for (const orientation of orientations) {
        // Simular colocación para calcular desperdicio
        const testPlate = new PlateSolution(
          plateSpec.width,
          plateSpec.height,
          trimLeft,
          trimTop,
          kerf
        );
        
        // Copiar piezas existentes
        for (const placed of plate.placedPieces) {
          testPlate.place(placed.piece);
        }

        if (testPlate.place(orientation)) {
          const waste = testPlate.totalArea - testPlate.usedArea;
          if (waste < bestWaste) {
            bestWaste = waste;
            bestPlate = plate;
            bestOrientation = orientation;
          }
        }
      }
    }

    // Si encontramos una placa adecuada, colocar
    if (bestPlate) {
      bestPlate.place(bestOrientation);
      placed = true;
    }

    // Si no, crear nueva placa
    if (!placed) {
      const newPlate = new PlateSolution(
        plateSpec.width,
        plateSpec.height,
        trimLeft,
        trimTop,
        kerf
      );

      let placedInNew = false;
      for (const orientation of orientations) {
        if (newPlate.place(orientation)) {
          placedInNew = true;
          break;
        }
      }

      if (placedInNew) {
        plates.push(newPlate);
      } else {
        remaining.push(piece);
      }
    }
  }

  return { plates, remaining };
}

/**
 * Evalúa la calidad de una solución
 */
function evaluateSolution(plates, options = {}) {
  const rotationPenalty = Number.isFinite(options.rotationPenalty)
    ? Math.max(0, options.rotationPenalty)
    : 0;
  const allowRotation = options.allowRotation !== false;
  const rotationMixPenalty = Number.isFinite(options.rotationMixPenalty)
    ? Math.max(0, options.rotationMixPenalty)
    : 0;

  const totalArea = plates.reduce((sum, p) => sum + p.totalArea, 0);
  const usedArea = plates.reduce((sum, p) => sum + p.usedArea, 0);
  const wasteArea = totalArea - usedArea;
  const utilization = totalArea > 0 ? (usedArea / totalArea) * 100 : 0;

  let rotatedCount = 0;
  let mixedRotationRows = 0;
  if (allowRotation && (rotationPenalty > 0 || rotationMixPenalty > 0)) {
    const rotationCounting = rotationMixPenalty > 0 ? new Map() : null;
    rotatedCount = plates.reduce((sum, plate) => {
      return sum + plate.placedPieces.reduce((inner, entry) => {
        const rotated = entry?.piece?.rotated ? 1 : 0;
        if (rotationCounting) {
          const rowIdx = entry?.piece?.rowIndex ?? entry?.piece?.rowIdx ?? entry?.piece?.row;
          if (rowIdx != null) {
            const key = String(rowIdx);
            const state = rotationCounting.get(key) || { rotated: 0, total: 0 };
            state.rotated += rotated;
            state.total += 1;
            rotationCounting.set(key, state);
          }
        }
        return inner + rotated;
      }, 0);
    }, 0);

    if (rotationCounting && rotationCounting.size > 0) {
      rotationCounting.forEach((state) => {
        if (state.total > 0 && state.rotated > 0 && state.rotated < state.total) {
          mixedRotationRows += 1;
        }
      });
    }
  }

  return {
    plateCount: plates.length,
    totalArea,
    usedArea,
    wasteArea,
    utilization,
    rotationPenaltyApplied: rotatedCount * rotationPenalty,
    rotationMixPenaltyApplied: mixedRotationRows * rotationMixPenalty,
    rotatedCount,
    mixedRotationRows,
    score: usedArea
      - (plates.length * 10000)
      - (rotatedCount * rotationPenalty)
      - (mixedRotationRows * rotationMixPenalty) // Penalizar placas, rotaciones y mezclas por fila
  };
}

/**
 * Simulated Annealing para optimizar la solución
 */
function simulatedAnnealing(pieces, plateSpec, options = {}, iterations = 100) {
  const {
    kerf = 5,
    trimLeft = 13,
    trimTop = 13,
    allowRotation = true
  } = options;

  // Probar múltiples estrategias iniciales
  const strategies = ['area-desc', 'width-desc', 'height-desc', 'perimeter-desc'];
  let bestInitialSolution = null;
  let bestInitialEval = null;

  for (const strategy of strategies) {
    const sorted = sortPieces(pieces, strategy);
    const solution = firstFitDecreasing(sorted, plateSpec, options);
    const evaluation = evaluateSolution(solution.plates, options);

    if (!bestInitialSolution || evaluation.score > bestInitialEval.score) {
      bestInitialSolution = solution;
      bestInitialEval = evaluation;
    }
  }

  let currentSolution = bestInitialSolution;
  let currentEval = bestInitialEval;
  
  let bestSolution = currentSolution;
  let bestEval = currentEval;

  let temperature = 2000;
  const coolingRate = 0.92;

  for (let i = 0; i < iterations; i++) {
    // Generar vecino: aplicar varias operaciones aleatorias
    const shuffled = [...pieces];
    
    // Operación 1: Swaps aleatorios (mezclar orden)
    const swaps = Math.floor(Math.random() * 8) + 2;
    for (let j = 0; j < swaps; j++) {
      const idx1 = Math.floor(Math.random() * shuffled.length);
      const idx2 = Math.floor(Math.random() * shuffled.length);
      [shuffled[idx1], shuffled[idx2]] = [shuffled[idx2], shuffled[idx1]];
    }

    // Operación 2: Forzar rotación en algunas piezas (si está permitido)
    if (allowRotation) {
      const rotationCount = Math.floor(Math.random() * 4) + 1;
      for (let j = 0; j < rotationCount; j++) {
        const idx = Math.floor(Math.random() * shuffled.length);
        const temp = shuffled[idx].width;
        shuffled[idx] = {
          ...shuffled[idx],
          width: shuffled[idx].height,
          height: temp,
          rotated: !shuffled[idx].rotated
        };
      }
    }

    // Operación 3: Mover piezas grandes al principio a veces
    if (Math.random() < 0.3) {
      shuffled.sort((a, b) => {
        const areaA = a.width * a.height;
        const areaB = b.width * b.height;
        return areaB - areaA;
      });
    }

    // Generar nueva solución
    const newSolution = firstFitDecreasing(shuffled, plateSpec, options);
    const newEval = evaluateSolution(newSolution.plates, options);

    // Decidir si aceptar la nueva solución
    const delta = newEval.score - currentEval.score;
    
    const acceptProbability = delta > 0 ? 1 : Math.exp(delta / temperature);
    
    if (Math.random() < acceptProbability) {
      currentSolution = newSolution;
      currentEval = newEval;

      // Actualizar mejor solución si es mejor
      if (newEval.score > bestEval.score) {
        bestSolution = newSolution;
        bestEval = newEval;
        console.log(`   🔥 Mejora encontrada (iter ${i}): ${bestEval.plateCount} placas, ${bestEval.utilization.toFixed(2)}% util`);
      }
    }

    // Enfriar
    temperature *= coolingRate;
  }

  return {
    solution: bestSolution,
    evaluation: bestEval
  };
}

/**
 * Función principal de optimización
 */
export function optimizeCutLayout(pieces, plateSpec, options = {}) {
  const {
    algorithm = 'simulated-annealing', // 'ffd', 'bfd', 'simulated-annealing'
    iterations = 100,
    kerf = 5,
    trimLeft = 13,
    trimTop = 13,
    allowRotation = true
  } = options;

  console.log('🎯 Iniciando optimización avanzada...');
  console.log(`   Piezas: ${pieces.length}`);
  console.log(`   Placa: ${plateSpec.width} × ${plateSpec.height} mm`);
  console.log(`   Algoritmo: ${algorithm}`);

  let result;

  switch (algorithm) {
    case 'ffd':
      result = firstFitDecreasing(pieces, plateSpec, options);
      return {
        plates: result.plates,
        remaining: result.remaining,
        evaluation: evaluateSolution(result.plates, options)
      };

    case 'bfd':
      result = bestFitDecreasing(pieces, plateSpec, options);
      return {
        plates: result.plates,
        remaining: result.remaining,
        evaluation: evaluateSolution(result.plates, options)
      };

    case 'simulated-annealing':
      const saResult = simulatedAnnealing(pieces, plateSpec, options, iterations);
      return {
        plates: saResult.solution.plates,
        remaining: saResult.solution.remaining,
        evaluation: saResult.evaluation
      };

    default:
      throw new Error(`Algoritmo desconocido: ${algorithm}`);
  }
}

/**
 * Genera reporte detallado de la solución
 */
export function generateReport(optimizationResult) {
  const { plates, remaining, evaluation } = optimizationResult;

  const report = {
    summary: {
      plateCount: plates.length,
      totalPieces: plates.reduce((sum, p) => sum + p.placedPieces.length, 0),
      remainingPieces: remaining.length,
      totalArea: evaluation.totalArea,
      usedArea: evaluation.usedArea,
      wasteArea: evaluation.wasteArea,
      utilization: evaluation.utilization.toFixed(2) + '%'
    },
    plates: plates.map((plate, idx) => ({
      plateNumber: idx + 1,
      dimensions: `${plate.plateWidth} × ${plate.plateHeight} mm`,
      pieces: plate.placedPieces.length,
      usedArea: plate.usedArea.toFixed(2),
      utilization: plate.utilization.toFixed(2) + '%',
      cutSequence: plate.getCutSequence(),
      placedPieces: plate.getPlacedPiecesWithCoords()
    })),
    remaining: remaining.map(p => ({
      id: p.id,
      dimensions: `${p.width} × ${p.height} mm`,
      area: (p.width * p.height).toFixed(2)
    }))
  };

  return report;
}

// ---------------------------------------------------------------------------
// Optimizador basado en franjas horizontales (bandas)
// ---------------------------------------------------------------------------

class HorizontalBand {
  constructor(x, y, maxWidth, kerf) {
    this.x = x;
    this.y = y;
    this.maxWidth = maxWidth;
    this.kerf = kerf;
    this.currentWidth = 0;
    this.bandHeight = 0;
    this.pieces = [];
  }

  addPiece(piece) {
    if (!piece) return false;
    const isEmpty = this.pieces.length === 0;
    if (isEmpty) {
      this.bandHeight = piece.height;
    } else {
      if (piece.height > this.bandHeight + EPSILON) {
        return false;
      }
    }

    const spacing = isEmpty ? 0 : this.kerf;
    const nextWidth = this.currentWidth + spacing + piece.width;
    if (nextWidth > this.maxWidth + EPSILON) {
      return false;
    }

    const placementX = this.x + this.currentWidth + spacing;
    this.pieces.push({
      piece,
      x: placementX,
      y: this.y,
      width: piece.width,
      height: piece.height
    });
    this.currentWidth = nextWidth;
    return true;
  }

  get height() {
    return this.bandHeight;
  }

  get usedArea() {
    return this.pieces.reduce((sum, entry) => sum + entry.width * entry.height, 0);
  }
}

class HorizontalPlateSolution {
  constructor(plateWidth, plateHeight, trimLeft = 0, trimTop = 0, trimRight = 0, trimBottom = 0, kerf = 0) {
    this.plateWidth = plateWidth;
    this.plateHeight = plateHeight;
    this.trimLeft = trimLeft;
    this.trimTop = trimTop;
    this.trimRight = trimRight;
    this.trimBottom = trimBottom;
    this.kerf = kerf;

    this.usableWidth = Math.max(0, plateWidth - trimLeft - trimRight);
    this.usableHeight = Math.max(0, plateHeight - trimTop - trimBottom);

    this.bands = [];
    this.currentY = trimTop;
    this.placedPieces = [];
  }

  place(piece) {
    if (!piece) return false;
    if (this.usableWidth <= EPSILON || this.usableHeight <= EPSILON) return false;

    for (const band of this.bands) {
      if (band.addPiece(piece)) {
        this.placedPieces.push({ piece, band });
        return true;
      }
    }

    const maxAvailableY = this.plateHeight - this.trimBottom;
    const remainingHeight = maxAvailableY - this.currentY;
    if (piece.height > remainingHeight + EPSILON) {
      return false;
    }

    const newBand = new HorizontalBand(this.trimLeft, this.currentY, this.usableWidth, this.kerf);
    if (!newBand.addPiece(piece)) {
      return false;
    }

    this.bands.push(newBand);
    this.currentY += newBand.height + (this.bands.length > 1 ? this.kerf : 0);
    this.placedPieces.push({ piece, band: newBand });
    return true;
  }

  get usedArea() {
    return this.bands.reduce((sum, band) => sum + band.usedArea, 0);
  }

  get totalArea() {
    return this.plateWidth * this.plateHeight;
  }

  get utilization() {
    const totalArea = this.totalArea;
    return totalArea > 0 ? (this.usedArea / totalArea) * 100 : 0;
  }

  getCutSequence() {
    const verticalCuts = [];
    const horizontalCuts = [];

    for (let i = 0; i < this.bands.length; i++) {
      const band = this.bands[i];
      if (i > 0) {
        const cutY = band.y - (this.kerf > 0 ? this.kerf : 0);
        horizontalCuts.push({
          type: 'horizontal-cut',
          position: Math.max(this.trimTop, cutY),
          x: this.trimLeft,
          y: Math.max(this.trimTop, cutY),
          width: this.usableWidth,
          height: 0
        });
      }

      const sortedPieces = [...band.pieces].sort((a, b) => a.x - b.x);
      for (let j = 0; j < sortedPieces.length; j++) {
        if (j === 0) continue;
        const placement = sortedPieces[j];
        const cutX = placement.x - (this.kerf > 0 ? this.kerf : 0);
        verticalCuts.push({
          type: 'vertical-cut',
          position: Math.max(this.trimLeft, cutX),
          x: Math.max(this.trimLeft, cutX),
          y: band.y,
          width: 0,
          height: band.height
        });
      }

      const bandBottom = band.y + band.height;
      const effectiveBottom = this.plateHeight - this.trimBottom;
      if (bandBottom < effectiveBottom - EPSILON) {
        horizontalCuts.push({
          type: 'horizontal-cut',
          position: bandBottom,
          x: this.trimLeft,
          y: bandBottom,
          width: this.usableWidth,
          height: 0
        });
      }
    }

    return {
      vertical: verticalCuts,
      horizontal: horizontalCuts,
      sequence: [...horizontalCuts, ...verticalCuts]
    };
  }

  getPlacedPiecesWithCoords() {
    const result = [];
    for (const band of this.bands) {
      result.push(...band.pieces);
    }
    return result;
  }
}

function buildBandOrientations(piece, allowRotation) {
  const orientations = [{
    ...piece,
    rotated: piece.rotated ?? false
  }];

  if (allowRotation && Math.abs(piece.width - piece.height) > EPSILON) {
    orientations.push({
      ...piece,
      width: piece.height,
      height: piece.width,
      rotated: !piece.rotated
    });
  }

  orientations.sort((a, b) => {
    if (Math.abs(a.height - b.height) > EPSILON) {
      return a.height - b.height; // Prefer menor altura para fijar band a la mínima posible
    }
    if (Math.abs(b.width - a.width) > EPSILON) {
      return b.width - a.width; // Si altura similar, usar el que aproveche más ancho
    }
    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    return areaB - areaA;
  });

  return orientations;
}

function firstFitDecreasingBands(pieces, plateSpec, options = {}) {
  const {
    kerf = 5,
    trimLeft = 13,
    trimTop = 13,
    trimRight = 0,
    trimBottom = 0,
    allowRotation = true
  } = options;

  const sorted = sortPieces(pieces, 'height-desc');
  const plates = [];
  const remaining = [];

  for (const piece of sorted) {
    let placed = false;
    const orientations = buildBandOrientations(piece, allowRotation);

    for (const plate of plates) {
      for (const orientation of orientations) {
        if (plate.place({ ...orientation })) {
          placed = true;
          break;
        }
      }
      if (placed) break;
    }

    if (!placed) {
      const newPlate = new HorizontalPlateSolution(
        plateSpec.width,
        plateSpec.height,
        trimLeft,
        trimTop,
        trimRight,
        trimBottom,
        kerf
      );

      let placedInNew = false;
      for (const orientation of orientations) {
        if (newPlate.place({ ...orientation })) {
          placedInNew = true;
          break;
        }
      }

      if (placedInNew) {
        plates.push(newPlate);
      } else {
        remaining.push(piece);
      }
    }
  }

  return { plates, remaining };
}

function bestFitDecreasingBands(pieces, plateSpec, options = {}) {
  const {
    kerf = 5,
    trimLeft = 13,
    trimTop = 13,
    trimRight = 0,
    trimBottom = 0,
    allowRotation = true
  } = options;

  const sorted = sortPieces(pieces, 'height-desc');
  const plates = [];
  const remaining = [];

  for (const piece of sorted) {
    let placed = false;
    let bestPlate = null;
    let bestOrientation = null;
    let bestWaste = Infinity;
    const orientations = buildBandOrientations(piece, allowRotation);

    for (const plate of plates) {
      for (const orientation of orientations) {
        const testPlate = new HorizontalPlateSolution(
          plateSpec.width,
          plateSpec.height,
          trimLeft,
          trimTop,
          trimRight,
          trimBottom,
          kerf
        );

        for (const placedPiece of plate.placedPieces) {
          testPlate.place({ ...placedPiece.piece });
        }

        if (testPlate.place({ ...orientation })) {
          const waste = testPlate.totalArea - testPlate.usedArea;
          if (waste < bestWaste) {
            bestWaste = waste;
            bestPlate = plate;
            bestOrientation = orientation;
          }
        }
      }
    }

    if (bestPlate && bestOrientation) {
      bestPlate.place({ ...bestOrientation });
      placed = true;
    }

    if (!placed) {
      const newPlate = new HorizontalPlateSolution(
        plateSpec.width,
        plateSpec.height,
        trimLeft,
        trimTop,
        trimRight,
        trimBottom,
        kerf
      );

      let placedInNew = false;
      for (const orientation of orientations) {
        if (newPlate.place({ ...orientation })) {
          placedInNew = true;
          break;
        }
      }

      if (placedInNew) {
        plates.push(newPlate);
      } else {
        remaining.push(piece);
      }
    }
  }

  return { plates, remaining };
}

function simulatedAnnealingBands(pieces, plateSpec, options = {}, iterations = 100) {
  const { allowRotation = true } = options;
  const strategies = ['height-desc', 'area-desc', 'width-desc', 'perimeter-desc'];

  let bestInitialSolution = null;
  let bestInitialEval = null;

  for (const strategy of strategies) {
    const sorted = sortPieces(pieces, strategy);
    const solution = firstFitDecreasingBands(sorted, plateSpec, options);
    const evaluation = evaluateSolution(solution.plates, options);

    if (!bestInitialSolution || evaluation.score > (bestInitialEval?.score ?? -Infinity)) {
      bestInitialSolution = solution;
      bestInitialEval = evaluation;
    }
  }

  let currentSolution = bestInitialSolution || firstFitDecreasingBands(pieces, plateSpec, options);
  let currentEval = bestInitialEval || evaluateSolution(currentSolution.plates, options);
  let bestSolution = currentSolution;
  let bestEval = currentEval;

  let temperature = 2000;
  const coolingRate = 0.92;

  for (let i = 0; i < iterations; i++) {
    const shuffled = [...pieces];

    const swaps = Math.floor(Math.random() * 8) + 2;
    for (let j = 0; j < swaps; j++) {
      const idx1 = Math.floor(Math.random() * shuffled.length);
      const idx2 = Math.floor(Math.random() * shuffled.length);
      [shuffled[idx1], shuffled[idx2]] = [shuffled[idx2], shuffled[idx1]];
    }

    if (allowRotation) {
      const rotationCount = Math.floor(Math.random() * 4) + 1;
      for (let j = 0; j < rotationCount; j++) {
        const idx = Math.floor(Math.random() * shuffled.length);
        const candidate = shuffled[idx];
        shuffled[idx] = {
          ...candidate,
          width: candidate.height,
          height: candidate.width,
          rotated: !candidate.rotated
        };
      }
    }

    if (Math.random() < 0.35) {
      shuffled.sort((a, b) => {
        if (Math.abs(b.height - a.height) > EPSILON) {
          return b.height - a.height;
        }
        const areaA = a.width * a.height;
        const areaB = b.width * b.height;
        return areaB - areaA;
      });
    }

    const newSolution = firstFitDecreasingBands(shuffled, plateSpec, options);
    const newEval = evaluateSolution(newSolution.plates, options);
    const delta = newEval.score - currentEval.score;
    const acceptProbability = delta > 0 ? 1 : Math.exp(delta / temperature);

    if (Math.random() < acceptProbability) {
      currentSolution = newSolution;
      currentEval = newEval;
      if (!bestEval || newEval.score > bestEval.score) {
        bestSolution = newSolution;
        bestEval = newEval;
        console.log(`   🔥 Mejora franjas (iter ${i}): ${bestEval.plateCount} placas, ${bestEval.utilization.toFixed(2)}% util`);
      }
    }

    temperature *= coolingRate;
  }

  return {
    solution: bestSolution,
    evaluation: bestEval
  };
}

export function optimizeCutLayoutBands(pieces, plateSpec, options = {}) {
  const {
    algorithm = 'simulated-annealing',
    iterations = 100
  } = options;

  console.log('🎯 Iniciando optimización avanzada (franjas horizontales)...');
  console.log(`   Piezas: ${pieces.length}`);
  console.log(`   Placa: ${plateSpec.width} × ${plateSpec.height} mm`);
  console.log(`   Algoritmo: ${algorithm}`);

  switch (algorithm) {
    case 'ffd': {
      const result = firstFitDecreasingBands(pieces, plateSpec, options);
      return {
        plates: result.plates,
        remaining: result.remaining,
        evaluation: evaluateSolution(result.plates, options)
      };
    }
    case 'bfd': {
      const result = bestFitDecreasingBands(pieces, plateSpec, options);
      return {
        plates: result.plates,
        remaining: result.remaining,
        evaluation: evaluateSolution(result.plates, options)
      };
    }
    case 'simulated-annealing-horizontal':
    case 'simulated-annealing': {
      const saResult = simulatedAnnealingBands(pieces, plateSpec, options, iterations);
      return {
        plates: saResult.solution.plates,
        remaining: saResult.solution.remaining,
        evaluation: saResult.evaluation
      };
    }
    default:
      throw new Error(`Algoritmo desconocido (bandas): ${algorithm}`);
  }
}
