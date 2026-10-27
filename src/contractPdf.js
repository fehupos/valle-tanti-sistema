import { jsPDF } from 'jspdf';

const LOGO='https://lhinolmdpaonyuxbgzbw.supabase.co/storage/v1/object/public/puppy-photos/site/2.svg';
const brl=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=value=>value?String(value).slice(0,10).split('-').reverse().join('/'): '—';

// MINUTA para conferência: não reproduz as oito páginas de cláusulas do contrato original.
// A aprovação do texto jurídico completo é necessária antes da emissão definitiva.
export async function generateContractDraft(sale){
  const pdf=new jsPDF({unit:'mm',format:'a4'});
  const snap=sale.contract_snapshot||{};
  const c=snap.client||{};const a=snap.animal||{};
  const margin=18;let y=21;
  const line=(value,style='normal')=>{
    pdf.setFont('helvetica',style);
    const lines=pdf.splitTextToSize(String(value??'—'),174);
    for(const txt of lines){if(y>275){pdf.addPage();y=20;}pdf.text(txt,margin,y);y+=6;}
    y+=2;
  };
  pdf.setFontSize(15);line('CONTRATO DE COMPRA E VENDA DE ANIMAIS DOMÉSTICOS','bold');
  pdf.setFontSize(10);line('VALLE TANTI AUGURI — MINUTA PARA REVISÃO JURÍDICA','bold');
  line('Referência visual da marca: '+LOGO);
  line('Operação: '+(sale.operation_status==='reservada'?'RESERVA':'VENDA')+' | Registro: '+sale.id);
  line('VENDEDOR: Canil Valle Tanti Auguri');
  line('COMPRADOR: '+(c.full_name||sale.buyer_name||'—'));
  line('CPF: '+(c.cpf||'—')+' | RG: '+(c.rg||'—'));
  line('Endereço: '+[c.address,c.address_number,c.neighborhood,c.city,c.state,c.postal_code].filter(Boolean).join(', '));
  line('ANIMAL: '+(a.name||'—')+' | Raça: '+(a.breed||'Chihuahua')+' | Sexo: '+(a.gender||'—'));
  line('Cor: '+(a.color||a.coat_color||'—')+' | Nascimento: '+date(a.birth_date));
  line('Pai: '+(a.father||'—')+' | Mãe: '+(a.mother||'—'));
  line('Pedigree: '+(a.pedigree_number||'—')+' | Microchip: '+(a.microchip_number||'—'));
  line('PREÇO TOTAL: '+brl(sale.sale_price));
  line('Adiantamento: '+brl(sale.advance_amount)+' | Saldo: '+brl(sale.delivery_amount??Number(sale.sale_price||0)-Number(sale.advance_amount||0)));
  line('Pagamento: '+(sale.payment_method||'—')+' | Parcelas: '+(sale.installments||'—'));
  line('Data do registro: '+date(sale.created_at)+' | Entrega prevista: '+date(sale.expected_delivery_date));
  line('Condições adicionais: '+(sale.notes||'Não informadas'));
  y+=5;
  line('ATENÇÃO: ESTA MINUTA NÃO SUBSTITUI O CONTRATO ORIGINAL DE 8 PÁGINAS.','bold');
  line('As cláusulas jurídicas do modelo fornecido, inclusive sobre idade mínima de entrega, esterilização, nota fiscal e garantias, exigem validação antes da emissão final.');
  line('Assinatura do comprador: ____________________________________');
  line('Assinatura do vendedor: ______________________________________');
  return pdf.output('blob');
}
