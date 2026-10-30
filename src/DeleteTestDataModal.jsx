import { useState } from 'react';
import { supabase } from './supabase';
import './ValleRefinements.css';

/** Exclusão permanente SOMENTE de dados de homologação, protegida por RPC no banco. */
export default function DeleteTestDataModal({ puppy, sale, onClose, onDeleted }) {
  const [deletePuppy, setDeletePuppy] = useState(Boolean(puppy && !sale));
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const name = puppy?.name || sale?.buyer_name || 'este registro';
  async function confirm(e) {
    e.preventDefault();
    if (confirmation !== 'EXCLUIR' || busy) return;
    setBusy(true);setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('valle_delete_test_data_v1', {
        p_puppy_id: sale ? null : puppy.id,
        p_sale_id: sale?.id || null,
        p_delete_puppy: sale ? deletePuppy : true,
        p_confirmation: confirmation,
      });
      if (rpcError) throw rpcError;
      // Limpeza de arquivos DEPOIS da transação. Uma falha não desfaz o banco;
      // isso é comunicado explicitamente para limpeza posterior, sem ocultar resíduos.
      const failures=[];
      const pdfPaths = (data?.contract_paths || []).filter(p => typeof p === 'string' && p.length);
      for(let i=0;i<pdfPaths.length;i+=100){
        const {error:removeError}=await supabase.storage.from('sale-contracts').remove(pdfPaths.slice(i,i+100));
        if(removeError) failures.push(`PDFs: ${removeError.message}`);
      }
      const image = data?.puppy_image;
      const prefix = '/storage/v1/object/public/puppy-photos/';
      if (data?.puppy_deleted && typeof image === 'string') {
        try {
          const url=new URL(image);
          const position=url.pathname.indexOf(prefix);
          const path=position<0?null:decodeURIComponent(url.pathname.slice(position+prefix.length));
          if(path?.startsWith('puppies/') && !path.includes('..')) {
            const {error:photoError}=await supabase.storage.from('puppy-photos').remove([path]);
            if(photoError) failures.push(`Foto: ${photoError.message}`);
          }
        } catch { failures.push('Não foi possível identificar o caminho da foto para remoção.'); }
      }
      await onDeleted?.(failures);
    } catch(e) { setError(e.message || 'Não foi possível excluir os dados.'); }
    finally {setBusy(false);}
  }
  return <div className="valle-detail-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
    <section className="valle-detail-modal valle-delete-modal" role="dialog" aria-modal="true" aria-label="Excluir dados de teste">
      <header className="valle-detail-header"><div><span className="valle-detail-kicker">SOMENTE DESENVOLVIMENTO</span><h2>Excluir definitivamente</h2></div><button className="valle-detail-close" type="button" onClick={onClose} disabled={busy}>×</button></header>
      <form onSubmit={confirm} className="valle-detail-content valle-cancel-form">
        <p><strong>{name}</strong> — esta exclusão é permanente e não poderá ser desfeita.</p>
        {sale ? <label className="valle-delete-choice"><input type="checkbox" checked={deletePuppy} onChange={e=>setDeletePuppy(e.target.checked)} disabled={busy}/><span>Excluir também o filhote e todas as suas operações de teste. Se desmarcado, exclui somente esta operação e libera o filhote quando possível.</span></label>
          : <p className="valle-cancel-note">Serão removidos o filhote e todas as vendas, reservas e minutas de teste vinculadas.</p>}
        <label>Digite <strong>EXCLUIR</strong> para confirmar<input value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off" placeholder="EXCLUIR" disabled={busy}/></label>
        {error && <p role="alert" className="sales-error">{error}</p>}
        <div className="valle-detail-actions"><button type="button" className="valle-btn valle-btn-ghost" onClick={onClose} disabled={busy}>Voltar</button><button type="submit" className="valle-btn valle-btn-danger" disabled={busy||confirmation!=='EXCLUIR'}>{busy?'Excluindo...':'Excluir permanentemente'}</button></div>
      </form>
    </section>
  </div>;
}
