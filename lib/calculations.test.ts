import { describe, expect, it } from "vitest";
import { airflowAverage, averageEfficiency, conclusionMetrics, efficiency, formatEfficiency, powerValues, validateReport } from "./calculations";
import { emptyReport } from "./types";

describe("report calculations", () => {
  it("calculates airflow average and supports an override", () => {
    const row = { date:"", positions:["1.2","1.4","1.6","1.8"] as [string,string,string,string], averageOverride:"" };
    expect(airflowAverage(row)).toMatchObject({ calculated:1.5, value:1.5, overridden:false });
    row.averageOverride="1.6";
    expect(airflowAverage(row)).toMatchObject({ calculated:1.5, value:1.6, overridden:true });
  });
  it("calculates purification efficiency", () => {
    expect(efficiency("100","15","").value).toBe(85);
    expect(efficiency("0","0","").value).toBe("/");
    expect(efficiency("100","15","88.5")).toMatchObject({ value:88.5, overridden:true });
    expect(efficiency("100","0",">99%")).toMatchObject({ value:">99%", overridden:true });
    expect(formatEfficiency(87.5)).toBe("87.50");
    expect(formatEfficiency(0)).toBe("0.00");
    expect(formatEfficiency(100)).toBe("≥99.99");
  });
  it("averages four purification points and supports report-style text", () => {
    const data=emptyReport();
    data.efficiency.after.points.forEach((point)=>{point.before.pm25="100";point.after.pm25="10"});
    expect(averageEfficiency(data.efficiency.after,"pm25")).toBe(90);
    data.efficiency.after.averageOverrides.pm25=">99%";
    expect(averageEfficiency(data.efficiency.after,"pm25")).toBe(">99%");
    data.efficiency.after.averageOverrides.pm25="";
    data.efficiency.after.points.forEach((point)=>{point.before.pm25="0";point.after.pm25="0"});
    expect(averageEfficiency(data.efficiency.after,"pm25")).toBe("/");
  });
  it("adds filter consumption only when the meter excludes it", () => {
    const row={date:"",previousMeter:"100",currentMeter:"110",runtimeHours:"5",fanPower:"2",filterPower:"1",totalOverride:"",hourlyOverride:"",note:""};
    expect(powerValues(row,true)).toMatchObject({metered:10,total:10,hourly:2});
    expect(powerValues(row,false)).toMatchObject({metered:10,total:15,hourly:3});
  });
  it("detects suspicious readings", () => {
    const data=emptyReport();data.power.before[0].previousMeter="20";data.power.before[0].currentMeter="10";data.efficiency.after.points[0].before.pm25="10";data.efficiency.after.points[0].after.pm25="20";
    expect(validateReport(data).join(" ")).toContain("本次电表数小于上次电表数");
    expect(validateReport(data).join(" ")).toContain("过滤后数值高于过滤前");
  });
  it("builds dynamic conclusion metrics", () => {
    const data=emptyReport();
    data.airflow.before.positions=["1","1","1","1"];
    data.airflow.after.positions=["1.2","1.2","1.2","1.2"];
    data.efficiency.before.points.forEach(p=>{p.before.pm25="100";p.after.pm25="20"});
    data.efficiency.after.points.forEach(p=>{p.before.pm25="100";p.after.pm25="10"});
    data.power.before[0]={date:"",previousMeter:"0",currentMeter:"20",runtimeHours:"10",fanPower:"",filterPower:"",totalOverride:"",hourlyOverride:"",note:""};
    data.power.after[0]={date:"",previousMeter:"0",currentMeter:"15",runtimeHours:"10",fanPower:"",filterPower:"",totalOverride:"",hourlyOverride:"",note:""};
    expect(conclusionMetrics(data)).toMatchObject({
      airflowIncrease:20, efficiencyGain:{pm25:10}, hourlySavingPercent:25, tenYearSavingKwh:43800,
    });
  });
});
