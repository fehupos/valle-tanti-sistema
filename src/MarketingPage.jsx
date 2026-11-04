import { useEffect, useMemo, useState, useId } from 'react';
import { supabase } from './supabase';
import './MarketingPage.css';

const todaySP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
const money = (n) => Number(n || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
// Rótulos compactos no gráfico diário: sem símbolo monetário nem casas decimais.
const dailyNumber = (n) => Math.round(Number(n || 0)).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const pct = (n) => `${Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const shortDate = (str) => str ? new Date(`${str.slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const sum = (arr, field) => arr.reduce((a, b) => a + Number(b[field] || 0), 0);
function defaultDates() {
  const t = todaySP();
  return { from: `${t.slice(0,7)}-01`, to: t };
}
function monthInfo(key) {
  const [year, month] = key.split('-').map(Number);
  const first = `${key}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: first, to: `${key}-${String(lastDay).padStart(2, '0')}` };
}
function recentMonths() {
  const [year, month] = todaySP().slice(0, 7).split('-').map(Number);
  return Array.from({ length: 4 }, (_, index) => {
    const d = new Date(Date.UTC(year, month - 1 - index, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    return { key, label: d.toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' }) };
  });
}

const METRIC_HELP = {
  spend: 'Total investido nos anúncios das plataformas selecionadas durante o período. Valor informado pelas APIs após a última sincronização.',
  impressions: 'Número de vezes que os anúncios foram exibidos. Uma mesma pessoa pode gerar várias impressões.',
  clicks: 'Cliques informados pelas plataformas de anúncios. Não representam necessariamente visitas ao site ou conversas iniciadas.',
  cpc: 'Custo por clique médio: investimento dividido pelo total de cliques em anúncios. Não é custo por lead.',
  visits: 'Quantidade de eventos de visita registrados pelo nosso site, considerando todas as origens. Não equivale necessariamente a visitantes únicos.',
  whatsapp: 'Quantidade de cliques nos botões de WhatsApp do site, incluindo diferentes origens. Não confirma o envio de mensagem.',
  rate: 'Cliques em botões de WhatsApp divididos pelas visitas registradas no site, vezes 100. É uma relação entre eventos, não uma taxa de pessoas únicas.',
  campaigns: 'Campanhas com detalhamento disponível para o período. Exportações manuais diárias sem identificador de campanha não são contadas como campanhas.',
};

const DAILY_METRICS = [
  { key: 'spend', label: 'Investimento', format: dailyNumber },
  { key: 'impressions', label: 'Impressões', format: dailyNumber },
  { key: 'clicks', label: 'Cliques no Anúncio', format: dailyNumber },
  { key: 'visits', label: 'Visitas ao Site', format: dailyNumber },
  { key: 'whatsapp', label: 'Cliques no WhatsApp', format: dailyNumber },
];

// Valores e variações diárias seguem o mesmo alinhamento da Evolução Mensal.
function dayChange(previous, current, validPrevious = true, validCurrent = true) {
  if (!validPrevious || !validCurrent || previous == null || current == null || previous <= 0) return null;
  const change = (current - previous) / previous * 100;
  if (!Number.isFinite(change)) return null;
  return { change, label: `${change >= 0 ? '+' : ''}${change.toFixed(1).replace('.', ',')}%` };
}
function DayDelta({ delta, index }) {
  // Uma única variação por coluna, alternando a linha de exibição.
  // As duas linhas são reservadas também para dias sem delta.
  return <span className="mk-day-delta-stack" title={delta ? 'Variação em relação ao dia anterior' : 'Sem base comparável com o dia anterior'}>
    <span className={`mk-day-delta ${delta && index % 2 === 0 ? (delta.change >= 0 ? 'positive' : 'negative') : ''}`}>
      {delta && index % 2 === 0 ? `${delta.change >= 0 ? '▲' : '▼'} ${delta.label}` : '\u00a0'}
    </span>
    <span className={`mk-day-delta ${delta && index % 2 !== 0 ? (delta.change >= 0 ? 'positive' : 'negative') : ''}`}>
      {delta && index % 2 !== 0 ? `${delta.change >= 0 ? '▲' : '▼'} ${delta.label}` : '\u00a0'}
    </span>
  </span>;
}
function CpcLineChart({ rows }) {
  const [hovered, setHovered] = useState(null);
  // SVG responsivo: preserva as 31 posições do mês sem impor rolagem horizontal.
  const step = 32;
  const left = 48, right = 12, top = 44, plotHeight = 185, footer = 72;
  const chartWidth = left + Math.max(rows.length, 1) * step + right;
  const chartHeight = top + plotHeight + footer;
  const max = Math.max(0.01, ...rows.map(r => r.cpc ?? 0));
  const yMax = Math.ceil(max * 1.18 * 100) / 100;
  const x = i => left + step * (i + 0.5);
  const y = v => top + plotHeight - v / yMax * plotHeight;
  const points = rows.map((r, i) => ({ ...r, i, x:x(i), y:r.cpc == null ? null : y(r.cpc) }));
  const segments = []; let segment = [];
  points.forEach(point => {
    if (point.cpc != null) segment.push(point);
    else if (segment.length) { segments.push(segment); segment = []; }
  });
  if (segment.length) segments.push(segment);
  return <div className="mk-line-wrap">
    <div className="mk-line-scroll"><svg className="mk-line-chart"
      role="img" aria-label="Evolução do CPC por dia, com valores e variação percentual abaixo de cada dia. Dias sem dados permanecem vazios."
      viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
      {[0,1,2,3,4].map(i => { const value=yMax*i/4; return <g key={i}><line x1={left} x2={chartWidth-right} y1={y(value)} y2={y(value)} stroke="#e8edf2"/><text x={left-8} y={y(value)+4} textAnchor="end" className="mk-axis-text">{money(value)}</text></g>; })}
      {segments.map((part,i) => <polyline key={i} points={part.map(r=>`${r.x},${r.y}`).join(' ')} fill="none" stroke="#425e83" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>)}
      {points.map((r,i) => {
        const prior=rows[i-1];
        const delta = i ? dayChange(prior.cpc,r.cpc,prior.cpc!=null,r.cpc!=null) : null;
        return <g key={r.day} onMouseEnter={()=>setHovered(i)} onMouseLeave={()=>setHovered(null)}>
          <rect x={r.x-step/2} y="0" width={step} height={chartHeight} fill="transparent"/>
          {r.cpc != null && <><circle cx={r.x} cy={r.y} r={hovered===i?5.2:3.5} fill="#425e83" stroke="white" strokeWidth="1.5"/>
            <text x={r.x} y={Math.max(13,r.y-12)} textAnchor="middle" className="mk-point-value">{money(r.cpc)}</text></>}
          <text x={r.x} y={top+plotHeight+18} textAnchor="middle" className="mk-axis-text">{r.day.slice(8)}</text>
          {delta && <text x={r.x} y={top+plotHeight+(i % 2 === 0 ? 37 : 54)} textAnchor="middle" className={`mk-svg-delta ${delta.change>=0?'positive':'negative'}`}>{delta.change>=0?'▲':'▼'} {delta.label}</text>}
          <title>{`${shortDate(r.day)}: ${r.cpc==null?'Sem CPC disponível':money(r.cpc)}${delta?` (${delta.label} vs. dia anterior)`:''}`}</title>
        </g>;
      })}
    </svg></div>
    <p className="mk-note">CPC = investimento ÷ cliques. A linha é interrompida quando não há dados ou cliques para calcular. Deltas só aparecem quando os dois dias possuem CPC válido e o anterior é maior que zero. Os dias permanecem visíveis sem rolagem horizontal.</p>
  </div>;
}

const TEXT_COLLATOR = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
function sortRows(rows, sort, extract) {
  return [...rows].sort((a,b) => {
    const va=extract(a,sort.key), vb=extract(b,sort.key);
    const aMissing=va==null, bMissing=vb==null;
    if (aMissing || bMissing) return aMissing===bMissing ? 0 : aMissing ? 1 : -1;
    const cmp=typeof va==='number' && typeof vb==='number' ? va-vb : TEXT_COLLATOR.compare(String(va),String(vb));
    return sort.direction==='asc' ? cmp : -cmp;
  });
}
function SortHeader({ label, column, sort, onSort }) {
  const selected=sort.key===column;
  return <th scope="col" aria-sort={!selected?'none':sort.direction==='asc'?'ascending':'descending'}>
    <button className="mk-sort-button" type="button" onClick={()=>onSort(column)} title={`Ordenar por ${label}`}>
      {label}<span aria-hidden="true">{selected?(sort.direction==='asc'?' ▲':' ▼'):' ↕'}</span>
    </button>
  </th>;
}

function MetricHelp({ label, description }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  return <span className="mk-help-wrap">
    <button type="button" className="mk-help-trigger" aria-label={`O que significa ${label}?`}
      aria-expanded={open} aria-describedby={open ? tooltipId : undefined}
      onClick={() => setOpen(value => !value)} onBlur={() => setOpen(false)}
      title={`Entenda: ${label}`}>?</button>
    <span className={`mk-help-popover${open ? ' is-open' : ''}`} role="tooltip" id={tooltipId}>{description}</span>
  </span>;
}

export default function MarketingPage() {
  const defaults = useMemo(defaultDates, []);
  const months = useMemo(recentMonths, []);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [platform, setPlatform] = useState('all');
  const [account, setAccount] = useState('all');
  const [campaignSort, setCampaignSort] = useState({ key:'spend', direction:'desc' });
  const [originSort, setOriginSort] = useState({ key:'count', direction:'desc' });
  const [dailyMetric, setDailyMetric] = useState('spend');
  const [data, setData] = useState({ ads:[], events:[], manual_campaigns:[] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [request, setRequest] = useState(0);
  const activeMonth = months.find(m => {
    const dates = monthInfo(m.key);
    return from === dates.from && (to === dates.to || (m.key === todaySP().slice(0, 7) && to === todaySP()));
  })?.key || '';
  function selectMonth(key) {
    const dates = monthInfo(key);
    setFrom(dates.from);
    setTo(key === todaySP().slice(0, 7) ? todaySP() : dates.to);
  }
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError('');
      const { data: result, error: err } = await supabase.rpc('get_marketing_dashboard', { p_from: from, p_to: to });
      if (!cancelled) {
        if (err) { setError(err.message); setData({ads:[], events:[], manual_campaigns:[]}); }
        else setData({ ads: Array.isArray(result?.ads) ? result.ads : [], events: Array.isArray(result?.events) ? result.events : [], manual_campaigns: Array.isArray(result?.manual_campaigns) ? result.manual_campaigns : [] });
        setLoading(false);
      }
    }
    if (from && to && from <= to) load();
    else { setLoading(false); setError('Confira o período selecionado.'); }
    return () => { cancelled = true; };
  }, [from, to, request]);

  const allAds = data.ads;
  const accountOptions = useMemo(() => {
    const entries = [...allAds, ...data.manual_campaigns].filter(r => platform === 'all' || r.platform === platform);
    const byAccount = new Map();
    for (const r of entries) {
      const id=String(r.account_id || '').replace(/^act_/, '');
      if (!id) continue;
      const key=`${r.platform}:${id}`;
      if (!byAccount.has(key)) byAccount.set(key,{key,platform:r.platform,id,label:r.account_name || ''});
      else if (!byAccount.get(key).label && r.account_name) byAccount.get(key).label=r.account_name;
    }
    return [...byAccount.values()].sort((a,b)=>TEXT_COLLATOR.compare(a.label || a.id,b.label || b.id));
  }, [allAds, data.manual_campaigns, platform]);
  const effectiveAccount = account==='all' || accountOptions.some(item=>item.key===account) ? account : 'all';
  const matchAccount = r => effectiveAccount==='all' || `${r.platform}:${String(r.account_id || '').replace(/^act_/, '')}`===effectiveAccount;
  const ads = useMemo(() => allAds.filter(r => (platform === 'all' || r.platform === platform) && matchAccount(r)), [allAds, platform, effectiveAccount]);
  const spend = sum(ads, 'spend');
  const clicks = sum(ads, 'clicks');
  const impressions = sum(ads, 'impressions');
  const currencies = [...new Set(ads.map(r => r.currency || 'BRL'))];
  const currencyOK = currencies.every(x => x === 'BRL');
  const eventRows = data.events;
  const visits = sum(eventRows.filter(r => r.event_name === 'site_visit'), 'event_count');
  const whatsapp = sum(eventRows.filter(r => r.event_name === 'whatsapp_click'), 'event_count');
  // Eventos do site cobrem TODAS as origens — não atribuir a campanhas pagas sem correspondência.
  const monthlyManual = useMemo(() => data.manual_campaigns.filter(r => (platform === 'all' || r.platform === platform) && matchAccount(r)), [data.manual_campaigns, platform, effectiveAccount]);
  const campaigns = useMemo(() => {
    const map = new Map();
    for (const r of ads.filter(r => r.data_source !== 'manual_daily')) {
      const k = [r.platform, r.account_id, r.campaign_id, r.currency].join('|');
      if (!map.has(k)) map.set(k, { key:k, name:r.campaign_name, platform:r.platform, account:r.account_id, currency:r.currency, spend:0, clicks:0, impressions:0 });
      const c = map.get(k); c.spend += Number(r.spend || 0); c.clicks += Number(r.clicks || 0); c.impressions += Number(r.impressions || 0);
    }
    return [...map.values()].sort((a,b) => b.spend-a.spend);
  }, [ads]);
  const displayCampaigns = useMemo(() => [
    ...campaigns,
    ...monthlyManual.map(r => ({
      key: ['monthly',r.platform,r.account_id,r.month,r.campaign_name].join('|'),
      name: r.campaign_name, platform: r.platform, account: r.account_id,
      currency: r.currency, spend: Number(r.spend || 0),
      clicks: Number(r.clicks || 0), impressions: Number(r.impressions || 0),
      manual: true, month: r.month,
    }))
  ].sort((a,b) => b.spend - a.spend), [campaigns, monthlyManual]);
  const sortedCampaigns = useMemo(() => sortRows(displayCampaigns, campaignSort, (r,k) => k==='cpc' ? (r.clicks>0 ? r.spend/r.clicks : null) : k==='platform' ? (r.platform==='meta'?'Meta Ads':'Google Ads') : k==='account' ? String(r.account) : k==='name' ? r.name : Number(r[k] || 0)), [displayCampaigns,campaignSort]);
  const toggleSort = setter => key => setter(prev => ({ key, direction:prev.key===key && prev.direction==='asc'?'desc':'asc' }));
  const manualDailyCount = ads.filter(r => r.data_source === 'manual_daily').length;
  const sources = useMemo(() => {
    const map = new Map();
    for (const r of eventRows.filter(r => r.event_name === 'whatsapp_click')) {
      const key = `${r.source} / ${r.medium}`;
      map.set(key, (map.get(key) || 0) + Number(r.event_count || 0));
    }
    return [...map].sort((a,b)=>b[1]-a[1]);
  }, [eventRows]);
  const sortedSources = useMemo(() => sortRows(sources, originSort, (r,k) => k==='name' ? r[0] : r[1]),[sources,originSort]);
  const lastSync = ads.reduce((max,r) => r.synced_at && (!max || r.synced_at > max) ? r.synced_at : max, '');
  const byDay = useMemo(() => {
    // Um registro por data. Os eventos do site não são filtrados por mídia,
    // pois não é possível atribuí-los com segurança a uma plataforma paga.
    const map = new Map();
    const getDay = day => {
      if (!map.has(day)) map.set(day, { day, spend:0, impressions:0, clicks:0, visits:0, whatsapp:0 });
      return map.get(day);
    };
    for (const a of ads) {
      const row = getDay(a.day);
      row.spend += Number(a.spend || 0);
      row.impressions += Number(a.impressions || 0);
      row.clicks += Number(a.clicks || 0);
    }
    for (const e of eventRows) {
      const row = getDay(e.day);
      if (e.event_name === 'site_visit') row.visits += Number(e.event_count || 0);
      if (e.event_name === 'whatsapp_click') row.whatsapp += Number(e.event_count || 0);
    }
    const rows = [];
    const date = new Date(`${from}T12:00:00Z`);
    // Nos meses completos e no mês atual reservamos todos os dias no eixo.
    // Dias futuros nunca são confundidos com zero observado.
    const chartEnd = from.slice(0,7)===to.slice(0,7) && from.endsWith('-01')
      ? monthInfo(from.slice(0,7)).to : to;
    const lastDate = new Date(`${chartEnd}T12:00:00Z`);
    const today = todaySP();
    while (date <= lastDate) {
      const day = date.toISOString().slice(0,10);
      const row = getDay(day);
      const future = day > today || day > to;
      const hasAds = ads.some(a => a.day === day);
      rows.push({ ...row, future, hasAds:hasAds && !future,
        cpc:!future && hasAds && row.clicks > 0 ? row.spend/row.clicks : null });
      date.setUTCDate(date.getUTCDate()+1);
    }
    return rows;
  }, [ads, eventRows, from, to]);
  const selectedMetric = DAILY_METRICS.find(m => m.key === dailyMetric) || DAILY_METRICS[0];
  const maxDay = Math.max(1, ...byDay.map(r=>r[dailyMetric]));
  const chartHasValues = byDay.some(r => !r.future && r[dailyMetric] > 0);
  const cpcHasValues = byDay.some(r => r.clicks > 0);
  return <main className="content marketing-page">
    <header className="page-header mk-page-header">
      <div><h1>Marketing</h1><p>Campanhas Meta Ads e Google Ads, visitas ao site e cliques no WhatsApp.</p></div>
      <button type="button" className="primary-button mk-refresh" onClick={() => setRequest(x => x + 1)} disabled={loading} aria-busy={loading}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.5 9A7.5 7.5 0 0 1 18 6l2 1M4 17l2 1a7.5 7.5 0 0 0 12.5-3"/></svg>
        <span>{loading ? 'Consultando...' : 'Atualizar dados'}</span>
      </button>
    </header>
    <section className="mk-period" aria-label="Período do relatório">
      <div className="mk-months" aria-label="Últimos quatro meses">
        {months.map(m => <button type="button" key={m.key} className={`mk-month ${activeMonth === m.key ? 'active' : ''}`} aria-pressed={activeMonth === m.key} onClick={() => selectMonth(m.key)}>{m.label}</button>)}
      </div>
      <div className="mk-controls">
        <label>De <input aria-label="Data inicial" type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label>Até <input aria-label="Data final" type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
      </div>
      <div className="mk-platform-group" role="group" aria-label="Filtrar plataformas de anúncios">
        <span className="mk-group-label">Plataforma</span>
        <div className="mk-platform-buttons">
          {[['all', 'Todas'], ['meta', 'Meta Ads'], ['google', 'Google Ads']].map(([key, label]) => <button
            key={key} type="button" className={`mk-month ${platform === key ? 'active' : ''}`}
            aria-pressed={platform === key} onClick={() => { setPlatform(key); setAccount('all'); }}>{label}</button>)}
        </div>
      </div>
      <div className="mk-platform-group" role="group" aria-label="Filtrar contas de anúncios">
        <span className="mk-group-label">Conta de anúncios</span>
        <div className="mk-platform-buttons">
          <button type="button" className={`mk-month ${effectiveAccount==='all'?'active':''}`} aria-pressed={effectiveAccount==='all'} onClick={()=>setAccount('all')}>Todas as contas</button>
          {accountOptions.map(item=><button key={item.key} type="button" className={`mk-month ${effectiveAccount===item.key?'active':''}`} aria-pressed={effectiveAccount===item.key} onClick={()=>setAccount(item.key)}>{item.label || (item.platform==='meta' ? 'Meta ' : 'Google ') + item.id} · {item.id}</button>)}
        </div>
      </div>
    </section>
    {error && <div className="mk-alert" role="alert">Falha na consulta: {error}. Confirme se executou o SQL 15 e entrou com perfil Gestão.</div>}
    {!currencyOK && <div className="mk-alert">Há moedas diferentes de BRL. Não some investimentos de moedas distintas; filtre por conta antes da análise.</div>}
    <div className="mk-explain">Os indicadores de mídia são importados previamente para o Supabase. Atualizar esta página <strong>não chama as APIs Meta/Google</strong>. Visitas e cliques no WhatsApp incluem todas as origens, mesmo ao selecionar plataforma ou conta de anúncios: os eventos ainda não possuem atribuição confiável por conta.</div>
    {manualDailyCount > 0 && <div className="mk-manual-note" role="status">
      <strong>Google Ads — dados importados manualmente:</strong> {manualDailyCount} dia(s) de totais por conta incluídos no gráfico e nos indicadores. Os detalhes por campanha são mensais, não diários, e não são somados uma segunda vez. Em dias com dados da API Google, a API prevalece.
    </div>}
    <section className="mk-kpis" aria-label="Indicadores de marketing">
      {[
        ['Investimento em anúncios', currencyOK ? money(spend) : 'Moedas diferentes', METRIC_HELP.spend],
        ['Impressões dos anúncios', fmt(impressions), METRIC_HELP.impressions],
        ['Cliques nos anúncios', fmt(clicks), METRIC_HELP.clicks],
        ['CPC médio de anúncios', currencyOK && clicks ? money(spend/clicks) : '—', METRIC_HELP.cpc],
        ['Visitas registradas no site', fmt(visits), METRIC_HELP.visits],
        ['Cliques nos botões WhatsApp', fmt(whatsapp), METRIC_HELP.whatsapp],
        ['Cliques WPP / visitas', visits ? pct(whatsapp / visits * 100) : '—', METRIC_HELP.rate],
        ['Campanhas com dados', fmt(displayCampaigns.length), METRIC_HELP.campaigns],
      ].map(([label, value, description]) => <div className="mk-kpi" key={label}>
        <div className="mk-kpi-label"><span>{label}</span><MetricHelp label={label} description={description}/></div>
        <strong>{value}</strong>
      </div>)}
    </section>
    <section className="mk-panel">
      <div className="mk-heading"><h2>Desempenho Diário dos Anúncios</h2><span>{ads.length ? `Atualizado: ${lastSync ? new Date(lastSync).toLocaleString('pt-BR') : '—'}` : 'Sem importações no período'}</span></div>
      <div className="mk-metric-buttons" role="group" aria-label="Métrica do gráfico diário">
        {DAILY_METRICS.map(metric => <button key={metric.key} type="button" className={`mk-month ${dailyMetric === metric.key ? 'active' : ''}`} aria-pressed={dailyMetric === metric.key} onClick={() => setDailyMetric(metric.key)}>{metric.label}</button>)}
      </div>
      <div className="mk-chart-total">{selectedMetric.label}: <strong>{selectedMetric.format(sum(byDay, dailyMetric))}</strong></div>
      {chartHasValues ? <div className="mk-bars-scroll"><div className="mk-bars" style={{ '--day-count': byDay.length }} role="img" aria-label={`Barras diárias de ${selectedMetric.label}, com valores e deltas diários`}>
        {byDay.map((r,i)=>{
          const valid=!r.future;
          const previous=byDay[i-1];
          const delta=i ? dayChange(previous[dailyMetric],r[dailyMetric],!previous.future,valid) : null;
          return <div className="mk-bar-col" key={r.day} title={`${shortDate(r.day)}: ${valid?selectedMetric.format(r[dailyMetric]):'Sem dados'}${delta?` (${delta.label})`:''}`}>
            <div className="mk-bar-value">{valid?selectedMetric.format(r[dailyMetric]):'\u00a0'}</div>
            <div className="mk-bar-rail"><div className="mk-bar" style={{height:`${valid && r[dailyMetric]>0 ? Math.max(2,r[dailyMetric]/maxDay*100):0}%`}}/></div>
            <span className="mk-day-label">{r.day.slice(8)}</span>
            <DayDelta delta={delta} index={i}/>
          </div>;
        })}
      </div></div> : <p className="mk-empty">Sem registros de {selectedMetric.label.toLowerCase()} no período selecionado.</p>}
      {(dailyMetric === 'visits' || dailyMetric === 'whatsapp') && <p className="mk-note">Esses eventos incluem tráfego de todas as origens do site, mesmo quando o filtro de plataforma está em Meta Ads ou Google Ads.</p>}
    </section>
    <section className="mk-panel">
      <div className="mk-heading"><h2>CPC Diário dos Anúncios</h2><span>Custo por clique nos anúncios</span></div>
      {cpcHasValues ? <CpcLineChart rows={byDay} /> : <p className="mk-empty">Sem cliques em anúncios para calcular o CPC diário no período.</p>}
    </section>
    <section className="mk-panel">
      <h2>Campanhas</h2>
      <div className="mk-table-wrap"><table className="mk-table"><thead><tr>{[['platform','Plataforma'],['account','Conta'],['name','Campanha'],['spend','Investimento'],['impressions','Impressões'],['clicks','Cliques'],['cpc','CPC']].map(([key,label])=><SortHeader key={key} column={key} label={label} sort={campaignSort} onSort={toggleSort(setCampaignSort)}/>)}</tr></thead><tbody>
        {sortedCampaigns.map(c=><tr key={c.key}><td>{c.platform === 'meta' ? 'Meta' : 'Google'}</td><td>{c.account}</td><td>{c.name}{c.manual && <span className="mk-manual-tag">CSV mensal</span>}</td><td>{c.currency === 'BRL' ? money(c.spend) : `${c.currency} ${fmt(c.spend)}`}</td><td>{fmt(c.impressions)}</td><td>{fmt(c.clicks)}</td><td>{c.clicks && c.currency==='BRL' ? money(c.spend / c.clicks) : '—'}</td></tr>)}
        {!displayCampaigns.length && <tr><td colSpan="7">Sem campanhas neste período.</td></tr>}
      </tbody></table></div>
      {monthlyManual.length > 0 && <p className="mk-note">Campanhas marcadas como “CSV mensal” representam o mesmo investimento dos totais diários de outubro. Exibidas apenas quando o mês inteiro estiver selecionado; não entram duas vezes nos indicadores.</p>}
    </section>
    <section className="mk-panel"><h2>Cliques no WhatsApp por origem observada</h2>
      <div className="mk-table-wrap"><table className="mk-table"><thead><tr><SortHeader column="name" label="Origem / Meio" sort={originSort} onSort={toggleSort(setOriginSort)}/><SortHeader column="count" label="Cliques WPP" sort={originSort} onSort={toggleSort(setOriginSort)}/></tr></thead><tbody>{sortedSources.map(([name,count])=><tr key={name}><td>{name}</td><td>{fmt(count)}</td></tr>)}{!sources.length && <tr><td colSpan="2">Nenhum clique registrado no período.</td></tr>}</tbody></table></div>
      <p className="mk-note">Cliques no botão não são conversas confirmadas nem leads. Cliques em anúncios que levam diretamente ao WhatsApp não aparecem nesta contagem do site. Visitas diretas ou pelo link da bio podem não permitir identificar a campanha inicial.</p>
    </section>
  </main>;
}
