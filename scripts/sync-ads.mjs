// Node >= 20. Sem dependências, sem chaves no código e sem envio de dados pessoais.
// Rode: node scripts/sync-ads.mjs --platform=meta --from=2026-10-01 --to=2026-10-31
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const envfile = path.resolve('.ads.local.env');
if (fs.existsSync(envfile)) {
  for (const ln of fs.readFileSync(envfile,'utf8').split(/\r?\n/)) {
    const s=ln.trim(); if(!s || s.startsWith('#')) continue;
    const m=s.match(/^([A-Z][A-Z0-9_]*)=(.*)$/); if(!m)continue;
    let v=m[2].trim(); if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1);
    if(process.env[m[1]]===undefined) process.env[m[1]]=v;
  }
}
const flags=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')).map(x=>{const ix=x.indexOf('=');return [x.slice(2,ix),x.slice(ix+1)];}));
const required=(k)=>{if(!process.env[k])throw Error(`Variável ${k} ausente`);return process.env[k];};
const num=x=>Number(x||0);
const dateOk=d=>/^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d+'T00:00:00Z'));
const from=flags.from,to=flags.to;
if(!dateOk(from)||!dateOk(to)||from>to) throw Error('Informe --from=AAAA-MM-DD e --to=AAAA-MM-DD (intervalo válido).');
const platform=flags.platform;
if(!['meta','google','all'].includes(platform)) throw Error('Informe --platform=meta|google|all');
if((Date.parse(to)-Date.parse(from))/86400000>92)throw Error('Limite de 93 dias por execução. Execute períodos menores.');
const base=required('SUPABASE_URL').replace(/\/$/,'');
const service=required('SUPABASE_SERVICE_ROLE_KEY');

async function checked(url,opts={},provider='API') {
  const res=await fetch(url,opts); const body=await res.text();
  if(!res.ok) throw Error(`${provider}: HTTP ${res.status}: ${body.slice(0,550)}`);
  try{return JSON.parse(body);}catch{throw Error(`${provider}: JSON inválido`)}
}
async function upsert(rows){
  if(!rows.length) return;
  for(let i=0;i<rows.length;i+=250){
    const res=await fetch(`${base}/rest/v1/ad_campaign_daily?on_conflict=platform,account_id,campaign_id,day`,{
      method:'POST',headers:{
        apikey: service,
        ...(service.startsWith('sb_secret_') ? {} : {Authorization: `Bearer ${service}`}),
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body:JSON.stringify(rows.slice(i,i+250))});
    if(!res.ok) throw Error(`Supabase HTTP ${res.status}: ${(await res.text()).slice(0,600)}`);
  }
}
function configuredMetaAccounts() {
  // Compatível com o formato antigo e com duas contas Meta.
  const candidates = [
    ['META_AD_ACCOUNT_ID_1', 'META_ACCESS_TOKEN_1'],
    ['META_AD_ACCOUNT_ID_2', 'META_ACCESS_TOKEN_2'],
  ];
  const configured = candidates
    .filter(([idKey]) => (process.env[idKey] || '').trim())
    .map(([idKey, tokenKey]) => ({
      id: process.env[idKey].trim().replace(/^act_/i, ''),
      token: (process.env[tokenKey] || process.env.META_ACCESS_TOKEN || '').trim(),
      variable: idKey,
    }));
  if (!configured.length && process.env.META_AD_ACCOUNT_ID?.trim()) {
    configured.push({
      id: process.env.META_AD_ACCOUNT_ID.trim().replace(/^act_/i, ''),
      token: (process.env.META_ACCESS_TOKEN || '').trim(),
      variable: 'META_AD_ACCOUNT_ID',
    });
  }
  if (!configured.length) throw Error('Defina META_AD_ACCOUNT_ID_1 e/ou META_AD_ACCOUNT_ID_2 no .ads.local.env');
  const seen = new Set();
  for (const account of configured) {
    if (!/^\d+$/.test(account.id)) throw Error(`${account.variable}: ID inválido`);
    if (!account.token) throw Error(`Token ausente para ${account.variable}: preencha META_ACCESS_TOKEN ou token individual`);
    if (seen.has(account.id)) throw Error(`Conta Meta repetida no .ads.local.env: act_${account.id}`);
    seen.add(account.id);
  }
  return configured;
}
async function metaAccount({id: account, token}, ver) {
  const headers = { Authorization: `Bearer ${token}` };
  const accountData = await checked(
    `https://graph.facebook.com/${ver}/act_${account}?fields=currency`,
    {headers}, `Meta act_${account}`
  );
  const currency = accountData.currency || 'BRL';
  const p = new URLSearchParams({
    fields: 'date_start,campaign_id,campaign_name,impressions,clicks,spend',
    level: 'campaign', time_increment: '1', limit: '500',
    time_range: JSON.stringify({since: from, until: to})
  });
  let url = `https://graph.facebook.com/${ver}/act_${account}/insights?${p}`;
  let n = 0, pages = 0, spendTotal = 0;
  while (url) {
    const data = await checked(url, {headers}, `Meta act_${account}`);
    const rows = (data.data || []).map(r => ({
      platform: 'meta', account_id: account,
      campaign_id: String(r.campaign_id), day: r.date_start,
      campaign_name: r.campaign_name || '', currency,
      impressions: num(r.impressions), clicks: num(r.clicks), spend: num(r.spend),
      platform_conversions: 0, platform_conversion_value: 0
    }));
    await upsert(rows);
    n += rows.length;
    spendTotal += rows.reduce((sum, r) => sum + r.spend, 0);
    pages++;
    if (pages > 300) throw Error(`Meta act_${account}: limite de paginação excedido`);
    url = data.paging?.next || null;
  }
  console.log(`Meta act_${account}: ${n} registros atualizados; gasto ${currency} ${spendTotal.toFixed(2)}`);
  return n;
}
async function meta() {
  const accounts = configuredMetaAccounts();
  const ver = required('META_GRAPH_VERSION');
  let total = 0;
  for (const account of accounts) {
    // Se a primeira conta falhar, interrompe. Evita relatório parcial parecer completo.
    total += await metaAccount(account, ver);
  }
  console.log(`Meta consolidado: ${total} linhas de ${accounts.length} conta(s).`);
}
async function google(){
  const clientId=required('GOOGLE_ADS_CLIENT_ID'),clientSecret=required('GOOGLE_ADS_CLIENT_SECRET'),refreshToken=required('GOOGLE_ADS_REFRESH_TOKEN'),developerToken=required('GOOGLE_ADS_DEVELOPER_TOKEN');
  const customer=required('GOOGLE_ADS_CUSTOMER_ID').replaceAll('-','');
  const ver=required('GOOGLE_ADS_API_VERSION');
  const t=await checked('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'})},'Google OAuth');
  const headers={'Authorization':`Bearer ${t.access_token}`,'developer-token':developerToken,'Content-Type':'application/json'};
  if(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) headers['login-customer-id']=process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replaceAll('-','');
  // GAQL: custo em micros (1.000.000 = 1 unidade monetária).
  const query=`SELECT segments.date, customer.currency_code, campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${from}' AND '${to}'`;
  let pageToken=undefined,n=0,pages=0;
  do {
    const b={query,pageSize:10000};if(pageToken)b.pageToken=pageToken;
    const data=await checked(`https://googleads.googleapis.com/${ver}/customers/${customer}/googleAds:search`,{method:'POST',headers,body:JSON.stringify(b)},'Google Ads');
    const rows=(data.results||[]).map(r=>({platform:'google',account_id:customer,campaign_id:String(r.campaign?.id||''),day:r.segments?.date,campaign_name:r.campaign?.name||'',currency:r.customer?.currencyCode||'BRL',impressions:num(r.metrics?.impressions),clicks:num(r.metrics?.clicks),spend:num(r.metrics?.costMicros)/1e6,platform_conversions:num(r.metrics?.conversions),platform_conversion_value:num(r.metrics?.conversionsValue)}));
    await upsert(rows);n+=rows.length;pages++;
    if(pages>300)throw Error('Paginação Google excedeu o limite de segurança.');
    pageToken=data.nextPageToken;
  }while(pageToken);
  console.log(`Google Ads: ${n} registros diários de campanha atualizados.`);
}
try{if(platform==='meta'||platform==='all')await meta();if(platform==='google'||platform==='all')await google();console.log('Sincronização concluída.')}catch(e){console.error('Falha:',e.message.replace(/access_token=[^&\s]+/g,'access_token=[OCULTO]'));process.exitCode=1;}
