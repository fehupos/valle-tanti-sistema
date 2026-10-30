import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Modelo sanitizado das oito páginas oficiais em public/contrato-valle-modelo.pdf.
// Não altera automaticamente as cláusulas jurídicas originais.
const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const plain = value => String(value ?? '').trim() || 'Não informado';
const dateBR = value => {
  if (!value) return 'Não informada';
  const v = String(value).slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : v;
};
const units = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const teens = ['dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
const tens = ['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
const hundreds = ['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
function underThousand(n) {
  if(n===100) return 'cem';
  const a=[];
  if(n>=100){a.push(hundreds[Math.floor(n/100)]);n%=100;}
  if(n>=20){a.push(tens[Math.floor(n/10)]);n%=10;}
  else if(n>=10){a.push(teens[n-10]);n=0;}
  if(n) a.push(units[n]);
  return a.join(' e ');
}
function integerWords(n){
  if(!n)return 'zero';
  const parts=[];let i=0;
  const names=['','mil','milhão','bilhão'];const plural=['','mil','milhões','bilhões'];
  while(n && i<4){let v=n%1000;if(v){const a=i===1&&v===1?'':underThousand(v);parts.unshift([a,i===0?'':v===1?names[i]:plural[i]].filter(Boolean).join(' '));}n=Math.floor(n/1000);i++;}
  return parts.join(' e ');
}
function wordsBR(amount){
  const cents=Math.round(Number(amount||0)*100);
  if(!Number.isSafeInteger(cents)||cents<0||cents>=1e12) return 'valor não suportado';
  const full=Math.floor(cents/100),fraction=cents%100;
  return [full?`${integerWords(full)} ${full===1?'real':'reais'}`:'',fraction?`${integerWords(fraction)} ${fraction===1?'centavo':'centavos'}`:''].filter(Boolean).join(' e ') || 'zero reais';
}
function normalize(value){
  // Helvetica / PDF standard fonts usam WinAnsi; substitui caracteres incompatíveis.
  return String(value ?? '').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/[\u2013\u2014]/g,'-').replace(/[^\u0020-\u007e\u00a0-\u00ff\u20ac]/g,'');
}
function lines(text,font,size,maxWidth){
  const out=[];
  for(const paragraph of normalize(text).split('\n')){
    let current='';
    for(const word of paragraph.split(/\s+/)){
      const candidate=current?current+' '+word:word;
      if(current && font.widthOfTextAtSize(candidate,size)>maxWidth){out.push(current);current=word;}else current=candidate;
    }
    out.push(current);
  }
  return out;
}
function block(page,font,text,{x=53,top,width=490,leading=12,maxLines=4,size=10}={}){
  const printed=lines(text,font,size,width);
  if(printed.length>maxLines) throw new Error(`Campo muito longo no contrato (página ${page.docPageNumber || '?'}): revise os dados antes de emitir. ${normalize(text).slice(0,65)}`);
  for(let i=0;i<printed.length;i++) page.drawText(printed[i],{x,y:page.getHeight()-top-i*leading-size,font,size,color:rgb(0,0,0)});
}
function ageDays(birth,delivery){
  if(!birth||!delivery)return null;
  const a=Date.parse(String(birth).slice(0,10)+'T12:00:00Z'),b=Date.parse(String(delivery).slice(0,10)+'T12:00:00Z');
  return Number.isFinite(a)&&Number.isFinite(b)&&b>=a?Math.round((b-a)/86400000):null;
}

export async function generateContractDraft(sale){
  const snapshot=sale.contract_snapshot || {};
  const c=snapshot.client || {};
  const a=snapshot.animal || {};
  const s=snapshot.sale || {};
  const response=await fetch(`${import.meta.env.BASE_URL || '/'}contrato-valle-modelo.pdf`);
  if(!response.ok) throw new Error('Modelo do contrato não encontrado em public/contrato-valle-modelo.pdf.');
  const doc=await PDFDocument.load(await response.arrayBuffer());
  if(doc.getPageCount()!==8)throw new Error('O modelo oficial deve conter oito páginas.');
  const font=await doc.embedFont(StandardFonts.Helvetica);
  const pages=doc.getPages();
  const fullName=plain(c.full_name || sale.buyer_name);
  const addr=[c.address, c.address_number, c.address_complement, c.neighborhood, c.city, c.state, c.postal_code].filter(Boolean).join(', ');
  const clientText=`COMPRADOR: ${fullName}, nacionalidade: ${plain(c.nationality)}, profissão: ${plain(c.profession)}, estado civil: ${plain(c.marital_status)}. RG: ${plain(c.rg)}, CPF: ${plain(c.cpf)}, e-mail: ${plain(c.email)}. Endereço: ${addr || 'Não informado'}.`;
  block(pages[0],font,clientText,{top:229,size:9.5,leading:12.3,maxLines:5});
  const gender=plain(a.gender);
  const animalText=`CLÁUSULA PRIMEIRA: O presente contrato tem como OBJETO a venda de um cachorro filhote ${gender}.\nRaça: ${plain(a.breed || 'CHIHUAHUA')}\nCor: ${plain(a.color || a.coat_color)}\nNome: ${plain(a.name)}\nPai: ${plain(a.father)}\nMãe: ${plain(a.mother)}\nData de nascimento: ${dateBR(a.birth_date)}\nNº Pedigree: ${plain(a.pedigree_number)}\nNº Microchip: ${plain(a.microchip_number)}`;
  block(pages[0],font,animalText,{top:411,size:9.5,leading:13.35,maxLines:9});
  const total=Number(sale.sale_price ?? s.sale_price ?? 0);
  const paid=Number(sale.advance_amount ?? s.advance_amount ?? 0);
  const remaining=Math.max(0,Number(sale.delivery_amount ?? s.delivery_amount ?? (total-paid)));
  block(pages[0],font,`CLÁUSULA SEGUNDA: O comprador pagará ao vendedor, pela compra do filhote, objeto deste contrato o valor de ${money(total)} (${wordsBR(total)}) da seguinte maneira:`,{top:719,size:9.5,leading:13,maxLines:2});
  block(pages[1],font,`Parágrafo Primeiro: A título de reserva ou adiantamento, será pago o valor de ${money(paid)} (${wordsBR(paid)}), conforme comprovante de pagamento.`,{top:53,size:9,leading:13,maxLines:2});
  block(pages[1],font,`Parágrafo Segundo: O valor remanescente de ${money(remaining)} (${wordsBR(remaining)}) deverá ser pago até 07 (sete) dias antes da entrega do filhote.`,{top:89,size:9,leading:13,maxLines:2});
  const delivery=sale.expected_delivery_date || s.expected_delivery_date || sale.sale_date || s.sale_date;
  const age=ageDays(a.birth_date,delivery);
  block(pages[1],font,`CLÁUSULA TERCEIRA: O filhote será entregue ${age === null?'na data acordada':`com ${age} dias de idade`}.`,{top:198,size:10,maxLines:1});
  block(pages[7],font,`Guarulhos/SP, ${dateBR(sale.created_at || s.sale_date || sale.sale_date || new Date().toISOString())}`,{top:198,size:10,maxLines:1,width:350});
  const bytes=await doc.save();
  return new Blob([bytes],{type:'application/pdf'});
}
