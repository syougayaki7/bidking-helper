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
const slotSumCache = new Map();

const els = {
  totalItems: document.querySelector("#totalItems"),
  totalSlots: document.querySelector("#totalSlots"),
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

function parseNumberList(value) {
  if (isBlank(value)) return [];
  return String(value)
    .split(/[\s,，;；、]+/)
    .map((part) => Number(part))
    .filter((number) => Number.isFinite(number) && number > 0)
    .map((number) => Math.floor(number));
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function floor2(value) {
  return Math.floor((value + Number.EPSILON) * 100) / 100;
}

function matchesShownAverage(slots, count, shownAverage) {
  if (shownAverage === null) return true;
  if (count <= 0) return false;
  const actualAverage = slots / count;
  const shown = round2(shownAverage);
  return floor2(actualAverage) === shown;
}

function averageError(slots, count, shownAverage) {
  if (shownAverage === null || slots === null) return 0;
  if (count <= 0) return Number.POSITIVE_INFINITY;
  return Math.abs(slots / count - shownAverage);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function formatSet(values, limit = 8) {
  const sorted = uniqueSorted(values);
  if (sorted.length === 0) return "无";
  const contiguous = sorted.every((value, index) => index === 0 || value === sorted[index - 1] + 1);
  if (sorted.length > 2 && contiguous) return `${sorted[0]} - ${sorted.at(-1)}`;
  if (sorted.length <= limit) return sorted.join(" 或 ");
  return `${sorted.slice(0, limit).join(" / ")} ...`;
}

function formatLimitedSet(values, limit = 4) {
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

function summarizeValueRange(values) {
  const known = values.filter(Number.isFinite);
  if (known.length === 0) return "未知";
  const min = Math.min(...known);
  const max = Math.max(...known);
  return min === max ? formatMoney(min) : `${formatMoney(min)} - ${formatMoney(max)}`;
}

function summarizeEstimateRange(estimates) {
  if (estimates.length === 0) return "未知";
  const low = Math.min(...estimates.map((estimate) => estimate.min));
  const finiteMaxes = estimates.map((estimate) => estimate.max).filter(Number.isFinite);
  if (finiteMaxes.length !== estimates.length) return `${formatMoney(low)}+`;
  const high = Math.max(...finiteMaxes);
  return low === high ? formatMoney(low) : `${formatMoney(low)} - ${formatMoney(high)}`;
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
      || color.knownItemSlots.length > 0;
  });
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

function optionValue(option, color) {
  if (color.pricePerItem !== null && color.pricePerItem > 0) {
    return option.count * color.pricePerItem;
  }
  if (option.slots === null && color.pricePerSlot === 0) return 0;
  if (option.slots === null) return option.count * color.pricePerSlot;
  return option.slots * color.pricePerSlot;
}

function readState() {
  const totalSlots = readNumber(els.totalSlots.value);
  return {
    totalItems: Math.max(0, Math.floor(readNumber(els.totalItems.value) ?? 0)),
    totalSlots: totalSlots === null ? null : Math.max(0, Math.floor(totalSlots)),
    colors: colors.map((color) => ({
      ...color,
      count: readNumber(document.querySelector(`[data-field="count"][data-key="${color.key}"]`).value),
      minCount: readNumber(document.querySelector(`[data-field="minCount"][data-key="${color.key}"]`).value),
      knownItemSlots: parseNumberList(document.querySelector(`[data-field="knownItemSlots"][data-key="${color.key}"]`).value),
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
  const observedMinimum = Math.max(
    color.minCount === null ? 0 : Math.floor(color.minCount),
    color.knownItemSlots?.length ?? 0,
  );
  const defaultMinimum = defaultMinimumFor(color);
  const minimumCount = Math.max(defaultMinimum, observedMinimum);
  if (color.count === null && state.totalItems < minimumCount) return [];
  const countCandidates = color.count === null
    ? Array.from({ length: state.totalItems - minimumCount + 1 }, (_, index) => index + minimumCount)
    : [Math.max(0, Math.floor(color.count))];

  const options = countCandidates.flatMap((count) => {
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

    if (position === ordered.length) {
      if (usedCount !== state.totalItems) return;
      if (state.totalSlots !== null && usedSlots !== state.totalSlots) return;

      const byColor = {};
      chosen.forEach((option, index) => {
        const color = state.colors[index];
        byColor[color.key] = { ...option, value: optionValue(option, color) };
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
  const values = Object.values(solution.byColor).map((color) => color.value);
  return values.every(Number.isFinite) ? values.reduce((sum, value) => sum + value, 0) : Number.NaN;
}

function solutionEstimate(solution) {
  const values = Object.values(solution.byColor).map((color) => color.value);
  const known = values.filter(Number.isFinite);
  const min = known.reduce((sum, value) => sum + value, 0);
  const max = known.length === values.length ? min : Number.NaN;
  return { min, max };
}

function valueEstimate(value) {
  return Number.isFinite(value) ? { min: value, max: value } : { min: 0, max: Number.NaN };
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
  const base = minimums.reduce((sum, item) => sum + item.count * item.color.pricePerItem, 0);
  const remaining = Math.max(0, state.totalItems - minimums.reduce((sum, item) => sum + item.count, 0));
  const prices = state.colors.map((color) => color.pricePerItem);
  return {
    min: base + remaining * Math.min(...prices),
    max: base + remaining * Math.max(...prices),
  };
}

function renderQuickState(state) {
  const ranges = Object.fromEntries(state.colors.map((color) => [color.key, quickCountRange(state, color)]));

  els.totalValue.textContent = summarizeEstimateRange([quickTotalEstimate(state)]);
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
        <span>${els.totalValue.textContent}</span>
      </div>
    </article>
  `;

  state.colors.forEach((color) => {
    const range = ranges[color.key];
    const slotValues = possibleDisplaySlots(color, state, [range.min, range.max]);
    document.querySelector(`[data-count-for="${color.key}"]`).textContent = formatRange([range.min, range.max]);
    document.querySelector(`[data-slots-for="${color.key}"]`).textContent = slotValues.length ? formatRange(slotValues) : "未知";
    document.querySelector(`[data-total-value-for="${color.key}"]`).textContent = summarizeEstimateRange([{
      min: range.min * color.pricePerItem,
      max: range.max * color.pricePerItem,
    }]);
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
      <td><input data-field="slots" data-key="${color.key}" type="number" min="0" step="1" value="${color.slots}" placeholder="未知"></td>
      <td><input data-field="avg" data-key="${color.key}" type="number" min="0" step="0.01" value="${color.avg}" placeholder="未知"></td>
      <td><input data-field="count" data-key="${color.key}" type="number" min="0" step="1" value="${color.count}" placeholder="未知"></td>
      <td class="value-cell" data-count-for="${color.key}">无</td>
      <td class="value-cell" data-slots-for="${color.key}">无</td>
      <td class="value-cell" data-total-value-for="${color.key}">未知</td>
    </tr>
    <tr class="detail-row">
      <td></td>
      <td colspan="6">
        <div class="inline-fields compact-detail">
          <span>至少</span>
          <input data-field="minCount" data-key="${color.key}" type="number" min="0" step="1" placeholder="未知">
          <span>件：</span>
          <input data-field="knownItemSlots" data-key="${color.key}" type="text" placeholder="单件格数 例：5 6 2 1">
        </div>
      </td>
    </tr>
  `).join("");
}

function formulaRows(state, solutions) {
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

  solutions.forEach((solution) => {
    const key = branchKeys.map((colorKey) => `${colorKey}:${solution.byColor[colorKey].count}`).join("|");
    const current = groups.get(key) ?? {
      branchCounts: Object.fromEntries(branchKeys.map((colorKey) => [colorKey, solution.byColor[colorKey].count])),
      redCounts: [],
      totalValues: [],
    };
    current.redCounts.push(solution.byColor.red.count);
    current.totalValues.push(solutionEstimate(solution));
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
        valueText: summarizeEstimateRange(group.totalValues),
      };
    })
    .sort((a, b) => b.redMax - a.redMax)
    .slice(0, 12);
}

function renderRedFormulas(state, result) {
  const rows = formulaRows(state, result.solutions);
  els.redFormulas.innerHTML = rows.map((row) => `
    <article class="solution-card">
      <div class="solution-top">
          <strong class="formula-line">${row.expression}</strong>
        <span>${row.valueText}</span>
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
  const solutionEstimates = result.solutions.map(solutionEstimate);

  els.totalValue.textContent = summarizeEstimateRange(solutionEstimates);
  els.redCounts.textContent = formatLimitedSet(redCounts);
  els.redNote.textContent = redCounts.length ? `红色格数可能为：${formatRange(redSlots.filter((value) => value !== null))}` : "当前线索下没有可行红色件数。";
  els.confidenceBadge.textContent = result.solutions.length
    ? `${result.truncated ? `${result.solutions.length}+` : formatter.format(result.solutions.length)} 个方案`
    : "无方案";

  state.colors.forEach((color) => {
    const colorValues = result.solutions.map((solution) => solution.byColor[color.key].value);
    const possibleCounts = summarizeByColor(result.solutions, color.key, "count");
    document.querySelector(`[data-count-for="${color.key}"]`).textContent = formatLimitedSet(summarizeByColor(result.solutions, color.key, "count"));
    const slotValues = possibleDisplaySlots(color, state, possibleCounts).filter((value) => value !== null);
    document.querySelector(`[data-slots-for="${color.key}"]`).textContent = slotValues.length ? formatRange(slotValues) : "未知";
    document.querySelector(`[data-total-value-for="${color.key}"]`).textContent = summarizeEstimateRange(colorValues.map(valueEstimate));
  });

  renderRedFormulas(state, result);

  const warnings = [];
  if (state.totalItems <= 0) warnings.push("请先输入总件数。");
  if (result.impossibleColor >= 0) warnings.push(`${state.colors[result.impossibleColor].name} 缺少可用于推算的候选，请检查件数、格数或数据库合法格数约束。`);
  if (result.truncated) warnings.push(`方案较多，当前只计算前 ${MAX_SOLUTIONS} 个；补充颜色件数、格数或均格数可以收窄。`);
  if (state.totalItems > 0 && result.impossibleColor < 0 && result.solutions.length === 0) warnings.push("已知件数之和或总格数约束不匹配，请复核输入。");
  els.warning.textContent = warnings.join(" ");
}

function reset() {
  colors.splice(0, colors.length, ...structuredClone(defaults));
  els.totalItems.value = "27";
  els.totalSlots.value = "";
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
