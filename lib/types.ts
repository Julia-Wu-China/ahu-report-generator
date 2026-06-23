export const PHOTO_SLOTS = [
  "exterior", "interior", "unit", "filterPre", "renovation", "filterPost",
  "testPre", "testPost", "particlePre", "particlePost", "powerPre", "powerPost",
] as const;
export type PhotoSlotKey = (typeof PHOTO_SLOTS)[number];
export const SLOT_MAX: Record<PhotoSlotKey, number> = {
  exterior:1, interior:1, unit:4, filterPre:4, renovation:1, filterPost:4,
  testPre:4, testPost:4, particlePre:4, particlePost:4, powerPre:4, powerPost:4,
};
const SLOT_MIGRATION: Record<string, PhotoSlotKey> = {
  installation: "filterPre", airflow: "testPre",
  particleBefore: "particlePre", particleAfter: "particlePost", power: "powerPre",
};

export interface Crop { x: number; y: number; zoom: number }
export interface Photo {
  id: string; slot: PhotoSlotKey; url: string; filename: string;
  crop: Crop; width: number; height: number;
}
export interface AirflowTest {
  date: string; positions: [string, string, string, string]; averageOverride: string;
}
export interface ParticleSet { pm25: string; p05: string; p5: string }
export interface EfficiencyPoint {
  before: ParticleSet; after: ParticleSet;
  overrides: ParticleSet;
}
export interface EfficiencyTest {
  date: string; points: [EfficiencyPoint, EfficiencyPoint, EfficiencyPoint, EfficiencyPoint];
  averageOverrides: ParticleSet;
}
export interface PhasePair<T> { before: T; after: T }
export interface BasicPhase { testDate:string; productName:string; modelQuantity:string }
export interface PowerRow {
  date: string; previousMeter: string; currentMeter: string; runtimeHours: string;
  fanPower: string; filterPower: string; totalOverride: string; hourlyOverride: string; note: string;
}
export function emptyPowerRow(): PowerRow {
  return { date: "", previousMeter: "", currentMeter: "", runtimeHours: "", fanPower: "", filterPower: "", totalOverride: "", hourlyOverride: "", note: "" };
}
export interface ReportData {
  projectName: string; testType: "调试测试" | "验证测试"; standard: string;
  testDate: string; testers: string; productName: string; modelQuantity: string;
  basic: PhasePair<BasicPhase>;
  meterIncludesFilter: boolean; customerOpinion: "符合要求" | "其他"; otherOpinion: string;
  airflow: PhasePair<AirflowTest>; efficiency: PhasePair<EfficiencyTest>; power: PhasePair<PowerRow[]>; photos: Photo[];
}
export interface ReportRecord {
  id: string; reportNumber: string | null; data: ReportData;
  createdAt: string; updatedAt: string;
}
export interface ReportVersion { version: number; createdAt: string; reportNumber: string; downloadUrl: string; type?: "pdf" | "word" }

export function emptyReport(): ReportData {
  const today = chinaDate();
  const yesterday = chinaDate(-1);
  const emptyAirflow = (date:string): AirflowTest => ({ date, positions: ["", "", "", ""], averageOverride: "" });
  const emptyEfficiency = (date:string): EfficiencyTest => ({
    date,
    points: Array.from({ length: 4 }, () => ({
      before: { pm25: "", p05: "", p5: "" }, after: { pm25: "", p05: "", p5: "" },
      overrides: { pm25: "", p05: "", p5: "" },
    })) as EfficiencyTest["points"],
    averageOverrides: { pm25: "", p05: "", p5: "" },
  });
  return {
    projectName: "", testType: "调试测试", standard: "参考GB/T 34012-2017",
    testDate: today, testers: "", productName: "", modelQuantity: "",
    basic: {
      before: { testDate:yesterday, productName:"如：组合式空调机组（安装介质过滤器）", modelQuantity:"如：G4等级*6个" },
      after: { testDate:today, productName:"如：组合式空调机组（安装超微过滤器）", modelQuantity:"如：FAH01P-Q*3个、FAH03P-Q*2个" },
    },
    meterIncludesFilter: true, customerOpinion: "符合要求", otherOpinion: "",
    airflow: { before: emptyAirflow(yesterday), after: emptyAirflow(today) },
    efficiency: { before: emptyEfficiency(yesterday), after: emptyEfficiency(today) },
    power: { before: [emptyPowerRow()], after: [emptyPowerRow()] },
    photos: [],
  };
}

export function normalizeReportData(input: ReportData | (Omit<ReportData, "airflow"|"power"> & { airflow: unknown; power: unknown })): ReportData {
  const data = structuredClone(input) as ReportData & { airflow: unknown; power: unknown };
  const fallbackDate = data.testDate || chinaDate();
  data.basic ??= {
    before: { testDate:fallbackDate, productName:"如：组合式空调机组（安装介质过滤器）", modelQuantity:data.modelQuantity || "如：G4等级*6个" },
    after: { testDate:fallbackDate, productName:data.productName || "如：组合式空调机组（安装超微过滤器）", modelQuantity:data.modelQuantity || "如：FAH01P-Q*3个、FAH03P-Q*2个" },
  };
  if (!data.basic.before.productName || data.basic.before.productName === "组合式空调机组（安装介质过滤器）") data.basic.before.productName = "如：组合式空调机组（安装介质过滤器）";
  if (!data.basic.after.productName || data.basic.after.productName === "组合式空调机组（安装超微过滤器）") data.basic.after.productName = "如：组合式空调机组（安装超微过滤器）";
  data.basic.before.modelQuantity ||= "如：G4等级*6个";
  data.basic.after.modelQuantity ||= "如：FAH01P-Q*3个、FAH03P-Q*2个";
  const previousBeforeDate = data.basic.before.testDate;
  if (!data.basic.before.testDate || data.basic.before.testDate === data.basic.after.testDate) data.basic.before.testDate = chinaDate(-1);
  if (Array.isArray(data.airflow)) {
    const rows = data.airflow as { date?:string; positions?:string[]; averageOverride?:string }[];
    const legacy = {
      date: rows.find((row) => row.date)?.date ?? "",
      positions: [rows[0]?.positions?.[0] ?? "", rows[0]?.positions?.[1] ?? "", rows[1]?.positions?.[0] ?? "", rows[1]?.positions?.[1] ?? ""] as AirflowTest["positions"],
      averageOverride: rows.find((row) => row.averageOverride)?.averageOverride ?? "",
    };
    data.airflow = { before: { date:data.basic.before.testDate, positions:["","","",""], averageOverride:"" }, after:legacy };
  } else if (!(data.airflow as PhasePair<AirflowTest>).before) {
    data.airflow = { before: { date:data.basic.before.testDate, positions:["","","",""], averageOverride:"" }, after:data.airflow as unknown as AirflowTest };
  }
  for (const phase of ["before","after"] as const) { const airflow=(data.airflow as PhasePair<AirflowTest>)[phase];
    airflow.positions = [...airflow.positions, "", "", "", ""].slice(0, 4) as AirflowTest["positions"];
    if (phase === "before" && airflow.date === previousBeforeDate) airflow.date = data.basic.before.testDate;
    airflow.date ||= data.basic[phase].testDate;
  }
  if (Array.isArray(data.efficiency)) {
    const rows = data.efficiency as ({ date?:string } & EfficiencyPoint)[];
    const legacy = {
      date: rows.find((row) => row.date)?.date ?? "",
      points: Array.from({ length: 4 }, (_, i) => rows[i] ?? {
        before: { pm25: "", p05: "", p5: "" }, after: { pm25: "", p05: "", p5: "" }, overrides: { pm25: "", p05: "", p5: "" },
      }) as EfficiencyTest["points"],
      averageOverrides: { pm25: "", p05: "", p5: "" },
    };
    data.efficiency = { before: emptyEfficiencyForDate(data.basic.before.testDate), after:legacy };
  } else if (!(data.efficiency as PhasePair<EfficiencyTest>).before) {
    data.efficiency = { before: emptyEfficiencyForDate(data.basic.before.testDate), after:data.efficiency as unknown as EfficiencyTest };
  }
  for (const phase of ["before","after"] as const) { const efficiency=(data.efficiency as PhasePair<EfficiencyTest>)[phase];
    efficiency.points = [...efficiency.points].slice(0, 4) as EfficiencyTest["points"];
    efficiency.averageOverrides ??= { pm25: "", p05: "", p5: "" };
    if (phase === "before" && efficiency.date === previousBeforeDate) efficiency.date = data.basic.before.testDate;
    efficiency.date ||= data.basic[phase].testDate;
  }
  // Migrate legacy power: PowerRow[] → PhasePair<PowerRow[]>
  if (Array.isArray(data.power)) {
    data.power = { before: (data.power as unknown as PowerRow[]), after: [emptyPowerRow()] } as unknown as ReportData["power"];
  }
  const power = (data.power as unknown as PhasePair<PowerRow[]>) ?? { before: [], after: [] };
  power.before ??= [];
  power.after ??= [];
  if (!power.before.length) power.before.push(emptyPowerRow());
  if (!power.after.length) power.after.push(emptyPowerRow());
  (data as unknown as ReportData).power = power;
  // Migrate old photo slot names to new ones
  data.photos = data.photos.map(p => {
    const newSlot = SLOT_MIGRATION[p.slot as string];
    return newSlot ? { ...p, slot: newSlot } : p;
  }).filter(p => (PHOTO_SLOTS as readonly string[]).includes(p.slot as string)) as typeof data.photos;
  return data as ReportData;
}

function emptyEfficiencyForDate(date:string): EfficiencyTest {
  return { date, points:Array.from({length:4},()=>({before:{pm25:"",p05:"",p5:""},after:{pm25:"",p05:"",p5:""},overrides:{pm25:"",p05:"",p5:""}})) as EfficiencyTest["points"], averageOverrides:{pm25:"",p05:"",p5:""} };
}

function chinaDate(offsetDays=0) {
  return new Date(Date.now() + 8*60*60*1000 + offsetDays*24*60*60*1000).toISOString().slice(0,10);
}
