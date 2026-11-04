import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { downloadPublishedContractTemplate, validateContractTemplate } from './contractDocx';
import './ContractTemplatePage.css';

const BUCKET = 'contract-templates';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export default function ContractTemplatePage() {
  const [items, setItems] = useState([]);
  const [upload, setUpload] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const active = items.find(item => item.status === 'published');

  const reload = useCallback(async () => {
    setLoading(true);
    const {data,error:fetchError} = await supabase.from('contract_templates')
      .select('id,version,file_path,status,description,created_at,published_at')
      .order('version', {ascending:false});
    if (fetchError) setError(fetchError.message);
    else { setItems(data || []); setError(''); }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function guarded(callback) {
    setBusy(true); setError(''); setMessage('');
    try {
      const {data:{user},error:authError} = await supabase.auth.getUser();
      if (authError || !user) throw new Error('Sessão expirada. Entre novamente.');
      const {data:profile,error:profileError} = await supabase.from('user_profiles')
        .select('role,active').eq('user_id', user.id).maybeSingle();
      if (profileError || profile?.role !== 'gestao' || !profile.active) {
        throw new Error('Somente um usuário ativo do perfil Gestão pode alterar modelos.');
      }
      await callback(user);
      await reload();
    } catch (err) { setError(err?.message || 'Não foi possível concluir a operação.'); }
    finally { setBusy(false); }
  }

  async function downloadVersion(item) {
    await guarded(async () => {
      let blob;
      if (item) {
        const {data,error:downloadError} = await supabase.storage.from(BUCKET).download(item.file_path);
        if (downloadError) throw downloadError;
        blob = data;
      } else {
        const model = await downloadPublishedContractTemplate();
        blob = model.blob;
      }
      downloadBlob(blob, `contrato-valle-modelo-v${item?.version ?? 0}.docx`);
    });
  }

  async function sendDraft(user) {
    if (!upload) throw new Error('Selecione um arquivo DOCX antes de enviar.');
    await validateContractTemplate(upload);
    const filePath = `templates/${crypto.randomUUID()}.docx`;
    const {error:uploadError} = await supabase.storage.from(BUCKET)
      .upload(filePath, upload, {contentType:DOCX_MIME, upsert:false});
    if (uploadError) throw uploadError;
    const {error:insertError} = await supabase.from('contract_templates').insert({
      file_path:filePath, status:'draft', description:note.trim() || null, created_by:user.id
    });
    if (insertError) {
      // Sem permissão de DELETE propositalmente: o arquivo órfão pode ser eliminado por administrador.
      throw new Error(`Arquivo enviado, mas houve falha ao registrar a versão: ${insertError.message}. Informe a Gestão para remover o arquivo órfão ${filePath}.`);
    }
    setUpload(null); setNote('');
    const input = document.getElementById('contract-template-file');
    if (input) input.value = '';
    setMessage('Nova versão salva como rascunho. Publique quando estiver pronta.');
  }

  async function publish(item) {
    if (!window.confirm(`Publicar a versão ${item.version} para todos os NOVOS contratos? Os contratos emitidos permanecerão inalterados.`)) return;
    await guarded(async () => {
      const {data:blob,error:downloadError} = await supabase.storage.from(BUCKET).download(item.file_path);
      if (downloadError) throw downloadError;
      await validateContractTemplate(blob);
      const {error:rpcError} = await supabase.rpc('publish_contract_template', {p_template_id:item.id});
      if (rpcError) throw rpcError;
      setMessage(`Versão ${item.version} publicada. Os próximos contratos usarão o novo modelo.`);
    });
  }

  return <main className="content contract-template-page">
    <header className="page-header"><div><h1>Modelo de Contrato</h1><p>Gerencie a minuta padrão utilizada em novas vendas e reservas.</p></div></header>
    {error && <div className="alert error" role="alert">{error}</div>}
    {message && <div className="alert success" role="status">{message}</div>}
    <section className="panel ct-section">
      <div className="ct-heading"><h2>Modelo vigente</h2><span className="ct-status">{active ? `Versão ${active.version} publicada` : 'Modelo original do projeto'}</span></div>
      <p>{active ? `Publicado em ${new Date(active.published_at).toLocaleString('pt-BR')}.` : 'Ainda não há uma versão publicada no Supabase. O gerador continua usando o modelo Word original.'}</p>
      <button className="secondary-button" disabled={busy} type="button" onClick={() => downloadVersion(active || null)}>Baixar modelo vigente</button>
    </section>
    <section className="panel ct-section">
      <h2>Enviar uma nova versão</h2>
      <p>Baixe o modelo vigente, edite o texto no Word e salve em DOCX. Preserve os campos automáticos entre chaves duplas, como <code>{'{{NOME_COMPLETO}}'}</code> e <code>{'{{VALOR_TOTAL}}'}</code>.</p>
      <label className="ct-field">Arquivo DOCX (até 5 MB)
        <input id="contract-template-file" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={busy} onChange={e => setUpload(e.target.files?.[0] || null)}/>
      </label>
      <label className="ct-field">Descrição da alteração (opcional)
        <input value={note} maxLength={200} disabled={busy} onChange={e => setNote(e.target.value)} placeholder="Ex.: Ajuste da cláusula de entrega"/>
      </label>
      <button className="primary-button" type="button" disabled={!upload || busy} onClick={() => guarded(sendDraft)}>{busy ? 'Validando...' : 'Validar e salvar rascunho'}</button>
      <p className="ct-note">O envio não altera contratos. Somente a publicação de uma versão aprovada altera o modelo utilizado em futuras operações.</p>
    </section>
    <section className="panel ct-section">
      <h2>Histórico de versões</h2>
      {loading ? <p>Carregando...</p> : !items.length ? <p>Nenhuma versão enviada ainda.</p> :
        <div className="ct-history">
          {items.map(item => <div className="ct-version" key={item.id}>
            <div className="ct-description">
              <strong>Versão {item.version}</strong> <span className={`ct-tag ct-${item.status}`}>{item.status === 'published' ? 'Vigente' : item.status === 'draft' ? 'Rascunho' : 'Anterior'}</span>
              <small>{new Date(item.created_at).toLocaleString('pt-BR')}{item.description ? ` — ${item.description}` : ''}</small>
            </div>
            <div className="ct-actions">
              <button type="button" className="secondary-button" disabled={busy} onClick={() => downloadVersion(item)}>Baixar</button>
              {item.status !== 'published' && <button type="button" className="primary-button" disabled={busy} onClick={() => publish(item)}>{item.status === 'archived' ? 'Restaurar e publicar' : 'Publicar'}</button>}
            </div>
          </div>)}
        </div>}
    </section>
  </main>;
}
