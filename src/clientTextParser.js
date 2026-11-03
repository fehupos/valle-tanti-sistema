// Parser local e determinístico: não acessa Clipboard nem envia dados a serviços externos.
export const CLIENT_MESSAGE_TEMPLATE = `Nome completo:
CPF:
RG:
Data de nascimento:
Nacionalidade:
Estado civil:
Profissão:
E-mail:
Instagram:
Telefone/WhatsApp:
CEP:
Rua:
Número:
Complemento:
Bairro:
Cidade:
Estado:`;

const aliases = {
  'nome': 'full_name', 'nome completo': 'full_name', 'cliente': 'full_name',
  'cpf': 'cpf', 'rg':'rg', 'identidade':'rg',
  'data de nascimento':'birth_date', 'nascimento':'birth_date', 'aniversario':'birth_date',
  'nacionalidade':'nationality', 'estado civil':'marital_status', 'profissao':'profession',
  'email':'email', 'e mail':'email', 'instagram':'instagram',
  'telefone':'phone', 'celular':'phone', 'whatsapp':'phone', 'telefone whatsapp':'phone', 'contato':'phone',
  'cep':'postal_code', 'logradouro':'address', 'rua':'address', 'endereco':'address',
  'numero':'address_number', 'numero da casa':'address_number',
  'complemento':'address_complement', 'bairro':'neighborhood', 'cidade':'city',
  'estado':'state', 'uf':'state',
};
const accentless = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const normalizeLabel = value => accentless(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const digits = value => String(value).replace(/\D/g,'');
const states = {AC:'AC',AL:'AL',AP:'AP',AM:'AM',BA:'BA',CE:'CE',DF:'DF',ES:'ES',GO:'GO',MA:'MA',MT:'MT',MS:'MS',MG:'MG',PA:'PA',PB:'PB',PR:'PR',PE:'PE',PI:'PI',RJ:'RJ',RN:'RN',RS:'RS',RO:'RO',RR:'RR',SC:'SC',SP:'SP',SE:'SE',TO:'TO'};
const stateNames = {'sao paulo':'SP','rio de janeiro':'RJ','minas gerais':'MG','espirito santo':'ES','parana':'PR','santa catarina':'SC','rio grande do sul':'RS','bahia':'BA','distrito federal':'DF','goias':'GO','pernambuco':'PE','ceara':'CE','para':'PA','amazonas':'AM','mato grosso':'MT','mato grosso do sul':'MS','maranhao':'MA','paraiba':'PB','rio grande do norte':'RN','piaui':'PI','alagoas':'AL','sergipe':'SE','tocantins':'TO','acre':'AC','rondonia':'RO','roraima':'RR','amapa':'AP'};
const validCpf = cpf => {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let t=9;t<11;t++) {
    const sum = [...cpf.slice(0,t)].reduce((s,d,i)=>s+Number(d)*(t+1-i),0);
    if (Number(cpf[t]) !== ((sum*10)%11)%10) return false;
  }
  return true;
};
const parseDate = raw => {
  const v=raw.trim();
  const match = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const iso = match ? `${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}` : v;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d=new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0,10)!==iso ? null : iso;
};
export function parseClientMessage(raw) {
  const values = {}; const warnings=[]; const unknown=[];
  for (const line of String(raw || '').split(/\r?\n/)) {
    const match=line.trim().replace(/^[-*•]\s*/, '').match(/^([^:：]{2,55})\s*[:：]\s*(.*)$/);
    if (!match) continue;
    const key=aliases[normalizeLabel(match[1])];
    if (!key) {unknown.push(match[1].trim());continue;}
    let value=match[2].trim();
    if (!value || /^(-|n\/a|nao informado|não informado)$/i.test(value)) continue;
    if (key==='cpf') { value=digits(value); if (!validCpf(value)) {warnings.push('CPF inválido: confira os 11 dígitos e os verificadores.');continue;} }
    if (key==='postal_code') {value=digits(value); if (value.length!==8) {warnings.push('CEP inválido: informe 8 dígitos.');continue;} }
    if (key==='birth_date') {const d=parseDate(value); if (!d) {warnings.push('Data de nascimento inválida. Use DD/MM/AAAA.');continue;} value=d;}
    if (key==='state') {const state=normalizeLabel(value); value=states[value.toUpperCase()] || stateNames[state]; if (!value) {warnings.push('Estado não reconhecido: informe a UF.');continue;} }
    if (key==='email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {warnings.push('E-mail inválido: confira o endereço.');continue;}
    if (key==='phone' && (digits(value).length<10 || digits(value).length>13)) {warnings.push('Telefone fora do padrão esperado: confira o número.');continue;}
    if (key==='full_name' && value.length<3) {warnings.push('Nome muito curto: confira o nome completo.');continue;}
    if (values[key] && values[key]!==value) warnings.push(`Campo duplicado: ${match[1]}. Foi usado o último valor.`);
    values[key]=value;
  }
  if (!Object.keys(values).length) warnings.push('Nenhum campo reconhecido. Use os rótulos do modelo.');
  return {values, warnings, unknown};
}
