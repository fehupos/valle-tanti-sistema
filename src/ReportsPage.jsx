import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import './ReportsPage.css';

const money = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const integer = (v) => Number(v || 0).toLocaleString('pt-BR');
const percent = (v) => `${Number(v || 0).toFixed(1).replace('.', ',')}%`;
const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const metricNames = {count:'Quantidade', revenue:'Valor vendido', ticket:'Ticket médio'};
const numeric = r => r.sale_amount != null && Number.isFinite(Number(r.sale_amount)) && Number(r.sale_amount) >= 0;
const metricValue = (rows, metric) => {
  if (metric === 'count') return rows.length;
  const valid = rows.filter(numeric);
  const sum = valid.reduce((a,r)=>a+Number(r.sale_amount),0);
  return metric === 'ticket' ? (valid.length ? sum / valid.length : 0) : sum;
};
const formatMetric = (v, metric) => metric === 'count' ? integer(v) : money(v);

function BarRows({ items, metric = 'count', maxItems = 10 }) {
  const max = Math.max(1, ...items.slice(0,maxItems).map(i=>i.value));
  return <div className="vr-bars">
    {items.slice(0,maxItems).map(item=><div className="vr-bar-row" key={item.label}>
      <div title={item.label} className="vr-bar-label">{item.label}</div>
      <div className="vr-bar-track"><div className="vr-bar-fill" style={{width:`${Math.max(1,(item.value/max)*100)}%`}} /></div>
      <strong>{formatMetric(item.value, metric)}</strong>
    </div>)}
    {!items.length && <p>Sem dados para os filtros selecionados.</p>}
  </div>;
}
function DistributionDonut({ items, totalLabel = 'vendas' }) {
  const total = items.reduce((a,i)=>a+i.value,0);
  let cursor=0;
  const palette=['#142b46','#d4a56f','#26868b','#8a6bc0'];
  const gradient=total ? items.map((i,index)=>{
    const a=cursor/total*100;
    cursor+=i.value;
    return `${palette[index%palette.length]} ${a}% ${cursor/total*100}%`;
  }).join(',') : '#e8edf3 0% 100%';
  return <div className="vr-sex"><div className="vr-donut" style={{background:`conic-gradient(${gradient})`}}><div>{integer(total)}<small>{totalLabel}</small></div></div><div className="vr-legend">{items.map((item,i)=><p key={item.label}><i className="vr-dot" style={{background:palette[i%palette.length]}}/>{item.label}<strong>{integer(item.value)} ({percent(total?item.value/total*100:0)})</strong></p>)}</div></div>;
}

function groupRank(rows, key, metric) {
  const groups = new Map();
  for (const row of rows) {
    const label = (row[key] || 'Não informado').trim();
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(row);
  }
  return [...groups].map(([label,data])=>({label,value:metricValue(data,metric)})).sort((a,b)=>b.value-a.value);
}

const yearColors = ['#142b46','#bc8750','#26868b','#8a6bc0','#b34e65'];
const cleanColor = (v) => String(v || '').trim().replace(/\s+/g,' ') || 'Não informado';
const sexLabel = (v) => v === 'macho' ? 'Machos' : v === 'femea' ? 'Fêmeas' : v;

/** Compara anos por mês usando o mesmo critério de métrica da tela principal. */
function YearComparison({ rows, years, metric }) {
  const [selected, setSelected] = useState([]);
  const activeYears = useMemo(() => (selected.length ? selected : years.slice(0,3)).filter(y=>years.includes(y)).slice(0,5), [selected,years]);
  const series = useMemo(()=>activeYears.map((y,i)=>({
    year:y, color:yearColors[i], values:months.map((_,m)=>{const period=rows.filter(r=>String(r.sale_date||'').slice(0,4)===y && Number(String(r.sale_date||'').slice(5,7))===m+1);return period.length?metricValue(period,metric):null;})
  })),[activeYears,rows,metric]);
  const max = Math.max(1,...series.flatMap(s=>s.values.filter(v=>v!==null)));
  const left=55,top=15,width=760,height=235,plotWidth=width-left-20,plotHeight=height-top-45;
  const x = i=>left+(plotWidth*i/11), y = v=>top+plotHeight-(v/max)*plotHeight;
  function toggleYear(yr){
    const current=selected.length?selected:years.slice(0,3);
    const next=current.includes(yr)?current.filter(y=>y!==yr):[...current,yr];
    if(next.length && next.length<=5) setSelected(next);
  }
  return <>
    <div className="vr-year-options" role="group" aria-label="Anos para comparação">
      {years.map(yr=><label key={yr}><input type="checkbox" checked={activeYears.includes(yr)} onChange={()=>toggleYear(yr)}/>{yr}</label>)}
    </div>
    <div className="vr-comparison-legend">{series.map(item=><span key={item.year}><i style={{background:item.color}}/>{item.year}</span>)}</div>
    <div className="vr-chart-scroll"><svg className="vr-comparison-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Comparação mensal por ano: ${metricNames[metric]}`}>
      {[0,.25,.5,.75,1].map(t=><g key={t}><line x1={left} x2={width-20} y1={y(max*t)} y2={y(max*t)} stroke="#dfe5ed" strokeDasharray="3 5"/><text x={left-8} y={y(max*t)+4} textAnchor="end" fontSize="10" fill="#64748b">{metric==='count'?integer(Math.round(max*t)):Number(max*t).toLocaleString('pt-BR',{notation:'compact',maximumFractionDigits:1})}</text></g>)}
      {months.map((m,i)=><text key={m} x={x(i)} y={height-18} textAnchor="middle" fontSize="11" fill="#64748b">{m}</text>)}
      {series.map(item=><g key={item.year}>
        {item.values.slice(1).map((v,i)=>v!==null&&item.values[i]!==null?<line key={i} x1={x(i)} y1={y(item.values[i])} x2={x(i+1)} y2={y(v)} stroke={item.color} strokeWidth="2.8" strokeLinecap="round"/>:null)}
        {item.values.map((v,i)=>v===null?null:<circle key={i} cx={x(i)} cy={y(v)} r="3.2" fill={item.color}><title>{`${months[i]}/${item.year}: ${formatMetric(v,metric)}`}</title></circle>)}
      </g>)}
    </svg></div>
    <p className="vr-muted">Até cinco anos simultâneos. Usa os filtros de raça, sexo e pelagem; ignora o filtro de ano para permitir a comparação.</p>
  </>;
}

/** Cruzamento por cor e sexo: contagem, valor registrado e ticket por grupo. */
function SexColorMatrix({ rows }) {
  const [showAll,setShowAll] = useState(false);
  const groups=useMemo(()=>{
    const map=new Map();
    for(const r of rows){
      const label=cleanColor(r.coat_color);
      if(label==='Não informado') continue;
      if(!map.has(label)) map.set(label,{label,macho:[],femea:[]});
      if(r.gender==='macho'||r.gender==='femea') map.get(label)[r.gender].push(r);
    }
    return [...map.values()].map(g=>({
      label:g.label,
      machoCount:g.macho.length,femeaCount:g.femea.length,
      machoTicket:g.macho.some(numeric)?metricValue(g.macho,'ticket'):null,
      femeaTicket:g.femea.some(numeric)?metricValue(g.femea,'ticket'):null,
      totalCount:g.macho.length+g.femea.length,
      totalRevenue:metricValue([...g.macho,...g.femea],'revenue')
    })).sort((a,b)=>b.totalCount-a.totalCount);
  },[rows]);
  const visible=showAll?groups:groups.slice(0,12);
  const maxCount=Math.max(1,...visible.map(x=>x.totalCount));
  return <>
    <div className="vr-matrix-scroll"><table className="vr-matrix"><thead><tr><th>Cor</th><th>Distribuição por sexo</th><th>Machos</th><th>Ticket macho</th><th>Fêmeas</th><th>Ticket fêmea</th></tr></thead><tbody>
      {visible.map(row=><tr key={row.label}>
        <td title={row.label}>{row.label}</td>
        <td><div className="vr-split-bar" title={`${row.machoCount} machos e ${row.femeaCount} fêmeas`} style={{width:`${Math.max(14,row.totalCount/maxCount*100)}%`}}>{row.machoCount>0&&<i style={{width:`${row.machoCount/row.totalCount*100}%`}}/>}{row.femeaCount>0&&<b style={{width:`${row.femeaCount/row.totalCount*100}%`}}/>}</div></td>
        <td>{integer(row.machoCount)}</td><td>{row.machoTicket===null?'—':money(row.machoTicket)}</td>
        <td>{integer(row.femeaCount)}</td><td>{row.femeaTicket===null?'—':money(row.femeaTicket)}</td>
      </tr>)}
      {!visible.length&&<tr><td colSpan={6}>Nenhuma cor informada para os filtros selecionados.</td></tr>}
    </tbody></table></div>
    {groups.length>12&&<button className="vr-more" type="button" onClick={()=>setShowAll(v=>!v)}>{showAll?'Mostrar apenas 12 cores':`Ver todas as ${groups.length} cores`}</button>}
    <p className="vr-muted">Ticket médio considera apenas vendas com valor válido. “—” significa ausência de valor válido para o grupo. Cores com grafias diferentes podem aparecer separadas até a padronização.</p>
  </>;
}

export default function ReportsPage({ userProfile }) {
  const [all,setAll] = useState([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [year,setYear] = useState(String(new Date().getFullYear()));
  const [breed,setBreed] = useState('Chihuahua');
  const [sex,setSex] = useState('all');
  const [coat,setCoat] = useState('all');
  const [metric,setMetric] = useState('count');

  useEffect(()=>{
    let alive = true;
    async function load(){
      if (userProfile?.role !== 'gestao') return;
      setLoading(true);setError('');
      const data = [];
      let start = 0;
      const pageSize = 1000;
      try {
        while(true){
          const { data: part, error: err } = await supabase
            .from('historical_sales')
            .select('source_row,sale_date,sale_amount,breed,gender,coat,coat_color,buyer_uf,payment_method,data_quality,warnings')
            .order('source_row',{ascending:true}).range(start,start+pageSize-1);
          if(err) throw err;
          data.push(...(part||[]));
          if(!part || part.length < pageSize) break;
          start += pageSize;
          if(start >= 100000) throw new Error('Volume inesperado de dados. Consulte a Gestão.');
        }
        if(alive) setAll(data);
      }catch(e){if(alive)setError(e.message || 'Falha ao consultar histórico.');}
      finally{if(alive)setLoading(false);}
    }
    load();return()=>{alive=false;};
  },[userProfile?.role]);

  const years = useMemo(()=>[...new Set(all.map(x=>String(x.sale_date || '').slice(0,4)).filter(Boolean))].sort((a,b)=>b.localeCompare(a)),[all]);
  const breeds = useMemo(()=>[...new Set(all.map(x=>x.breed).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),[all]);
  const base = useMemo(()=>all.filter(r =>
    (breed === 'all' || r.breed === breed) && (sex === 'all' || r.gender === sex) &&
    (coat === 'all' || (r.coat || 'Não informado') === coat)
  ),[all,breed,sex,coat]);
  const filtered = useMemo(()=>base.filter(r=>year==='all'||String(r.sale_date).slice(0,4)===year),[base,year]);
  const salesCount=filtered.length;
  const validAmount=filtered.filter(numeric);
  const total=metricValue(filtered,'revenue');
  const avg=metricValue(filtered,'ticket');
  const missing=filtered.length-validAmount.length;
  const duplicate=filtered.filter(x=>String(x.warnings||'').toUpperCase().includes('DUPL')).length;
  const monthly=useMemo(()=>months.map((label,i)=>({label,value:metricValue(filtered.filter(r=>Number(String(r.sale_date).slice(5,7))===i+1),metric)})),[filtered,metric]);
  const maxMonthly=Math.max(1,...monthly.map(m=>m.value));
  const monthlyDelta=useMemo(()=>{
    const yearNum=Number(year);
    const currentYear=new Date().getFullYear();
    const currentMonth=new Date().getMonth()+1;
    return monthly.map((entry,i)=>{
      if(i===0||year==='all'||(yearNum===currentYear&&i+1>currentMonth)) return null;
      const prior=monthly[i-1].value;
      if(prior<=0 || !filtered.some(r=>Number(String(r.sale_date).slice(5,7))===i+1)) return null;
      const change=(entry.value-prior)/prior*100;
      return {change, label:`${change>=0?'+':''}${change.toFixed(1).replace('.',',')}%`};
    });
  },[monthly,year,filtered]);
  const colors=useMemo(()=>groupRank(filtered,'coat_color',metric),[filtered,metric]);
  const coatParts=useMemo(()=>{
    const counts={curto:0,longo:0,other:0};
    for(const r of filtered){if(r.coat==='curto')counts.curto++;else if(r.coat==='longo')counts.longo++;else counts.other++;}
    return [{label:'Pelo curto',value:counts.curto},{label:'Pelo longo',value:counts.longo},{label:'Não informado',value:counts.other}];
  },[filtered]);
  const locationParts=useMemo(()=>{
    const counts={inside:0,outside:0,missing:0};
    for(const r of filtered){const uf=String(r.buyer_uf||'').trim().toUpperCase();if(uf==='SP')counts.inside++;else if(/^[A-Z]{2}$/.test(uf))counts.outside++;else counts.missing++;}
    return [{label:'Dentro de SP',value:counts.inside},{label:'Fora de SP',value:counts.outside},{label:'Não informado',value:counts.missing}];
  },[filtered]);
  const paymentParts=useMemo(()=>{
    const options=[
      {label:'PIX',value:0},
      {label:'Parcelado',value:0},
      {label:'Link de Pagamento',value:0},
      {label:'Dinheiro',value:0}
    ];
    const lookup=new Map(options.map((item,index)=>[item.label,index]));
    let other=0;
    for(const r of filtered){
      const raw=String(r.payment_method||'').trim();
      if(!raw) continue;
      const simplified=raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
      const label=simplified==='pix'?'PIX':
        simplified==='parcelado'?'Parcelado':
        ['link de pagamento','link pagamento','link'].includes(simplified)?'Link de Pagamento':
        ['dinheiro','especie','em especie'].includes(simplified)?'Dinheiro':null;
      if(label) options[lookup.get(label)].value++;
      else other++;
    }
    if(other) options.push({label:'Outros',value:other});
    return options;
  },[filtered]);
  const paymentKnown=paymentParts.reduce((total,item)=>total+item.value,0);
  const [heatMetric,setHeatMetric] = useState('count');
  const sexM=filtered.filter(r=>r.gender==='macho').length;
  const sexF=filtered.filter(r=>r.gender==='femea').length;
  const yearRows=useMemo(()=>Array.from({length:5},(_,index)=>{
    const y=String(new Date().getFullYear()-index);
    const monthly=months.map((_,i)=>{
      const period=base.filter(r=>String(r.sale_date).slice(0,4)===y && Number(String(r.sale_date).slice(5,7))===i+1);
      return period.length?metricValue(period,heatMetric):null;
    });
    const values=monthly.filter(n=>n!==null && Number.isFinite(n));
    return {year:y,monthly,low:values.length?Math.min(...values):0,high:values.length?Math.max(...values):0};
  }),[base,heatMetric]);
  // Escala independente para cada ano: intensidade relativa aos meses do mesmo ano.
  const heatCellStyle=(value,row)=>{
    if(value===null) return {background:'rgba(20,43,70,0.04)',color:'#6b7686'};
    const intensity=row.high===row.low ? 0.66 : (value-row.low)/(row.high-row.low);
    const opacity=0.15 + 0.75*intensity;
    return {background:`rgba(20,43,70,${opacity})`,color:opacity>=0.53?'white':'#203047'};
  };

  if(userProfile?.role!=='gestao') return <main className="content"><p>Relatórios disponíveis somente para Gestão.</p></main>;
  return <main className="content vr-page">
    <header className="page-header"><div><h1>Relatórios de Gestão</h1><p>Histórico de vendas • visão comercial e perfil dos animais vendidos</p></div></header>
    {error && <div className="alert error" role="alert">{error}</div>}
    {loading ? <section className="panel"><p>Carregando histórico de vendas...</p></section> : <>
      <section className="panel vr-filters">
        <label>Ano<select value={year} onChange={e=>setYear(e.target.value)}><option value="all">Todos os anos</option>{years.map(y=><option key={y}>{y}</option>)}</select></label>
        <label>Raça<select value={breed} onChange={e=>setBreed(e.target.value)}><option value="all">Todas as raças</option>{breeds.map(b=><option key={b}>{b}</option>)}</select></label>
        <label>Sexo<select value={sex} onChange={e=>setSex(e.target.value)}><option value="all">Todos</option><option value="macho">Macho</option><option value="femea">Fêmea</option></select></label>
        <label>Pelagem<select value={coat} onChange={e=>setCoat(e.target.value)}><option value="all">Todas</option><option value="curto">Curto</option><option value="longo">Longo</option><option value="Não informado">Não informado</option></select></label>
      </section>
      <div className="vr-kpis">
        <article className="vr-kpi"><span>Valor vendido registrado</span><strong>{money(total)}</strong></article>
        <article className="vr-kpi"><span>Quantidade de vendas</span><strong>{integer(salesCount)}</strong></article>
        <article className="vr-kpi"><span>Ticket médio*</span><strong>{money(avg)}</strong></article>
      </div>
      <section className="panel vr-panel"><div className="vr-head"><h2>Evolução mensal</h2><div className="vr-segments">{Object.entries(metricNames).map(([id,label])=><button type="button" key={id} aria-pressed={metric===id} className={metric===id?'selected':''} onClick={()=>setMetric(id)}>{label}</button>)}</div></div>
        <div className="vr-month-chart" role="img" aria-label={`Gráfico de ${metricNames[metric]} por mês`}>
          {monthly.map(({label,value},i)=><div className="vr-month" key={label} title={`${label}: ${formatMetric(value,metric)}`}><div className="vr-month-val">{formatMetric(value,metric)}</div><div className="vr-month-rail"><div style={{height:`${value?Math.max(4,100*value/maxMonthly):0}%`}} /></div><span className="vr-month-label">{label}</span><span className={`vr-delta-slot ${monthlyDelta[i]?(monthlyDelta[i].change>=0?'positive':'negative'):''}`} title={monthlyDelta[i]?'Variação em relação ao mês anterior':undefined}>{monthlyDelta[i]?<>{monthlyDelta[i].change>=0?'▲':'▼'} {monthlyDelta[i].label}</>:null}</span></div>)}
        </div>
      </section>
      <section className="panel vr-panel"><div className="vr-head"><h2>Comparação mensal entre anos</h2><span className="vr-muted">{metricNames[metric]}</span></div><YearComparison rows={base} years={years} metric={metric}/></section>
      <div className="vr-grid vr-grid-distributions">
        <section className="panel vr-panel"><h2>Sexo dos filhotes</h2><DistributionDonut items={[{label:'Machos',value:sexM},{label:'Fêmeas',value:sexF}]}/></section>
        <section className="panel vr-panel"><h2>Pelagem</h2><DistributionDonut items={coatParts}/></section>
        <section className="panel vr-panel"><h2>Localização dos compradores</h2><DistributionDonut items={locationParts}/></section>
        <section className="panel vr-panel"><h2>Modalidade de compra</h2><DistributionDonut items={paymentParts}/>{!paymentKnown&&<p className="vr-muted vr-empty-payment">Sem modalidades informadas na base histórica. O gráfico está preparado para PIX, Parcelado, Link de Pagamento e Dinheiro.</p>}</section>
      </div>
      <section className="panel vr-panel"><div className="vr-head"><h2>Cores mais vendidas</h2><span className="vr-muted">{metricNames[metric]} • principais 12 cores</span></div><BarRows items={colors} metric={metric} maxItems={12}/></section>
      <section className="panel vr-panel"><div className="vr-head"><h2>Cor × sexo × ticket médio</h2><span className="vr-muted">{integer(filtered.length)} vendas filtradas</span></div><SexColorMatrix rows={filtered}/></section>
      <section className="panel vr-panel"><div className="vr-head"><h2>Mapa de calor: vendas por mês e ano</h2><div className="vr-segments" role="group" aria-label="Métrica do mapa de calor"><button type="button" className={heatMetric==='count'?'selected':''} aria-pressed={heatMetric==='count'} onClick={()=>setHeatMetric('count')}>Quantidade</button><button type="button" className={heatMetric==='revenue'?'selected':''} aria-pressed={heatMetric==='revenue'} onClick={()=>setHeatMetric('revenue')}>Valor total</button></div></div><p className="vr-muted">Últimos cinco anos, incluindo o atual. A intensidade da cor é calculada separadamente em cada ano. Filtros de raça, sexo e pelagem se aplicam independentemente do ano selecionado acima.</p><div className="vr-heat-overflow"><div className="vr-heat"><span className="vr-year"/>{months.map(m=><span key={m} className="vr-heat-header">{m}</span>)}{yearRows.map(row=><div className="vr-heat-row" key={row.year}><strong className="vr-year">{row.year}</strong>{row.monthly.map((n,i)=><span key={i} title={`${row.year} / ${months[i]}: ${n===null?'sem registros':formatMetric(n,heatMetric)}`} className="vr-heat-cell" style={heatCellStyle(n,row)}>{n===null?'–':heatMetric==='revenue'?Number(n).toLocaleString('pt-BR',{notation:'compact',maximumFractionDigits:1}):integer(n)}</span>)}</div>)}</div></div></section>
      <p className="vr-notes">Fonte: base histórica do sistema antigo. Excluídos registros sem sexo informado. *Ticket médio calculado somente sobre vendas com valor válido. {missing ? `${missing} registro(s) neste filtro não possuem valor válido. ` : ''}{duplicate ? `${duplicate} registro(s) com possível duplicidade ainda não revisada. ` : ''}UF não informada aparece separadamente no gráfico geográfico. Modalidades de pagamento sem valor cadastrado não são estimadas. Comparações mês a mês só aparecem quando um ano específico está selecionado e o mês anterior tem valor positivo. Os registros históricos não são misturados com vendas de teste do sistema atual.</p>
    </>}
  </main>;
}
