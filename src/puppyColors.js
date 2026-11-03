/** Catálogo de cores padronizadas. Lilac/Isabella são cadastrados como Chocolate. */
export const PUPPY_COLOR_OPTIONS = [
  { value: 'Branco', group: 'Branco' },
  { value: 'Creme', group: 'Creme' },
  { value: 'Fulvo', group: 'Fulvo' },
  { value: 'Dourado', group: 'Dourado' },
  { value: 'Vermelho', group: 'Vermelho' },
  { value: 'Preto', group: 'Preto' },
  { value: 'Chocolate', group: 'Chocolate' },
  { value: 'Azul', group: 'Azul' },
  { value: 'Prateado', group: 'Prateado' },
  { value: 'Canela', group: 'Canela' },
];
export function colorGroup(value){
  const label=String(value||'').trim();
  const normalized=label.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  if(['lilac','lilas','isabella'].includes(normalized)) return 'Chocolate';
  const known=PUPPY_COLOR_OPTIONS.find(x=>x.value.toLocaleLowerCase('pt-BR')===normalized);
  return known?.group || (label || 'Não informado');
}
