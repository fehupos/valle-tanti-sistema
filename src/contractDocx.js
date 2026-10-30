import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

// O arquivo Word é o documento-fonte. O gerador não escreve por coordenadas.
// Mantenha os nomes dos campos {{CAMPO}} ao editar o modelo no Word.
const asText = value => String(value ?? '').trim();
const present = (value, fallback = 'Não informado') => asText(value) || fallback;
const number = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const s = asText(value);
  if (!s) return 0;
  const clean = s.replace(/R\$|\s/g, '');
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};
const amount = value => number(value).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
const brDate = value => {
  if (!value) return 'Não informada';
  const v = String(value).slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : v;
};
const units = ['','um','dois','três','quatro','cinco','seis','sete','oito','nove'];
const teens = ['dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
const tens = ['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
const hundreds = ['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
function below1000(n) {
  if (n === 100) return 'cem';
  const bits=[];
  if (n >= 100) { bits.push(hundreds[Math.trunc(n/100)]); n%=100; }
  if (n >= 20) { bits.push(tens[Math.trunc(n/10)]); n%=10; }
  else if (n >= 10) { bits.push(teens[n-10]); n=0; }
  if(n>0) bits.push(units[n]);
  return bits.join(' e ');
}
function intWords(n) {
  if(n===0) return 'zero';
  const parts=[], singular=['','mil','milhão','bilhão'], plural=['','mil','milhões','bilhões'];
  let group=0;
  while(n>0 && group < 4){
    const chunk=n%1000;
    if(chunk){
      const part=group===1 && chunk===1 ? 'mil' : [below1000(chunk),group===0?'':chunk===1?singular[group]:plural[group]].filter(Boolean).join(' ');
      parts.unshift(part);
    }
    n=Math.floor(n/1000); group++;
  }
  return parts.join(' e ');
}
function moneyWords(value){
  const cents=Math.round(number(value)*100);
  if(!Number.isSafeInteger(cents)||cents<0||cents>=1e12) throw new Error('Valor fora da faixa permitida para o contrato.');
  const reais=Math.floor(cents/100), centavos=cents%100;
  const parts=[];
  if(reais) parts.push(`${intWords(reais)} ${reais===1?'real':'reais'}`);
  if(centavos) parts.push(`${intWords(centavos)} ${centavos===1?'centavo':'centavos'}`);
  return parts.join(' e ')||'zero reais';
}
function daysBetween(birth,reference){
  if(!birth||!reference) return null;
  const a=Date.parse(`${String(birth).slice(0,10)}T12:00:00Z`);
  const b=Date.parse(`${String(reference).slice(0,10)}T12:00:00Z`);
  return Number.isFinite(a)&&Number.isFinite(b)&&b>=a ? Math.round((b-a)/86400000) : null;
}
function parseDayCount(value){
  if(value===null || value===undefined || value==='')return null;
  const n=Number(value);
  return Number.isInteger(n)&&n>=0&&n<=1000?n:null;
}
function contractFields(sale){
  const snap=sale.contract_snapshot||{};
  const c=snap.client||snap.buyer||{};
  const a=snap.animal||snap.animal_details||snap.puppy||{};
  const s=snap.sale||{};
  const total=number(sale.sale_price??s.sale_price);
  const paid=number(sale.advance_amount??s.advance_amount);
  if(total<=0||paid<0||paid>total)throw new Error('Valor total ou adiantamento inválido para gerar a minuta.');
  const saldo=Math.round((total-paid)*100)/100;
  const percent=Math.round((paid/total)*100);
  // Prioriza o campo de idade em dias já salvo no formulário; evita usar a data futura de entrega.
  const age=parseDayCount(a.days_old_at_sale ?? a.age_days ?? a.days_old ?? a.dias_de_vida)
    ?? daysBetween(a.birth_date, s.sale_date || sale.created_at || sale.sale_date);
  if(age===null) throw new Error('Idade do filhote em dias não encontrada. Confira o formulário de venda.');
  const addr=[c.address, c.address_number, c.address_complement, c.neighborhood, c.city, c.state, c.postal_code]
    .map(asText).filter(Boolean).join(', ');
  return {
    'NOME_COMPLETO':present(c.full_name||sale.buyer_name),
    'NACIONALIDADE':present(c.nationality),
    'PROFISSÃO':present(c.profession),
    'ESTADO_CIVIL':present(c.marital_status),
    'RG':present(c.rg),
    'CPF':present(c.cpf),
    'EMAIL':present(c.email),
    'ENDEREÇO_COMPLETO':present(addr),
    'SEXO':present(a.gender),
    'RAÇA':present(a.breed||'CHIHUAHUA'),
    'COR':present(a.coat_color||a.color),
    'NOME_ANIMAL':present(a.name),
    'PAI':present(a.father),
    'MÃE':present(a.mother),
    'DATA_NASCIMENTO':brDate(a.birth_date),
    'PEDIGREE':present(a.pedigree_number||a.pedigree_no|| (a.pedigree === true ? 'Sim' : 'Não informado')),
    'MICROCHIP':present(a.microchip_number||a.microchip),
    'VALOR_TOTAL':`R$ ${amount(total)}`,
    'VALOR_TOTAL_EXTENSO':moneyWords(total),
    'VALOR_ADIANTADO':amount(paid), // a própria cláusula já possui "R$"
    'VALOR_ADIANTADO_EXTENSO':moneyWords(paid),
    'PERCENTUAL_ADIANTADO':String(percent),
    'PERCENTUAL_ADIANTADO_EXTENSO':intWords(percent),
    'SALDO':`R$ ${amount(saldo)}`,
    'SALDO_EXTENSO':moneyWords(saldo),
    'IDADE_DIAS':String(age),
    'DATA_CONTRATO':brDate(s.sale_date||sale.created_at||sale.sale_date)
  };
}

export async function generateContractDraft(sale){
  const base=import.meta.env.BASE_URL||'/';
  const url=`${base.endsWith('/')?base:base+'/'}contrato-valle-modelo.docx`;
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw new Error(`Modelo Word não encontrado (${response.status}). Verifique public/contrato-valle-modelo.docx.`);
  const bytes=await response.arrayBuffer();
  const zip=new PizZip(bytes); // falha se o servidor responder HTML ou um DOCX inválido
  const doc=new Docxtemplater(zip,{
    delimiters:{start:'{{',end:'}}'},
    paragraphLoop:true,
    linebreaks:true,
    nullGetter:part=>{throw new Error(`Campo do contrato sem valor configurado: ${part.value}`);}
  });
  try {doc.render(contractFields(sale));}
  catch(e){
    const details=e?.properties?.errors?.map(item=>item.properties?.explanation).filter(Boolean).join('; ');
    throw new Error(`Falha ao preencher o modelo Word: ${details||e.message}`);
  }
  return new Blob([doc.getZip().generate({type:'uint8array',compression:'DEFLATE'})],{
    type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
}
