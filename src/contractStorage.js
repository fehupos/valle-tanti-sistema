import { supabase } from './supabase';
import { generateContractDraft } from './contractPdf';

export async function createAndStoreDraft(sale, userId) {
  if (!sale?.id || !userId) throw new Error('Venda ou usuário não identificado.');
  const { data: existing, error: existingError } = await supabase.from('contracts').select('id,file_path,version').eq('sale_id',sale.id).order('version',{ascending:false}).limit(1);
  if (existingError) throw existingError;
  if (existing?.[0]) return existing[0];
  const blob = await generateContractDraft(sale);
  const path = `${sale.id}/${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await supabase.storage.from('sale-contracts').upload(path,blob,{contentType:'application/pdf',upsert:false});
  if (uploadError) throw uploadError;
  const { data: contract, error: insertError } = await supabase.from('contracts').insert({sale_id:sale.id,file_path:path,created_by:userId,version:1}).select('id,file_path,version').single();
  if (insertError) {
    await supabase.storage.from('sale-contracts').remove([path]);
    throw insertError;
  }
  return contract;
}

export async function downloadStoredDraft(contract, saleId) {
  let item = contract;
  if (!item) {
    const {data,error} = await supabase.from('contracts').select('id,file_path,version').eq('sale_id',saleId).order('version',{ascending:false}).limit(1).maybeSingle();
    if(error) throw error;
    item=data;
  }
  if (!item?.file_path) throw new Error('Nenhuma minuta armazenada para este registro.');
  const {data,error}=await supabase.storage.from('sale-contracts').download(item.file_path);
  if(error) throw error;
  const url=URL.createObjectURL(data);
  const a=document.createElement('a');a.href=url;a.download=`minuta-valle-tanti-${saleId || item.file_path.split('/')[0]}.pdf`;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
