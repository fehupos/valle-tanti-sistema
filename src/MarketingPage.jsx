import { useEffect, useMemo, useState, useId } from 'react';
import { supabase } from './supabase';
import './MarketingPage.css';

const todaySP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
const money = (n) => Number(n || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
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
  { key: 'spend', label: 'Investimento', format: money },
  { key: 'impressions', label: 'Impressões', format: fmt },
  { key: 'clicks', label: 'Cliques no Anúncio', format: fmt },
  { key: 'visits', label: 'Visitas ao Site', format: fmt },
  { key: 'whatsapp', label: 'Cliques no WhatsApp', format: fmt },
];

function CpcLineChart({ rows }) {
  const [hovered, setHovered] = useState(null);
  const chartWidth = 1000;
  const chartHeight = 235;
  const left = 58, right = 17, top = 15, bottom = 35;
  const innerWidth = chartWidth - left - right;
  const innerHeight = chartHeight - top - bottom;
  const max = Math.max(1, ...rows.map(r => r.cpc || 0));
  const yMax = Math.ceil(max * 1.15 * 100) / 100;
  const posX = i => left + (rows.length === 1 ? innerWidth / 2 : i * innerWidth / (rows.length - 1));
  const posY = value => top + innerHeight - (value / yMax) * innerHeight;
  const valid = rows.map((r, i) => ({ ...r, x: posX(i), y: posY(r.cpc || 0), i }));
  const segments = [];
  let segment = [];
  for (const item of valid) {
    if (item.clicks > 0) segment.push(item);
    else if (segment.length) { segments.push(segment); segment = []; }
  }
  if (segment.length) segments.push(segment);
  const ticks = [0, 1, 2, 3, 4].map(i => ({ v: yMax * i / 4, y: posY(yMax * i / 4) }));
  const chosen = hovered === null ? null : valid[hovered];
  const xLabels = valid.filter((_, i) => i === 0 || i === valid.length-1 || (i % Math.max(1, Math.ceil(valid.length / 9)) === 0));
  return <div className="mk-line-wrap">
    <svg className="mk-line-chart" role="img" aria-label="Gráfico de linha do CPC diário: investimento dividido pelos cliques nos anúncios, somente nos dias com cliques" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="xMidYMid meet">
      {ticks.map((t,i) => <g key={i}><line x1={left} x2={chartWidth-right} y1={t.y} y2={t.y} stroke="#e8edf2" strokeWidth="1"/><text x={left-10} y={t.y+4} textAnchor="end" className="mk-axis-text">{money(t.v)}</text></g>)}
      {xLabels.map(r => <text key={r.day} x={r.x} y={chartHeight-10} textAnchor="middle" className="mk-axis-text">{r.day.slice(8)}</text>)}
      {segments.map((s,i) => <polyline key={i} points={s.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="#425e83" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>)}
      {valid.filter(r=>r.clicks>0).map(r => <circle key={r.day} cx={r.x} cy={r.y} r={chosen?.i===r.i ? 6 : 3.6} fill="#425e83" stroke="white" strokeWidth="1.5"/>)}
      {valid.map(r => <rect key={r.day} x={r.x - Math.max(6, innerWidth/Math.max(rows.length,1)/2)} y={top} width={Math.max(12,innerWidth/Math.max(rows.length,1))} height={innerHeight} fill="transparent" onMouseEnter={() => setHovered(r.i)} onMouseLeave={() => setHovered(null)}><title>{`${shortDate(r.day)}: ${r.clicks ? money(r.cpc) : 'Sem cliques para calcular CPC'} (${fmt(r.clicks)} cliques)`}</title></rect>)}
      {chosen && chosen.clicks > 0 && <g pointerEvents="none"><line x1={chosen.x} x2={chosen.x} y1={top} y2={top+innerHeight} stroke="#9cacbf" strokeDasharray="4 4"/><circle cx={chosen.x} cy={chosen.y} r="6" fill="#425e83" stroke="white" strokeWidth="2"/></g>}
    </svg>
    <p className="mk-note">CPC diário = investimento em anúncios ÷ cliques nos anúncios. Dias sem cliques não têm CPC calculável. Passe o mouse nos pontos para ver os valores.</p>
  </div>;
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
  const ads = useMemo(() => allAds.filter(r => platform === 'all' || r.platform === platform), [allAds, platform]);
  const spend = sum(ads, 'spend');
  const clicks = sum(ads, 'clicks');
  const impressions = sum(ads, 'impressions');
  const currencies = [...new Set(ads.map(r => r.currency || 'BRL'))];
  const currencyOK = currencies.every(x => x === 'BRL');
  const eventRows = data.events;
  const visits = sum(eventRows.filter(r => r.event_name === 'site_visit'), 'event_count');
  const whatsapp = sum(eventRows.filter(r => r.event_name === 'whatsapp_click'), 'event_count');
  // Eventos do site cobrem TODAS as origens — não atribuir a campanhas pagas sem correspondência.
  const monthlyManual = useMemo(() => data.manual_campaigns.filter(r => platform === 'all' || r.platform === platform), [data.manual_campaigns, platform]);
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
  const manualDailyCount = ads.filter(r => r.data_source === 'manual_daily').length;
  const sources = useMemo(() => {
    const map = new Map();
    for (const r of eventRows.filter(r => r.event_name === 'whatsapp_click')) {
      const key = `${r.source} / ${r.medium}`;
      map.set(key, (map.get(key) || 0) + Number(r.event_count || 0));
    }
    return [...map].sort((a,b)=>b[1]-a[1]);
  }, [eventRows]);
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
    const lastDate = new Date(`${to}T12:00:00Z`);
    while (date <= lastDate) {
      const day = date.toISOString().slice(0,10);
      const row = getDay(day);
      rows.push({ ...row, cpc:row.clicks > 0 ? row.spend/row.clicks : null });
      date.setUTCDate(date.getUTCDate()+1);
    }
    return rows;
  }, [ads, eventRows, from, to]);
  const selectedMetric = DAILY_METRICS.find(m => m.key === dailyMetric) || DAILY_METRICS[0];
  const maxDay = Math.max(1, ...byDay.map(r=>r[dailyMetric]));
  const chartHasValues = byDay.some(r => r[dailyMetric] > 0);
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
            aria-pressed={platform === key} onClick={() => setPlatform(key)}>{label}</button>)}
        </div>
      </div>
    </section>
    {error && <div className="mk-alert" role="alert">Falha na consulta: {error}. Confirme se executou o SQL 15 e entrou com perfil Gestão.</div>}
    {!currencyOK && <div className="mk-alert">Há moedas diferentes de BRL. Não some investimentos de moedas distintas; filtre por conta antes da análise.</div>}
    <div className="mk-explain">Os indicadores de mídia são importados previamente para o Supabase. Atualizar esta página <strong>não chama as APIs Meta/Google</strong>. Os indicadores do site incluem todas as origens, mesmo quando a plataforma selecionada é Meta ou Google.</div>
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
      {chartHasValues ? <div className="mk-bars" role="img" aria-label={`Barras diárias de ${selectedMetric.label}`}>
        {byDay.map(r=><div className="mk-bar-col" key={r.day} title={`${shortDate(r.day)}: ${selectedMetric.format(r[dailyMetric])}`}><div className="mk-bar" style={{height:`${r[dailyMetric] > 0 ? Math.max(2, r[dailyMetric]/maxDay*100) : 0}%`}}/><small>{r.day.slice(8)}</small></div>)}
      </div> : <p className="mk-empty">Sem registros de {selectedMetric.label.toLowerCase()} no período selecionado.</p>}
      {(dailyMetric === 'visits' || dailyMetric === 'whatsapp') && <p className="mk-note">Esses eventos incluem tráfego de todas as origens do site, mesmo quando o filtro de plataforma está em Meta Ads ou Google Ads.</p>}
    </section>
    <section className="mk-panel">
      <div className="mk-heading"><h2>CPC Diário dos Anúncios</h2><span>Custo por clique nos anúncios</span></div>
      {cpcHasValues ? <CpcLineChart rows={byDay} /> : <p className="mk-empty">Sem cliques em anúncios para calcular o CPC diário no período.</p>}
    </section>
    <section className="mk-panel">
      <h2>Campanhas</h2>
      <div className="mk-table-wrap"><table className="mk-table"><thead><tr><th>Plataforma</th><th>Conta</th><th>Campanha</th><th>Investimento</th><th>Impressões</th><th>Cliques</th><th>CPC</th></tr></thead><tbody>
        {displayCampaigns.map(c=><tr key={c.key}><td>{c.platform === 'meta' ? 'Meta' : 'Google'}</td><td>{c.account}</td><td>{c.name}{c.manual && <span className="mk-manual-tag">CSV mensal</span>}</td><td>{c.currency === 'BRL' ? money(c.spend) : `${c.currency} ${fmt(c.spend)}`}</td><td>{fmt(c.impressions)}</td><td>{fmt(c.clicks)}</td><td>{c.clicks && c.currency==='BRL' ? money(c.spend / c.clicks) : '—'}</td></tr>)}
        {!displayCampaigns.length && <tr><td colSpan="7">Sem campanhas neste período.</td></tr>}
      </tbody></table></div>
      {monthlyManual.length > 0 && <p className="mk-note">Campanhas marcadas como “CSV mensal” representam o mesmo investimento dos totais diários de outubro. Exibidas apenas quando o mês inteiro estiver selecionado; não entram duas vezes nos indicadores.</p>}
    </section>
    <section className="mk-panel"><h2>Cliques no WhatsApp por origem observada</h2>
      <div className="mk-table-wrap"><table className="mk-table"><thead><tr><th>Origem / Meio</th><th>Cliques WPP</th></tr></thead><tbody>{sources.map(([name,count])=><tr key={name}><td>{name}</td><td>{fmt(count)}</td></tr>)}{!sources.length && <tr><td colSpan="2">Nenhum clique registrado no período.</td></tr>}</tbody></table></div>
      <p className="mk-note">Cliques no botão não são conversas confirmadas nem leads. Cliques em anúncios que levam diretamente ao WhatsApp não aparecem nesta contagem do site. Visitas diretas ou pelo link da bio podem não permitir identificar a campanha inicial.</p>
    </section>
  </main>;
}
