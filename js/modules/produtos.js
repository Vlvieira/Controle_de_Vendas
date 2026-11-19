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

function normalizarTextoBusca(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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

// Redimensiona e comprime a imagem para caber com folga no localStorage
function processarImagemParaBase64(file, maxLargura = 360, qualidade = 0.78) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Selecione um arquivo de imagem válido (JPG, PNG ou WebP).'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (evento) => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, maxLargura / img.width);
        const largura = Math.round(img.width * escala);
        const altura = Math.round(img.height * escala);

        const canvas = document.createElement('canvas');
        canvas.width = largura;
        canvas.height = altura;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, largura, altura);

        const base64Compactado = canvas.toDataURL('image/jpeg', qualidade);
        resolve(base64Compactado);
      };
      img.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
      img.src = evento.target.result;
    };
    reader.onerror = () => reject(new Error('Erro ao carregar o arquivo de imagem.'));
    reader.readAsDataURL(file);
  });
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
    tipo,
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
let imagemNovaProdutoBase64 = '';
let imagemEdicaoProdutoBase64 = '';

// Estado dos filtros de pesquisa do catálogo
let filtroBuscaProduto = '';
let filtroCategoriaProduto = '';
let filtroEstoqueProduto = 'todos'; // 'todos' | 'disponivel' | 'baixo' | 'zerado'

function filtrarProdutosLista(produtos) {
  const termo = normalizarTextoBusca(filtroBuscaProduto);
  const catFiltro = normalizarTextoBusca(filtroCategoriaProduto);

  return (produtos || []).filter(p => {
    const skuNorm = normalizarTextoBusca(p.sku);
    const nomeNorm = normalizarTextoBusca(p.nome);
    const catNorm = normalizarTextoBusca(p.categoria);
    const estoque = Number(p.estoque || 0);

    if (termo && !skuNorm.includes(termo) && !nomeNorm.includes(termo) && !catNorm.includes(termo)) {
      return false;
    }

    if (catFiltro && catNorm !== catFiltro) {
      return false;
    }

    if (filtroEstoqueProduto === 'disponivel' && estoque <= 5) return false;
    if (filtroEstoqueProduto === 'baixo' && (estoque <= 0 || estoque > 5)) return false;
    if (filtroEstoqueProduto === 'zerado' && estoque > 0) return false;

    return true;
  });
}

function gerarLinhasTabelaProdutos(produtosFiltrados, totalCadastrados, isAdmin, todasMovimentacoes) {
  if (totalCadastrados === 0) {
    return `<tr><td colspan="${isAdmin ? 8 : 6}" style="text-align: center; color: #64748b; padding: 1.5rem;">Nenhum produto cadastrado no estoque.</td></tr>`;
  }

  if (produtosFiltrados.length === 0) {
    return `<tr><td colspan="${isAdmin ? 8 : 6}" style="text-align: center; color: #64748b; padding: 1.5rem;">Nenhum produto encontrado com os filtros aplicados.</td></tr>`;
  }

  return produtosFiltrados.map(p => {
    const margem = p.custo > 0 ? (((p.venda - p.custo) / p.custo) * 100).toFixed(1) : '0.0';
    const estoqueBaixo = Number(p.estoque) <= 5;
    const temImagem = Boolean(p.imagem);
    const qtdMovsProduto = isAdmin
      ? todasMovimentacoes.filter(m => String(m.produtoId) === String(p.id) || (p.sku && String(m.sku) === String(p.sku))).length
      : 0;

    return `
      <tr>
        <td><strong>${p.sku}</strong></td>
        <td>
          <span
            class="product-name-hover"
            ${temImagem ? `data-product-img="${escaparHtml(p.imagem)}" data-product-title="${escaparHtml(p.nome)}"` : ''}>
            ${escaparHtml(p.nome)}
          </span>
        </td>
        <td>${escaparHtml(p.categoria)}</td>
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
}

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

    if (filtroCategoriaProduto && !categoriasExistentes.some(c => c.toLowerCase() === filtroCategoriaProduto.toLowerCase())) {
      filtroCategoriaProduto = '';
    }

    const produtosFiltrados = filtrarProdutosLista(produtos);
    const temFiltroAtivo = Boolean(filtroBuscaProduto.trim() || filtroCategoriaProduto || filtroEstoqueProduto !== 'todos');

    const totalItens = produtos.reduce((acc, p) => acc + Number(p.estoque || 0), 0);
    const custoTotalEstoque = produtos.reduce((acc, p) => acc + (Number(p.custo || 0) * Number(p.estoque || 0)), 0);
    const valorPotencialVenda = produtos.reduce((acc, p) => acc + (Number(p.venda || 0) * Number(p.estoque || 0)), 0);

    const optionsProdutos = produtos.length === 0
      ? `<option value="">Nenhum produto cadastrado</option>`
      : produtos.map(p => `<option value="${p.id}">${p.sku} - ${p.nome} (Atual: ${p.estoque})</option>`).join('');

    const linhasTabela = gerarLinhasTabelaProdutos(produtosFiltrados, produtos.length, isAdmin, todasMovimentacoes);

    const optionsFiltroCategoria = categoriasExistentes.map(cat => {
      const selected = cat.toLowerCase() === filtroCategoriaProduto.toLowerCase() ? 'selected' : '';
      return `<option value="${escaparHtml(cat)}" ${selected}>${escaparHtml(cat)}</option>`;
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
        const temImagemEdit = Boolean(imagemEdicaoProdutoBase64);

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
              <div class="form-group" id="wrap-ep-nome">
                <label for="ep-nome" style="display: flex; align-items: center; gap: 0.35rem;">
                  Nome do Produto
                  <span id="ep-nome-img-badge" class="${temImagemEdit ? '' : 'hidden'}" style="font-size: 0.76rem; color: #2563eb; font-weight: 600;">(🖼️ passe o cursor para ver a foto)</span>
                </label>
                <input
                  type="text"
                  id="ep-nome"
                  required
                  value="${escaparHtml(prodEdit.nome)}"
                  style="${temImagemEdit ? 'border-color: #2563eb; background-color: #f8fafc;' : ''}">
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
              <div class="form-group">
                <label for="ep-imagem">Imagem do Produto (opcional)</label>
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem;">
                  <input
                    type="file"
                    id="ep-imagem"
                    accept="image/*"
                    style="flex: 1; min-width: 240px; padding: 0.45rem; border: 1px solid var(--border); border-radius: 8px; background: #fff;">
                  <div id="ep-imagem-preview-wrap" class="${temImagemEdit ? '' : 'hidden'}" style="display: ${temImagemEdit ? 'flex' : 'none'}; align-items: center; gap: 0.5rem; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0.3rem 0.6rem;">
                    <img id="ep-imagem-preview" src="${escaparHtml(imagemEdicaoProdutoBase64)}" alt="Pré-visualização" style="width: 44px; height: 44px; object-fit: cover; border-radius: 6px; border: 1px solid #e2e8f0;">
                    <button type="button" id="btn-clear-edit-img" class="btn-danger-sm" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Remover</button>
                  </div>
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
        const temImagemNova = Boolean(imagemNovaProdutoBase64);

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
              <div class="form-group" id="wrap-p-nome">
                <label for="p-nome" style="display: flex; align-items: center; gap: 0.35rem;">
                  Nome do Produto
                  <span id="p-nome-img-badge" class="${temImagemNova ? '' : 'hidden'}" style="font-size: 0.76rem; color: #2563eb; font-weight: 600;">(🖼️ passe o cursor para ver a imagem)</span>
                </label>
                <input
                  type="text"
                  id="p-nome"
                  required
                  placeholder="Ex: Headset Gamer"
                  style="${temImagemNova ? 'border-color: #2563eb; background-color: #f8fafc;' : ''}">
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
              <div class="form-group">
                <label for="p-imagem">Imagem do Produto (opcional)</label>
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem;">
                  <input
                    type="file"
                    id="p-imagem"
                    accept="image/*"
                    style="flex: 1; min-width: 240px; padding: 0.45rem; border: 1px solid var(--border); border-radius: 8px; background: #fff;">
                  <div id="p-imagem-preview-wrap" class="${temImagemNova ? '' : 'hidden'}" style="display: ${temImagemNova ? 'flex' : 'none'}; align-items: center; gap: 0.5rem; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0.3rem 0.6rem;">
                    <img id="p-imagem-preview" src="${escaparHtml(imagemNovaProdutoBase64)}" alt="Pré-visualização" style="width: 44px; height: 44px; object-fit: cover; border-radius: 6px; border: 1px solid #e2e8f0;">
                    <button type="button" id="btn-clear-new-img" class="btn-danger-sm" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Remover</button>
                  </div>
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
            <div class="toolbar-row" style="margin-bottom: 0.85rem;">
              <h3 id="prod-catalog-title" style="margin: 0;">
                Catálogo e Saldo de Estoque (${temFiltroAtivo ? `${produtosFiltrados.length} de ${produtos.length}` : produtos.length})
              </h3>
              ${temFiltroAtivo ? `
                <button type="button" id="btn-clear-prod-filters" class="btn-secondary" style="padding: 0.42rem 0.8rem; font-size: 0.82rem;">
                  ✕ Limpar filtros
                </button>
              ` : `
                <button type="button" id="btn-clear-prod-filters" class="btn-secondary hidden" style="padding: 0.42rem 0.8rem; font-size: 0.82rem;">
                  ✕ Limpar filtros
                </button>
              `}
            </div>

            <!-- Barra de Filtros e Pesquisa de Produtos -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; margin-bottom: 1rem;">
              <div class="form-group" style="margin-bottom: 0;">
                <label for="prod-search-input">Pesquisar Produto</label>
                <input
                  type="search"
                  id="prod-search-input"
                  value="${escaparHtml(filtroBuscaProduto)}"
                  placeholder="🔍 Buscar por código, nome ou categoria...">
              </div>

              <div class="form-group" style="margin-bottom: 0;">
                <label for="prod-filter-categoria">Filtrar por Categoria</label>
                <select id="prod-filter-categoria">
                  <option value="">Todas as categorias</option>
                  ${optionsFiltroCategoria}
                </select>
              </div>

              <div class="form-group" style="margin-bottom: 0;">
                <label for="prod-filter-estoque">Situação do Estoque</label>
                <select id="prod-filter-estoque">
                  <option value="todos" ${filtroEstoqueProduto === 'todos' ? 'selected' : ''}>Todos os itens</option>
                  <option value="disponivel" ${filtroEstoqueProduto === 'disponivel' ? 'selected' : ''}>✅ Estoque normal (> 5 un.)</option>
                  <option value="baixo" ${filtroEstoqueProduto === 'baixo' ? 'selected' : ''}>⚠️ Estoque baixo (1 a 5 un.)</option>
                  <option value="zerado" ${filtroEstoqueProduto === 'zerado' ? 'selected' : ''}>🚫 Sem estoque (0 un.)</option>
                </select>
              </div>
            </div>

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
                <tbody id="prod-table-body">
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

      <!-- Tooltip flutuante com a imagem do produto ao passar o cursor -->
      <div
        id="product-image-hover-tooltip"
        class="hidden"
        style="position: fixed; z-index: 9999; pointer-events: none; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; padding: 0.55rem; box-shadow: 0 12px 28px rgba(15, 23, 42, 0.22); max-width: 230px; text-align: center;">
        <img
          id="product-image-hover-src"
          src=""
          alt="Foto do produto"
          style="width: 200px; height: 200px; object-fit: cover; border-radius: 8px; display: block; margin-bottom: 0.4rem; background: #f8fafc;">
        <div id="product-image-hover-caption" style="font-size: 0.8rem; font-weight: 700; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></div>
      </div>
    `;
  },

  init(refreshCallback) {
    const currentUser = Store.getCurrentUser();
    const isAdmin = verificarIsAdmin(currentUser);

    // Tooltip flutuante compartilhado (Catálogo, Cadastrar Novo Produto e Editar Produto)
    const tooltip = document.getElementById('product-image-hover-tooltip');
    const tooltipImg = document.getElementById('product-image-hover-src');
    const tooltipCaption = document.getElementById('product-image-hover-caption');

    const posicionarTooltip = (e) => {
      if (!tooltip || tooltip.classList.contains('hidden')) return;
      const offset = 16;
      const larguraBox = 230;
      const alturaBox = 250;

      let left = e.clientX + offset;
      let top = e.clientY + offset;

      if (left + larguraBox > window.innerWidth - 12) {
        left = e.clientX - larguraBox - offset;
      }
      if (top + alturaBox > window.innerHeight - 12) {
        top = Math.max(12, window.innerHeight - alturaBox - 12);
      }

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    };

    const exibirTooltipImagem = (src, titulo, eventoMouse) => {
      if (!src || !tooltip || !tooltipImg || !tooltipCaption) return;
      tooltipImg.src = src;
      tooltipCaption.textContent = titulo || 'Pré-visualização do Produto';
      tooltip.classList.remove('hidden');
      posicionarTooltip(eventoMouse);
    };

    const ocultarTooltipImagem = () => {
      if (!tooltip) return;
      tooltip.classList.add('hidden');
    };

    const vincularHoverProdutosTabela = () => {
      document.querySelectorAll('.product-name-hover[data-product-img]').forEach(el => {
        el.addEventListener('mouseenter', (e) => {
          exibirTooltipImagem(el.dataset.productImg, el.dataset.productTitle, e);
        });
        el.addEventListener('mousemove', posicionarTooltip);
        el.addEventListener('mouseleave', ocultarTooltipImagem);
      });
    };

    // Vincula os botões de ação da tabela (Histórico, Editar, Excluir) e hover das imagens
    const vincularAcoesTabela = () => {
      vincularHoverProdutosTabela();
      if (!isAdmin) return;

      document.querySelectorAll('[data-history-prod]').forEach(btn => {
        btn.addEventListener('click', () => {
          ocultarTooltipImagem();
          produtoHistoricoId = btn.dataset.historyProd;
          abaAtivaProdutos = 'historico';
          if (refreshCallback) refreshCallback();
        });
      });

      document.querySelectorAll('[data-edit-prod]').forEach(btn => {
        btn.addEventListener('click', () => {
          ocultarTooltipImagem();
          produtoEmEdicaoId = btn.dataset.editProd;
          const prodAlvo = (Store.getCollection('produtos') || []).find(p => String(p.id) === String(produtoEmEdicaoId));
          imagemEdicaoProdutoBase64 = prodAlvo?.imagem || '';
          abaAtivaProdutos = 'editar';
          if (refreshCallback) refreshCallback();
        });
      });

      document.querySelectorAll('[data-delete-prod]').forEach(btn => {
        btn.addEventListener('click', () => {
          ocultarTooltipImagem();
          const id = btn.dataset.deleteProd;
          Store.removeItem('produtos', id);
          if (refreshCallback) refreshCallback();
        });
      });
    };

    // Atualiza a tabela em tempo real ao pesquisar/filtrar sem perder o foco do input
    const aplicarFiltrosCatalogoEmTempoReal = () => {
      const produtos = Store.getCollection('produtos') || [];
      const todasMovimentacoes = isAdmin ? sincronizarMovimentacoesExternas(produtos) : [];
      const produtosFiltrados = filtrarProdutosLista(produtos);
      const temFiltroAtivo = Boolean(filtroBuscaProduto.trim() || filtroCategoriaProduto || filtroEstoqueProduto !== 'todos');

      const tbody = document.getElementById('prod-table-body');
      const titleEl = document.getElementById('prod-catalog-title');
      const btnClearFilters = document.getElementById('btn-clear-prod-filters');

      if (tbody) {
        tbody.innerHTML = gerarLinhasTabelaProdutos(produtosFiltrados, produtos.length, isAdmin, todasMovimentacoes);
        vincularAcoesTabela();
      }

      if (titleEl) {
        titleEl.textContent = `Catálogo e Saldo de Estoque (${temFiltroAtivo ? `${produtosFiltrados.length} de ${produtos.length}` : produtos.length})`;
      }

      if (btnClearFilters) {
        btnClearFilters.classList.toggle('hidden', !temFiltroAtivo);
      }
    };

    const inpBusca = document.getElementById('prod-search-input');
    const selFiltroCat = document.getElementById('prod-filter-categoria');
    const selFiltroEstoque = document.getElementById('prod-filter-estoque');
    const btnClearFilters = document.getElementById('btn-clear-prod-filters');

    if (inpBusca) {
      inpBusca.addEventListener('input', () => {
        filtroBuscaProduto = inpBusca.value;
        aplicarFiltrosCatalogoEmTempoReal();
      });
    }

    if (selFiltroCat) {
      selFiltroCat.addEventListener('change', () => {
        filtroCategoriaProduto = selFiltroCat.value;
        aplicarFiltrosCatalogoEmTempoReal();
      });
    }

    if (selFiltroEstoque) {
      selFiltroEstoque.addEventListener('change', () => {
        filtroEstoqueProduto = selFiltroEstoque.value;
        aplicarFiltrosCatalogoEmTempoReal();
      });
    }

    if (btnClearFilters) {
      btnClearFilters.addEventListener('click', () => {
        filtroBuscaProduto = '';
        filtroCategoriaProduto = '';
        filtroEstoqueProduto = 'todos';
        if (inpBusca) inpBusca.value = '';
        if (selFiltroCat) selFiltroCat.value = '';
        if (selFiltroEstoque) selFiltroEstoque.value = 'todos';
        aplicarFiltrosCatalogoEmTempoReal();
      });
    }

    vincularAcoesTabela();

    if (!isAdmin) return;

    configurarCalculoMargemVenda('p-custo', 'p-margem', 'p-venda');
    configurarCalculoMargemVenda('ep-custo', 'ep-margem', 'ep-venda');

    configurarSeletorCategoria('p');
    configurarSeletorCategoria('ep');

    // Helper para upload + hover no campo Nome do Produto (usado tanto em Cadastrar quanto em Editar)
    const configurarCampoImagemEHoverNome = ({
      idInputFile,
      idPreviewWrap,
      idPreviewImg,
      idBtnClear,
      idWrapNome,
      idInputNome,
      idBadgeNome,
      idMsgErro,
      getBase64,
      setBase64,
      tituloFallback
    }) => {
      const inpFile = document.getElementById(idInputFile);
      const wrapPreview = document.getElementById(idPreviewWrap);
      const imgPreview = document.getElementById(idPreviewImg);
      const btnClear = document.getElementById(idBtnClear);
      const wrapNome = document.getElementById(idWrapNome);
      const inpNome = document.getElementById(idInputNome);
      const badgeNome = document.getElementById(idBadgeNome);
      const msgErro = document.getElementById(idMsgErro);

      const atualizarVisualCampoNome = () => {
        const temImg = Boolean(getBase64());
        if (badgeNome) badgeNome.classList.toggle('hidden', !temImg);
        if (inpNome) {
          inpNome.style.borderColor = temImg ? '#2563eb' : '';
          inpNome.style.backgroundColor = temImg ? '#f8fafc' : '';
        }
      };

      if (wrapNome) {
        wrapNome.addEventListener('mouseenter', (e) => {
          const base64Atual = getBase64();
          if (!base64Atual) return;
          const nomeDigitado = inpNome?.value.trim() || tituloFallback;
          exibirTooltipImagem(base64Atual, nomeDigitado, e);
        });
        wrapNome.addEventListener('mousemove', posicionarTooltip);
        wrapNome.addEventListener('mouseleave', ocultarTooltipImagem);
      }

      if (inpFile) {
        inpFile.addEventListener('change', async () => {
          const file = inpFile.files?.[0];
          if (!file) {
            setBase64('');
            if (wrapPreview) {
              wrapPreview.classList.add('hidden');
              wrapPreview.style.display = 'none';
            }
            atualizarVisualCampoNome();
            ocultarTooltipImagem();
            return;
          }

          try {
            const base64 = await processarImagemParaBase64(file);
            setBase64(base64);
            if (imgPreview) imgPreview.src = base64;
            if (wrapPreview) {
              wrapPreview.classList.remove('hidden');
              wrapPreview.style.display = 'flex';
            }
            if (msgErro) msgErro.classList.add('hidden');
            atualizarVisualCampoNome();
          } catch (err) {
            setBase64('');
            inpFile.value = '';
            atualizarVisualCampoNome();
            if (msgErro) {
              msgErro.textContent = err.message;
              msgErro.classList.remove('hidden');
            }
          }
        });
      }

      if (btnClear) {
        btnClear.addEventListener('click', () => {
          setBase64('');
          if (inpFile) inpFile.value = '';
          if (imgPreview) imgPreview.src = '';
          if (wrapPreview) {
            wrapPreview.classList.add('hidden');
            wrapPreview.style.display = 'none';
          }
          atualizarVisualCampoNome();
          ocultarTooltipImagem();
        });
      }
    };

    configurarCampoImagemEHoverNome({
      idInputFile: 'p-imagem',
      idPreviewWrap: 'p-imagem-preview-wrap',
      idPreviewImg: 'p-imagem-preview',
      idBtnClear: 'btn-clear-new-img',
      idWrapNome: 'wrap-p-nome',
      idInputNome: 'p-nome',
      idBadgeNome: 'p-nome-img-badge',
      idMsgErro: 'prod-msg',
      getBase64: () => imagemNovaProdutoBase64,
      setBase64: (val) => { imagemNovaProdutoBase64 = val; },
      tituloFallback: 'Novo Produto'
    });

    configurarCampoImagemEHoverNome({
      idInputFile: 'ep-imagem',
      idPreviewWrap: 'ep-imagem-preview-wrap',
      idPreviewImg: 'ep-imagem-preview',
      idBtnClear: 'btn-clear-edit-img',
      idWrapNome: 'wrap-ep-nome',
      idInputNome: 'ep-nome',
      idBadgeNome: 'ep-nome-img-badge',
      idMsgErro: 'edit-prod-msg',
      getBase64: () => imagemEdicaoProdutoBase64,
      setBase64: (val) => { imagemEdicaoProdutoBase64 = val; },
      tituloFallback: 'Produto em Edição'
    });

    document.querySelectorAll('[data-prod-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        ocultarTooltipImagem();
        abaAtivaProdutos = btn.dataset.prodTab;
        produtoEmEdicaoId = null;
        produtoHistoricoId = null;
        imagemNovaProdutoBase64 = '';
        imagemEdicaoProdutoBase64 = '';
        if (refreshCallback) refreshCallback();
      });
    });

    const btnBackCatalog = document.getElementById('btn-back-catalog');
    if (btnBackCatalog) {
      btnBackCatalog.addEventListener('click', () => {
        produtoHistoricoId = null;
        abaAtivaProdutos = 'catalogo';
        if (refreshCallback) refreshCallback();
      });
    }

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

    const btnCancelEdit = document.getElementById('btn-cancel-edit-prod');
    if (btnCancelEdit) {
      btnCancelEdit.addEventListener('click', () => {
        ocultarTooltipImagem();
        produtoEmEdicaoId = null;
        imagemEdicaoProdutoBase64 = '';
        abaAtivaProdutos = 'catalogo';
        if (refreshCallback) refreshCallback();
      });
    }

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
          estoque: estoqueNovo,
          imagem: imagemEdicaoProdutoBase64 || ''
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

        ocultarTooltipImagem();
        produtoEmEdicaoId = null;
        imagemEdicaoProdutoBase64 = '';
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

        Store.addItem('produtos', {
          sku,
          nome,
          categoria,
          custo,
          venda,
          estoque,
          imagem: imagemNovaProdutoBase64 || ''
        });

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

        ocultarTooltipImagem();
        imagemNovaProdutoBase64 = '';
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
  }
};