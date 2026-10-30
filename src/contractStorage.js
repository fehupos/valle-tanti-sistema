import { supabase } from './supabase';
import { generateContractDraft } from './contractDocx';

const bucket='sale-contracts';
const docxType='application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Novas operações geram Word; contratos antigos em PDF permanecem intactos.
export async function createAndStoreDraft(sale,userId){
  if(!sale?.id||!userId)throw new Error('Venda ou usuário não identificado.');
  const {data:existing,error:existingError}=await supabase.from('contracts')
    .select('id,file_path,version').eq('sale_id',sale.id).order('version',{ascending:false}).limit(1);
  if(existingError)throw existingError;
  if(existing?.[0])return existing[0];
  const blob=await generateContractDraft(sale);
  const path=`${sale.id}/${crypto.randomUUID()}.docx`;
  const {error:uploadError}=await supabase.storage.from(bucket).upload(path,blob,{contentType:docxType,upsert:false});
  if(uploadError)throw uploadError;
  const {data:contract,error:insertError}=await supabase.from('contracts')
    .insert({sale_id:sale.id,file_path:path,created_by:userId,version:1})
    .select('id,file_path,version').single();
  if(insertError){
    const {error:cleanupError}=await supabase.storage.from(bucket).remove([path]);
    throw new Error(`${insertError.message}${cleanupError?` (arquivo pendente no Storage: ${path})`:''}`);
  }
  return contract;
}

// Nome do download: primeiro e segundo nomes + seis primeiros dígitos do CPF.
// Exemplo: minuta-Maria-Clara-123456.docx
function safeNamePart(value){
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9-]/g,'')
    .slice(0,60);
}
function downloadFilename(client,extension,fallbackId){
  const name=String(client?.full_name ?? '').trim().split(/\s+/)
    .slice(0,2).map(safeNamePart).filter(Boolean).join('-');
  const cpf=String(client?.cpf ?? '').replace(/\D/g,'').slice(0,6);
  // Não inventar CPF ou nome se dados antigos estiverem incompletos.
  if(name && cpf.length===6)return `minuta-${name}-${cpf}.${extension}`;
  const safeId=safeNamePart(fallbackId)||'contrato';
  return `minuta-valle-tanti-${safeId}.${extension}`;
}

export async function downloadStoredDraft(contract,saleOrId,clientOverride){
  const saleId=typeof saleOrId==='object'?saleOrId?.id:saleOrId;
  let item=contract;
  if(!item){
    const {data,error}=await supabase.from('contracts')
      .select('id,file_path,version').eq('sale_id',saleId).order('version',{ascending:false}).limit(1).maybeSingle();
    if(error)throw error;
    item=data;
  }
  if(!item?.file_path)throw new Error('Nenhuma minuta armazenada para este registro.');
  const {data,error}=await supabase.storage.from(bucket).download(item.file_path);
  if(error)throw error;
  const ext=item.file_path.toLowerCase().endsWith('.docx')?'docx':'pdf';
  let sale=typeof saleOrId==='object'?saleOrId:null;
  // Usa o snapshot da operação e, se necessário, consulta os dados já existentes.
  // Qualquer falha nessa consulta afeta apenas o nome, nunca o download.
  if(!sale && saleId){
    const result=await supabase.from('sales').select('id,client_id,buyer_name,contract_snapshot').eq('id',saleId).maybeSingle();
    sale=result.data||null;
  }
  const snap=sale?.contract_snapshot||{};
  const fromSnapshot=snap.client||snap.buyer||{};
  let buyer={...fromSnapshot,...(clientOverride||{})};
  if((!buyer.full_name||!buyer.cpf)&&sale?.client_id){
    const result=await supabase.from('clients').select('full_name,cpf').eq('id',sale.client_id).maybeSingle();
    if(result.data)buyer={...result.data,...buyer};
  }
  if(!buyer.full_name && sale?.buyer_name)buyer.full_name=sale.buyer_name;
  const url=URL.createObjectURL(data);
  const a=document.createElement('a');
  a.href=url;
  a.download=downloadFilename(buyer,ext,saleId||item.file_path.split('/')[0]);
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
