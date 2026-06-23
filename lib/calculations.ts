import type { AirflowTest, EfficiencyPoint, EfficiencyTest, ParticleSet, PhasePair, PowerRow } from "./types";

const numberOrNull = (value: string): number | null => {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const rounded = (value: number, digits = 2) => Number(value.toFixed(digits));
export const formatEfficiency = (value:number|string|null|undefined) => typeof value === "number" ? (value === 100 ? "≥99.99" : value.toFixed(2)) : (value ?? "");

export function airflowAverage(row: AirflowTest): { calculated: number | null; value: number | null; overridden: boolean } {
  const points = row.positions.map(numberOrNull).filter((v): v is number => v !== null);
  const calculated = points.length ? rounded(points.reduce((a, b) => a + b, 0) / points.length) : null;
  const override = numberOrNull(row.averageOverride);
  return { calculated, value: override ?? calculated, overridden: override !== null };
}

export function efficiency(before: string, after: string, override: string): { calculated:number|null; value:number|string|null; overridden:boolean } {
  const b = numberOrNull(before); const a = numberOrNull(after); const o = numberOrNull(override);
  const calculated = b !== null && b !== 0 && a !== null ? rounded(((b - a) / b) * 100) : null;
  const manual = override.trim();
  const automatic = b === 0 ? "/" : calculated;
  return { calculated, value: manual ? (o ?? manual) : automatic, overridden: Boolean(manual) };
}

export function efficiencyValues(row: EfficiencyPoint): Record<keyof ParticleSet, ReturnType<typeof efficiency>> {
  return {
    pm25: efficiency(row.before.pm25, row.after.pm25, row.overrides.pm25),
    p05: efficiency(row.before.p05, row.after.p05, row.overrides.p05),
    p5: efficiency(row.before.p5, row.after.p5, row.overrides.p5),
  };
}

export function powerValues(row: PowerRow, meterIncludesFilter: boolean) {
  const prev = numberOrNull(row.previousMeter); const current = numberOrNull(row.currentMeter);
  const runtime = numberOrNull(row.runtimeHours); const filterPower = numberOrNull(row.filterPower) ?? 0;
  const metered = prev !== null && current !== null ? current - prev : null;
  const calculatedTotal = metered === null ? null : rounded(metered + (meterIncludesFilter ? 0 : filterPower * (runtime ?? 0)));
  const totalOverride = numberOrNull(row.totalOverride);
  const total = totalOverride ?? calculatedTotal;
  const calculatedHourly = total !== null && runtime !== null && runtime > 0 ? rounded(total / runtime, 3) : null;
  const hourlyOverride = numberOrNull(row.hourlyOverride);
  return {
    metered: metered === null ? null : rounded(metered), calculatedTotal, total: totalOverride ?? calculatedTotal,
    calculatedHourly, hourly: hourlyOverride ?? calculatedHourly,
    totalOverridden: totalOverride !== null, hourlyOverridden: hourlyOverride !== null,
  };
}

export function averageEfficiency(test: EfficiencyTest, key: keyof ParticleSet): number|string|null {
  const override = test.averageOverrides[key].trim();
  if (override) return numberOrNull(override) ?? override;
  const values = test.points.map((point) => efficiencyValues(point)[key].value);
  if (values.some((value)=>value === "/")) return "/";
  const numeric = values.filter((value):value is number=>typeof value === "number");
  if (numeric.length === test.points.length) return rounded(numeric.reduce((a,b)=>a+b,0)/numeric.length);
  const text = values.filter((value):value is string=>typeof value === "string");
  return text.length === test.points.length && text.every((value)=>value === text[0]) ? text[0] : null;
}

const percentChange = (before: number | null, after: number | null, digits = 2): number | null =>
  before !== null && before !== 0 && after !== null ? rounded(((after - before) / before) * 100, digits) : null;

const numericEfficiency = (test: EfficiencyTest, key: keyof ParticleSet): number | null => {
  const result = averageEfficiency(test, key);
  return typeof result === "number" ? result : null;
};

export function averageHourlyPower(rows: PowerRow[], meterIncludesFilter: boolean): number | null {
  const values = rows.map((row) => powerValues(row, meterIncludesFilter).hourly)
    .filter((v): v is number => v !== null);
  return values.length ? rounded(values.reduce((sum, v) => sum + v, 0) / values.length, 3) : null;
}

export interface ConclusionMetrics {
  airflowIncrease: number | null;
  efficiencyGain: Record<keyof ParticleSet, number | null>;
  hourlySavingPercent: number | null;
  tenYearSavingKwh: number | null;
}

export interface ConclusionInput {
  airflow: PhasePair<AirflowTest>; efficiency: PhasePair<EfficiencyTest>;
  power: PhasePair<PowerRow[]>; meterIncludesFilter: boolean;
}

/** 10-year saving assumes continuous operation: 24 hours x 365 days x 10 years. */
export function conclusionMetrics(data: ConclusionInput): ConclusionMetrics {
  const airflowBefore = airflowAverage(data.airflow.before).value;
  const airflowAfter = airflowAverage(data.airflow.after).value;
  const powerBefore = averageHourlyPower(data.power.before, data.meterIncludesFilter);
  const powerAfter = averageHourlyPower(data.power.after, data.meterIncludesFilter);
  const hourlyChange = percentChange(powerBefore, powerAfter);
  const efficiencyGain = (Object.keys(data.efficiency.before.points[0].before) as (keyof ParticleSet)[])
    .reduce((result, key) => {
      const before = numericEfficiency(data.efficiency.before, key);
      const after = numericEfficiency(data.efficiency.after, key);
      result[key] = before !== null && after !== null ? rounded(after - before, 2) : null;
      return result;
    }, {} as Record<keyof ParticleSet, number | null>);
  return {
    airflowIncrease: percentChange(airflowBefore, airflowAfter),
    efficiencyGain,
    hourlySavingPercent: hourlyChange === null ? null : rounded(-hourlyChange, 2),
    tenYearSavingKwh: powerBefore !== null && powerAfter !== null
      ? rounded((powerBefore - powerAfter) * 24 * 365 * 10, 2) : null,
  };
}

export function conclusionFormulaLines(data: ConclusionInput, metrics = conclusionMetrics(data)): string[] {
  const fmt = (value:number|null, digits=3) => value === null ? null : value.toFixed(digits).replace(/\.0+$|(?<=\.[0-9]*?)0+$/g, "");
  const percent = (value:number|null) => value === null ? null : `${value.toFixed(2)}%`;
  const unavailable = "公式：数据不足，无法计算";
  const airflowBefore = airflowAverage(data.airflow.before).value;
  const airflowAfter = airflowAverage(data.airflow.after).value;
  const efficiencyBefore = (["pm25","p05","p5"] as const).map((key) => numericEfficiency(data.efficiency.before, key));
  const efficiencyAfter = (["pm25","p05","p5"] as const).map((key) => numericEfficiency(data.efficiency.after, key));
  const powerBefore = averageHourlyPower(data.power.before, data.meterIncludesFilter);
  const powerAfter = averageHourlyPower(data.power.after, data.meterIncludesFilter);
  const airflowValues = [fmt(airflowAfter), fmt(airflowBefore), percent(metrics.airflowIncrease)];
  const efficiencyLines = efficiencyBefore.map((before, index) => {
    const values = [fmt(efficiencyAfter[index]), fmt(before), percent(metrics.efficiencyGain[["pm25","p05","p5"][index] as keyof ParticleSet])];
    return values.every((value): value is string => value !== null) ? `公式：${values[0]}-${values[1]}=${values[2]}` : unavailable;
  });
  const savingValues = [fmt(powerBefore), fmt(powerAfter), percent(metrics.hourlySavingPercent)];
  const tenYearValues = [fmt(powerBefore), fmt(powerAfter), metrics.tenYearSavingKwh === null ? null : `${metrics.tenYearSavingKwh.toFixed(2)} kWh`];
  return [
    airflowValues.every((value): value is string => value !== null) ? `公式：(${airflowValues[0]}-${airflowValues[1]})/${airflowValues[1]}×100%=${airflowValues[2]}` : unavailable,
    ...efficiencyLines,
    savingValues.every((value): value is string => value !== null) ? `公式：(${savingValues[0]}-${savingValues[1]})/${savingValues[0]}×100%=${savingValues[2]}` : unavailable,
    tenYearValues.every((value): value is string => value !== null) ? `公式：(${tenYearValues[0]}-${tenYearValues[1]})×24×365×10=${tenYearValues[2]}` : unavailable,
  ];
}

export function validateReport(data: { airflow: PhasePair<AirflowTest>; efficiency: PhasePair<EfficiencyTest>; power: PhasePair<PowerRow[]>; meterIncludesFilter: boolean }) {
  const warnings: string[] = [];
  (["before","after"] as const).forEach((phase)=>data.airflow[phase].positions.forEach((v, i) => { if (numberOrNull(v) !== null && Number(v) < 0) warnings.push(`风速${phase === "before" ? "改造前" : "改造后"}测点${i + 1}存在负数`); }));
  (["before","after"] as const).forEach((phase)=>data.efficiency[phase].points.forEach((row, i) => {
    (Object.keys(row.before) as (keyof ParticleSet)[]).forEach((key) => {
      const before = numberOrNull(row.before[key]); const after = numberOrNull(row.after[key]);
      if (before !== null && after !== null && after > before) warnings.push(`净化效率第${i + 1}行过滤后数值高于过滤前`);
      const value = efficiency(row.before[key], row.after[key], row.overrides[key]).value;
      if (typeof value === "number" && (value < 0 || value > 100)) warnings.push(`净化效率测点${i + 1}结果超出0%–100%`);
    });
  }));
  (["before","after"] as const).forEach((phase)=>data.power[phase].forEach((row, i) => {
    const prev = numberOrNull(row.previousMeter); const current = numberOrNull(row.currentMeter);
    if (prev !== null && current !== null && current < prev) warnings.push(`用电量${phase === "before" ? "改造前" : "改造后"}第${i + 1}行本次电表数小于上次电表数`);
    if (numberOrNull(row.runtimeHours) === 0) warnings.push(`用电量${phase === "before" ? "改造前" : "改造后"}第${i + 1}行运行时长为0`);
  }));
  return [...new Set(warnings)];
}
