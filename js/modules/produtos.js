import { Store } from '../store.js';

const STORAGE_KEY_HISTORICO = 'gv_movimentacoes_estoque_v1';

function formatarMoeda(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function verificarIsAdmin(user) {
  if (!user) return false;
  const perfil = String(user.perfil || user.role || user.tipo || '').trim().toLowerCase();
  return perfil === 'admin' || perfil === 'administrador';
}

function obterDataHoraAtual() {
  const agora = new Date();
  return `${agora.toLocaleDateString('pt-BR')} ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function gerarProximoCodigo(produtos) {
  let maiorNumero = 0;

  (produtos || []).forEach(p => {
    const raw = String(p.sku || p.codigo || '').trim();
    const match = raw.match(/(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maiorNumero) {
        maiorNumero = num;
      }
    }
  });

  const proximo = maiorNumero + 1;
  return String(proximo).padStart(3, '0');
}

function obterCategoriasUnicas(produtos) {
  const mapa = new Map();
  (produtos || []).forEach(p => {
    const cat = String(p.categoria || '').trim();
    if (!cat) return;
    const chave = cat.toLowerCase();
    if (!mapa.has(chave)) {
      mapa.set(chave, cat);
    }
  });
  return Array.from(mapa.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function escaparHtml(texto) {
  return String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderizarCampoCategoriaHtml({ prefixo, categorias, valorSelecionado = '' }) {
  const temCategorias = categorias.length > 0;
  const valorTrim = String(valorSelecionado || '').trim();
  const isNovaInicial = !temCategorias || (valorTrim !== '' && !categorias.some(c => c.toLowerCase() === valorTrim.toLowerCase()));

  const optionsHtml = categorias.map(cat => {
    const selected = !isNovaInicial && cat.toLowerCase() === valorTrim.toLowerCase() ? 'selected' : '';
    return `<option value="${escaparHtml(cat)}" ${selected}>${escaparHtml(cat)}</option>`;
  }).join('');

  return `
    <div class="form-group">
      <label for="${prefixo}-categoria-select">Categoria</label>
      <select id="${prefixo}-categoria-select" required>
        ${temCategorias ? `<option value="" ${!valorTrim && !isNovaInicial ? 'selected' : ''} disabled>Selecione uma categoria...</option>` : ''}
        ${optionsHtml}
        <option value="__nova__" ${isNovaInicial ? 'selected' : ''}>➕ Nova categoria...</option>
      </select>
      <input
        type="text"
        id="${prefixo}-categoria-nova"
        placeholder="Digite o nome da nova categoria (Ex: Periféricos)"
        value="${isNovaInicial ? escaparHtml(valorTrim) : ''}"
        ${isNovaInicial ? 'required' : ''}
        style="margin-top: 0.5rem; display: ${isNovaInicial ? 'block' : 'none'};">
    </div>
  `;
}

function configurarSeletorCategoria(prefixo) {
  const select = document.getElementById(`${prefixo}-categoria-select`);
  const inputNova = document.getElementById(`${prefixo}-categoria-nova`);
  if (!select || !inputNova) return;

  const atualizarVisibilidade = () => {
    if (select.value === '__nova__') {
      inputNova.style.display = 'block';
      inputNova.required = true;
      inputNova.focus();
    } else {
      inputNova.style.display = 'none';
      inputNova.required = false;
      inputNova.value = '';
    }
  };

  select.addEventListener('change', atualizarVisibilidade);
}

function obterCategoriaEscolhida(prefixo) {
  const select = document.getElementById(`${prefixo}-categoria-select`);
  const inputNova = document.getElementById(`${prefixo}-categoria-nova`);
  if (!select) return '';
  if (select.value === '__nova__') {
    return inputNova ? inputNova.value.trim() : '';
  }
  return select.value.trim();
}

function calcularMargemPct(custo, venda) {
  const c = Number(custo) || 0;
  const v = Number(venda) || 0;
  if (c <= 0) return 0;
  return Number((((v - c) / c) * 100).toFixed(2));
}

function configurarCalculoMargemVenda(idCusto, idMargem, idVenda) {
  const inpCusto = document.getElementById(idCusto);
  const inpMargem = document.getElementById(idMargem);
  const inpVenda = document.getElementById(idVenda);

  if (!inpCusto || !inpMargem || !inpVenda) return;

  // Ao digitar a Margem de Lucro (%) -> preenche o Preço de Venda (R$) automaticamente
  inpMargem.addEventListener('input', () => {
    const custo = parseFloat(inpCusto.value);
    const margem = parseFloat(inpMargem.value);

    if (isNaN(custo) || custo <= 0 || isNaN(margem)) {
      if (inpMargem.value === '') inpVenda.value = '';
      return;
    }

    const vendaCalculada = custo * (1 + margem / 100);
    inpVenda.value = vendaCalculada.toFixed(2);
  });

  // Ao digitar o Preço de Venda (R$) -> preenche a Margem de Lucro (%) automaticamente
  inpVenda.addEventListener('input', () => {
    const custo = parseFloat(inpCusto.value);
    const venda = parseFloat(inpVenda.value);

    if (isNaN(custo) || custo <= 0 || isNaN(venda)) {
      if (inpVenda.value === '') inpMargem.value = '';
      return;
    }

    const margemCalculada = ((venda - custo) / custo) * 100;
    inpMargem.value = margemCalculada.toFixed(2).replace(/\.00$/, '');
  });

  // Ao alterar o Custo Unitário (R$) -> recalcula automaticamente mantendo a margem ou o preço informado
  inpCusto.addEventListener('input', () => {
    const custo = parseFloat(inpCusto.value);
    if (isNaN(custo) || custo <= 0) return;

    const margem = parseFloat(inpMargem.value);
    const venda = parseFloat(inpVenda.value);

    if (!isNaN(margem) && inpMargem.value !== '') {
      inpVenda.value = (custo * (1 + margem / 100)).toFixed(2);
    } else if (!isNaN(venda) && inpVenda.value !== '') {
      const novaMargem = ((venda - custo) / custo) * 100;
      inpMargem.value = novaMargem.toFixed(2).replace(/\.00$/, '');
    }
  });
}

// Lê todos os registros salvos unificando Store + localStorage sem nunca perder dados
function obterHistoricoEstoque() {
  let doStore = [];
  let doLocalNovo = [];
  let doLocalLegado = [];

  if (typeof Store.getCollection === 'function') {
    try {
      const res = Store.getCollection('movimentacoes_estoque');
      if (Array.isArray(res)) doStore = res;
    } catch (err) {}
  }

  try {
    const rawNovo = JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORICO) || '[]');
    if (Array.isArray(rawNovo)) doLocalNovo = rawNovo;
  } catch (err) {}

  try {
    const rawLegado = JSON.parse(localStorage.getItem('movimentacoes_estoque') || '[]');
    if (Array.isArray(rawLegado)) doLocalLegado = rawLegado;
  } catch (err) {}

  const mapaUnico = new Map();
  [...doLocalLegado, ...doStore, ...doLocalNovo].forEach((item, idx) => {
    if (!item || typeof item !== 'object') return;
    const chave = item.id
      ? String(item.id)
      : `${item.produtoId || item.sku}-${item.data}-${item.saldoAnterior}-${item.saldoAtual}-${idx}`;
    if (!mapaUnico.has(chave)) {
      mapaUnico.set(chave, item);
    }
  });

  const listaCompleta = Array.from(mapaUnico.values());

  if (listaCompleta.length > doLocalNovo.length) {
    try {
      localStorage.setItem(STORAGE_KEY_HISTORICO, JSON.stringify(listaCompleta));
    } catch (err) {}
  }

  return listaCompleta;
}

function persistirListaHistoricoCompleta(listaCompleta) {
  try {
    localStorage.setItem(STORAGE_KEY_HISTORICO, JSON.stringify(listaCompleta));
    localStorage.setItem('movimentacoes_estoque', JSON.stringify(listaCompleta));
  } catch (err) {}

  if (typeof Store.saveCollection === 'function') {
    try {
      Store.saveCollection('movimentacoes_estoque', listaCompleta);
    } catch (err) {}
  } else if (typeof Store.getCollection === 'function' && typeof Store.removeItem === 'function') {
    try {
      const atuais = Store.getCollection('movimentacoes_estoque') || [];
      atuais.forEach(item => {
        if (item && item.id) Store.removeItem('movimentacoes_estoque', item.id);
      });
      if (typeof Store.addItem === 'function') {
        listaCompleta.forEach(item => Store.addItem('movimentacoes_estoque', item));
      }
    } catch (err) {}
  }
}

function registrarHistoricoEstoque({ produtoId, sku, nome, tipo, quantidade, saldoAnterior, saldoAtual, observacao, usuario }) {
  const listaAtual = obterHistoricoEstoque();

  const novoRegistro = {
    id: `${Date.now()}-${listaAtual.length + 1}-${Math.random().toString(36).slice(2, 7)}`,
    produtoId: String(produtoId || ''),
    sku: String(sku || ''),
    nome: String(nome || ''),
    data: obterDataHoraAtual(),
    tipo, // 'entrada', 'saida', 'ajuste', 'cadastro'
    quantidade: Number(quantidade || 0),
    saldoAnterior: Number(saldoAnterior || 0),
    saldoAtual: Number(saldoAtual || 0),
    observacao: observacao || '',
    usuario: usuario || 'Administrador'
  };

  const novaLista = [...listaAtual, novoRegistro];

  if (typeof Store.addItem === 'function') {
    try {
      Store.addItem('movimentacoes_estoque', novoRegistro);
    } catch (err) {}
  }

  persistirListaHistoricoCompleta(novaLista);
  return novoRegistro;
}

// Limpa o histórico de um produto específico (somente Admin) mantendo o saldo atual como marco base
function limparHistoricoProduto(produto, nomeAdmin) {
  if (!produto) return;

  const historicoAtual = obterHistoricoEstoque();
  const restanteOutrosProdutos = historicoAtual.filter(
    m => !(String(m.produtoId) === String(produto.id) || (produto.sku && String(m.sku) === String(produto.sku)))
  );

  const estoqueAtual = Number(produto.estoque || 0);
  const marcoBasePosLimpeza = {
    id: `${Date.now()}-reset-${produto.id}-${Math.random().toString(36).slice(2, 6)}`,
    produtoId: String(produto.id),
    sku: String(produto.sku || ''),
    nome: String(produto.nome || ''),
    data: obterDataHoraAtual(),
    tipo: 'ajuste',
    quantidade: estoqueAtual,
    saldoAnterior: estoqueAtual,
    saldoAtual: estoqueAtual,
    observacao: 'Histórico limpo pelo Administrador (saldo atual mantido)',
    usuario: nomeAdmin || 'Administrador'
  };

  const novaLista = [...restanteOutrosProdutos, marcoBasePosLimpeza];
  persistirListaHistoricoCompleta(novaLista);
}

// Sincroniza movimentações feitas fora deste módulo (ex: baixas por venda ou estornos no módulo de Vendas)
function sincronizarMovimentacoesExternas(produtos) {
  if (!Array.isArray(produtos) || produtos.length === 0) return obterHistoricoEstoque();

  let historico = obterHistoricoEstoque();
  let houveAlteracao = false;

  produtos.forEach(prod => {
    const estoqueRealAtual = Number(prod.estoque || 0);
    const movsDoProduto = historico.filter(
      m => String(m.produtoId) === String(prod.id) || (prod.sku && String(m.sku) === String(prod.sku))
    );

    if (movsDoProduto.length === 0) {
      const regBase = {
        id: `${Date.now()}-init-${prod.id}-${Math.random().toString(36).slice(2, 6)}`,
        produtoId: String(prod.id),
        sku: String(prod.sku || ''),
        nome: String(prod.nome || ''),
        data: obterDataHoraAtual(),
        tipo: 'cadastro',
        quantidade: estoqueRealAtual,
        saldoAnterior: 0,
        saldoAtual: estoqueRealAtual,
        observacao: 'Saldo inicial registrado no histórico',
        usuario: 'Sistema'
      };
      historico.push(regBase);
      if (typeof Store.addItem === 'function') {
        try { Store.addItem('movimentacoes_estoque', regBase); } catch (err) {}
      }
      houveAlteracao = true;
    } else {
      const ultimaMov = movsDoProduto[movsDoProduto.length - 1];
      const ultimoSaldoRegistrado = Number(ultimaMov.saldoAtual);

      if (!isNaN(ultimoSaldoRegistrado) && ultimoSaldoRegistrado !== estoqueRealAtual) {
        const diferenca = estoqueRealAtual - ultimoSaldoRegistrado;
        const tipoMov = diferenca < 0 ? 'saida' : 'entrada';
        const obsMov = diferenca < 0
          ? 'Saída automática (Venda registrada)'
          : 'Entrada automática (Estorno / Ajuste externo)';

        const regAuto = {
          id: `${Date.now()}-sync-${prod.id}-${Math.random().toString(36).slice(2, 6)}`,
          produtoId: String(prod.id),
          sku: String(prod.sku || ''),
          nome: String(prod.nome || ''),
          data: obterDataHoraAtual(),
          tipo: tipoMov,
          quantidade: Math.abs(diferenca),
          saldoAnterior: ultimoSaldoRegistrado,
          saldoAtual: estoqueRealAtual,
          observacao: obsMov,
          usuario: 'Sistema (Vendas)'
        };
        historico.push(regAuto);
        if (typeof Store.addItem === 'function') {
          try { Store.addItem('movimentacoes_estoque', regAuto); } catch (err) {}
        }
        houveAlteracao = true;
      }
    }
  });

  if (houveAlteracao) {
    persistirListaHistoricoCompleta(historico);
  }

  return historico;
}

let abaAtivaProdutos = 'catalogo';
let produtoEmEdicaoId = null;
let produtoHistoricoId = null;

export const ProdutosModule = {
  render() {
    const currentUser = Store.getCurrentUser();
    const isAdmin = verificarIsAdmin(currentUser);
    const produtos = Store.getCollection('produtos') || [];
    const todasMovimentacoes = isAdmin ? sincronizarMovimentacoesExternas(produtos) : [];
    const proximoCodigo = gerarProximoCodigo(produtos);
    const categoriasExistentes = obterCategoriasUnicas(produtos);

    if (!isAdmin) {
      abaAtivaProdutos = 'catalogo';
      produtoEmEdicaoId = null;
      produtoHistoricoId = null;
    }

    const totalItens = produtos.reduce((acc, p) => acc + Number(p.estoque || 0), 0);
    const custoTotalEstoque = produtos.reduce((acc, p) => acc + (Number(p.custo || 0) * Number(p.estoque || 0)), 0);
    const valorPotencialVenda = produtos.reduce((acc, p) => acc + (Number(p.venda || 0) * Number(p.estoque || 0)), 0);

    const optionsProdutos = produtos.length === 0
      ? `<option value="">Nenhum produto cadastrado</option>`
      : produtos.map(p => `<option value="${p.id}">${p.sku} - ${p.nome} (Atual: ${p.estoque})</option>`).join('');

    const linhasTabela = produtos.length === 0
      ? `<tr><td colspan="${isAdmin ? 8 : 6}" style="text-align: center; color: #64748b; padding: 1.5rem;">Nenhum produto cadastrado no estoque.</td></tr>`
      : produtos.map(p => {
          const margem = p.custo > 0 ? (((p.venda - p.custo) / p.custo) * 100).toFixed(1) : '0.0';
          const estoqueBaixo = Number(p.estoque) <= 5;
          const qtdMovsProduto = isAdmin
            ? todasMovimentacoes.filter(m => String(m.produtoId) === String(p.id) || (p.sku && String(m.sku) === String(p.sku))).length
            : 0;

          return `
            <tr>
              <td><strong>${p.sku}</strong></td>
              <td>${p.nome}</td>
              <td>${p.categoria}</td>
              ${isAdmin ? `<td>${formatarMoeda(p.custo)}</td>` : ''}
              <td>${formatarMoeda(p.venda)}</td>
              ${isAdmin ? `<td><span class="badge badge-success">${margem}%</span></td>` : ''}
              <td>
                <span class="badge ${estoqueBaixo ? 'badge-danger' : 'badge-info'}">
                  ${p.estoque} un.
                </span>
              </td>
              ${isAdmin ? `
                <td style="white-space: nowrap;">
                  <button
                    type="button"
                    data-history-prod="${p.id}"
                    title="Ver histórico completo de movimentações deste produto"
                    style="padding: 0.35rem 0.65rem; font-size: 0.78rem; font-weight: 600; border-radius: 6px; border: 1px solid #bfdbfe; background: #eff6ff; color: #1d4ed8; cursor: pointer; margin-right: 0.35rem;">
                    Histórico${qtdMovsProduto > 0 ? ` (${qtdMovsProduto})` : ''}
                  </button>
                  <button
                    type="button"
                    data-edit-prod="${p.id}"
                    style="padding: 0.35rem 0.65rem; font-size: 0.78rem; font-weight: 600; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc; color: #0f172a; cursor: pointer; margin-right: 0.35rem;">
                    Editar
                  </button>
                  <button type="button" class="btn-danger-sm" data-delete-prod="${p.id}">Excluir</button>
                </td>
              ` : ''}
            </tr>
          `;
        }).join('');

    const estiloCaixinhaKpi = `
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 1.1rem 1.25rem;
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 0.35rem;
    `;

    const kpisAdminHtml = isAdmin ? `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 1rem; margin-bottom: 1.25rem;">
        <div style="${estiloCaixinhaKpi} border-left: 4px solid #2563eb;">
          <span style="font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: #64748b;">
            📦 Produtos Cadastrados
          </span>
          <strong style="font-size: 1.65rem; font-weight: 800; color: #0f172a; line-height: 1.2;">
            ${produtos.length}
          </strong>
          <span style="font-size: 0.78rem; color: #64748b;">Itens ativos no catálogo</span>
        </div>

        <div style="${estiloCaixinhaKpi} border-left: 4px solid #8b5cf6;">
          <span style="font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: #64748b;">
            🏷️ Unidades em Estoque
          </span>
          <strong style="font-size: 1.65rem; font-weight: 800; color: #0f172a; line-height: 1.2;">
            ${totalItens} un.
          </strong>
          <span style="font-size: 0.78rem; color: #64748b;">Total físico disponível</span>
        </div>

        <div style="${estiloCaixinhaKpi} border-left: 4px solid #f59e0b;">
          <span style="font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: #64748b;">
            💰 Custo Total do Estoque
          </span>
          <strong style="font-size: 1.65rem; font-weight: 800; color: #0f172a; line-height: 1.2;">
            ${formatarMoeda(custoTotalEstoque)}
          </strong>
          <span style="font-size: 0.78rem; color: #64748b;">Capital investido</span>
        </div>

        <div style="${estiloCaixinhaKpi} border-left: 4px solid #10b981;">
          <span style="font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: #64748b;">
            📈 Potencial de Venda
          </span>
          <strong style="font-size: 1.65rem; font-weight: 800; color: #059669; line-height: 1.2;">
            ${formatarMoeda(valorPotencialVenda)}
          </strong>
          <span style="font-size: 0.78rem; color: #64748b;">Receita estimada total</span>
        </div>
      </div>
    ` : '';

    const submenuHtml = isAdmin ? `
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 0.75rem 1rem; margin-bottom: 1.25rem; box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04); display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center;">
        <button
          type="button"
          data-prod-tab="catalogo"
          style="padding: 0.6rem 1.05rem; border-radius: 8px; border: 1px solid ${abaAtivaProdutos === 'catalogo' ? '#2563eb' : '#cbd5e1'}; background: ${abaAtivaProdutos === 'catalogo' ? '#2563eb' : '#f8fafc'}; color: ${abaAtivaProdutos === 'catalogo' ? '#ffffff' : '#0f172a'}; font-weight: 600; font-size: 0.88rem; cursor: pointer; transition: all 0.15s ease;">
          📦 Catálogo e Estoque (${produtos.length})
        </button>
        <button
          type="button"
          data-prod-tab="cadastrar"
          style="padding: 0.6rem 1.05rem; border-radius: 8px; border: 1px solid ${abaAtivaProdutos === 'cadastrar' ? '#2563eb' : '#cbd5e1'}; background: ${abaAtivaProdutos === 'cadastrar' ? '#2563eb' : '#f8fafc'}; color: ${abaAtivaProdutos === 'cadastrar' ? '#ffffff' : '#0f172a'}; font-weight: 600; font-size: 0.88rem; cursor: pointer; transition: all 0.15s ease;">
          ➕ Cadastrar Produto
        </button>
        <button
          type="button"
          data-prod-tab="movimentar"
          style="padding: 0.6rem 1.05rem; border-radius: 8px; border: 1px solid ${abaAtivaProdutos === 'movimentar' ? '#2563eb' : '#cbd5e1'}; background: ${abaAtivaProdutos === 'movimentar' ? '#2563eb' : '#f8fafc'}; color: ${abaAtivaProdutos === 'movimentar' ? '#ffffff' : '#0f172a'}; font-weight: 600; font-size: 0.88rem; cursor: pointer; transition: all 0.15s ease;">
          🔄 Movimentar Estoque
        </button>
      </div>
    ` : '';

    let conteudoAbaHtml = '';

    if (isAdmin && abaAtivaProdutos === 'historico' && produtoHistoricoId) {
      const prodHist = produtos.find(p => String(p.id) === String(produtoHistoricoId));
      if (prodHist) {
        const movsProduto = todasMovimentacoes
          .filter(m => String(m.produtoId) === String(prodHist.id) || (prodHist.sku && String(m.sku) === String(prodHist.sku)))
          .reverse();

        const linhasHistorico = movsProduto.length === 0
          ? `<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 1.5rem;">Nenhuma movimentação de estoque registrada para este produto até o momento.</td></tr>`
          : movsProduto.map((m, idx) => {
              const numeroRegistro = movsProduto.length - idx;
              let badgeTipo = `<span class="badge badge-info">Ajuste</span>`;
              let sinalQtd = '';
              let corQtd = '#0f172a';

              if (m.tipo === 'entrada' || m.tipo === 'cadastro') {
                badgeTipo = `<span class="badge badge-success">${m.tipo === 'cadastro' ? 'Cadastro Inicial' : 'Entrada (+)'}</span>`;
                sinalQtd = `+${m.quantidade} un.`;
                corQtd = '#059669';
              } else if (m.tipo === 'saida') {
                badgeTipo = `<span class="badge badge-danger">Saída (-)</span>`;
                sinalQtd = `-${m.quantidade} un.`;
                corQtd = '#dc2626';
              } else {
                const diff = Number(m.saldoAtual) - Number(m.saldoAnterior);
                sinalQtd = diff >= 0 ? `+${diff} un.` : `${diff} un.`;
                corQtd = diff >= 0 ? '#059669' : '#dc2626';
              }

              return `
                <tr>
                  <td style="color: #64748b; font-size: 0.8rem;">#${numeroRegistro}</td>
                  <td>${m.data}</td>
                  <td>${badgeTipo}</td>
                  <td style="font-weight: 700; color: ${corQtd};">${sinalQtd}</td>
                  <td>${m.saldoAnterior} un. &rarr; <strong>${m.saldoAtual} un.</strong></td>
                  <td>${m.observacao || '-'}</td>
                  <td>${m.usuario || '-'}</td>
                </tr>
              `;
            }).join('');

        conteudoAbaHtml = `
          <div class="card">
            <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.75rem; margin-bottom: 1rem;">
              <div>
                <h3 style="margin: 0;">Histórico de Movimentação — Cód. ${prodHist.sku} (${prodHist.nome})</h3>
                <p style="margin: 0.25rem 0 0; font-size: 0.85rem; color: #64748b;">
                  Total de registros salvos: <strong>${movsProduto.length}</strong> | Saldo atual em estoque: <strong>${prodHist.estoque} un.</strong>
                </p>
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;">
                ${isAdmin && movsProduto.length > 0 ? `
                  <button
                    type="button"
                    id="btn-clear-prod-history"
                    data-clear-history-id="${prodHist.id}"
                    style="padding: 0.45rem 0.9rem; font-size: 0.85rem; font-weight: 600; border-radius: 8px; border: 1px solid #fecaca; background: #fef2f2; color: #dc2626; cursor: pointer;">
                    🗑️ Limpar Histórico
                  </button>
                ` : ''}
                <button type="button" id="btn-back-catalog" class="btn-secondary" style="padding: 0.45rem 0.9rem; font-size: 0.85rem;">
                  &larr; Voltar ao Catálogo
                </button>
              </div>
            </div>

            <div class="table-wrapper" style="max-height: 480px; overflow-y: auto;">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Data / Hora</th>
                    <th>Tipo</th>
                    <th>Movimentação</th>
                    <th>Saldo (Antes &rarr; Depois)</th>
                    <th>Motivo / Observação</th>
                    <th>Responsável</th>
                  </tr>
                </thead>
                <tbody>
                  ${linhasHistorico}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Pop-up de Confirmação para Limpar Histórico (Admin) -->
          <div id="clear-history-confirm-modal" class="modal-overlay hidden">
            <div class="modal-box" style="max-width: 440px; border-top: 5px solid #dc2626;">
              <h3 style="margin-top: 0; margin-bottom: 0.65rem; color: #b91c1c;">🗑️ Limpar Histórico de Movimentação</h3>
              <p style="color: #475569; font-size: 0.92rem; line-height: 1.5; margin-bottom: 1.25rem;">
                Tem certeza que deseja apagar os <strong>${movsProduto.length} registro(s)</strong> de histórico do produto <strong>Cód. ${prodHist.sku} — ${prodHist.nome}</strong>?<br><br>
                <span style="font-size: 0.84rem; color: #64748b;">O saldo atual em estoque (<strong>${prodHist.estoque} un.</strong>) não será alterado.</span>
              </p>
              <div style="display: flex; justify-content: flex-end; gap: 0.65rem;">
                <button type="button" id="btn-cancel-clear-history" class="btn-secondary">Cancelar</button>
                <button type="button" id="btn-confirm-clear-history" class="btn-primary" style="margin-top: 0; width: auto; background: #dc2626;">Sim, Limpar Histórico</button>
              </div>
            </div>
          </div>
        `;
      } else {
        abaAtivaProdutos = 'catalogo';
        produtoHistoricoId = null;
      }
    }

    if (!conteudoAbaHtml && isAdmin && abaAtivaProdutos === 'editar' && produtoEmEdicaoId) {
      const prodEdit = produtos.find(p => String(p.id) === String(produtoEmEdicaoId));
      if (prodEdit) {
        const margemAtualEdit = calcularMargemPct(prodEdit.custo, prodEdit.venda);
        conteudoAbaHtml = `
          <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
              <h3 style="margin: 0;">Editar Produto — Cód. ${prodEdit.sku}</h3>
              <button type="button" id="btn-cancel-edit-prod" class="btn-secondary" style="padding: 0.4rem 0.85rem; font-size: 0.85rem;">Cancelar</button>
            </div>
            <div id="edit-prod-msg" class="error-msg hidden"></div>
            <form id="edit-product-form">
              <div class="form-grid">
                <div class="form-group">
                  <label for="ep-sku">Código</label>
                  <input type="text" id="ep-sku" readonly value="${prodEdit.sku}" style="background-color: #f1f5f9; color: #475569; font-weight: 700; cursor: not-allowed;">
                </div>
                ${renderizarCampoCategoriaHtml({
                  prefixo: 'ep',
                  categorias: categoriasExistentes,
                  valorSelecionado: prodEdit.categoria
                })}
              </div>
              <div class="form-group">
                <label for="ep-nome">Nome do Produto</label>
                <input type="text" id="ep-nome" required value="${escaparHtml(prodEdit.nome)}">
              </div>
              <div class="form-grid">
                <div class="form-group">
                  <label for="ep-custo">Custo Unitário (R$)</label>
                  <input type="number" id="ep-custo" step="0.01" min="0" required value="${Number(prodEdit.custo || 0)}">
                </div>
                <div class="form-group">
                  <label for="ep-margem">Margem de Lucro (%)</label>
                  <input type="number" id="ep-margem" step="0.01" value="${margemAtualEdit > 0 ? margemAtualEdit : ''}" placeholder="Ex: 50">
                </div>
                <div class="form-group">
                  <label for="ep-venda">Preço de Venda (R$)</label>
                  <input type="number" id="ep-venda" step="0.01" min="0" required value="${Number(prodEdit.venda || 0)}">
                </div>
                <div class="form-group">
                  <label for="ep-estoque">Estoque Atual</label>
                  <input type="number" id="ep-estoque" min="0" required value="${Number(prodEdit.estoque || 0)}">
                </div>
              </div>
              <div style="display: flex; gap: 0.65rem; margin-top: 0.5rem;">
                <button type="submit" class="btn-primary">Salvar Alterações</button>
              </div>
            </form>
          </div>
        `;
      } else {
        abaAtivaProdutos = 'catalogo';
        produtoEmEdicaoId = null;
      }
    }

    if (!conteudoAbaHtml) {
      if (isAdmin && abaAtivaProdutos === 'cadastrar') {
        conteudoAbaHtml = `
          <div class="card">
            <h3 style="margin-bottom: 1rem;">Cadastrar Novo Produto</h3>
            <div id="prod-msg" class="error-msg hidden"></div>
            <form id="product-form">
              <div class="form-grid">
                <div class="form-group">
                  <label for="p-sku">Código (Automático)</label>
                  <input type="text" id="p-sku" readonly value="${proximoCodigo}" style="background-color: #f1f5f9; color: #475569; font-weight: 700; cursor: not-allowed;">
                </div>
                ${renderizarCampoCategoriaHtml({
                  prefixo: 'p',
                  categorias: categoriasExistentes
                })}
              </div>
              <div class="form-group">
                <label for="p-nome">Nome do Produto</label>
                <input type="text" id="p-nome" required placeholder="Ex: Headset Gamer">
              </div>
              <div class="form-grid">
                <div class="form-group">
                  <label for="p-custo">Custo Unitário (R$)</label>
                  <input type="number" id="p-custo" step="0.01" min="0" required placeholder="0,00">
                </div>
                <div class="form-group">
                  <label for="p-margem">Margem de Lucro (%)</label>
                  <input type="number" id="p-margem" step="0.01" placeholder="Ex: 50">
                </div>
                <div class="form-group">
                  <label for="p-venda">Preço de Venda (R$)</label>
                  <input type="number" id="p-venda" step="0.01" min="0" required placeholder="0,00">
                </div>
                <div class="form-group">
                  <label for="p-estoque">Estoque Inicial</label>
                  <input type="number" id="p-estoque" min="0" required placeholder="0">
                </div>
              </div>
              <button type="submit" class="btn-primary">Salvar Produto</button>
            </form>
          </div>
        `;
      } else if (isAdmin && abaAtivaProdutos === 'movimentar') {
        conteudoAbaHtml = `
          <div class="card">
            <h3 style="margin-bottom: 1rem;">Movimentação de Estoque</h3>
            <div id="mov-msg" class="error-msg hidden"></div>
            <form id="stock-move-form">
              <div class="form-group">
                <label for="m-produto">Selecionar Produto</label>
                <select id="m-produto" required>
                  ${optionsProdutos}
                </select>
              </div>
              <div class="form-grid">
                <div class="form-group">
                  <label for="m-tipo">Tipo de Movimentação</label>
                  <select id="m-tipo" required>
                    <option value="entrada">Entrada (+)</option>
                    <option value="saida">Saída / Ajuste (-)</option>
                  </select>
                </div>
                <div class="form-group">
                  <label for="m-qtd">Quantidade</label>
                  <input type="number" id="m-qtd" min="1" required placeholder="Ex: 10">
                </div>
              </div>
              <div class="form-group">
                <label for="m-obs">Motivo / Observação (opcional)</label>
                <input type="text" id="m-obs" placeholder="Ex: Reposição de fornecedor, avaria, inventário...">
              </div>
              <button type="submit" class="btn-primary">Registrar Movimentação</button>
            </form>
          </div>
        `;
      } else {
        conteudoAbaHtml = `
          <div class="card">
            <h3 style="margin-bottom: 1rem;">Catálogo e Saldo de Estoque (${produtos.length})</h3>
            <div class="table-wrapper">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Produto</th>
                    <th>Categoria</th>
                    ${isAdmin ? '<th>Custo</th>' : ''}
                    <th>Preço Venda</th>
                    ${isAdmin ? '<th>Margem</th>' : ''}
                    <th>Estoque</th>
                    ${isAdmin ? '<th>Ações</th>' : ''}
                  </tr>
                </thead>
                <tbody>
                  ${linhasTabela}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }
    }

    return `
      ${kpisAdminHtml}
      ${submenuHtml}
      ${conteudoAbaHtml}
    `;
  },

  init(refreshCallback) {
    const currentUser = Store.getCurrentUser();
    const isAdmin = verificarIsAdmin(currentUser);

    if (!isAdmin) return;

    // Preenchimento automático bidirecional entre Margem de Lucro (%) e Preço de Venda (R$)
    configurarCalculoMargemVenda('p-custo', 'p-margem', 'p-venda');
    configurarCalculoMargemVenda('ep-custo', 'ep-margem', 'ep-venda');

    // Lista suspensa de categorias + opção de criar nova categoria
    configurarSeletorCategoria('p');
    configurarSeletorCategoria('ep');

    document.querySelectorAll('[data-prod-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        abaAtivaProdutos = btn.dataset.prodTab;
        produtoEmEdicaoId = null;
        produtoHistoricoId = null;
        if (refreshCallback) refreshCallback();
      });
    });

    // Abrir histórico de movimentações do produto
    document.querySelectorAll('[data-history-prod]').forEach(btn => {
      btn.addEventListener('click', () => {
        produtoHistoricoId = btn.dataset.historyProd;
        abaAtivaProdutos = 'historico';
        if (refreshCallback) refreshCallback();
      });
    });

    // Voltar do histórico para o catálogo
    const btnBackCatalog = document.getElementById('btn-back-catalog');
    if (btnBackCatalog) {
      btnBackCatalog.addEventListener('click', () => {
        produtoHistoricoId = null;
        abaAtivaProdutos = 'catalogo';
        if (refreshCallback) refreshCallback();
      });
    }

    // Limpar histórico de movimentações (somente Administrador)
    const btnClearHistory = document.getElementById('btn-clear-prod-history');
    const modalClearHistory = document.getElementById('clear-history-confirm-modal');
    const btnCancelClearHistory = document.getElementById('btn-cancel-clear-history');
    const btnConfirmClearHistory = document.getElementById('btn-confirm-clear-history');

    if (btnClearHistory && modalClearHistory) {
      btnClearHistory.addEventListener('click', () => {
        if (!verificarIsAdmin(Store.getCurrentUser())) return;
        modalClearHistory.classList.remove('hidden');
      });
    }

    const fecharModalLimparHistorico = () => {
      if (modalClearHistory) modalClearHistory.classList.add('hidden');
    };

    if (btnCancelClearHistory) {
      btnCancelClearHistory.addEventListener('click', fecharModalLimparHistorico);
    }

    if (modalClearHistory) {
      modalClearHistory.addEventListener('click', (e) => {
        if (e.target === modalClearHistory) fecharModalLimparHistorico();
      });
    }

    if (btnConfirmClearHistory && btnClearHistory) {
      btnConfirmClearHistory.addEventListener('click', () => {
        const userAtual = Store.getCurrentUser();
        if (!verificarIsAdmin(userAtual)) return;

        const prodIdAlvo = btnClearHistory.dataset.clearHistoryId;
        const prodAlvo = (Store.getCollection('produtos') || []).find(p => String(p.id) === String(prodIdAlvo));

        if (prodAlvo) {
          limparHistoricoProduto(prodAlvo, userAtual?.nome || 'Administrador');
        }

        fecharModalLimparHistorico();
        if (refreshCallback) refreshCallback();
      });
    }

    // Abrir edição do produto
    document.querySelectorAll('[data-edit-prod]').forEach(btn => {
      btn.addEventListener('click', () => {
        produtoEmEdicaoId = btn.dataset.editProd;
        abaAtivaProdutos = 'editar';
        if (refreshCallback) refreshCallback();
      });
    });

    // Cancelar edição
    const btnCancelEdit = document.getElementById('btn-cancel-edit-prod');
    if (btnCancelEdit) {
      btnCancelEdit.addEventListener('click', () => {
        produtoEmEdicaoId = null;
        abaAtivaProdutos = 'catalogo';
        if (refreshCallback) refreshCallback();
      });
    }

    // Salvar edição do produto (registra no histórico se houver alteração de estoque)
    const editForm = document.getElementById('edit-product-form');
    if (editForm && produtoEmEdicaoId) {
      editForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const prodAnterior = (Store.getCollection('produtos') || []).find(p => String(p.id) === String(produtoEmEdicaoId));
        const sku = prodAnterior ? prodAnterior.sku : document.getElementById('ep-sku').value.trim();
        const nome = document.getElementById('ep-nome').value.trim();
        const categoria = obterCategoriaEscolhida('ep');
        const custo = parseFloat(document.getElementById('ep-custo').value) || 0;
        const venda = parseFloat(document.getElementById('ep-venda').value) || 0;
        const estoqueNovo = parseInt(document.getElementById('ep-estoque').value, 10) || 0;

        if (!categoria) return;

        Store.updateItem('produtos', produtoEmEdicaoId, {
          sku,
          nome,
          categoria,
          custo,
          venda,
          estoque: estoqueNovo
        });

        if (prodAnterior && Number(prodAnterior.estoque) !== estoqueNovo) {
          const saldoAnterior = Number(prodAnterior.estoque);
          registrarHistoricoEstoque({
            produtoId: produtoEmEdicaoId,
            sku,
            nome,
            tipo: 'ajuste',
            quantidade: Math.abs(estoqueNovo - saldoAnterior),
            saldoAnterior,
            saldoAtual: estoqueNovo,
            observacao: 'Alteração manual via edição de produto',
            usuario: currentUser?.nome || 'Administrador'
          });
        }

        produtoEmEdicaoId = null;
        abaAtivaProdutos = 'catalogo';
        if (refreshCallback) refreshCallback();
      });
    }

    const prodForm = document.getElementById('product-form');
    if (prodForm) {
      prodForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const produtosAtuais = Store.getCollection('produtos') || [];
        const sku = gerarProximoCodigo(produtosAtuais);
        const nome = document.getElementById('p-nome').value.trim();
        const categoria = obterCategoriaEscolhida('p');
        const custo = parseFloat(document.getElementById('p-custo').value) || 0;
        const venda = parseFloat(document.getElementById('p-venda').value) || 0;
        const estoque = parseInt(document.getElementById('p-estoque').value, 10) || 0;

        if (!categoria) return;

        Store.addItem('produtos', { sku, nome, categoria, custo, venda, estoque });

        const prodCriado = (Store.getCollection('produtos') || []).find(p => p.sku === sku && p.nome === nome);
        if (prodCriado) {
          registrarHistoricoEstoque({
            produtoId: prodCriado.id,
            sku,
            nome,
            tipo: 'cadastro',
            quantidade: estoque,
            saldoAnterior: 0,
            saldoAtual: estoque,
            observacao: 'Saldo inicial no cadastro',
            usuario: currentUser?.nome || 'Administrador'
          });
        }

        abaAtivaProdutos = 'catalogo';
        if (refreshCallback) refreshCallback();
      });
    }

    const moveForm = document.getElementById('stock-move-form');
    if (moveForm) {
      moveForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const prodId = document.getElementById('m-produto').value;
        const tipo = document.getElementById('m-tipo').value;
        const qtd = parseInt(document.getElementById('m-qtd').value, 10) || 0;
        const obsInput = document.getElementById('m-obs');
        const observacao = obsInput ? obsInput.value.trim() : '';
        const msgBox = document.getElementById('mov-msg');

        const produto = (Store.getCollection('produtos') || []).find(p => String(p.id) === String(prodId));
        if (!produto || qtd <= 0) return;

        const saldoAnterior = Number(produto.estoque);
        let novoEstoque = saldoAnterior;

        if (tipo === 'entrada') {
          novoEstoque += qtd;
        } else {
          if (qtd > novoEstoque) {
            if (msgBox) {
              msgBox.textContent = 'Quantidade de saída maior que o estoque atual.';
              msgBox.classList.remove('hidden');
            }
            return;
          }
          novoEstoque -= qtd;
        }

        Store.updateItem('produtos', prodId, { estoque: novoEstoque });

        registrarHistoricoEstoque({
          produtoId: produto.id,
          sku: produto.sku,
          nome: produto.nome,
          tipo,
          quantidade: qtd,
          saldoAnterior,
          saldoAtual: novoEstoque,
          observacao: observacao || (tipo === 'entrada' ? 'Entrada manual de estoque' : 'Saída manual de estoque'),
          usuario: currentUser?.nome || 'Administrador'
        });

        abaAtivaProdutos = 'catalogo';
        if (refreshCallback) refreshCallback();
      });
    }

    document.querySelectorAll('[data-delete-prod]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.deleteProd;
        Store.removeItem('produtos', id);
        if (refreshCallback) refreshCallback();
      });
    });
  }
};