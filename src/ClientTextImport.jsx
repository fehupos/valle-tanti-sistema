import { useState } from 'react';
import { CLIENT_MESSAGE_TEMPLATE, parseClientMessage } from './clientTextParser';
import './ClientTextImport.css';
const names = {full_name:'Nome completo',cpf:'CPF',rg:'RG',birth_date:'Nascimento',nationality:'Nacionalidade',marital_status:'Estado civil',profession:'Profissão',email:'E-mail',instagram:'Instagram',phone:'WhatsApp',postal_code:'CEP',address:'Rua',address_number:'Número',address_complement:'Complemento',neighborhood:'Bairro',city:'Cidade',state:'UF'};
export default function ClientTextImport({onApply, disabled=false}) {
  const [expanded,setExpanded]=useState(false);
  const [raw,setRaw]=useState('');
  const [result,setResult]=useState(null);
  return <section className="valle-import-box">
    <button type="button" className="valle-import-toggle" onClick={()=>setExpanded(v=>!v)} disabled={disabled} aria-expanded={expanded}>Preencher com texto {expanded?'−':'+'}</button>
    {expanded && <div className="valle-import-content">
      <p>Cole aqui a mensagem respondida pelo cliente. Nenhuma informação será salva automaticamente.</p>
      <textarea aria-label="Texto recebido do cliente" rows={7} value={raw} onChange={e=>{setRaw(e.target.value);setResult(null);}} placeholder={CLIENT_MESSAGE_TEMPLATE}/>
      <div className="valle-import-actions">
        <button type="button" className="valle-import-btn" onClick={()=>setResult(parseClientMessage(raw))} disabled={!raw.trim() || disabled}>Identificar dados</button>
        <button type="button" className="valle-import-secondary" onClick={()=>{setRaw(CLIENT_MESSAGE_TEMPLATE);setResult(null);}}>Usar modelo de mensagem</button>
      </div>
      {result && <div className="valle-import-preview">
        <strong>Confira antes de aplicar ({Object.keys(result.values).length} campos reconhecidos)</strong>
        <dl>{Object.entries(result.values).map(([key,value])=><div key={key}><dt>{names[key]||key}</dt><dd>{value}</dd></div>)}</dl>
        {result.warnings.map((w,i)=><p role="alert" key={i} className="valle-import-warning">{w}</p>)}
        {result.unknown.length>0 && <p className="valle-import-warning">Rótulos não reconhecidos: {result.unknown.join(', ')}</p>}
        <button type="button" className="valle-import-btn" disabled={!Object.keys(result.values).length || disabled} onClick={()=>{onApply(result.values);setExpanded(false);setRaw('');setResult(null);}}>Aplicar aos campos do formulário</button>
      </div>}
    </div>}
  </section>;
}
