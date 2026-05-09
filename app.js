const colors = [
  { key: "red", name: "红色", color: "#cc3f32", count: "", slots: "", avg: "", pricePerSlot: 0, pricePerItem: 177692 },
  { key: "gold", name: "金色", color: "#c99a2e", count: "", slots: "", avg: "", pricePerSlot: 0, pricePerItem: 46325 },
  { key: "purple", name: "紫色", color: "#7357cf", count: "", slots: "", avg: "", pricePerSlot: 0, pricePerItem: 9493 },
  { key: "blue", name: "蓝色", color: "#3278b7", count: "", slots: "", avg: "", pricePerSlot: 0, pricePerItem: 3126 },
  { key: "greenWhite", name: "绿白", color: "#489061", count: "", slots: "", avg: "", pricePerSlot: 0, pricePerItem: 556 },
];

const defaults = structuredClone(colors);
const formatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
const MAX_SOLUTIONS = 50000;
const legalSlotsByColor = {
  red: [1, 2, 3, 4, 6, 8, 9, 10, 12, 15, 16],
  gold: [1, 2, 3, 4, 6, 8, 9, 10, 12, 15, 16, 18],
  purple: [1, 2, 3, 4, 5, 6, 8, 9, 10, 12],
  blue: [1, 2, 3, 4, 5, 6, 8, 9, 15, 16, 20],
  greenWhite: [1, 2, 3, 4, 5, 6, 8, 9, 12],
};
const floorPriceBySlots = {
  red: { 1: 52500, 2: 92880, 3: 143100, 4: 112896, 6: 120600, 8: 281600, 9: 188888, 10: 287280, 12: 305920, 15: 293400, 16: 361000 },
  gold: { 1: 7800, 2: 18600, 3: 30159, 4: 25875, 6: 36511, 8: 48703, 9: 48300, 10: 67600, 12: 74745, 15: 97382, 16: 199900, 18: 106500 },
  purple: { 1: 2100, 2: 3454, 3: 6554, 4: 3180, 5: 16310, 6: 9749, 8: 11752, 9: 12045, 10: 31688, 12: 20082 },
  blue: { 1: 711, 2: 848, 3: 2322, 4: 2214, 5: 4840, 6: 3285, 8: 3173, 9: 4410, 15: 14659, 16: 9168, 20: 8880 },
  greenWhite: { 1: 107, 2: 107, 3: 112, 4: 142, 5: 1452, 6: 386, 8: 609, 9: 902, 12: 5129 },
};
const slotSumCache = new Map();
const floorValueCache = new Map();

const els = {
  totalItems: document.querySelector("#totalItems"),
  totalSlots: document.querySelector("#totalSlots"),
  totalAvgSlots: document.querySelector("#totalAvgSlots"),
  sampleCount: document.querySelector("#sampleCount"),
  sampleAvgValue: document.querySelector("#sampleAvgValue"),
  sampleTotalValue: document.querySelector("#sampleTotalValue"),
  sampleSlotCount: document.querySelector("#sampleSlotCount"),
  sampleAvgSlots: document.querySelector("#sampleAvgSlots"),
  sampleTotalSlots: document.querySelector("#sampleTotalSlots"),
  colorRows: document.querySelector("#colorRows"),
  totalValue: document.querySelector("#totalValue"),
  redCounts: document.querySelector("#redCounts"),
  redNote: document.querySelector("#redNote"),
  redFormulas: document.querySelector("#redFormulas"),
  warning: document.querySelector("#warning"),
  confidenceBadge: document.querySelector("#confidenceBadge"),
  resetButton: document.querySelector("#resetButton"),
};

function isBlank(value) {
  return String(value).trim() === "";
}

function readNumber(value) {
  if (isBlank(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readMoney(value) {
  if (isBlank(value)) return null;
  const text = String(value).trim().toLowerCase();
  const matched = text.match(/^([0-9]+(?:\.[0-9]+)?)(w|万|k|千)?$/);
  if (!matched) return readNumber(value);
  const number = Number(matched[1]);
  if (!Number.isFinite(number)) return null;
  const unit = matched[2];
  if (unit === "w" || unit === "万") return number * 10000;
  if (unit === "k" || unit === "千") return number * 1000;
  return number;
}

function parseNumberList(value) {
  if (isBlank(value)) return [];
  return String(value)
    .split(/[\s,，;；、]+/)
    .map((part) => readMoney(part))
    .filter((number) => Number.isFinite(number) && number > 0)
    .map((number) => Math.floor(number));
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function round2(value) {
  return Math.round(value * 100 + 1e-9) / 100;
}

function floor2(value) {
  return Math.floor(value * 100 + 1e-9) / 100;
}

function matchesShownAverage(slots, count, shownAverage) {
  if (shownAverage === null) return true;
  if (count <= 0) return false;
  const actualAverage = slots / count;
  const shown = round2(shownAverage);
  return floor2(actualAverage) === shown;
}

function matchesShownValueAverage(totalValue, count, shownAverage) {
  if (totalValue === null || shownAverage === null) return true;
  if (count <= 0) return totalValue === 0 && floor2(shownAverage) === 0;
  const actualAverage = totalValue / count;
  const shown = round2(shownAverage);
  return floor2(actualAverage) === shown;
}

function possibleTotalSlotsFromAverage(totalItems, shownAverage) {
  if (shownAverage === null || totalItems <= 0) return null;
  const maxSlots = totalItems * Math.max(...Object.values(legalSlotsByColor).flat());
  const slots = [];
  for (let slot = 0; slot <= maxSlots; slot += 1) {
    if (matchesShownAverage(slot, totalItems, shownAverage)) slots.push(slot);
  }
  return slots;
}

function averageError(slots, count, shownAverage) {
  if (shownAverage === null || slots === null) return 0;
  if (count <= 0) return Number.POSITIVE_INFINITY;
  return Math.abs(slots / count - shownAverage);
}

function valueAverageError(totalValue, count, shownAverage) {
  if (totalValue === null || shownAverage === null) return 0;
  if (count <= 0) return Number.POSITIVE_INFINITY;
  return Math.abs(totalValue / count - shownAverage);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function formatSet(values, limit = Number.POSITIVE_INFINITY) {
  const sorted = uniqueSorted(values);
  if (sorted.length === 0) return "无";
  const contiguous = sorted.every((value, index) => index === 0 || value === sorted[index - 1] + 1);
  if (sorted.length > 2 && contiguous) return `${sorted[0]} - ${sorted.at(-1)}`;
  if (sorted.length <= limit) return sorted.join(" 或 ");
  return `${sorted.slice(0, limit).join(" / ")} ...`;
}

function formatLimitedSet(values, limit = 3) {
  const sorted = uniqueSorted(values);
  if (sorted.length === 0) return "无";
  const contiguous = isContiguous(sorted);
  if (contiguous && sorted.length > 2) return `${sorted[0]} - ${sorted.at(-1)}`;
  if (sorted.length <= limit) return sorted.join(" 或 ");
  return `${sorted.slice(0, limit).join(" / ")} ...`;
}

function formatRange(values) {
  const sorted = uniqueSorted(values);
  if (sorted.length === 0) return "未知";
  const min = sorted[0];
  const max = sorted.at(-1);
  return min === max ? String(min) : `${min} - ${max}`;
}

function formatCompactRange(values) {
  const sorted = uniqueSorted(values);
  if (sorted.length === 0) return "未知";
  const min = sorted[0];
  const max = sorted.at(-1);
  return min === max ? String(min) : `${min}~${max}`;
}

function isContiguous(values) {
  const sorted = uniqueSorted(values);
  return sorted.every((value, index) => index === 0 || value === sorted[index - 1] + 1);
}

function formatMoney(value) {
  if (!Number.isFinite(value)) return "未知";
  if (Math.abs(value) >= 10000) return `${formatter.format(value / 10000)}w`;
  if (Math.abs(value) >= 1000) return `${formatter.format(value / 1000)}k`;
  return formatter.format(value);
}

function valuePill(label, value) {
  return `<span class="value-pill"><small>${label}</small>${value}</span>`;
}

function formatValueSummary(parts) {
  return `<span class="value-summary">${parts.map(([label, value]) => valuePill(label, value)).join("")}</span>`;
}

function summarizeValueRange(values) {
  const known = values.filter(Number.isFinite);
  if (known.length === 0) return "未知";
  const min = Math.min(...known);
  const max = Math.max(...known);
  return min === max ? formatMoney(min) : `${formatMoney(min)} - ${formatMoney(max)}`;
}

function summarizeEstimateRange(estimates, weights = null) {
  if (estimates.length === 0) return "未知";
  const floor = Math.min(...estimates.map((estimate) => estimate.floor));
  const cautiousValues = estimates.map((estimate) => estimate.cautious).filter(Number.isFinite);
  const expectedValues = estimates.map((estimate) => estimate.expected).filter(Number.isFinite);
  const cautiousText = cautiousValues.length === estimates.length
    ? weights ? formatMoney(weightedAverage(cautiousValues, weights)) : summarizeMoneyValues(cautiousValues)
    : "未知";
  const expectedText = expectedValues.length === estimates.length
    ? weights ? formatMoney(weightedAverage(expectedValues, weights)) : summarizeMoneyValues(expectedValues)
    : "未知";
  return formatValueSummary([
    ["最低", formatMoney(floor)],
    ["稳妥", cautiousText],
    ["期望", expectedText],
  ]);
}

function summarizeMoneyValues(values) {
  const low = Math.min(...values);
  const high = Math.max(...values);
  return low === high ? formatMoney(low) : `${formatMoney(low)} - ${formatMoney(high)}`;
}

function weightedAverage(values, weights) {
  return values.reduce((sum, value, index) => sum + value * weights[index], 0);
}

function normalizedWeights(weights) {
  if (!weights.length) return null;
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  return weights.map((value) => value / total);
}

function summarizeColorEstimateRange(estimates, color) {
  if (estimates.length === 0) return "未知";
  const floor = Math.min(...estimates.map((estimate) => estimate.floor));
  const expectedValues = estimates.map((estimate) => estimate.expected).filter(Number.isFinite);
  if (expectedValues.length !== estimates.length) return `最低 ${formatMoney(floor)} / 均值未知`;
  const expectedLow = Math.min(...expectedValues);
  const expectedHigh = Math.max(...expectedValues);
  const expectedText = expectedLow === expectedHigh
    ? formatMoney(expectedLow)
    : `${formatMoney(expectedLow)} - ${formatMoney(expectedHigh)}`;
  return formatValueSummary([
    ["最低", formatMoney(floor)],
    [color.key === "red" ? "期望" : "均值", expectedText],
  ]);
}

function defaultMinimumFor(color) {
  return ["purple", "blue", "greenWhite"].includes(color.key) ? 1 : 0;
}

function hasDetailedClues(state) {
  return state.totalSlots !== null || state.colors.some((color) => {
    return color.count !== null
      || color.minCount !== null
      || color.slots !== null
      || color.avg !== null
      || color.totalValue !== null
      || color.knownItemSlots.length > 0
      || color.knownItemValues.length > 0;
  });
}

function sampleValue(state) {
  if (state.sampleTotalValue !== null && state.sampleTotalValue > 0) return state.sampleTotalValue;
  if (state.sampleCount === null || state.sampleAvgValue === null) return null;
  if (state.sampleCount <= 0 || state.sampleAvgValue <= 0) return null;
  return state.sampleCount * state.sampleAvgValue;
}

function applySampleEstimate(estimate, state) {
  const value = sampleValue(state);
  if (value === null) return estimate;
  return {
    floor: Math.max(estimate.floor, value),
    cautious: Number.isFinite(estimate.cautious) ? Math.max(estimate.cautious, value) : value,
    expected: Number.isFinite(estimate.expected) ? Math.max(estimate.expected, value) : value,
  };
}

function possibleUnknownSlotSums(colorKey, count) {
  const cacheKey = `${colorKey}:${count}`;
  if (slotSumCache.has(cacheKey)) return slotSumCache.get(cacheKey);

  const legalSlots = legalSlotsByColor[colorKey] ?? [1];
  let sums = new Set([0]);
  for (let item = 0; item < count; item += 1) {
    const next = new Set();
    sums.forEach((sum) => {
      legalSlots.forEach((slot) => next.add(sum + slot));
    });
    sums = next;
  }

  const result = uniqueSorted([...sums]);
  slotSumCache.set(cacheKey, result);
  return result;
}

function possibleDatabaseSlotsForCount(color, count) {
  const knownItemSlots = color.knownItemSlots ?? [];
  if (count < knownItemSlots.length) return [];

  const knownSlotTotal = knownItemSlots.reduce((sum, slots) => sum + slots, 0);
  const unknownCount = count - knownItemSlots.length;
  return possibleUnknownSlotSums(color.key, unknownCount).map((slots) => knownSlotTotal + slots);
}

function knownValueTotal(color) {
  return sum(color.knownItemValues ?? []);
}

function minColorValueForSlots(colorKey, count, totalSlots) {
  if (count === 0) return 0;
  const floorPrices = floorPriceBySlots[colorKey];
  if (!floorPrices) return 0;
  if (totalSlots === null || totalSlots === undefined) return count * floorPrices[1];

  const cacheKey = `${colorKey}:${count}:${totalSlots}`;
  if (floorValueCache.has(cacheKey)) return floorValueCache.get(cacheKey);

  const entries = Object.entries(floorPrices).map(([slots, price]) => [Number(slots), price]);
  let costs = new Map([[0, 0]]);
  for (let item = 0; item < count; item += 1) {
    const next = new Map();
    costs.forEach((cost, sum) => {
      entries.forEach(([slots, price]) => {
        const nextSum = sum + slots;
        if (nextSum > totalSlots) return;
        const nextCost = cost + price;
        if (!next.has(nextSum) || nextCost < next.get(nextSum)) next.set(nextSum, nextCost);
      });
    });
    costs = next;
  }

  const result = costs.get(totalSlots) ?? count * floorPrices[1];
  floorValueCache.set(cacheKey, result);
  return result;
}

function optionValue(option, color) {
  const pricePerItem = effectivePricePerItem(color);
  if (pricePerItem !== null && pricePerItem > 0) {
    return option.count * pricePerItem;
  }
  if (option.slots === null && color.pricePerSlot === 0) return 0;
  if (option.slots === null) return option.count * color.pricePerSlot;
  return option.slots * color.pricePerSlot;
}

function effectivePricePerItem(color) {
  return color.priceOverride ?? color.pricePerItem;
}

function optionEstimate(option, color) {
  if (color.totalValue !== null) return { floor: color.totalValue, cautious: color.totalValue, expected: color.totalValue };
  const knownValue = knownValueTotal(color);
  const knownCount = color.knownItemValues?.length ?? 0;
  const unknownCount = Math.max(0, option.count - knownCount);
  const pricePerItem = effectivePricePerItem(color);
  const expected = knownValue > 0
    ? knownValue + unknownCount * pricePerItem
    : optionValue(option, color);
  if (color.priceOverride !== null && knownValue === 0) return { floor: expected, cautious: expected, expected };
  const floor = minColorValueForSlots(color.key, option.count, option.slots);
  if (knownValue > 0) return { floor: Math.max(floor, knownValue), cautious: color.key === "red" ? Math.max(floor, knownValue) : expected, expected };
  const cautious = color.key === "red" ? floor : expected;
  return { floor, cautious, expected };
}

function readState() {
  const totalSlots = readNumber(els.totalSlots.value);
  const totalAvgSlots = readNumber(els.totalAvgSlots.value);
  const totalItems = Math.max(0, Math.floor(readNumber(els.totalItems.value) ?? 0));
  const totalSlotCandidates = totalSlots === null
    ? possibleTotalSlotsFromAverage(totalItems, totalAvgSlots)
    : null;
  return {
    totalItems,
    totalSlots: totalSlots === null ? null : Math.max(0, Math.floor(totalSlots)),
    totalSlotCandidates,
    totalAvgSlots,
    sampleCount: readNumber(els.sampleCount.value),
    sampleAvgValue: readMoney(els.sampleAvgValue.value),
    sampleTotalValue: readMoney(els.sampleTotalValue.value),
    sampleSlotCount: readNumber(els.sampleSlotCount.value),
    sampleAvgSlots: readNumber(els.sampleAvgSlots.value),
    sampleTotalSlots: readNumber(els.sampleTotalSlots.value),
    colors: colors.map((color) => ({
      ...color,
      priceOverride: readMoney(document.querySelector(`[data-field="priceOverride"][data-key="${color.key}"]`).value),
      totalValue: readMoney(document.querySelector(`[data-field="totalValue"][data-key="${color.key}"]`).value),
      count: readNumber(document.querySelector(`[data-field="count"][data-key="${color.key}"]`).value),
      minCount: readNumber(document.querySelector(`[data-field="minCount"][data-key="${color.key}"]`).value),
      knownItemSlots: parseNumberList(document.querySelector(`[data-field="knownItemSlots"][data-key="${color.key}"]`).value),
      knownItemValues: parseNumberList(document.querySelector(`[data-field="knownItemValues"][data-key="${color.key}"]`).value),
      slots: readNumber(document.querySelector(`[data-field="slots"][data-key="${color.key}"]`).value),
      avg: readNumber(document.querySelector(`[data-field="avg"][data-key="${color.key}"]`).value),
    })),
  };
}

function possibleSlotsForCount(color, count, state, options = {}) {
  const forSolver = options.forSolver ?? false;
  const knownSlots = color.slots === null ? null : Math.max(0, Math.floor(color.slots));
  const databaseSlots = possibleDatabaseSlotsForCount(color, count);
  if (databaseSlots.length === 0) return [];

  if (knownSlots !== null) {
    if (count === 0 && knownSlots !== 0) return [];
    if (!databaseSlots.includes(knownSlots)) return [];
    return [knownSlots];
  }

  if (count === 0) return color.avg === null ? [0] : [];

  if (state.totalSlots === null && color.avg === null && forSolver) {
    return [databaseSlots[0]];
  }

  const maxSlots = state.totalSlots ?? databaseSlots.at(-1);
  const boundedSlots = databaseSlots.filter((slot) => slot <= maxSlots);
  if (boundedSlots.length === 0) return [];
  const matchedSlots = boundedSlots.filter((slot) => matchesShownAverage(slot, count, color.avg));
  if (matchedSlots.length > 0 || color.avg === null) return matchedSlots;

  const bestError = Math.min(...boundedSlots.map((slot) => averageError(slot, count, color.avg)));
  return boundedSlots.filter((slot) => Math.abs(averageError(slot, count, color.avg) - bestError) < 0.000001);
}

function possibleOptions(color, state) {
  if (color.avg === 0 && color.count === null && color.slots === null) {
    return [{ count: 0, slots: 0, avgError: 0, value: 0 }];
  }

  const observedMinimum = Math.max(
    color.minCount === null ? 0 : Math.floor(color.minCount),
    color.knownItemSlots?.length ?? 0,
    color.knownItemValues?.length ?? 0,
  );
  const defaultMinimum = defaultMinimumFor(color);
  const minimumCount = Math.max(defaultMinimum, observedMinimum);
  if (color.count === null && state.totalItems < minimumCount) return [];
  const countCandidates = color.count === null
    ? Array.from({ length: state.totalItems - minimumCount + 1 }, (_, index) => index + minimumCount)
    : [Math.max(0, Math.floor(color.count))];
  const valueMatchedCounts = color.totalValue !== null && color.priceOverride !== null
    ? countCandidates.filter((count) => matchesShownValueAverage(color.totalValue, count, color.priceOverride))
    : countCandidates;
  const valueCountCandidates = valueMatchedCounts.length > 0 || color.totalValue === null || color.priceOverride === null
    ? valueMatchedCounts
    : countCandidates.filter((count) => {
      const bestError = Math.min(...countCandidates.map((candidate) => valueAverageError(color.totalValue, candidate, color.priceOverride)));
      return Math.abs(valueAverageError(color.totalValue, count, color.priceOverride) - bestError) < 0.000001;
    });

  const options = valueCountCandidates.flatMap((count) => {
    return possibleSlotsForCount(color, count, state, { forSolver: true }).map((slots) => ({
      count,
      slots,
      avgError: averageError(slots, count, color.avg),
      value: 0,
    }));
  });

  if (color.avg === null || options.length === 0) return options;

  const displayedMatches = options.filter((option) => {
    if (option.slots === null) return false;
    return matchesShownAverage(option.slots, option.count, color.avg);
  });
  if (displayedMatches.length > 0) return displayedMatches;

  const bestError = Math.min(...options.map((option) => option.avgError));
  return options.filter((option) => Math.abs(option.avgError - bestError) < 0.000001);
}

function possibleDisplaySlots(color, state, counts) {
  return uniqueSorted(counts.flatMap((count) => possibleSlotsForCount(color, count, state)));
}

function solve(state) {
  const solutions = [];
  let truncated = false;
  const optionSets = state.colors.map((color) => possibleOptions(color, state));
  const impossibleColor = optionSets.findIndex((options) => options.length === 0);

  if (impossibleColor >= 0) {
    return { solutions, truncated, impossibleColor };
  }

  const ordered = state.colors
    .map((color, index) => ({ color, index, options: optionSets[index] }))
    .sort((a, b) => a.options.length - b.options.length);
  const chosen = Array(state.colors.length);

  function walk(position, usedCount, usedSlots) {
    if (solutions.length >= MAX_SOLUTIONS) {
      truncated = true;
      return;
    }

    if (usedCount > state.totalItems) return;
    if (state.totalSlots !== null && usedSlots > state.totalSlots) return;
    if (state.totalSlotCandidates !== null && usedSlots > state.totalSlotCandidates.at(-1)) return;

    if (position === ordered.length) {
      if (usedCount !== state.totalItems) return;
      if (state.totalSlots !== null && usedSlots !== state.totalSlots) return;
      if (state.totalSlotCandidates !== null && !state.totalSlotCandidates.includes(usedSlots)) return;

      const byColor = {};
      chosen.forEach((option, index) => {
        const color = state.colors[index];
        byColor[color.key] = { ...option, ...optionEstimate(option, color) };
      });
      solutions.push({ totalCount: state.totalItems, totalSlots: usedSlots, byColor });
      return;
    }

    const entry = ordered[position];
    for (const option of entry.options) {
      chosen[entry.index] = option;
      walk(position + 1, usedCount + option.count, usedSlots + (option.slots ?? 0));
    }
  }

  walk(0, 0, 0);
  return { solutions, truncated, impossibleColor };
}

function summarizeByColor(solutions, key, field) {
  return uniqueSorted(solutions.map((solution) => solution.byColor[key][field]));
}

function solutionValue(solution) {
  const values = Object.values(solution.byColor).map((color) => color.expected);
  return values.every(Number.isFinite) ? values.reduce((sum, value) => sum + value, 0) : Number.NaN;
}

function solutionEstimate(solution) {
  const values = Object.values(solution.byColor);
  return {
    floor: values.reduce((sum, value) => sum + value.floor, 0),
    cautious: values.every((value) => Number.isFinite(value.cautious))
      ? values.reduce((sum, value) => sum + value.cautious, 0)
      : Number.NaN,
    expected: values.every((value) => Number.isFinite(value.expected))
      ? values.reduce((sum, value) => sum + value.expected, 0)
      : Number.NaN,
  };
}

function valueEstimate(value) {
  return Number.isFinite(value)
    ? { floor: value, cautious: value, expected: value }
    : { floor: 0, cautious: Number.NaN, expected: Number.NaN };
}

function colorByKey(state, key) {
  return state.colors.find((color) => color.key === key);
}

function quickCountRange(state, color) {
  const min = defaultMinimumFor(color);
  const otherMinimums = state.colors
    .filter((other) => other.key !== color.key)
    .reduce((sum, other) => sum + defaultMinimumFor(other), 0);
  return { min, max: Math.max(min, state.totalItems - otherMinimums) };
}

function quickTotalEstimate(state) {
  const minimums = state.colors.map((color) => ({ color, count: defaultMinimumFor(color) }));
  const baseFloor = minimums.reduce((sum, item) => {
    const price = floorPriceBySlots[item.color.key]?.[1] ?? item.color.pricePerItem;
    return sum + item.count * price;
  }, 0);
  const baseExpected = minimums.reduce((sum, item) => sum + item.count * effectivePricePerItem(item.color), 0);
  const remaining = Math.max(0, state.totalItems - minimums.reduce((sum, item) => sum + item.count, 0));
  const floorPrices = state.colors.map((color) => floorPriceBySlots[color.key]?.[1] ?? color.pricePerItem);
  const expectedPrices = state.colors.map((color) => effectivePricePerItem(color));
  const weightedExpectedPrice = weightedColorExpectedPrice(state.colors);
  return applySampleEstimate({
    floor: baseFloor + remaining * Math.min(...floorPrices),
    cautious: baseExpected + remaining * Math.min(...expectedPrices),
    expected: baseExpected + remaining * weightedExpectedPrice,
  }, state);
}

function weightedColorExpectedPrice(stateColors) {
  const weighted = stateColors.map((color) => {
    const price = effectivePricePerItem(color);
    return { price, weight: price > 0 ? 1 / price : 0 };
  });
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return 0;
  return weighted.reduce((sum, item) => sum + item.price * item.weight, 0) / totalWeight;
}

function probabilityKeysForSolutions(solutions) {
  if (solutions.length === 0) return [];
  const blueFixed = uniqueSorted(solutions.map((solution) => solution.byColor.blue.count)).length === 1;
  const greenFixed = uniqueSorted(solutions.map((solution) => solution.byColor.greenWhite.count)).length === 1;
  return blueFixed && greenFixed
    ? ["purple", "gold", "red"]
    : ["greenWhite", "blue", "purple", "gold", "red"];
}

function solutionWeights(solutions, keys, stateColors) {
  if (solutions.length === 0 || keys.length === 0) return [];
  const prices = Object.fromEntries(stateColors.map((color) => [color.key, effectivePricePerItem(color)]));
  const logWeights = solutions.map((solution) => {
    const total = keys.reduce((sum, key) => sum + solution.byColor[key].count, 0);
    const logCombinations = logFactorial(total) - keys.reduce((sum, key) => sum + logFactorial(solution.byColor[key].count), 0);
    const logColorWeights = keys.reduce((sum, key) => {
      const price = prices[key];
      const weight = price > 0 ? 1 / price : 0;
      return weight > 0 ? sum + solution.byColor[key].count * Math.log(weight) : Number.NEGATIVE_INFINITY;
    }, 0);
    return logCombinations + logColorWeights;
  });
  const maxLog = Math.max(...logWeights);
  const weights = logWeights.map((value) => Math.exp(value - maxLog));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  return totalWeight > 0 ? weights.map((value) => value / totalWeight) : solutions.map(() => 1 / solutions.length);
}

function logFactorial(value) {
  let result = 0;
  for (let index = 2; index <= value; index += 1) result += Math.log(index);
  return result;
}

function renderQuickState(state) {
  const ranges = Object.fromEntries(state.colors.map((color) => [color.key, quickCountRange(state, color)]));
  const totalValueHtml = summarizeEstimateRange([quickTotalEstimate(state)]);

  els.totalValue.innerHTML = totalValueHtml;
  els.redCounts.textContent = formatRange([ranges.red.min, ranges.red.max]);
  els.redNote.textContent = "输入任意颜色线索后开始精确推算。";
  els.confidenceBadge.textContent = "快速估算";
  els.redFormulas.innerHTML = `
    <article class="solution-card">
      <div class="solution-top">
        <strong class="formula-line">
          <span class="formula-chip" style="--color: #cc3f32">红色</span>
          <span>= ${state.totalItems}</span>
          ${state.colors.filter((color) => color.key !== "red").map((color) => (
            `<span class="formula-minus">-</span><span class="formula-chip" style="--color: ${color.color}">${color.name}<small>${formatCompactRange([ranges[color.key].min, ranges[color.key].max])}</small></span>`
          )).join("")}
        </strong>
        <span>${totalValueHtml}</span>
      </div>
    </article>
  `;

  state.colors.forEach((color) => {
    const range = ranges[color.key];
    const slotValues = possibleDisplaySlots(color, state, [range.min, range.max]);
    setRowResolved(color.key, color.totalValue !== null || range.min === range.max);
    document.querySelector(`[data-count-for="${color.key}"]`).textContent = formatRange([range.min, range.max]);
    document.querySelector(`[data-slots-for="${color.key}"]`).textContent = slotValues.length ? formatRange(slotValues) : "未知";
    document.querySelector(`[data-total-value-for="${color.key}"]`).innerHTML = summarizeColorEstimateRange([{
      floor: range.min * (floorPriceBySlots[color.key]?.[1] ?? color.pricePerItem),
      cautious: range.max * effectivePricePerItem(color),
      expected: range.max * effectivePricePerItem(color),
    }], color);
  });

  els.warning.textContent = state.totalItems <= 0 ? "请先输入总件数。" : "";
}

function renderRows() {
  els.colorRows.innerHTML = colors.map((color) => `
    <tr>
      <td>
        <span class="color-name" style="--color: ${color.color}">
          <span class="swatch"></span>${color.name}
        </span>
      </td>
      <td class="price-cell"><input data-field="priceOverride" data-key="${color.key}" type="text" value="" placeholder="${formatMoney(color.pricePerItem)}"></td>
      <td class="price-cell"><input data-field="totalValue" data-key="${color.key}" type="text" value="" placeholder="未知"></td>
      <td><input data-field="slots" data-key="${color.key}" type="number" min="0" step="1" value="${color.slots}" placeholder="未知"></td>
      <td><input data-field="avg" data-key="${color.key}" type="number" min="0" step="0.01" value="${color.avg}" placeholder="未知"></td>
      <td><input data-field="count" data-key="${color.key}" type="number" min="0" step="1" value="${color.count}" placeholder="未知"></td>
      <td class="value-cell" data-count-for="${color.key}">无</td>
      <td class="value-cell" data-slots-for="${color.key}">无</td>
      <td class="value-cell" data-total-value-for="${color.key}">未知</td>
    </tr>
    <tr class="detail-row" data-detail-for="${color.key}">
      <td></td>
      <td colspan="8">
        <div class="inline-fields compact-detail">
          <span>至少</span>
          <input data-field="minCount" data-key="${color.key}" type="number" min="0" step="1" placeholder="未知">
          <span>件：</span>
          <input data-field="knownItemSlots" data-key="${color.key}" type="text" placeholder="单件格数 例：5 6 2 1">
          <input data-field="knownItemValues" data-key="${color.key}" type="text" placeholder="已知价值 例：52000 89000">
        </div>
      </td>
    </tr>
  `).join("");
}

function formulaRows(state, solutions, probabilities = null) {
  if (solutions.length === 0) return [];

  const countSets = Object.fromEntries(
    state.colors.map((color) => [color.key, summarizeByColor(solutions, color.key, "count")]),
  );
  const nonRedColors = state.colors.filter((color) => color.key !== "red");
  const fixedKeys = nonRedColors
    .filter((color) => countSets[color.key].length === 1)
    .map((color) => color.key);
  const branchKeys = nonRedColors
    .filter((color) => countSets[color.key].length > 1 && countSets[color.key].length <= 6 && !isContiguous(countSets[color.key]))
    .map((color) => color.key);
  const variableKeys = nonRedColors
    .filter((color) => countSets[color.key].length > 1 && !branchKeys.includes(color.key))
    .map((color) => color.key);
  const fixedSubtract = fixedKeys.reduce((sum, colorKey) => sum + countSets[colorKey][0], 0);
  const groups = new Map();

  solutions.forEach((solution, index) => {
    const key = branchKeys.map((colorKey) => `${colorKey}:${solution.byColor[colorKey].count}`).join("|");
    const current = groups.get(key) ?? {
      branchCounts: Object.fromEntries(branchKeys.map((colorKey) => [colorKey, solution.byColor[colorKey].count])),
      redCounts: [],
      totalValues: [],
      weights: [],
      probability: 0,
    };
    current.redCounts.push(solution.byColor.red.count);
    current.totalValues.push(applySampleEstimate(solutionEstimate(solution), state));
    if (probabilities !== null) {
      const weight = probabilities[index] ?? 0;
      current.weights.push(weight);
      current.probability += weight;
    }
    groups.set(key, current);
  });

  return [...groups.values()]
    .map((group) => {
      const branchSubtract = Object.values(group.branchCounts).reduce((sum, count) => sum + count, 0);
      const remaining = state.totalItems - fixedSubtract - branchSubtract;
      const variableText = variableKeys.map((colorKey) => colorByKey(state, colorKey).name).join(" - ");
      const variableChips = variableKeys.map((colorKey) => {
        const color = colorByKey(state, colorKey);
        const rangeText = formatCompactRange(countSets[colorKey]);
        return `<span class="formula-chip" style="--color: ${color.color}">${color.name}<small>${rangeText}</small></span>`;
      }).join('<span class="formula-minus">-</span>');
      const redChip = '<span class="formula-chip" style="--color: #cc3f32">红色</span>';
      const expression = variableChips
        ? `${redChip}<span>= ${remaining}</span><span class="formula-minus">-</span>${variableChips}`
        : `${redChip}<span>= ${remaining}</span>`;
      const context = [
        ...fixedKeys
          .filter((colorKey) => countSets[colorKey][0] > 0)
          .map((colorKey) => [colorKey, countSets[colorKey][0]]),
        ...Object.entries(group.branchCounts).filter(([, count]) => count > 0),
      ]
        .map((colorKey) => {
          const [key, count] = colorKey;
          const color = colorByKey(state, key);
          return `<span class="chip" style="--color: ${color.color}">${color.name} ${count}件</span>`;
        })
        .join("");

      return {
        expression,
        context,
        redText: formatSet(group.redCounts),
        redMax: Math.max(...group.redCounts),
        valueText: summarizeEstimateRange(group.totalValues, normalizedWeights(group.weights)),
        probability: group.probability,
      };
    })
    .sort((a, b) => a.redMax - b.redMax)
    .slice(0, 12);
}

function renderRedFormulas(state, result, probabilities = null) {
  const rows = formulaRows(state, result.solutions, probabilities);
  const showProbability = probabilities !== null && rows.length <= 6;
  els.redFormulas.innerHTML = rows.map((row) => `
    <article class="solution-card">
      <div class="solution-top">
          <strong class="formula-line">${row.expression}</strong>
        <span class="solution-metrics">
          ${showProbability ? `<span class="probability-pill">可能性 ${Math.round(row.probability * 100)}%</span>` : ""}
          ${row.valueText}
        </span>
      </div>
      <div class="chips">
        <span class="chip red-chip">红色 ${row.redText}件</span>
        ${row.context}
      </div>
    </article>
  `).join("");
}

function render() {
  const state = readState();
  if (!hasDetailedClues(state)) {
    renderQuickState(state);
    return;
  }

  const result = solve(state);
  const redCounts = summarizeByColor(result.solutions, "red", "count");
  const redSlots = summarizeByColor(result.solutions, "red", "slots");
  const solutionEstimates = result.solutions.map((solution) => applySampleEstimate(solutionEstimate(solution), state));
  const probabilityKeys = probabilityKeysForSolutions(result.solutions);
  const probabilities = solutionWeights(result.solutions, probabilityKeys, state.colors);

  els.totalValue.innerHTML = summarizeEstimateRange(solutionEstimates, probabilities.length ? probabilities : null);
  els.redCounts.textContent = formatSet(redCounts);
  els.redNote.textContent = redCounts.length ? `红色格数可能为：${formatRange(redSlots.filter((value) => value !== null))}` : "当前线索下没有可行红色件数。";
  els.confidenceBadge.textContent = result.solutions.length
    ? `${result.truncated ? `${result.solutions.length}+` : formatter.format(result.solutions.length)} 个方案`
    : "无方案";

  state.colors.forEach((color) => {
    const colorEstimates = result.solutions.map((solution) => solution.byColor[color.key]);
    const possibleCounts = summarizeByColor(result.solutions, color.key, "count");
    setRowResolved(color.key, color.totalValue !== null || possibleCounts.length === 1);
    document.querySelector(`[data-count-for="${color.key}"]`).textContent = formatLimitedSet(summarizeByColor(result.solutions, color.key, "count"));
    const slotValues = possibleDisplaySlots(color, state, possibleCounts).filter((value) => value !== null);
    document.querySelector(`[data-slots-for="${color.key}"]`).textContent = slotValues.length ? formatRange(slotValues) : "未知";
    document.querySelector(`[data-total-value-for="${color.key}"]`).innerHTML = summarizeColorEstimateRange(colorEstimates, color);
  });

  renderRedFormulas(state, result, probabilities.length ? probabilities : null);

  const warnings = [];
  if (state.totalItems <= 0) warnings.push("请先输入总件数。");
  if (result.impossibleColor >= 0) warnings.push(`${state.colors[result.impossibleColor].name} 缺少可用于推算的候选，请检查件数、格数或数据库合法格数约束。`);
  if (result.truncated) warnings.push(`方案较多，当前只计算前 ${MAX_SOLUTIONS} 个；补充颜色件数、格数或均格数可以收窄。`);
  if (state.totalItems > 0 && result.impossibleColor < 0 && result.solutions.length === 0) warnings.push("已知件数之和或总格数约束不匹配，请复核输入。");
  els.warning.textContent = warnings.join(" ");
}

function setRowResolved(colorKey, resolved) {
  const detailRow = document.querySelector(`[data-detail-for="${colorKey}"]`);
  const row = detailRow?.previousElementSibling;
  row?.classList.toggle("resolved-row", resolved);
  detailRow?.classList.toggle("resolved-row", resolved);
}

function reset() {
  colors.splice(0, colors.length, ...structuredClone(defaults));
  els.totalItems.value = "27";
  els.totalSlots.value = "";
  els.totalAvgSlots.value = "";
  els.sampleCount.value = "";
  els.sampleAvgValue.value = "";
  els.sampleTotalValue.value = "";
  els.sampleSlotCount.value = "";
  els.sampleAvgSlots.value = "";
  els.sampleTotalSlots.value = "";
  renderRows();
  bindInputs();
  render();
}

function bindInputs() {
  document.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", render);
  });
}

renderRows();
bindInputs();
render();
els.resetButton.addEventListener("click", reset);
