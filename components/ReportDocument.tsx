import { airflowAverage, averageEfficiency, conclusionFormulaLines, conclusionMetrics, efficiencyValues, formatEfficiency, powerValues } from "@/lib/calculations";
import type { AirflowTest, EfficiencyTest, PhotoSlotKey, ReportData } from "@/lib/types";

const value = (v: number | string | null | undefined, suffix = "") => v === null || v === undefined ? "" : `${v}${suffix}`;
const text = (v: string) => v || "　";
const keepTextTogether = (v: number | string | null | undefined) => value(v);

function PhotoGrid({ data, slot, labels }: { data:ReportData; slot:PhotoSlotKey; labels?:string[] }) {
  const photos = data.photos.filter((p) => p.slot === slot);
  return <div className={`photo-grid count-${photos.length || 1}`}>
    {photos.length ? photos.map((photo, i) => <div className="photo-cell" key={photo.id}>
      <img src={photo.url} alt={photo.filename} style={{ objectPosition:`${photo.crop.x}% ${photo.crop.y}%`, transform:`scale(${photo.crop.zoom})` }} />
      {labels?.[i] && <span>{labels[i]}</span>}
    </div>) : <div className="photo-placeholder">照片</div>}
  </div>;
}

function Header({ number, page, totalPages, title }: { number:string|null; page:number; totalPages:number; title?:string }) {
  return <><header className="report-header"><img src="/template-header.jpeg" alt="爱优特 净化无耗材更节能"/>{title&&<span className="report-section-title">{title}</span>}<span>空调箱测试报告　编号：{number ?? "待生成"}</span></header><footer className="report-footer"><img src="/template-footer.jpeg" alt="爱优特空气技术（上海）有限公司"/></footer><div className="page-num">第 {page} 页 / 共 {totalPages} 页</div></>;
}

function AirflowDataTable({ label, test }:{ label:string; test:AirflowTest }) {
  return <div className="phase-table"><h3>{label}</h3><table className="data-table airflow-table"><thead><tr><th>测试日期</th><th>测点1</th><th>测点2</th><th>测点3</th><th>测点4</th><th>平均风速（m/s）</th></tr></thead><tbody><tr><td>{test.date}</td>{test.positions.map((point,i)=><td key={i}>{point}</td>)}<td>{value(airflowAverage(test).value)}</td></tr></tbody></table></div>;
}

function EfficiencyDataTable({ label, test }:{ label:string; test:EfficiencyTest }) {
  const averages=(["pm25","p05","p5"] as const).map((key)=>averageEfficiency(test,key));
  const dateParts=test.date.split("-");
  const displayDate=dateParts.length===3?<>{dateParts[0]}‑<br/>{dateParts[1]}‑{dateParts[2]}</>:test.date;
  const headers=[
    ["PM2.5浓度","（μg/m³）"],["≥0.5μm","（个/L）"],["≥5μm","（个/L）"],
    ["PM2.5浓度","（μg/m³）"],["≥0.5μm","（个/L）"],["≥5μm","（个/L）"],
    ["PM2.5","（%）"],["≥0.5μm","（%）"],["≥5μm","（%）"],
  ];
  return <div className="phase-table"><h3>{label}</h3><table className="data-table efficiency-table"><colgroup>{[7.5,6.5,10.8,9.5,8.4,10.8,9.5,8.4,9.4,10,9.2].map((width,i)=><col key={i} style={{width:`${width}%`}}/>)}</colgroup><thead><tr><th rowSpan={2}>日期</th><th rowSpan={2}>测点</th><th colSpan={3}>过滤器前</th><th colSpan={3}>过滤器后</th><th colSpan={3}>净化效率</th></tr><tr>{headers.map(([name,unit],i)=><th key={i}><span className="efficiency-heading-line">{name}</span><br/><span className="efficiency-heading-line">{unit}</span></th>)}</tr></thead><tbody>{test.points.map((row,i)=>{const e=efficiencyValues(row);return <tr key={i}>{i===0&&<td rowSpan={4} className="efficiency-date">{displayDate}</td>}<th>测点{i+1}</th><td>{row.before.pm25}</td><td>{row.before.p05}</td><td>{row.before.p5}</td><td>{row.after.pm25}</td><td>{row.after.p05}</td><td>{row.after.p5}</td><td className="efficiency-result">{keepTextTogether(formatEfficiency(e.pm25.value))}</td><td className="efficiency-result">{keepTextTogether(formatEfficiency(e.p05.value))}</td><td className="efficiency-result">{keepTextTogether(formatEfficiency(e.p5.value))}</td></tr>})}<tr><th colSpan={8}>平均净化效率</th>{averages.map((v,i)=><td className="efficiency-result" key={i}>{keepTextTogether(formatEfficiency(v))}</td>)}</tr></tbody></table></div>;
}

export function ReportDocument({ data, reportNumber }: { data:ReportData; reportNumber:string|null }) {
  const hasAirflow=(t:AirflowTest)=>!!(t.date||t.positions.some(p=>p.trim()));
  const hasEfficiency=(t:EfficiencyTest)=>t.points.some(p=>Object.values(p.before).some(v=>v)||Object.values(p.after).some(v=>v));
  const hasPower=(rows:ReportData["power"]["before"])=>rows.some(r=>r.previousMeter||r.currentMeter||r.runtimeHours);

  const testItems=[
    ...(hasAirflow(data.airflow.before)||hasAirflow(data.airflow.after)?["风速（风量）"]:[]),
    ...(hasEfficiency(data.efficiency.before)||hasEfficiency(data.efficiency.after)?["净化效率"]:[]),
    ...(hasPower(data.power.before)||hasPower(data.power.after)?["用电量"]:[]),
  ];

  const SECS=[
    {key:"airflow" as const, short:"风速（风量）", title:"风速（风量）测试"},
    {key:"efficiency" as const, short:"净化效率",   title:"净化效率测试"},
    {key:"power" as const,      short:"用电量",     title:"用电量测试"},
  ];
  const activeSecs=SECS.filter(s=>{
    if(s.key==="airflow")    return hasAirflow(data.airflow.before)||hasAirflow(data.airflow.after);
    if(s.key==="efficiency") return hasEfficiency(data.efficiency.before)||hasEfficiency(data.efficiency.after);
    return hasPower(data.power.before)||hasPower(data.power.after);
  });
  const totalPages=3+activeSecs.length;
  const chNums=["二","三","四","五","六"];
  const conclusion=conclusionMetrics(data);
  const conclusionFormulas=conclusionFormulaLines(data,conclusion);
  const metric=(v:number|null,unit="%")=>v===null?"—":`${v.toFixed(2)}${unit}`;

  const testChoiceBar=(currentKey:string)=>(
    <div className="test-choice"><b>测试项目</b><span>{activeSecs.map(s=>(s.key===currentKey?"☑":"□")+s.short).join("　")}</span></div>
  );

  return <div className="report-document">
    {/* ── 第 1 页：封面 ── */}
    <section className="report-page" style={{display:"flex",flexDirection:"column"}}><Header number={reportNumber} page={1} totalPages={totalPages}/>
      <h1>测试报告</h1>
      <table className="meta-table"><colgroup><col style={{width:"13%"}}/><col style={{width:"14.5%"}}/><col style={{width:"39%"}}/><col style={{width:"33.5%"}}/></colgroup><tbody>
        <tr><th>项目名称</th><td colSpan={3}>{text(data.projectName)}</td></tr>
        <tr><th>测试类型</th><td>{data.testType === "调试测试" ? "☑ 调试测试　☐ 验证测试" : "☐ 调试测试　☑ 验证测试"}</td><th>测试标准</th><td>{text(data.standard)}</td></tr>
        <tr><th>测试人员</th><td>{text(data.testers)}</td><th>测试项目</th><td>{testItems.join("、")||"　"}</td></tr>
        <tr><td className="meta-sub-label meta-corner">测试阶段</td><td className="meta-sub-label">测试日期</td><td className="meta-sub-label">产品名称</td><td className="meta-sub-label">型号及数量</td></tr>
        <tr><th>改造前</th><td className="meta-sub-val">{text(data.basic.before.testDate)}</td><td className="meta-sub-val">{text(data.basic.before.productName)}</td><td className="meta-sub-val">{text(data.basic.before.modelQuantity)}</td></tr>
        <tr><th>改造后</th><td className="meta-sub-val">{text(data.basic.after.testDate)}</td><td className="meta-sub-val">{text(data.basic.after.productName)}</td><td className="meta-sub-val">{text(data.basic.after.modelQuantity)}</td></tr>
      </tbody></table>
      <div style={{flex:1,marginLeft:"-18mm",marginRight:"-18mm",marginTop:"5mm",overflow:"hidden",minHeight:0,display:"flex",flexDirection:"column"}}>
        <PhotoGrid data={data} slot="exterior"/>
      </div>
    </section>

    {/* ── 第 2 页：现场及机组照片 ── */}
    <section className="report-page"><Header number={reportNumber} page={2} totalPages={totalPages}/>
      <h2 style={{textAlign:"center",fontSize:"14pt",fontFamily:'"SimHei","Noto Sans CJK SC",sans-serif',letterSpacing:"2pt",margin:"3mm 0"}}>一、现场及机组照片</h2>
      <div style={{position:"absolute",top:"35mm",left:"18mm",right:"18mm",bottom:"23mm",border:".25mm solid #000",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{flex:1,borderBottom:".25mm solid #000",display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0}}>
          <h3 style={{fontSize:"9pt",textAlign:"center",margin:"2mm",flex:"0 0 auto",borderBottom:".25mm solid #000",paddingBottom:"1mm"}}>空调机组</h3>
          <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column"}}><PhotoGrid data={data} slot="unit"/></div>
        </div>
        <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 1fr",overflow:"hidden",minHeight:0}}>
          <div style={{borderRight:".25mm solid #000",display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0}}>
            <h3 style={{fontSize:"9pt",textAlign:"center",margin:"2mm",flex:"0 0 auto",borderBottom:".25mm solid #000",paddingBottom:"1mm"}}>改造前过滤器</h3>
            <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column"}}><PhotoGrid data={data} slot="filterPre"/></div>
          </div>
          <div style={{display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0}}>
            <h3 style={{fontSize:"9pt",textAlign:"center",margin:"2mm",flex:"0 0 auto",borderBottom:".25mm solid #000",paddingBottom:"1mm"}}>改造后过滤器</h3>
            <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column"}}><PhotoGrid data={data} slot="filterPost"/></div>
          </div>
        </div>
      </div>
    </section>

    {/* ── 动态测试页 ── */}
    {activeSecs.map((sec,idx)=>{
      const pageNum=idx+3;
      const sectionTitle=`${chNums[idx]}、${sec.title}`;
      return <section className="report-page" key={sec.key}>
        <Header number={reportNumber} page={pageNum} totalPages={totalPages}/>
        <h2 style={{textAlign:"center",fontSize:"14pt",fontFamily:'"SimHei","Noto Sans CJK SC",sans-serif',letterSpacing:"2pt",margin:"3mm 0"}}>{sectionTitle}</h2>

        {sec.key==="airflow"&&<>
          <h2>（1）测试数据</h2>
          <AirflowDataTable label="改造前" test={data.airflow.before}/><AirflowDataTable label="改造后" test={data.airflow.after}/>
          <div className="photo-section airflow-photo-section" style={{ position: "absolute", left: "18mm", right: "18mm", bottom: "33mm" }}>
            <h2>（2）测试照片</h2>
            <div className="two-photo-panels airflow-photo-panels"><div><h3>改造前风速/过滤器前颗粒物实测</h3><PhotoGrid data={data} slot="testPre"/></div><div><h3>改造后风速/过滤器前颗粒物实测</h3><PhotoGrid data={data} slot="testPost"/></div></div>
          </div>
        </>}

        {sec.key==="efficiency"&&<>
          <h2>（1）测试数据</h2>
          <EfficiencyDataTable label="改造前" test={data.efficiency.before}/><EfficiencyDataTable label="改造后" test={data.efficiency.after}/>
          <div className="photo-section efficiency-photo-section" style={{ position: "absolute", left: "18mm", right: "18mm", bottom: "33mm" }}>
            <h2>（2）测试照片</h2>
            <div className="two-photo-panels efficiency-photo-panels"><div><h3>改造前过滤器后颗粒物实测</h3><PhotoGrid data={data} slot="particlePre"/></div><div><h3>改造后过滤器后颗粒物实测</h3><PhotoGrid data={data} slot="particlePost"/></div></div>
          </div>
        </>}

        {sec.key==="power"&&<>
          <h2>（1）测试数据</h2>
          {(["before","after"] as const).map(phase=>{const rows=data.power[phase].filter(r=>r.date||r.previousMeter||r.currentMeter||r.runtimeHours||r.fanPower||r.filterPower||r.totalOverride||r.hourlyOverride||r.note);if(!rows.length)return null;return <div key={phase}><h3 style={{fontSize:"0.9em",margin:"6px 0 4px",textAlign:"left"}}>{phase==="before"?"改造前":"改造后"}</h3><table className="data-table power-table"><thead><tr>{["序号","测试日期","上次电表数（kWh）","本次电表数（kWh）","累计用电量（kWh）","累计运行时长（h）","风机功率（kW）","过滤器功率（kW）","总用电量（kWh）","每小时用电量（kWh/h）","备注"].map((h)=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row,i)=>{const p=powerValues(row,data.meterIncludesFilter);return <tr key={i}><td>{i+1}</td><td>{row.date}</td><td>{row.previousMeter}</td><td>{row.currentMeter}</td><td>{value(p.metered)}</td><td>{row.runtimeHours}</td><td>{row.fanPower}</td><td>{row.filterPower}</td><td>{value(p.total)}</td><td>{value(p.hourly)}</td><td>{row.note}</td></tr>})}{(()=>{const hourlyVals=rows.map(r=>powerValues(r,data.meterIncludesFilter).hourly).filter((v):v is number=>v!==null);const avg=hourlyVals.length>0?Number((hourlyVals.reduce((a,b)=>a+b,0)/hourlyVals.length).toFixed(3)):null;return avg!==null?<tr key="avg"><td colSpan={9} style={{textAlign:"right",fontWeight:600,paddingRight:8}}>平均每小时用电量（kWh/h）</td><td>{avg}</td><td/></tr>:null;})()}</tbody></table></div>})}
          <p className="note">注：若是介质类过滤器，过滤器功率记录为0；如果电表未监测静电过滤器用电量，静电过滤器用电量根据参数表和项目实际数量得出。</p>
          <div className="photo-section power-photo-section" style={{ position: "absolute", left: "18mm", right: "18mm", bottom: "33mm" }}>
            <h2>（2）测试照片</h2>
            <div className="two-photo-panels power-photo-panels"><div><h3>改造前用电实测</h3><PhotoGrid data={data} slot="powerPre"/></div><div><h3>改造后用电实测</h3><PhotoGrid data={data} slot="powerPost"/></div></div>
          </div>
        </>}

      </section>;
    })}
    <section className="report-page conclusion-page">
      <Header number={reportNumber} page={totalPages} totalPages={totalPages}/>
      <h2 className="chapter-title">{chNums[activeSecs.length]}、报告结论</h2>
      <div className="conclusion-content">
        <p>安装 <b>{data.basic.after.productName||"—"}</b> 相比安装 <b>{data.basic.before.productName||"—"}</b>：</p>
        <ol>
          <li>风速（新风量）增加了 {metric(conclusion.airflowIncrease)}；<div className="conclusion-formula">{conclusionFormulas[0]}</div></li>
          <li>PM2.5 净化效率（按差值）提高了 {metric(conclusion.efficiencyGain.pm25)}；<div className="conclusion-formula">{conclusionFormulas[1]}</div></li>
          <li>≥0.5μm 净化效率（按差值）提高了 {metric(conclusion.efficiencyGain.p05)}；<div className="conclusion-formula">{conclusionFormulas[2]}</div></li>
          <li>≥5μm 净化效率（按差值）提高了 {metric(conclusion.efficiencyGain.p5)}；<div className="conclusion-formula">{conclusionFormulas[3]}</div></li>
          <li>每小时用电量节省 {metric(conclusion.hourlySavingPercent)}；<div className="conclusion-formula">{conclusionFormulas[4]}</div></li>
          <li>累计10年可以节省电量 {metric(conclusion.tenYearSavingKwh," kWh")}。<div className="conclusion-formula">{conclusionFormulas[5]}</div></li>
        </ol>
      </div>
      <div className="staff-signatures"><span><b>测试：</b><i/></span><span><b>审核：</b><i/></span><span><b>批准：</b><i/></span></div>
      <div className="inspection-seal">
        <p><span>检测单位（盖章）：</span><b>爱优特空气技术（上海）有限公司</b></p>
        <p><span>日期：</span><i/>年<i/>月<i/>日</p>
      </div>
      <h2 className="customer-opinion-heading">{chNums[activeSecs.length+1]}、客户意见</h2>
      <div className="customer-opinion">
        <p className="opinion-title">客户意见：</p>
        <p>□ 测试项目符合要求，测试数据真实。</p>
        <p>□ 其他：</p>
        <div className="opinion-sign"><p><span>单位（盖章）：</span><i/></p><p><span>日期：</span><i/></p></div>
      </div>
    </section>
  </div>;
}
