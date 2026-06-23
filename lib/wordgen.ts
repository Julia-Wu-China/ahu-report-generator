import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, HeightRule, LevelFormat, Packer, PageNumber,
  ImageRun, Paragraph, Tab, TabStopType, Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType,
} from "docx";
import {
  airflowAverage, averageEfficiency, conclusionFormulaLines, conclusionMetrics, efficiencyValues, formatEfficiency, powerValues,
} from "./calculations";
import type { AirflowTest, EfficiencyTest, Photo, PhotoSlotKey, ReportData } from "./types";
import { patchDocxSrcRects, type SrcRect } from "./zip-patch";

type ReportLanguage = "zh" | "en";

// ── helpers ────────────────────────────────────────────────────────────────────

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "000000" } as const;
const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const GRAY_FILL = { fill: "F0F0F0", type: "clear" as const, color: "auto" };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const NO_BORDERS = { top:NO_BORDER, bottom:NO_BORDER, left:NO_BORDER, right:NO_BORDER, insideHorizontal:NO_BORDER, insideVertical:NO_BORDER };
const BRAND_RULE = { style: BorderStyle.SINGLE, size: 12, color: "159BD3" } as const;

const WORD_TEXT = {
  zh: {
    photoLabels: {
      exterior: "项目外景", interior: "项目内景", unit: "空调机组",
      filterPre: "改造前过滤器", renovation: "改造过程", filterPost: "改造后过滤器",
      testPre: "改造前风速/过滤器前颗粒物实测", testPost: "改造后风速/过滤器前颗粒物实测",
      particlePre: "改造前过滤器后颗粒物实测", particlePost: "改造后过滤器后颗粒物实测",
      powerPre: "改造前用电实测", powerPost: "改造后用电实测",
    } as Record<PhotoSlotKey, string>,
    reportTitle: "测试报告", projectName: "项目名称", testType: "测试类型", debugTest: "调试测试", validationTest: "验证测试",
    standard: "测试标准", testers: "测试人员", testItems: "测试项目", phase: "测试阶段", testDate: "测试日期",
    productName: "产品名称", modelQuantity: "型号及数量", before: "改造前", after: "改造后",
    airflowItem: "风速（风量）", efficiencyItem: "净化效率", powerItem: "用电量",
    point1: "测点1", point2: "测点2", point3: "测点3", point4: "测点4", avgAirflow: "平均风速（m/s）",
    date: "日期", point: "测点", beforeFilter: "过滤器前", afterFilter: "过滤器后",
    pm25: "PM2.5浓度\n（μg/m³）", p05: "≥0.5μm\n（个/L）", p5: "≥5μm\n（个/L）",
    pm25Eff: "PM2.5\n（%）", p05Eff: "≥0.5μm\n（%）", p5Eff: "≥5μm\n（%）", avgEfficiency: "平均净化效率",
    sequence: "序号", previousMeter: "上次电表数（kWh）", currentMeter: "本次电表数（kWh）", meteredPower: "累计用电量（kWh）",
    runtime: "累计运行时长（h）", fanPower: "风机功率（kW）", filterPower: "过滤器功率（kW）", totalPower: "总用电量（kWh）",
    hourlyPower: "每小时用电量（kWh/h）", note: "备注", avgHourlyPower: "平均每小时用电量（kWh/h）",
    customerOpinion: "客户意见：", customerAgree: "□ 测试项目符合要求，测试数据真实。", other: "□ 其他：",
    customerSeal: "客户单位（盖章）：____________________________", dateBlank: "日期：________年____月____日",
    inspectionSeal: "检测单位（盖章）：", company: "爱优特空气技术（上海）有限公司",
    chapters: ["二","三","四","五","六"], sitePhotos: "一、现场及机组照片", dataSection: "（1）测试数据", photoSection: "（2）测试照片",
    airflowTitle: "风速（风量）测试", efficiencyTitle: "净化效率测试", powerTitle: "用电量测试", conclusionTitle: "报告结论",
    notePower: "注：若是介质类过滤器，过滤器功率记录为0；如果电表未监测静电过滤器用电量，静电过滤器用电量根据参数表和项目实际数量得出。",
    installed: "安装 ", compared: " 相比安装 ", colon: "：",
    staff: ["测试：______________", "审核：______________", "批准：______________"],
    headerReport: "空调箱测试报告　编号：", page: "第 ", pageOf: " 页 / 共 ", pageSuffix: " 页",
    missingPhoto: "图片缺失：", noPhoto: "未上传照片", pendingNumber: "待生成",
  },
  en: {
    photoLabels: {
      exterior: "Project Exterior", interior: "Project Interior", unit: "AHU Unit",
      filterPre: "Filter Before Retrofit", renovation: "Retrofit Process", filterPost: "Filter After Retrofit",
      testPre: "Before: Air Speed / Upstream Particles", testPost: "After: Air Speed / Upstream Particles",
      particlePre: "Before: Downstream Particles", particlePost: "After: Downstream Particles",
      powerPre: "Before: Power Test", powerPost: "After: Power Test",
    } as Record<PhotoSlotKey, string>,
    reportTitle: "Test Report", projectName: "Project Name", testType: "Test Type", debugTest: "Commissioning Test", validationTest: "Validation Test",
    standard: "Test Standard", testers: "Testers", testItems: "Test Items", phase: "Phase", testDate: "Test Date",
    productName: "Product Name", modelQuantity: "Model / Qty.", before: "Before", after: "After",
    airflowItem: "Air Speed (Airflow)", efficiencyItem: "Purification Efficiency", powerItem: "Power Consumption",
    point1: "Point 1", point2: "Point 2", point3: "Point 3", point4: "Point 4", avgAirflow: "Average Air Speed (m/s)",
    date: "Date", point: "Point", beforeFilter: "Before Filter", afterFilter: "After Filter",
    pm25: "PM2.5\n(μg/m³)", p05: "≥0.5μm\n(count/L)", p5: "≥5μm\n(count/L)",
    pm25Eff: "PM2.5\n(%)", p05Eff: "≥0.5μm\n(%)", p5Eff: "≥5μm\n(%)", avgEfficiency: "Average Efficiency",
    sequence: "No.", previousMeter: "Previous Meter (kWh)", currentMeter: "Current Meter (kWh)", meteredPower: "Metered Energy (kWh)",
    runtime: "Runtime (h)", fanPower: "Fan Power (kW)", filterPower: "Filter Power (kW)", totalPower: "Total Energy (kWh)",
    hourlyPower: "Hourly Energy (kWh/h)", note: "Note", avgHourlyPower: "Average Hourly Energy (kWh/h)",
    customerOpinion: "Customer Comments:", customerAgree: "□ Test items meet requirements and the data is true.", other: "□ Other:",
    customerSeal: "Customer (Seal): ____________________________", dateBlank: "Date: ________ / ____ / ____",
    inspectionSeal: "Testing Company (Seal): ", company: "AirQuality Technology (Shanghai) Co., Ltd.",
    chapters: ["II","III","IV","V","VI"], sitePhotos: "I. Site and Unit Photos", dataSection: "(1) Test Data", photoSection: "(2) Test Photos",
    airflowTitle: "Air Speed (Airflow) Test", efficiencyTitle: "Purification Efficiency Test", powerTitle: "Power Consumption Test", conclusionTitle: "Conclusion",
    notePower: "Note: For media filters, record filter power as 0. If the meter does not monitor electrostatic filter energy, calculate it from the parameter table and actual project quantity.",
    installed: "Installed ", compared: " compared with ", colon: ":",
    staff: ["Tested by: ____________", "Reviewed by: ____________", "Approved by: ____________"],
    headerReport: "AHU Test Report  No.: ", page: "Page ", pageOf: " of ", pageSuffix: "",
    missingPhoto: "Missing image: ", noPhoto: "No photo uploaded", pendingNumber: "Pending",
  },
} as const;


function cell(
  text: string,
  opts: {
    bold?: boolean; size?: number; rowSpan?: number; columnSpan?: number;
    shading?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    widthPct?: number; widthDxa?: number; compact?: boolean;
  } = {}
): TableCell {
  const { bold = false, size = 18, rowSpan, columnSpan, shading, align = AlignmentType.CENTER, widthPct, widthDxa, compact = false } = opts;
  return new TableCell({
    rowSpan, columnSpan,
    borders: ALL_BORDERS,
    shading: shading ? GRAY_FILL : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: compact ? { top:40, bottom:40, left:30, right:30 } : undefined,
    width: widthDxa ? { size: widthDxa, type: WidthType.DXA } : widthPct ? { size: widthPct, type: WidthType.PERCENTAGE } : undefined,
    children: [
      new Paragraph({
        alignment: align,
        children: text.split("\n").map((line, index) => new TextRun({ text:line, bold, size, font:"SimSun", ...(index ? { break:1 } : {}) })),
      }),
    ],
  });
}

function hd(text: string, pageBreakBefore = false): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    heading: HeadingLevel.HEADING_2,
    pageBreakBefore,
    children: [new TextRun({ text, bold: true, size: 28, font: "SimHei" })],
  });
}

function subhd(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: false, size: 20, font: "SimSun" })],
    spacing: { before: 120, after: 60 },
  });
}

function label(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: false, size: 18, font: "SimSun" })],
    spacing: { before: 80, after: 40 },
  });
}

function empty(): Paragraph {
  return new Paragraph({ children: [new TextRun("")] });
}

const PHOTO_LABELS: Record<PhotoSlotKey, string> = {
  exterior: "项目外景", interior: "项目内景", unit: "空调机组",
  filterPre: "改造前过滤器", renovation: "改造过程", filterPost: "改造后过滤器",
  testPre: "改造前风速/过滤器前颗粒物实测", testPost: "改造后风速/过滤器前颗粒物实测",
  particlePre: "改造前过滤器后颗粒物实测", particlePost: "改造后过滤器后颗粒物实测",
  powerPre: "改造前用电实测", powerPost: "改造后用电实测",
};

type WordText = (typeof WORD_TEXT)[ReportLanguage];
type BuildContext = { srcRects: Array<{ seq: number; rect: SrcRect | null }>; nextImageSeq: number; text: WordText };
type WordPhoto = { data: Buffer; srcRect: SrcRect | null };

async function wordPhoto(photo: Photo, imageDirectory: string, width: number, height: number): Promise<WordPhoto | null> {
  const source = path.join(imageDirectory, `${photo.id}.jpg`);
  if (!fs.existsSync(source)) return null;

  const image = sharp(source);
  const metadata = await image.metadata();
  const sourceWidth = metadata.width ?? photo.width;
  const sourceHeight = metadata.height ?? photo.height;
  if (!sourceWidth || !sourceHeight) return null;

  const targetRatio = width / height;
  const sourceRatio = sourceWidth / sourceHeight;
  const baseWidth = sourceRatio > targetRatio ? sourceHeight * targetRatio : sourceWidth;
  const baseHeight = sourceRatio > targetRatio ? sourceHeight : sourceWidth / targetRatio;
  const positionX = Math.min(100, Math.max(0, photo.crop?.x ?? 50)) / 100;
  const positionY = Math.min(100, Math.max(0, photo.crop?.y ?? 50)) / 100;
  const zoom = Math.min(2, Math.max(1, photo.crop?.zoom ?? 1));
  const baseLeft = (sourceWidth - baseWidth) * positionX;
  const baseTop = (sourceHeight - baseHeight) * positionY;
  const cropWidth = baseWidth / zoom;
  const cropHeight = baseHeight / zoom;
  const left = Math.max(0, Math.min(sourceWidth - cropWidth, baseLeft + (baseWidth - cropWidth) / 2));
  const top = Math.max(0, Math.min(sourceHeight - cropHeight, baseTop + (baseHeight - cropHeight) / 2));
  const rect = {
    l: Math.round((left / sourceWidth) * 100000),
    r: Math.round(((sourceWidth - left - cropWidth) / sourceWidth) * 100000),
    t: Math.round((top / sourceHeight) * 100000),
    b: Math.round(((sourceHeight - top - cropHeight) / sourceHeight) * 100000),
  };

  return {
    data: fs.readFileSync(source),
    srcRect: rect.l || rect.r || rect.t || rect.b ? rect : null,
  };
}

async function photoParagraph(photo: Photo, imageDirectory: string, width: number, height: number, ctx: BuildContext): Promise<Paragraph> {
  const seq = ctx.nextImageSeq++;
  const data = await wordPhoto(photo, imageDirectory, width, height);
  if (!data) return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: `${ctx.text.missingPhoto}${photo.filename}`, size: 16, color: "888888", font: "SimSun" })],
  });
  ctx.srcRects.push({ seq, rect: data.srcRect });
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0 },
    children: [new ImageRun({
      type: "jpg", data: data.data, transformation: { width, height },
      altText: { title: photo.filename, description: ctx.text.photoLabels[photo.slot], name: photo.filename },
    })],
  });
}

function photoGridSizing(photoCount: number, compact: boolean, availableHeightDxa?: number) {
  const count = Math.max(1, Math.min(4, photoCount));
  const rows = count <= 2 ? 1 : 2;
  const cols = count === 1 ? 1 : 2;
  const usableHeightDxa = Math.max(1200, (availableHeightDxa ?? (compact ? 2450 : 1900)) - 320);
  const rowHeightDxa = Math.floor(usableHeightDxa / rows);
  const height = Math.max(compact ? 92 : 78, Math.floor(rowHeightDxa / 15) - 4);
  const width = cols === 1 ? (compact ? 280 : 245) : (compact ? 138 : 118);
  return { rows, cols, rowHeightDxa, width, height };
}

async function slotPhotoCell(data: ReportData, slot: PhotoSlotKey, imageDirectory: string, ctx: BuildContext, compact = false, availableHeightDxa?: number): Promise<TableCell> {
  const photos = data.photos.filter((photo) => photo.slot === slot);
  const sizing = photoGridSizing(photos.length, compact, availableHeightDxa);
  const children: (Paragraph | Table)[] = [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: ctx.text.photoLabels[slot], bold: true, size: 18, font: "SimHei", color: "666666" })],
    spacing: { after: 12 },
  })];

  if (!photos.length) {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: ctx.text.noPhoto, color: "999999", size: 16 })] }));
  } else if (photos.length === 1) {
    children.push(await photoParagraph(photos[0], imageDirectory, sizing.width, sizing.height, ctx));
  } else {
    const rows: TableRow[] = [];
    for (let i = 0; i < photos.length; i += 2) {
      const cells = await Promise.all(photos.slice(i, i + 2).map(async (photo) => new TableCell({
        borders: NO_BORDERS,
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        children: [await photoParagraph(photo, imageDirectory, sizing.width, sizing.height, ctx)],
      })));
      if (cells.length === 1) cells.push(new TableCell({ borders: NO_BORDERS, verticalAlign: VerticalAlign.CENTER, margins: { top: 0, bottom: 0, left: 0, right: 0 }, children: [empty()] }));
      rows.push(new TableRow({ cantSplit: true, height: { value: sizing.rowHeightDxa, rule: HeightRule.EXACT }, children: cells }));
    }
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, rows }));
  }

  return new TableCell({
    borders: ALL_BORDERS,
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 60, bottom: 60, left: 60, right: 60 },
    children,
  });
}

async function slotCellContent(
  data: ReportData, slot: PhotoSlotKey, imageDirectory: string,
  cellWidth: number, cellHeight: number, ctx: BuildContext,
): Promise<(Paragraph | Table)[]> {
  const photos = data.photos.filter((p) => p.slot === slot).slice(0, 4);
  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: ctx.text.photoLabels[slot], bold: true, size: 18, font: "SimHei", color: "666666" })],
    spacing: { after: 12 },
  });
  if (!photos.length) {
    return [titlePara, new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: ctx.text.noPhoto, color: "999999", size: 16 })] })];
  }
  const count = photos.length;
  const cols = count === 1 ? 1 : 2;
  const rows = count <= 2 ? 1 : 2;
  const imgW = cols === 1 ? cellWidth - 10 : Math.floor((cellWidth - 15) / 2);
  const imgH = rows === 1 ? cellHeight - 12 : Math.floor((cellHeight - 12) / 2);
  if (count === 1) {
    return [titlePara, await photoParagraph(photos[0], imageDirectory, imgW, imgH, ctx)];
  }
  const photoRows: TableRow[] = [];
  for (let i = 0; i < count; i += 2) {
    const slice = photos.slice(i, i + 2);
    const cells = await Promise.all(slice.map(async (photo) => new TableCell({
      borders: NO_BORDERS, verticalAlign: VerticalAlign.CENTER,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      children: [await photoParagraph(photo, imageDirectory, imgW, imgH, ctx)],
    })));
    if (cells.length === 1) cells.push(new TableCell({ borders: NO_BORDERS, verticalAlign: VerticalAlign.CENTER, margins: { top: 0, bottom: 0, left: 0, right: 0 }, children: [empty()] }));
    photoRows.push(new TableRow({ cantSplit: true, height: { value: imgH * 15, rule: HeightRule.EXACT }, children: cells }));
  }
  return [titlePara, new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, rows: photoRows })];
}

async function buildOverviewTable(data: ReportData, imageDirectory: string, ctx: BuildContext): Promise<Table> {
  const ROW = 6200; // DXA per row; two rows ≈ 12400 DXA, fits within ~12700 available
  const m = { top: 60, bottom: 60, left: 60, right: 60 };
  const [unitContent, preContent, postContent] = await Promise.all([
    slotCellContent(data, "unit",       imageDirectory, 585, 360, ctx),
    slotCellContent(data, "filterPre",  imageDirectory, 285, 360, ctx),
    slotCellContent(data, "filterPost", imageDirectory, 285, 360, ctx),
  ]);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ cantSplit: true, height: { value: ROW, rule: HeightRule.EXACT }, children: [
        new TableCell({ columnSpan: 2, borders: ALL_BORDERS, verticalAlign: VerticalAlign.TOP, margins: m, children: unitContent }),
      ]}),
      new TableRow({ cantSplit: true, height: { value: ROW, rule: HeightRule.EXACT }, children: [
        new TableCell({ borders: ALL_BORDERS, verticalAlign: VerticalAlign.TOP, margins: m, children: preContent }),
        new TableCell({ borders: ALL_BORDERS, verticalAlign: VerticalAlign.TOP, margins: m, children: postContent }),
      ]}),
    ],
  });
}

async function photoSlotTable(data: ReportData, slots: PhotoSlotKey[], imageDirectory: string, ctx: BuildContext, compact = false, rowHeightDxa?: number): Promise<Table> {
  const rows: TableRow[] = [];
  for (let i = 0; i < slots.length; i += 2) {
    const cells = await Promise.all(slots.slice(i, i + 2).map((slot) => slotPhotoCell(data, slot, imageDirectory, ctx, compact, rowHeightDxa)));
    if (cells.length === 1) cells.push(new TableCell({ borders: ALL_BORDERS, children: [empty()] }));
    rows.push(new TableRow({ cantSplit: true, height: rowHeightDxa ? { value: rowHeightDxa, rule: HeightRule.EXACT } : undefined, children: cells }));
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

// ── meta table ────────────────────────────────────────────────────────────────

function metaTable(data: ReportData, testItems: string[], text: WordText): Table {
  const d = data;
  const widths = [1173, 1309, 3519, 3025];
  const metaRow = (children: TableCell[]) => new TableRow({
    height: { value: 680, rule: HeightRule.EXACT },
    children,
  });
  return new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: [
      metaRow([
        cell(text.projectName, { bold: true, shading: true, widthDxa: widths[0] }),
        cell(d.projectName, { columnSpan: 3, widthDxa: widths[1] + widths[2] + widths[3] }),
      ]),
      metaRow([
        cell(text.testType, { bold: true, shading: true, widthDxa: widths[0] }),
        cell(d.testType === "调试测试" ? `☑ ${text.debugTest}  ☐ ${text.validationTest}` : `☐ ${text.debugTest}  ☑ ${text.validationTest}`, { widthDxa: widths[1] }),
        cell(text.standard, { bold: true, shading: true, widthDxa: widths[2] }),
        cell(d.standard, { widthDxa: widths[3] }),
      ]),
      metaRow([
        cell(text.testers, { bold: true, shading: true, widthDxa: widths[0] }),
        cell(d.testers, { widthDxa: widths[1] }),
        cell(text.testItems, { bold: true, shading: true, widthDxa: widths[2] }),
        cell(testItems.join("、") || "", { widthDxa: widths[3] }),
      ]),
      metaRow([
        cell(text.phase, { bold: true, shading: true, widthDxa: widths[0] }),
        cell(text.testDate, { bold: true, shading: true, widthDxa: widths[1] }),
        cell(text.productName, { bold: true, shading: true, widthDxa: widths[2] }),
        cell(text.modelQuantity, { bold: true, shading: true, widthDxa: widths[3] }),
      ]),
      metaRow([
        cell(text.before, { bold: true, shading: true, widthDxa: widths[0] }),
        cell(d.basic.before.testDate, { widthDxa: widths[1] }),
        cell(d.basic.before.productName, { widthDxa: widths[2] }),
        cell(d.basic.before.modelQuantity, { widthDxa: widths[3] }),
      ]),
      metaRow([
        cell(text.after, { bold: true, shading: true, widthDxa: widths[0] }),
        cell(d.basic.after.testDate, { widthDxa: widths[1] }),
        cell(d.basic.after.productName, { widthDxa: widths[2] }),
        cell(d.basic.after.modelQuantity, { widthDxa: widths[3] }),
      ]),
    ],
  });
}

// ── airflow table ─────────────────────────────────────────────────────────────

function airflowTable(test: AirflowTest, text: WordText): Table {
  const avg = airflowAverage(test);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        cell(text.testDate, { bold: true, shading: true }),
        cell(text.point1, { bold: true, shading: true }),
        cell(text.point2, { bold: true, shading: true }),
        cell(text.point3, { bold: true, shading: true }),
        cell(text.point4, { bold: true, shading: true }),
        cell(text.avgAirflow, { bold: true, shading: true }),
      ]}),
      new TableRow({ children: [
        cell(test.date),
        ...test.positions.map(p => cell(p)),
        cell(avg.value != null ? String(avg.value) : ""),
      ]}),
    ],
  });
}

// ── efficiency table ──────────────────────────────────────────────────────────

function efficiencyTable(test: EfficiencyTest, text: WordText): Table {
  const avgPm25 = averageEfficiency(test, "pm25");
  const avgP05  = averageEfficiency(test, "p05");
  const avgP5   = averageEfficiency(test, "p5");
  const widths = [677, 587, 975, 857, 758, 975, 857, 758, 848, 903, 831];
  const dateParts = test.date.split("-");
  const displayDate = dateParts.length === 3 ? `${dateParts[0]}‑\n${dateParts[1]}‑${dateParts[2]}` : test.date;

  const hdRow1 = new TableRow({ children: [
    cell(text.date,   { bold: true, shading: true, rowSpan: 2, widthDxa:widths[0] }),
    cell(text.point,   { bold: true, shading: true, rowSpan: 2, widthDxa:widths[1] }),
    cell(text.beforeFilter, { bold: true, shading: true, columnSpan: 3, widthDxa:widths[2]+widths[3]+widths[4] }),
    cell(text.afterFilter, { bold: true, shading: true, columnSpan: 3, widthDxa:widths[5]+widths[6]+widths[7] }),
    cell(text.efficiencyItem, { bold: true, shading: true, columnSpan: 3, widthDxa:widths[8]+widths[9]+widths[10] }),
  ]});

  const hdRow2 = new TableRow({ children: [
    ...[text.pm25,text.p05,text.p5,text.pm25,text.p05,text.p5,text.pm25Eff,text.p05Eff,text.p5Eff]
      .map((text, index) => cell(text, { bold:true, shading:true, widthDxa:widths[index+2], compact:true })),
  ]});

  const dataRows = test.points.map((row, i) => {
    const ev = efficiencyValues(row);
    const rowCells = [
      ...(i === 0 ? [cell(displayDate, { rowSpan:4, widthDxa:widths[0] })] : []),
      cell(`${text.point}${i + 1}`, { bold:true, shading:true, widthDxa:widths[1] }),
      cell(row.before.pm25, { widthDxa:widths[2] }), cell(row.before.p05, { widthDxa:widths[3] }), cell(row.before.p5, { widthDxa:widths[4] }),
      cell(row.after.pm25, { widthDxa:widths[5] }),  cell(row.after.p05, { widthDxa:widths[6] }),  cell(row.after.p5, { widthDxa:widths[7] }),
      cell(formatEfficiency(ev.pm25.value), { widthDxa:widths[8], compact:true }),
      cell(formatEfficiency(ev.p05.value), { widthDxa:widths[9], compact:true }),
      cell(formatEfficiency(ev.p5.value), { widthDxa:widths[10], compact:true }),
    ];
    return new TableRow({ children: rowCells });
  });

  const avgRow = new TableRow({ children: [
    cell(text.avgEfficiency, { bold:true, shading:true, columnSpan:8, widthDxa:widths.slice(0,8).reduce((a,b)=>a+b,0) }),
    cell(formatEfficiency(avgPm25), { widthDxa:widths[8], compact:true }),
    cell(formatEfficiency(avgP05), { widthDxa:widths[9], compact:true }),
    cell(formatEfficiency(avgP5), { widthDxa:widths[10], compact:true }),
  ]});

  return new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: [hdRow1, hdRow2, ...dataRows, avgRow],
  });
}

// ── power table ───────────────────────────────────────────────────────────────

function powerTable(rows: ReportData["power"]["before"], meterIncludesFilter: boolean, text: WordText): Table {
  const headers = [text.sequence,text.testDate,text.previousMeter,text.currentMeter,
    text.meteredPower,text.runtime,text.fanPower,text.filterPower,text.totalPower,text.hourlyPower,text.note];

  const hdRow = new TableRow({ children: headers.map(h => cell(h, { bold: true, shading: true })) });

  const dataRows = rows.map((row, i) => {
    const p = powerValues(row, meterIncludesFilter);
    return new TableRow({ children: [
      cell(String(i + 1)),
      cell(row.date),
      cell(row.previousMeter),
      cell(row.currentMeter),
      cell(p.metered != null ? String(p.metered) : ""),
      cell(row.runtimeHours),
      cell(row.fanPower),
      cell(row.filterPower),
      cell(p.total != null ? String(p.total) : ""),
      cell(p.hourly != null ? String(p.hourly) : ""),
      cell(row.note),
    ]});
  });

  const hourlyVals = rows
    .map(r => powerValues(r, meterIncludesFilter).hourly)
    .filter((v): v is number => v !== null);
  const avg = hourlyVals.length
    ? Number((hourlyVals.reduce((a, b) => a + b, 0) / hourlyVals.length).toFixed(3))
    : null;

  const avgRow = new TableRow({ children: [
    cell(text.avgHourlyPower, { bold: true, shading: true, columnSpan: 9, align: AlignmentType.RIGHT }),
    cell(avg != null ? String(avg) : ""),
    cell(""),
  ]});

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [hdRow, ...dataRows, avgRow],
  });
}

// ── signature ─────────────────────────────────────────────────────────────────

function signatureBlock(text: WordText): Paragraph[] {
  return [
    new Paragraph({ children:[new TextRun({ text:text.customerOpinion, bold:true, size:26, font:"SimHei" })], spacing:{ before:120, after:160 } }),
    new Paragraph({ children:[new TextRun({ text:text.customerAgree, size:22, font:"SimSun" })], spacing:{ after:80 } }),
    new Paragraph({ children:[new TextRun({ text:text.other, size:22, font:"SimSun" })], spacing:{ after:500 } }),
    new Paragraph({ alignment:AlignmentType.RIGHT, children:[new TextRun({ text:text.customerSeal, size:22, font:"SimSun" })], spacing:{ after:260 } }),
    new Paragraph({ alignment:AlignmentType.RIGHT, children:[new TextRun({ text:text.dateBlank, size:22, font:"SimSun" })] }),
  ];
}

function inspectionSealBlock(text: WordText): Paragraph[] {
  return [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({ text: text.inspectionSeal, size: 22, font: "SimSun" }),
        new TextRun({ text: text.company, size: 22, font: "SimSun" }),
      ],
      spacing: { before: 120, after: 220 },
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: text.dateBlank, size: 22, font: "SimSun" })],
      spacing: { after: 180 },
    }),
  ];
}

// ── presence helpers ──────────────────────────────────────────────────────────

const hasAirflow = (t: AirflowTest) => t.positions.some(p => p.trim());
const hasEfficiency = (t: EfficiencyTest) =>
  t.points.some(p => Object.values(p.before).some(v => v) || Object.values(p.after).some(v => v));
const hasPower = (rows: ReportData["power"]["before"]) =>
  rows.some(r => r.previousMeter || r.currentMeter || r.runtimeHours);

// ── main export ───────────────────────────────────────────────────────────────

export async function generateDocx(data: ReportData, reportNumber: string | null, imageDirectory = "", language: ReportLanguage = "zh"): Promise<Buffer> {
  const text = WORD_TEXT[language];
  const ctx: BuildContext = { srcRects: [], nextImageSeq: 0, text };
  const chNums = text.chapters;

  const testItems = [
    ...(hasAirflow(data.airflow.before) || hasAirflow(data.airflow.after) ? [text.airflowItem] : []),
    ...(hasEfficiency(data.efficiency.before) || hasEfficiency(data.efficiency.after) ? [text.efficiencyItem] : []),
    ...(hasPower(data.power.before) || hasPower(data.power.after) ? [text.powerItem] : []),
  ];

  const SECS = [
    { key: "airflow"     as const, title: text.airflowTitle, active: hasAirflow(data.airflow.before) || hasAirflow(data.airflow.after) },
    { key: "efficiency"  as const, title: text.efficiencyTitle, active: hasEfficiency(data.efficiency.before) || hasEfficiency(data.efficiency.after) },
    { key: "power"       as const, title: text.powerTitle, active: hasPower(data.power.before) || hasPower(data.power.after) },
  ].filter(s => s.active);

  // Page 1 exterior photo — fills remaining space after meta table
  const exteriorPhoto = data.photos.find((p) => p.slot === "exterior");
  const exteriorPara: Paragraph = exteriorPhoto
    ? await photoParagraph(exteriorPhoto, imageDirectory, 600, 337.5, ctx)
    : new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [new TextRun({ text: `${text.photoLabels.exterior} (${text.noPhoto})`, size: 18, color: "999999", font: "SimSun" })] });

  // Page 2 overview table — 空调机组 full row, then 改造前/后过滤器 two columns
  const overviewPhotos = await buildOverviewTable(data, imageDirectory, ctx);

  const testPhotos: Partial<Record<(typeof SECS)[number]["key"], Table>> = {};
  if (SECS.some((sec) => sec.key === "airflow")) testPhotos.airflow = await photoSlotTable(data, ["testPre", "testPost"], imageDirectory, ctx, true, 8700);
  if (SECS.some((sec) => sec.key === "efficiency")) testPhotos.efficiency = await photoSlotTable(data, ["particlePre", "particlePost"], imageDirectory, ctx, true, 5450);
  if (SECS.some((sec) => sec.key === "power")) testPhotos.power = await photoSlotTable(data, ["powerPre", "powerPost"], imageDirectory, ctx, true, 7700);

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: text.reportTitle, bold: true, size: 48, font: "SimHei" })],
      spacing: { before: 1080, after: 180 },
    }),
    metaTable(data, testItems, text),
    new Paragraph({ spacing: { before: 120 }, children: [] }),
    exteriorPara,
    hd(text.sitePhotos, true),
    overviewPhotos,
  ];

  SECS.forEach((sec, idx) => {
    children.push(hd(language === "en" ? `${chNums[idx]}. ${sec.title}` : `${chNums[idx]}、${sec.title}`, true));

    if (sec.key === "airflow") {
      children.push(subhd(text.dataSection));
      children.push(label(text.before));
      children.push(airflowTable(data.airflow.before, text));
      children.push(label(text.after));
      children.push(airflowTable(data.airflow.after, text));
      children.push(empty());
      children.push(subhd(text.photoSection));
      children.push(testPhotos.airflow!);
    }

    if (sec.key === "efficiency") {
      children.push(subhd(text.dataSection));
      children.push(label(text.before));
      children.push(efficiencyTable(data.efficiency.before, text));
      children.push(label(text.after));
      children.push(efficiencyTable(data.efficiency.after, text));
      children.push(empty());
      children.push(subhd(text.photoSection));
      children.push(testPhotos.efficiency!);
    }

    if (sec.key === "power") {
      children.push(subhd(text.dataSection));
      const beforeRows = data.power.before.filter(r => r.date || r.previousMeter || r.currentMeter || r.runtimeHours);
      const afterRows  = data.power.after.filter(r => r.date || r.previousMeter || r.currentMeter || r.runtimeHours);
      if (beforeRows.length) {
        children.push(label(text.before));
        children.push(powerTable(beforeRows, data.meterIncludesFilter, text));
      }
      if (afterRows.length) {
        children.push(label(text.after));
        children.push(powerTable(afterRows, data.meterIncludesFilter, text));
      }
      children.push(new Paragraph({
        children: [new TextRun({ text: text.notePower, size: 16, font: "SimSun" })],
        spacing: { before: 80, after: 80 },
      }));
      children.push(empty());
      children.push(subhd(text.photoSection));
      children.push(testPhotos.power!);
    }

    children.push(empty());
  });

  const conclusion = conclusionMetrics(data);
  const conclusionFormulas = conclusionFormulaLines(data, conclusion);
  const metric = (v:number|null, unit="%") => v === null ? "—" : `${v.toFixed(2)}${unit}`;
  children.push(hd(language === "en" ? `${chNums[SECS.length]}. ${text.conclusionTitle}` : `${chNums[SECS.length]}、${text.conclusionTitle}`, true));
  children.push(new Paragraph({
    children:[
      new TextRun({ text:text.installed, size:22, font:"SimSun" }),
      new TextRun({ text:data.basic.after.productName||"—", bold:true, size:22, font:"SimSun" }),
      new TextRun({ text:text.compared, size:22, font:"SimSun" }),
      new TextRun({ text:data.basic.before.productName||"—", bold:true, size:22, font:"SimSun" }),
      new TextRun({ text:text.colon, size:22, font:"SimSun" }),
    ], spacing:{ before:160, after:100 },
  }));
  [
    { text: language === "en" ? `Air speed (fresh airflow) increased by ${metric(conclusion.airflowIncrease)}.` : `风速（新风量）增加了 ${metric(conclusion.airflowIncrease)}；`, formula:conclusionFormulas[0] },
    { text: language === "en" ? `PM2.5 purification efficiency improved by ${metric(conclusion.efficiencyGain.pm25)}.` : `PM2.5 净化效率（按差值）提高了 ${metric(conclusion.efficiencyGain.pm25)}；`, formula:conclusionFormulas[1] },
    { text: language === "en" ? `≥0.5μm purification efficiency improved by ${metric(conclusion.efficiencyGain.p05)}.` : `≥0.5μm 净化效率（按差值）提高了 ${metric(conclusion.efficiencyGain.p05)}；`, formula:conclusionFormulas[2] },
    { text: language === "en" ? `≥5μm purification efficiency improved by ${metric(conclusion.efficiencyGain.p5)}.` : `≥5μm 净化效率（按差值）提高了 ${metric(conclusion.efficiencyGain.p5)}；`, formula:conclusionFormulas[3] },
    { text: language === "en" ? `Hourly energy consumption saved ${metric(conclusion.hourlySavingPercent)}.` : `每小时用电量节省 ${metric(conclusion.hourlySavingPercent)}；`, formula:conclusionFormulas[4] },
    { text: language === "en" ? `Estimated 10-year energy saving is ${metric(conclusion.tenYearSavingKwh," kWh")}.` : `累计10年可以节省电量 ${metric(conclusion.tenYearSavingKwh," kWh")}。`, formula:conclusionFormulas[5] },
  ].forEach(item=>{
    children.push(new Paragraph({
      numbering:{ reference:"conclusion-numbering", level:0 },
      children:[new TextRun({ text:item.text, size:22, font:"SimSun" })], spacing:{ after:20 },
    }));
    children.push(new Paragraph({
      indent:{ left:840 },
      children:[new TextRun({ text:item.formula, size:16, color:"777777", font:"SimSun" })], spacing:{ after:80 },
    }));
  });
  children.push(empty());
  children.push(new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: [3008, 3009, 3009],
    layout: TableLayoutType.FIXED,
    borders: { top:NO_BORDER, bottom:NO_BORDER, left:NO_BORDER, right:NO_BORDER, insideHorizontal:NO_BORDER, insideVertical:NO_BORDER },
    rows: [new TableRow({ height:{ value:900, rule:HeightRule.EXACT }, children: text.staff.map((text) => new TableCell({
      borders: { top:NO_BORDER, bottom:NO_BORDER, left:NO_BORDER, right:NO_BORDER },
      width: { size: 3009, type: WidthType.DXA },
      verticalAlign: VerticalAlign.BOTTOM,
      margins: { bottom:80, top:0, left:0, right:0 },
      children: [new Paragraph({ children:[new TextRun({ text, bold:true, size:22, font:"SimSun" })] })],
    })) })],
  }));
  children.push(empty());
  children.push(...inspectionSealBlock(text));
  children.push(empty());
  children.push(hd(language === "en" ? `${chNums[SECS.length + 1]}. ${text.customerOpinion.replace(/:$/, "")}` : `${chNums[SECS.length + 1]}、客户意见`));
  children.push(...signatureBlock(text));

  const isEnglish = language === "en";
  const headerImage = fs.readFileSync(path.join(process.cwd(), "public", isEnglish ? "template-header-en.png" : "template-header.jpeg"));
  const footerImage = fs.readFileSync(path.join(process.cwd(), "public", isEnglish ? "template-footer-en.png" : "template-footer.jpeg"));
  const headerImageRun = new ImageRun({
    type: isEnglish ? "png" : "jpg",
    data: headerImage,
    transformation: isEnglish ? { width: 176, height: 32 } : { width: 205, height: 57 },
    altText: { title: isEnglish ? "AirQuality" : "爱优特净化 无耗材更节能", description:"Report header brand logo", name: isEnglish ? "template-header-en.png" : "template-header.jpeg" },
  });
  const footerImageRun = new ImageRun({
    type: isEnglish ? "png" : "jpg",
    data: footerImage,
    transformation:{ width:794, height: isEnglish ? 55 : 56 },
    altText:{ title:text.company, description:"Report footer contact information", name: isEnglish ? "template-footer-en.png" : "template-footer.jpeg" },
  });
  const header = new Header({ children: [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top:NO_BORDER, bottom:BRAND_RULE, left:NO_BORDER, right:NO_BORDER, insideHorizontal:NO_BORDER, insideVertical:NO_BORDER },
    rows: [new TableRow({ children: [
      new TableCell({
        width: { size: 38, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ children: [headerImageRun] })],
      }),
      new TableCell({
        width: { size: 62, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.BOTTOM,
        children: [new Paragraph({ alignment:AlignmentType.RIGHT, children:[new TextRun({ text:`${text.headerReport}${reportNumber ?? text.pendingNumber}`, size:18, font:"SimSun" })] })],
      }),
    ] })],
  })] });
  const footer = new Footer({ children: [
    new Paragraph({
      alignment:AlignmentType.CENTER,
      children:[new TextRun({ children:[text.page, PageNumber.CURRENT, text.pageOf, PageNumber.TOTAL_PAGES, text.pageSuffix], size:18, font:"SimSun" })],
      spacing:{ after:80 },
    }),
    new Paragraph({
      alignment:AlignmentType.CENTER, indent:{ left:-1440, right:-1440 },
      children:[footerImageRun],
    }),
  ] });

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "SimSun", size: 18 },
        },
      },
    },
    numbering: { config: [{ reference:"conclusion-numbering", levels:[{
      level:0, format:LevelFormat.DECIMAL, text:"%1）", alignment:AlignmentType.LEFT,
      style:{ paragraph:{ indent:{ left:480, hanging:360 } } },
    }] }] },
    sections: [{
      properties:{ page:{ margin:{ top:1440, right:1440, bottom:1440, left:1440, header:360, footer:300 } } },
      headers:{ default:header }, footers:{ default:footer }, children,
    }],
  });

  const srcRects = ctx.srcRects
    .sort((a, b) => a.seq - b.seq)
    .map((item) => item.rect);
  return patchDocxSrcRects(Buffer.from(await Packer.toBuffer(doc)), srcRects);
}
