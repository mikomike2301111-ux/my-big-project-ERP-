#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const p=path.join(__dirname,'..','src','main.jsx'),mark='/* dashboard-accuracy-ui-v1 */';
let s=fs.readFileSync(p,'utf8');
if(!s||s.trim()==='PLACEHOLDER'||s.length<50000) throw new Error('main.jsx not restored');
if(!s.includes(mark)){
 const a=s.indexOf('function KpiCard('),sp=s.indexOf('function Sparkline(',a),pn=s.indexOf('function Panel(',sp);
 if(a<0||sp<0||pn<0) throw new Error('KPI components not found');
 const kpi=`function KpiCard({ icon: Icon, label, value, change, changeLabel = 'comparison unavailable', tone, series }) {
  const pct = change === null || change === undefined || change === '' ? NaN : Number(change);
  const showPct = Number.isFinite(pct);
  return <article className={`kpi-card kpi-card-aligned kpi-card-spark tone-${tone || 'green'}`}>
    <div className="kpi-head"><span><Icon size={18} /></span><strong>{label}</strong></div>
    <h3 title={String(value)}>{value}</h3>
    <div className="kpi-meta">{showPct ? <em className={pct >= 0 ? 'up' : 'down'}>{pct >= 0 ? '+' : ''}{Number(pct).toFixed(1).replace(/\\.0$/, '')}%</em> : <em>—</em>}<small>{changeLabel}</small></div>
    <Sparkline tone={tone} series={series} />
  </article>;
}
`;
 s=s.slice(0,a)+kpi+s.slice(sp);
 const sp2=s.indexOf('function Sparkline('),pn2=s.indexOf('function Panel(',sp2);
 const spark=`function Sparkline({ tone, series }) {
  const data=Array.isArray(series)&&series.length?series.slice(-12).map((v,i)=>({i,v:Number(v)||0})):[];
  if(!data.length) return <div className="sparkline sparkline-empty" aria-label="Trend unavailable">Trend unavailable</div>;
  const color=tone==='red'?'#dc2626':tone==='blue'?'#2563eb':'#16a34a';
  const animKey=data.map(d=>d.v).join('-')+'-'+(tone||'g');
  return <div className="sparkline" aria-hidden="true"><ResponsiveContainer width="100%" height={32}>
    <AreaChart key={animKey} data={data} margin={{top:4,right:2,left:2,bottom:0}}>
      <defs><linearGradient id={`spark-${tone||'green'}-${animKey.slice(0,12)}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.22}/><stop offset="100%" stopColor={color} stopOpacity={0}/></linearGradient></defs>
      <Area type="monotone" dataKey="v" stroke={color} fill={`url(#spark-${tone||'green'}-${animKey.slice(0,12)})`} strokeWidth={2.25} isAnimationActive={false} dot={false} activeDot={false}/>
    </AreaChart></ResponsiveContainer></div>;
}
`;
 s=s.slice(0,sp2)+spark+s.slice(pn2);
 const ds=s.indexOf('function Dashboard('),de=s.indexOf('function AnalyticsCenter(',ds);
 if(ds<0||de<0) throw new Error('Dashboard component not found');
 let d=s.slice(ds,de);
 d=d.replace('change={s.revenueChange ?? 0} tone="green"','change={s.revenueChange} changeLabel="vs last year" tone="green"');
 d=d.replace("change={s.profitChange ?? 0} tone={num(s.netProfit) >= 0 ? 'green' : 'red'}","change={s.profitChange} changeLabel=\"vs last year\" tone={num(s.netProfit) >= 0 ? 'green' : 'red'}");
 d=d.replace('label="Cash Position" value={currency(s.cashPosition)} change={s.cashChange ?? 0}','label="Collected" value={currency(s.cashPosition)} change={null} changeLabel="comparison unavailable"');
 d=d.replace('change={s.inventoryChange ?? 0}','change={null} changeLabel="comparison unavailable"');
 d=d.replace('change={s.pipelineChange ?? 0}','change={null} changeLabel="comparison unavailable"');
 d=d.replace('change={s.productionChange ?? 0}','change={null} changeLabel="comparison unavailable"');
 d=d.replace("const colors = ['#6d4aff', '#377dff', '#3cc76f', '#ffac33', '#f64e4e'];","const colors = ['#2563eb', '#ea580c', '#16a34a', '#7c3aed', '#0891b2'];\n  const hasChartData = chartRows.some(row => ['revenue','expenses','profit'].some(key => Number(row && row[key]) !== 0));");
 const old=`<Panel className="span-7" title="Revenue Overview" action={
          <div className="chart-period-switch">
            <Filter size={14} />
            {['Day', 'Week', 'Month', 'Quarter', 'Year'].map(item => (
              <button key={item} type="button" className={globalPeriod === item ? 'active' : ''} onClick={() => setGlobalPeriod(item)}>
                {item}
              </button>
            ))}
          </div>
        }>
          <ResponsiveContainer width="100%" height={260}>
            <ReLineChart data={chartRows} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#eef0f3" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#667085', fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} domain={[0, 'auto']} tick={{ fill: '#667085', fontSize: 12 }} tickFormatter={v => `Ksh${Math.round(v / 1000)}K`} />
              <Tooltip formatter={v => currency(v)} />
              <Line type="monotone" dataKey="revenue" stroke="#050505" strokeWidth={3} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="expenses" stroke="#a7afbd" strokeWidth={3} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="profit" stroke="#101828" strokeWidth={3} dot={{ r: 4 }} />
            </ReLineChart>
          </ResponsiveContainer>
        </Panel>`;
 const newer=`<Panel className="span-7" title="Revenue Overview" action={<div className="chart-period-switch"><Filter size={14}/>{['Day','Week','Month','Quarter','Year'].map(item=><button key={item} type="button" className={globalPeriod===item?'active':''} onClick={()=>setGlobalPeriod(item)}>{item}</button>)}</div>}>
          {hasChartData ? <ResponsiveContainer width="100%" height={280}><ReLineChart data={chartRows} margin={{top:16,right:18,left:8,bottom:4}}>
            <CartesianGrid stroke="#e4e7ec" strokeDasharray="3 5" vertical={false}/>
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{fill:'#667085',fontSize:12}}/>
            <YAxis tickLine={false} axisLine={false} domain={['auto','auto']} tick={{fill:'#667085',fontSize:11}} tickFormatter={v=>Math.abs(v)>=1000?`Ksh${(v/1000).toFixed(1)}k`:`Ksh${Math.round(v)}`}/>
            <Tooltip formatter={v=>currency(v)} cursor={{stroke:'#98a2b3',strokeDasharray:'4 4'}}/>
            <Legend verticalAlign="top" align="right" iconType="circle" iconSize={8} wrapperStyle={{fontSize:11}}/>
            <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#2563eb" strokeWidth={2.8} dot={false} activeDot={{r:5}} isAnimationActive={false}/>
            <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#ea580c" strokeWidth={2.8} dot={false} activeDot={{r:5}} isAnimationActive={false}/>
            <Line type="monotone" dataKey="profit" name="Profit" stroke="#16a34a" strokeWidth={2.8} dot={false} activeDot={{r:5}} isAnimationActive={false}/>
          </ReLineChart></ResponsiveContainer> : <div className="chart-empty-state"><strong>No revenue trend for this period</strong><span>The graph will show recorded sales and expenses when data exists for the selected period.</span></div>}
        </Panel>`;
 if(!d.includes(old)) throw new Error('Revenue chart block mismatch');
 d=d.replace(old,newer);
 d=d.replace('<Panel className="span-6" title="Top Products" action="View all">','<Panel className="span-6" title="Top Categories">');
 d=d.replace('<TopProducts categories={categories} />','<TopProducts categories={categories} total={categoryTotal} />');
 const catStart=d.indexOf('<Panel className="span-5" title="Sales by Category">');
 const catEnd=d.indexOf('<Panel className="span-4 attention-panel"',catStart);
 if(catStart<0||catEnd<0) throw new Error('category panel not found');
 const categoryPanel=`<Panel className="span-5" title="Sales by Category">
          {categories.some(item => Number(item.total) > 0) ? <div className="category-panel">
            <ResponsiveContainer width="45%" height={230}><PieChart><Pie data={categories} dataKey="total" innerRadius={62} outerRadius={104} paddingAngle={2}>{categories.map((_,i)=><Cell key={i} fill={colors[i%colors.length]}/>)}</Pie></PieChart></ResponsiveContainer>
            <div className="category-list">{categories.map((item,index)=><div key={item.name}><span style={{'--dot':colors[index%colors.length]}}>{item.name}</span><strong>{currency(item.total)}</strong><em>{Math.round(Number(item.total||0)/Math.max(1,categoryTotal)*100)}%</em></div>)}</div>
          </div> : <div className="chart-empty-state"><strong>No category sales recorded</strong><span>Category visuals appear when real sales line items are recorded.</span></div>}
        </Panel>
        `;
 d=d.slice(0,catStart)+categoryPanel+d.slice(catEnd);
 s=s.slice(0,ds)+d+s.slice(de);
 const ts=s.indexOf('function TopProducts('),te=s.indexOf('// ─── EMAIL WORKSPACE',ts);
 if(ts<0||te<0) throw new Error('TopProducts not found');
 const top=`function TopProducts({ categories = [], total = 0 }) {
  const rows=(Array.isArray(categories)?categories:[]).filter(item=>Number(item&&item.total)>0).slice(0,5);
  if(!rows.length) return <div className="quiet-state">No recorded category sales yet.</div>;
  const shownTotal=Number(total)>0?Number(total):rows.reduce((sum,item)=>sum+Number(item.total||0),0);
  return <div className="product-list">{rows.map(item=><div key={item.name}><span className="product-icon"><Package size={20}/></span><strong>{item.name}</strong><em>{Math.round(Number(item.total||0)/Math.max(1,shownTotal)*100)}%</em><b>{currency(item.total)}</b></div>)}</div>;
}
`;
 s=s.slice(0,ts)+top+s.slice(te);
 s=s.replace('<span>Next month revenue</span>','<span>Next month revenue (run-rate)</span>');
 s=s.replace('<span>Expected cash</span>','<span>Outstanding invoices</span>');
 s=s.replace('<p>{forecast.summary}</p>',"<p>{forecast.summary} {forecast.forecastBasis || ''}</p>");
 const i=s.indexOf('function KpiCard(');s=s.slice(0,i)+mark+'\n'+s.slice(i);
 fs.writeFileSync(p,s);
}
console.log('[dashboard-accuracy-ui] complete');
