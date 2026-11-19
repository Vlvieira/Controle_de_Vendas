import { Store } from '../store.js';

function formatarMoeda(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarDataBR(dataISO) {
  if (!dataISO) return '';
  const [ano, mes, dia] = dataISO.split('-');
  if (!ano || !mes || !dia) return dataISO;
  return `${dia}/${mes}/${ano}`;
}

function escaparHtml(texto) {
  return String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function obterDataHoraAtualBR() {
  const agora = new Date();
  return `${agora.toLocaleDateString('pt-BR')} ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function obterDataVencimentoPadrao() {
  const dt = new Date();
  dt.setDate(dt.getDate() + 30);
  const ano = dt.getFullYear();
  const mes = String(dt.getMonth() + 1).padStart(2, '0');
  const dia = String(dt.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function obterDataVenda(venda) {
  const timestamp = Number(venda.id);
  if (!isNaN(timestamp) && timestamp > 1600000000000) {
    return new Date(timestamp);
  }
  if (venda.data) {
    const [parteData] = venda.data.split(' ');
    const [dia, mes, ano] = parteData.split('/').map(Number);
    if (dia && mes && ano) return new Date(ano, mes - 1, dia);
  }
  return new Date();
}

function isPagamentoAPrazo(pagamento) {
  return pagamento === 'A Prazo' || pagamento === 'A Prazo / Fiado';
}

function formatarPagamentoExibicao(pagamento) {
  return pagamento === 'A Prazo / Fiado' ? 'A Prazo' : pagamento;
}

function verificarVendaVencida(venda) {
  const isPendentePrazo =
    (isPagamentoAPrazo(venda.pagamento) || venda.status === 'Aguardando pagamento') &&
    !venda.quitado &&
    venda.status !== 'Concluída';

  if (!isPendentePrazo || !venda.dataVencimento) return false;

  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dtVencimento = new Date(venda.dataVencimento + 'T00:00:00');

  return inicioHoje > dtVencimento;
}

function verificarSituacaoCliente(nomeDigitado) {
  const nomeLimpo = (nomeDigitado || '').trim().toLowerCase();
  if (!nomeLimpo || nomeLimpo === 'consumidor final') return null;

  const clientes = Store.getCollection('clientes') || [];
  const cliente = clientes.find(c => (c.nome || '').trim().toLowerCase() === nomeLimpo);
  if (!cliente) return null;

  const vendas = Store.getCollection('vendas') || [];
  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  const comprasPendentes = vendas.filter(
    v =>
      (v.cliente || '').trim().toLowerCase() === nomeLimpo &&
      (isPagamentoAPrazo(v.pagamento) || v.status === 'Aguardando pagamento') &&
      !v.quitado &&
      v.status !== 'Concluída'
  );

  let diasMaiorAtraso = 0;
  let totalEmAbertoComMulta = 0;
  let totalVencidoComMulta = 0;
  let totalAVencer = 0;
  let qtdComprasVencidas = 0;
  let qtdComprasAVencer = 0;
  const detalhesContas = [];

  comprasPendentes.forEach(v => {
    const dataCompra = obterDataVenda(v);
    const vencimento = v.dataVencimento
      ? new Date(v.dataVencimento + 'T00:00:00')
      : new Date(dataCompra.getFullYear(), dataCompra.getMonth(), dataCompra.getDate() + 30);

    const valorBase = Number(v.valorOriginal ?? v.total ?? 0);
    const vencimentoTexto = v.dataVencimento ? formatarDataBR(v.dataVencimento) : 'Sem data';

    if (inicioHoje > vencimento) {
      const diffDias = Math.floor((inicioHoje - vencimento) / (1000 * 60 * 60 * 24));
      if (diffDias > diasMaiorAtraso) diasMaiorAtraso = diffDias;
      qtdComprasVencidas++;
      const valorComMulta = valorBase * 1.01;
      totalVencidoComMulta += valorComMulta;
      totalEmAbertoComMulta += valorComMulta;
      detalhesContas.push({
        pedido: v.id ? `#${String(v.id).slice(-4)}` : '-',
        vencimento: vencimentoTexto,
        valor: valorComMulta,
        vencida: true,
        diasAtraso: diffDias
      });
    } else {
      qtdComprasAVencer++;
      totalAVencer += valorBase;
      totalEmAbertoComMulta += valorBase;
      detalhesContas.push({
        pedido: v.id ? `#${String(v.id).slice(-4)}` : '-',
        vencimento: vencimentoTexto,
        valor: valorBase,
        vencida: false,
        diasAtraso: 0
      });
    }
  });

  const emAtraso = diasMaiorAtraso > 0 || cliente.statusManual === 'atrasado';
  const temContasAPagar = comprasPendentes.length > 0;

  if (!emAtraso && !temContasAPagar) return null;

  return {
    cliente,
    emAtraso,
    temContasAPagar,
    diasMaiorAtraso,
    qtdComprasVencidas,
    qtdComprasAVencer,
    totalVencidoComMulta,
    totalAVencer,
    totalEmAbertoComMulta,
    detalhesContas
  };
}

function construirLinhaDoTempoVenda(venda) {
  const pagamentoTexto = formatarPagamentoExibicao(venda.pagamento || '-');
  const isPrazo = isPagamentoAPrazo(venda.pagamento);
  const eventos = [];

  if (Array.isArray(venda.historicoStatus) && venda.historicoStatus.length > 0) {
    venda.historicoStatus.forEach(ev => {
      eventos.push({
        icone: ev.icone || '📋',
        titulo: ev.titulo || ev.status || 'Atualização do pedido',
        descricao: ev.descricao || '',
        dataHora: ev.dataHora || venda.data || '-',
        usuario: ev.usuario || venda.vendedorNome || '-',
        cor: ev.cor || '#2563eb'
      });
    });
    return eventos;
  }

  eventos.push({
    icone: '📝',
    titulo: 'Solicitação do Pedido Registrada',
    descricao: `Pedido criado com pagamento via ${pagamentoTexto}${isPrazo && venda.dataVencimento ? ` (Venc.: ${formatarDataBR(venda.dataVencimento)})` : ''}.`,
    dataHora: venda.data || '-',
    usuario: venda.vendedorNome || '-',
    cor: '#2563eb'
  });

  if (venda.status === 'Em separação') {
    eventos.push({
      icone: '📦',
      titulo: 'Em Separação',
      descricao: 'Itens sendo separados no estoque para envio/retirada.',
      dataHora: venda.data || '-',
      usuario: venda.vendedorNome || '-',
      cor: '#d97706'
    });
  } else if (venda.status === 'Em entrega') {
    eventos.push({
      icone: '🚚',
      titulo: 'Saiu para Entrega',
      descricao: 'Pedido encaminhado para entrega ao cliente.',
      dataHora: venda.dataAtualizacao || venda.data || '-',
      usuario: venda.vendedorNome || '-',
      cor: '#0284c7'
    });
  } else if (venda.status === 'Aguardando pagamento') {
    eventos.push({
      icone: '⏳',
      titulo: 'Aguardando Recebimento do Pagamento',
      descricao: `Pagamento pendente (${pagamentoTexto})${venda.dataVencimento ? ` • Vencimento: ${formatarDataBR(venda.dataVencimento)}` : ''}.`,
      dataHora: venda.dataAtualizacao || venda.data || '-',
      usuario: venda.vendedorNome || '-',
      cor: '#d97706'
    });
  }

  if (venda.status === 'Concluída') {
    const multa = Number(venda.multaAplicada || 0);
    eventos.push({
      icone: '💰',
      titulo: 'Pagamento Recebido / Quitado',
      descricao: `Recebimento confirmado via ${pagamentoTexto}${multa > 0 ? ` (inclui multa de ${formatarMoeda(multa)})` : ''}.`,
      dataHora: venda.dataConclusao || venda.data || '-',
      usuario: venda.usuarioConclusao || venda.vendedorNome || '-',
      cor: '#059669'
    });
    eventos.push({
      icone: '✅',
      titulo: 'Pedido Finalizado no Sistema',
      descricao: 'Entrega e pagamento concluídos com sucesso.',
      dataHora: venda.dataConclusao || venda.data || '-',
      usuario: venda.usuarioConclusao || venda.vendedorNome || '-',
      cor: '#059669'
    });
  }

  return eventos;
}

let carrinhoAtual = [];
let descontoPercentualAtual = 0;
let ultimoClienteAlertado = '';
let clienteSelecionadoAtual = 'Consumidor Final';
let categoriaSelecionadaVenda = '';
let filtroHistoricoVendas = '';

function obterLimiteDesconto(isAdmin) {
  return isAdmin ? 50 : 40;
}

function obterCategoriasDisponiveis(produtosDisponiveis) {
  const mapa = new Map();
  (produtosDisponiveis || []).forEach(p => {
    const cat = String(p.categoria || '').trim();
    if (!cat) return;
    const chave = cat.toLowerCase();
    if (!mapa.has(chave)) {
      mapa.set(chave, cat);
    }
  });
  return Array.from(mapa.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function gerarOptionsProdutosPorCategoria(produtosDisponiveis, categoriaFiltro) {
  if (!produtosDisponiveis || produtosDisponiveis.length === 0) {
    return `<option value="" selected disabled></option>`;
  }

  const catNorm = String(categoriaFiltro || '').trim().toLowerCase();
  const filtrados = catNorm
    ? produtosDisponiveis.filter(p => String(p.categoria || '').trim().toLowerCase() === catNorm)
    : produtosDisponiveis;

  if (filtrados.length === 0) {
    return `<option value="" selected disabled></option>`;
  }

  const opcoes = filtrados.map(p => `
    <option value="${p.id}">
      ${escaparHtml(p.nome)}
    </option>
  `).join('');

  return `<option value="" selected disabled></option>${opcoes}`;
}

function filtrarVendasHistorico(vendas, termo) {
  const busca = String(termo || '').trim().toLowerCase();
  if (!busca) return vendas;

  return (vendas || []).filter(v => {
    const pedidoId = v.id ? `#${String(v.id).slice(-4)} ${String(v.id)}` : '';
    const cliente = v.cliente || 'Consumidor Final';
    const itensTexto = (v.itens || []).map(i => `${i.nome} ${i.sku || ''}`).join(' ');
    const pagamento = formatarPagamentoExibicao(v.pagamento || '');
    const status = v.status || '';
    const vendedor = v.vendedorNome || '';
    const data = v.data || '';

    const textoCompleto = `${pedidoId} ${cliente} ${itensTexto} ${pagamento} ${status} ${vendedor} ${data}`.toLowerCase();
    return textoCompleto.includes(busca);
  });
}

function renderizarLinhasHistorico(vendasFiltradas, isAdmin, temFiltroAtivo) {
  if (!vendasFiltradas || vendasFiltradas.length === 0) {
    const mensagemVazia = temFiltroAtivo
      ? 'Nenhuma venda encontrada para a pesquisa informada.'
      : 'Nenhuma venda registrada ainda.';
    return `<tr><td colspan="${isAdmin ? 9 : 8}" style="text-align: center; color: #64748b; padding: 1.5rem;">${mensagemVazia}</td></tr>`;
  }

  return [...vendasFiltradas].reverse().map(v => {
    const itens = Array.isArray(v.itens) ? v.itens : [];
    const resumoItens = itens.map(i => escaparHtml(i.nome)).join(', ');
    const totalUnidades = itens.reduce((acc, i) => acc + Number(i.qtd || 0), 0);
    const detalheQtdHtml = itens.length > 1
      ? `<div style="font-size: 0.72rem; color: #64748b;">(${itens.map(i => Number(i.qtd || 0)).join(' + ')})</div>`
      : '';

    const vencida = verificarVendaVencida(v);
    const valorBase = Number(v.valorOriginal ?? v.total ?? 0);
    const valorExibicao = vencida ? valorBase * 1.01 : Number(v.total || 0);
    const descontoAplicadoPct = Number(v.descontoPercentual || 0);
    const descontoAplicadoValor = Number(v.descontoValor || 0);

    let statusBadgeClass = 'status-entrega';
    if (v.status === 'Concluída') statusBadgeClass = 'status-concluida';
    if (v.status === 'Aguardando pagamento' || v.status === 'Em separação') statusBadgeClass = 'status-aguardando';

    const vencInfo = v.dataVencimento && v.status !== 'Concluída'
      ? `<div style="font-size: 0.75rem; color: ${vencida ? '#dc2626' : '#b45309'}; font-weight: 600;">
          ${vencida ? '⚠️ Vencida:' : 'Venc.:'} ${formatarDataBR(v.dataVencimento)}
         </div>`
      : '';

    const infoDescontoHtml = descontoAplicadoPct > 0
      ? `<div style="font-size: 0.74rem; color: #059669; font-weight: 600;">
          Desc. ${descontoAplicadoPct.toFixed(1).replace('.0', '')}%${isAdmin ? ' s/ lucro' : ''} (-${formatarMoeda(descontoAplicadoValor)})
         </div>`
      : '';

    return `
      <tr style="${vencida ? 'background-color: #fef2f2;' : ''}">
        <td>
          <button
            type="button"
            data-open-order-history="${v.id}"
            title="Clique para ver o histórico completo deste pedido"
            style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; font-weight: 800; padding: 0.2rem 0.5rem; border-radius: 6px; cursor: pointer; font-size: 0.85rem; margin-bottom: 0.2rem; display: inline-flex; align-items: center; gap: 0.25rem;"
          >
            #${v.id.slice(-4)} <span style="font-size: 0.72rem; font-weight: 600;">📋</span>
          </button>
          <br><span style="font-size: 0.78rem; color: #64748b;">${v.data}</span>
        </td>
        <td>${v.cliente || 'Consumidor Final'}</td>
        <td style="max-width: 240px;">${resumoItens}</td>
        <td style="white-space: nowrap;">
          <strong>${totalUnidades} un.</strong>
          ${detalheQtdHtml}
        </td>
        <td>
          <span style="font-size: 0.85rem;">${formatarPagamentoExibicao(v.pagamento)}</span>
          ${vencInfo}
        </td>
        <td>
          <strong style="${vencida ? 'color: #dc2626;' : ''}">${formatarMoeda(valorExibicao)}</strong>
          ${infoDescontoHtml}
          ${vencida ? `<div style="font-size: 0.72rem; color: #dc2626;">c/ multa 1%</div>` : ''}
        </td>
        <td>
          <select class="status-select ${statusBadgeClass}" data-change-status="${v.id}">
            <option value="Em separação" ${v.status === 'Em separação' ? 'selected' : ''}>📦 Em separação</option>
            <option value="Em entrega" ${v.status === 'Em entrega' ? 'selected' : ''}>🚚 Em entrega</option>
            <option value="Aguardando pagamento" ${v.status === 'Aguardando pagamento' ? 'selected' : ''}>⏳ Aguardando pagamento</option>
            <option value="Concluída" ${v.status === 'Concluída' ? 'selected' : ''}>✅ Concluída</option>
          </select>
        </td>
        <td>${v.vendedorNome || '-'}</td>
        ${isAdmin ? `
          <td>
            <button type="button" class="btn-danger-sm" data-cancel-sale="${v.id}" title="Cancelar venda e devolver estoque">Estornar</button>
          </td>
        ` : ''}
      </tr>
    `;
  }).join('');
}

function renderizarBannerSituacaoCliente(info) {
  if (!info) return '';

  const isCritico = info.emAtraso;
  const bg = isCritico ? '#fef2f2' : '#fffbeb';
  const border = isCritico ? '#fecaca' : '#fde68a';
  const color = isCritico ? '#991b1b' : '#92400e';
  const icone = isCritico ? '⚠️' : '💳';
  const titulo = isCritico
    ? 'Cliente em Atraso / Pendências'
    : 'Cliente com Contas a Pagar em Aberto';

  const linhasResumo = [];
  if (info.qtdComprasVencidas > 0) {
    linhasResumo.push(
      `<strong>${info.qtdComprasVencidas} vencida(s):</strong> ${formatarMoeda(info.totalVencidoComMulta)} (c/ multa 1%)`
    );
  }
  if (info.qtdComprasAVencer > 0) {
    linhasResumo.push(
      `<strong>${info.qtdComprasAVencer} a vencer:</strong> ${formatarMoeda(info.totalAVencer)}`
    );
  }
  if (info.cliente.statusManual === 'atrasado' && info.qtdComprasVencidas === 0) {
    linhasResumo.push(`Marcado manualmente como <em>Em atraso</em>`);
  }

  return `
    <div style="background: ${bg}; border: 1px solid ${border}; color: ${color}; border-radius: 10px; padding: 0.75rem 0.9rem; margin-bottom: 1rem; font-size: 0.85rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
        <strong>${icone} ${titulo}</strong>
        ${info.totalEmAbertoComMulta > 0 ? `<span style="font-weight: 800;">Total: ${formatarMoeda(info.totalEmAbertoComMulta)}</span>` : ''}
      </div>
      <div style="line-height: 1.4;">
        ${linhasResumo.join(' &nbsp;|&nbsp; ')}
      </div>
    </div>
  `;
}

export const VendasModule = {
  render() {
    const currentUser = Store.getCurrentUser();
    const isAdmin = currentUser?.perfil === 'admin';
    const limiteDescontoPct = obterLimiteDesconto(isAdmin);

    const produtos = Store.getCollection('produtos') || [];
    const clientes = Store.getCollection('clientes') || [];
    const todasVendas = Store.getCollection('vendas') || [];

    const vendasExibidas = isAdmin
      ? todasVendas
      : todasVendas.filter(v => v.vendedorId === currentUser.id);

    const vendasFiltradas = filtrarVendasHistorico(vendasExibidas, filtroHistoricoVendas);
    const temFiltroAtivo = filtroHistoricoVendas.trim().length > 0;

    const produtosDisponiveis = produtos.filter(p => Number(p.estoque) > 0);
    const categoriasDisponiveis = obterCategoriasDisponiveis(produtosDisponiveis);

    if (
      categoriaSelecionadaVenda &&
      !categoriasDisponiveis.some(c => c.toLowerCase() === categoriaSelecionadaVenda.toLowerCase())
    ) {
      categoriaSelecionadaVenda = '';
    }

    const optionsCategorias = categoriasDisponiveis.map(cat => {
      const selected = cat.toLowerCase() === categoriaSelecionadaVenda.toLowerCase() ? 'selected' : '';
      return `<option value="${escaparHtml(cat)}" ${selected}>${escaparHtml(cat)}</option>`;
    }).join('');

    const optionsProdutos = gerarOptionsProdutosPorCategoria(produtosDisponiveis, categoriaSelecionadaVenda);

    const optionsClientes = clientes.map(c => `
      <option value="${escaparHtml(c.nome)}" ${c.nome === clienteSelecionadoAtual ? 'selected' : ''}>${escaparHtml(c.nome)}${c.telefone ? ` (${escaparHtml(c.telefone)})` : ''}</option>
    `).join('');

    const infoClienteAtual = verificarSituacaoCliente(clienteSelecionadoAtual);
    const bannerClienteHtml = renderizarBannerSituacaoCliente(infoClienteAtual);

    const subtotalCarrinho = carrinhoAtual.reduce((acc, item) => acc + (item.preco * item.qtd), 0);
    const custoTotalCarrinho = carrinhoAtual.reduce((acc, item) => acc + (item.custo * item.qtd), 0);
    const lucroBrutoCarrinho = Math.max(0, subtotalCarrinho - custoTotalCarrinho);

    const descontoPctValido = Math.min(limiteDescontoPct, Math.max(0, Number(descontoPercentualAtual) || 0));
    const valorDesconto = Number((lucroBrutoCarrinho * (descontoPctValido / 100)).toFixed(2));
    const totalCarrinho = Math.max(0, Number((subtotalCarrinho - valorDesconto).toFixed(2)));
    const lucroRestanteCarrinho = Math.max(0, Number((lucroBrutoCarrinho - valorDesconto).toFixed(2)));
    const valorMinimoVenda = Math.max(0, Number((subtotalCarrinho - (lucroBrutoCarrinho * (limiteDescontoPct / 100))).toFixed(2)));

    const linhasCarrinho = carrinhoAtual.length === 0
      ? `<tr><td colspan="5" style="text-align: center; color: #64748b; padding: 1rem;">Adicione itens para iniciar a venda.</td></tr>`
      : carrinhoAtual.map((item, idx) => `
          <tr>
            <td>${escaparHtml(item.nome)}</td>
            <td>${formatarMoeda(item.preco)}</td>
            <td>${item.qtd} un.</td>
            <td><strong>${formatarMoeda(item.preco * item.qtd)}</strong></td>
            <td>
              <button type="button" class="btn-danger-sm" data-remove-cart="${idx}">Remover</button>
            </td>
          </tr>
        `).join('');

    const linhasHistorico = renderizarLinhasHistorico(vendasFiltradas, isAdmin, temFiltroAtivo);

    const contadorHistoricoTexto = temFiltroAtivo
      ? `${vendasFiltradas.length} de ${vendasExibidas.length}`
      : `${vendasExibidas.length}`;

    return `
      <div class="dashboard-split" style="margin-bottom: 1.5rem;">
        <div class="card" style="margin-bottom: 0;">
          <h3 style="margin-bottom: 1rem;">1. Selecionar Produtos</h3>
          <div id="sale-msg" class="error-msg hidden"></div>

          <form id="add-item-form" style="display: flex; flex-direction: column; gap: 0.85rem;">
            <div class="form-group" style="margin-bottom: 0; width: 100%;">
              <label for="s-categoria" style="display: block; margin-bottom: 0.35rem;">1º Categoria</label>
              <select
                id="s-categoria"
                style="width: 100%; height: 42px; padding: 0 0.75rem; border: 1px solid var(--border); border-radius: 8px; font-size: 0.92rem; box-sizing: border-box; background-color: #fff;"
                ${produtosDisponiveis.length === 0 ? 'disabled' : ''}
              >
                <option value="" ${!categoriaSelecionadaVenda ? 'selected' : ''}></option>
                ${optionsCategorias}
              </select>
            </div>

            <div class="form-group" style="margin-bottom: 0; width: 100%;">
              <label for="s-produto" style="display: block; margin-bottom: 0.35rem;">2º Produto em Estoque</label>
              <select
                id="s-produto"
                required
                style="width: 100%; height: 42px; padding: 0 0.75rem; border: 1px solid var(--border); border-radius: 8px; font-size: 0.92rem; box-sizing: border-box; background-color: #fff;"
                ${produtosDisponiveis.length === 0 ? 'disabled' : ''}
              >
                ${optionsProdutos}
              </select>
              <div id="product-stock-info" class="hidden" style="margin-top: 0.4rem; font-size: 0.83rem; font-weight: 600; color: #0369a1; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 0.4rem 0.65rem; box-sizing: border-box;"></div>
            </div>

            <div class="form-group" style="margin-bottom: 0; width: 100%;">
              <label for="s-qtd" style="display: block; margin-bottom: 0.35rem;">3º Quantidade</label>
              <input
                type="number"
                id="s-qtd"
                min="1"
                value=""
                required
                style="width: 100%; height: 42px; padding: 0 0.75rem; border: 1px solid var(--border); border-radius: 8px; font-size: 0.92rem; box-sizing: border-box; background-color: #fff;"
                ${produtosDisponiveis.length === 0 ? 'disabled' : ''}
              >
            </div>

            <button
              type="submit"
              class="btn-primary"
              style="width: 100%; height: 42px; margin-top: 0.25rem; box-sizing: border-box; ${produtosDisponiveis.length === 0 ? 'opacity: 0.5; cursor: not-allowed;' : ''}"
              ${produtosDisponiveis.length === 0 ? 'disabled' : ''}
            >
              + Adicionar ao Pedido
            </button>

            <!-- Pré-visualização da imagem do produto selecionado -->
            <div
              id="selected-product-image-box"
              class="hidden"
              style="margin-top: 0.25rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.75rem; align-items: center; gap: 0.85rem;"
            >
              <img
                id="selected-product-image-src"
                src=""
                alt="Imagem do produto selecionado"
                style="width: 96px; height: 96px; object-fit: cover; border-radius: 8px; border: 1px solid #cbd5e1; background: #ffffff; flex-shrink: 0;"
              >
              <div style="min-width: 0; flex: 1;">
                <span id="selected-product-image-sku" style="display: inline-block; font-size: 0.74rem; font-weight: 700; color: #475569; background: #e2e8f0; padding: 0.12rem 0.45rem; border-radius: 5px; margin-bottom: 0.25rem;"></span>
                <div id="selected-product-image-name" style="font-size: 0.92rem; font-weight: 700; color: #0f172a; line-height: 1.3; margin-bottom: 0.25rem; word-break: break-word;"></div>
                <div id="selected-product-image-price" style="font-size: 0.95rem; font-weight: 800; color: #059669;"></div>
              </div>
            </div>
          </form>
        </div>

        <div class="card" style="margin-bottom: 0;">
          <h3 style="margin-bottom: 1rem;">2. Finalizar Venda</h3>

          <div class="table-wrapper" style="margin-bottom: 1rem;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Unit.</th>
                  <th>Qtd</th>
                  <th>Subtotal</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${linhasCarrinho}
              </tbody>
            </table>
          </div>

          <form id="finish-sale-form">
            <div class="form-grid" style="margin-bottom: 1rem;">
              <div class="form-group" style="margin-bottom: 0;">
                <label for="s-cliente">Cliente</label>
                <select id="s-cliente">
                  <option value="Consumidor Final" ${clienteSelecionadoAtual === 'Consumidor Final' ? 'selected' : ''}>Consumidor Final (Avulso)</option>
                  ${optionsClientes}
                </select>
              </div>

              <div class="form-group" style="margin-bottom: 0;">
                <label for="s-pagamento">Forma de Pagamento</label>
                <select id="s-pagamento">
                  <option value="PIX">PIX</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Cartão de Crédito">Cartão de Crédito</option>
                  <option value="Cartão de Débito">Cartão de Débito</option>
                  <option value="A Prazo">A Prazo</option>
                </select>
              </div>

              <div class="form-group" style="margin-bottom: 0;">
                <label for="s-desconto">
                  ${isAdmin ? 'Desconto s/ Lucro (%)' : 'Desconto (%)'}
                </label>
                <input type="number" id="s-desconto" min="0" max="${limiteDescontoPct}" step="0.01" value="${descontoPctValido > 0 ? descontoPctValido : ''}" placeholder="0%" ${carrinhoAtual.length === 0 ? 'disabled' : ''}>
              </div>

              <div class="form-group" style="margin-bottom: 0;">
                <label for="s-valor-final">
                  Valor de Venda Final (R$)
                </label>
                <input type="number" id="s-valor-final" min="${valorMinimoVenda.toFixed(2)}" max="${subtotalCarrinho.toFixed(2)}" step="0.01" value="${carrinhoAtual.length > 0 ? totalCarrinho.toFixed(2) : ''}" placeholder="0,00" ${carrinhoAtual.length === 0 ? 'disabled' : ''}>
              </div>

              <div class="form-group hidden" id="wrap-vencimento" style="margin-bottom: 0;">
                <label for="s-vencimento">Data de Vencimento *</label>
                <input type="date" id="s-vencimento" value="${obterDataVencimentoPadrao()}">
              </div>

              <div class="form-group" style="margin-bottom: 0;">
                <label for="s-status">Status Inicial do Pedido</label>
                <select id="s-status">
                <option value="Em separação" selected>📦 Em separação</option>
                <option value="Em entrega">🚚 Em entrega</option>
                <option value="Aguardando pagamento">⏳ Aguardando pagamento</option>
                <option value="Concluída">✅ Concluída</option>
                </select>
              </div>
            </div>

            <div id="client-payable-banner">${bannerClienteHtml}</div>

            <div id="discount-limit-alert" class="error-msg hidden" style="margin-bottom: 0.75rem; font-size: 0.84rem;"></div>

            <div style="background: #f8fafc; border: 1px solid var(--border); border-radius: 10px; padding: 0.85rem 1rem; margin-bottom: 0.75rem;">
              <div style="display: flex; justify-content: space-between; font-size: 0.88rem; color: #64748b; margin-bottom: 0.3rem;">
                <span>Subtotal dos Itens:</span>
                <span id="sale-subtotal-display">${formatarMoeda(subtotalCarrinho)}</span>
              </div>
              ${isAdmin ? `
                <div style="display: flex; justify-content: space-between; font-size: 0.82rem; color: #64748b; margin-bottom: 0.3rem;">
                  <span>Lucro Bruto (máx. desc. ${limiteDescontoPct}%):</span>
                  <span id="sale-profit-base-display">${formatarMoeda(lucroBrutoCarrinho)} (mín. venda: ${formatarMoeda(valorMinimoVenda)})</span>
                </div>
              ` : ''}
              <div id="sale-discount-row" style="display: ${descontoPctValido > 0 ? 'flex' : 'none'}; justify-content: space-between; font-size: 0.88rem; color: #059669; font-weight: 600; margin-bottom: 0.35rem;">
                <span id="sale-discount-label">${isAdmin ? `Desconto (${descontoPctValido}% do lucro):` : `Desconto (${descontoPctValido}%):`}</span>
                <span id="sale-discount-display">- ${formatarMoeda(valorDesconto)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.4rem; border-top: 1px dashed var(--border);">
                <div>
                  <span style="font-weight: 700; color: var(--text);">Total Final da Venda:</span>
                  ${isAdmin ? `
                    <div id="sale-profit-final-display" style="font-size: 0.75rem; color: #059669;">
                      Lucro líquido final: ${formatarMoeda(lucroRestanteCarrinho)}
                    </div>
                  ` : ''}
                </div>
                <span id="sale-total-display" style="font-size: 1.35rem; font-weight: 800; color: var(--primary);">${formatarMoeda(totalCarrinho)}</span>
              </div>
            </div>

            <button type="submit" class="btn-primary" ${carrinhoAtual.length === 0 ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
              ✓ Concluir e Registrar Venda
            </button>
          </form>
        </div>
      </div>

      <div class="card">
        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.75rem; margin-bottom: 1rem;">
          <h3 style="margin: 0;">Histórico de Vendas (<span id="sales-history-count">${contadorHistoricoTexto}</span>)</h3>
          <div style="display: flex; align-items: center; gap: 0.5rem; flex: 1; max-width: 380px; min-width: 240px;">
            <input
              type="search"
              id="sales-history-search"
              value="${escaparHtml(filtroHistoricoVendas)}"
              placeholder="Pesquisar pedido, cliente, produto, status..."
              style="width: 100%; padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: 8px; font-size: 0.88rem;"
            >
            <button
              type="button"
              id="btn-clear-sales-search"
              class="btn-secondary ${temFiltroAtivo ? '' : 'hidden'}"
              style="padding: 0.48rem 0.75rem; font-size: 0.82rem; white-space: nowrap;"
            >
              Limpar
            </button>
          </div>
        </div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Pedido / Data</th>
                <th>Cliente</th>
                <th>Itens</th>
                <th>Qtd</th>
                <th>Pagamento</th>
                <th>Total</th>
                <th>Status</th>
                <th>Vendedor</th>
                ${isAdmin ? '<th>Ações</th>' : ''}
              </tr>
            </thead>
            <tbody id="sales-history-tbody">
              ${linhasHistorico}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Pop-up de Histórico Completo do Pedido -->
      <div id="order-history-modal" class="modal-overlay hidden">
        <div id="order-history-modal-box" class="modal-box" style="max-width: 620px; width: 95%; border-top: 5px solid #2563eb;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.75rem; margin-bottom: 0.9rem;">
            <div>
              <h3 id="order-history-modal-title" style="margin: 0; color: #1e3a8a;">Histórico do Pedido</h3>
              <p id="order-history-modal-subtitle" style="font-size: 0.82rem; color: #64748b; margin: 0.2rem 0 0 0;"></p>
            </div>
            <button type="button" id="btn-close-order-history-x" class="btn-secondary" style="padding: 0.35rem 0.7rem;">✕</button>
          </div>

          <div id="order-history-modal-content" style="max-height: 70vh; overflow-y: auto; padding-right: 0.15rem;"></div>

          <div style="display: flex; justify-content: flex-end; margin-top: 1rem;">
            <button type="button" id="btn-close-order-history" class="btn-primary" style="margin-top: 0; width: auto;">Fechar</button>
          </div>
        </div>
      </div>

      <!-- Pop-up de Confirmação de Estorno de Venda -->
      <div id="cancel-sale-confirm-modal" class="modal-overlay hidden">
        <div class="modal-box" style="max-width: 480px; width: 95%; border-top: 5px solid #ef4444;">
          <div style="display: flex; align-items: center; gap: 0.65rem; margin-bottom: 0.85rem;">
            <span style="font-size: 1.65rem;">⚠️</span>
            <div>
              <h3 style="color: #b91c1c; margin: 0;">Confirmar Estorno da Venda</h3>
              <p style="font-size: 0.82rem; color: #64748b; margin: 0;">Esta ação não poderá ser desfeita</p>
            </div>
          </div>

          <div id="cancel-sale-confirm-details" style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 0.9rem; margin-bottom: 1.15rem; font-size: 0.9rem; color: #7f1d1d;">
          </div>

          <div style="display: flex; gap: 0.65rem; justify-content: flex-end;">
            <button type="button" id="btn-cancel-sale-abort" class="btn-secondary">Cancelar</button>
            <button type="button" id="btn-cancel-sale-confirm" class="btn-primary" style="margin-top: 0; width: auto; background: #dc2626;">✓ Confirmar Estorno</button>
          </div>
        </div>
      </div>

      <!-- Pop-up de Alerta de Cliente em Atraso / Contas a Pagar -->
      <div id="overdue-client-modal" class="modal-overlay hidden">
        <div id="overdue-client-modal-box" class="modal-box" style="border-top: 5px solid #ef4444;">
          <div style="display: flex; align-items: center; gap: 0.65rem; margin-bottom: 0.85rem;">
            <span id="overdue-client-icon" style="font-size: 1.65rem;">⚠️</span>
            <div>
              <h3 id="overdue-client-title" style="color: #b91c1c; margin: 0;">Cliente em Atraso</h3>
              <p id="overdue-client-subtitle" style="font-size: 0.82rem; color: #64748b; margin: 0;">Pendência financeira detectada</p>
            </div>
          </div>

          <div id="overdue-client-details" style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 0.9rem; margin-bottom: 1.15rem; font-size: 0.92rem; color: #7f1d1d;">
          </div>

          <div style="display: flex; gap: 0.65rem; justify-content: flex-end;">
            <button type="button" id="btn-clear-overdue-client" class="btn-secondary">Trocar Cliente</button>
            <button type="button" id="btn-close-overdue-modal" class="btn-primary" style="margin-top: 0; width: auto; background: #dc2626;">Ciente, continuar</button>
          </div>
        </div>
      </div>
    `;
  },

  init(refreshCallback) {
    const currentUser = Store.getCurrentUser();
    const isAdmin = currentUser?.perfil === 'admin';
    const limiteDescontoPct = obterLimiteDesconto(isAdmin);
    const msgBox = document.getElementById('sale-msg');

    const mostrarErro = (texto) => {
      if (!msgBox) return;
      msgBox.textContent = texto;
      msgBox.classList.remove('hidden');
    };

    const selCategoria = document.getElementById('s-categoria');
    const selProduto = document.getElementById('s-produto');
    const inpQtd = document.getElementById('s-qtd');
    const infoEstoqueProduto = document.getElementById('product-stock-info');
    const boxImagemProduto = document.getElementById('selected-product-image-box');
    const imgProdutoSelecionado = document.getElementById('selected-product-image-src');
    const skuProdutoSelecionado = document.getElementById('selected-product-image-sku');
    const nomeProdutoSelecionado = document.getElementById('selected-product-image-name');
    const precoProdutoSelecionado = document.getElementById('selected-product-image-price');

    const atualizarImagemProdutoSelecionado = (produto) => {
      if (!boxImagemProduto || !imgProdutoSelecionado) return;

      if (produto && produto.imagem) {
        imgProdutoSelecionado.src = produto.imagem;
        if (skuProdutoSelecionado) skuProdutoSelecionado.textContent = `Cód. ${produto.sku || '-'}`;
        if (nomeProdutoSelecionado) nomeProdutoSelecionado.textContent = produto.nome || '';
        if (precoProdutoSelecionado) precoProdutoSelecionado.textContent = formatarMoeda(produto.venda || 0);
        boxImagemProduto.classList.remove('hidden');
        boxImagemProduto.style.display = 'flex';
      } else {
        imgProdutoSelecionado.src = '';
        boxImagemProduto.classList.add('hidden');
        boxImagemProduto.style.display = 'none';
      }
    };

    const atualizarInfoEstoqueELimite = () => {
      if (!selProduto || !inpQtd) return;
      const prodId = selProduto.value;

      if (!prodId) {
        inpQtd.removeAttribute('max');
        if (infoEstoqueProduto) {
          infoEstoqueProduto.textContent = '';
          infoEstoqueProduto.classList.add('hidden');
        }
        atualizarImagemProdutoSelecionado(null);
        return;
      }

      const produto = (Store.getCollection('produtos') || []).find(p => String(p.id) === String(prodId));
      if (produto) {
        const estoqueTotal = Number(produto.estoque || 0);
        const itemNoCarrinho = carrinhoAtual.find(item => String(item.produtoId) === String(prodId));
        const qtdNoCarrinho = itemNoCarrinho ? Number(itemNoCarrinho.qtd || 0) : 0;
        const disponivelReal = Math.max(0, estoqueTotal - qtdNoCarrinho);

        if (disponivelReal > 0) {
          inpQtd.max = String(disponivelReal);
          if (inpQtd.value !== '' && Number(inpQtd.value) > disponivelReal) {
            inpQtd.value = String(disponivelReal);
          }
        } else {
          inpQtd.removeAttribute('max');
        }

        if (infoEstoqueProduto) {
          const detalheCarrinho = qtdNoCarrinho > 0 ? ` (${qtdNoCarrinho} já no pedido)` : '';
          infoEstoqueProduto.textContent = `📦 Estoque disponível: ${disponivelReal} un.${detalheCarrinho}`;
          infoEstoqueProduto.style.background = disponivelReal > 0 ? '#f0f9ff' : '#fef2f2';
          infoEstoqueProduto.style.borderColor = disponivelReal > 0 ? '#bae6fd' : '#fecaca';
          infoEstoqueProduto.style.color = disponivelReal > 0 ? '#0369a1' : '#b91c1c';
          infoEstoqueProduto.classList.remove('hidden');
        }

        atualizarImagemProdutoSelecionado(produto);
      } else {
        inpQtd.removeAttribute('max');
        if (infoEstoqueProduto) {
          infoEstoqueProduto.textContent = '';
          infoEstoqueProduto.classList.add('hidden');
        }
        atualizarImagemProdutoSelecionado(null);
      }
    };

    if (selCategoria && selProduto) {
      selCategoria.addEventListener('change', () => {
        categoriaSelecionadaVenda = selCategoria.value;
        const produtosDisponiveis = (Store.getCollection('produtos') || []).filter(p => Number(p.estoque) > 0);
        selProduto.innerHTML = gerarOptionsProdutosPorCategoria(produtosDisponiveis, categoriaSelecionadaVenda);
        if (inpQtd) {
          inpQtd.value = '';
          inpQtd.removeAttribute('max');
        }
        if (infoEstoqueProduto) {
          infoEstoqueProduto.textContent = '';
          infoEstoqueProduto.classList.add('hidden');
        }
        atualizarImagemProdutoSelecionado(null);
        if (msgBox) msgBox.classList.add('hidden');
      });
    }

    if (selProduto) {
      selProduto.addEventListener('change', () => {
        if (inpQtd) inpQtd.value = '';
        atualizarInfoEstoqueELimite();
        if (msgBox) msgBox.classList.add('hidden');
      });
    }

    const selCliente = document.getElementById('s-cliente');
    const bannerCliente = document.getElementById('client-payable-banner');
    const modalAtraso = document.getElementById('overdue-client-modal');
    const modalBox = document.getElementById('overdue-client-modal-box');
    const modalIcon = document.getElementById('overdue-client-icon');
    const modalTitle = document.getElementById('overdue-client-title');
    const modalSubtitle = document.getElementById('overdue-client-subtitle');
    const modalDetalhes = document.getElementById('overdue-client-details');
    const btnFecharModal = document.getElementById('btn-close-overdue-modal');
    const btnTrocarCliente = document.getElementById('btn-clear-overdue-client');

    if (selCliente) {
      selCliente.addEventListener('change', () => {
        const nomeAtual = selCliente.value;
        clienteSelecionadoAtual = nomeAtual;

        if (!nomeAtual || nomeAtual === 'Consumidor Final') {
          ultimoClienteAlertado = '';
          if (bannerCliente) bannerCliente.innerHTML = '';
          return;
        }

        const infoSituacao = verificarSituacaoCliente(nomeAtual);
        if (bannerCliente) {
          bannerCliente.innerHTML = renderizarBannerSituacaoCliente(infoSituacao);
        }

        if (infoSituacao && modalAtraso && modalDetalhes && nomeAtual.toLowerCase() !== ultimoClienteAlertado.toLowerCase()) {
          ultimoClienteAlertado = nomeAtual;
          const {
            cliente,
            emAtraso,
            diasMaiorAtraso,
            qtdComprasVencidas,
            qtdComprasAVencer,
            totalVencidoComMulta,
            totalAVencer,
            totalEmAbertoComMulta,
            detalhesContas
          } = infoSituacao;

          if (modalBox && modalIcon && modalTitle && modalSubtitle && btnFecharModal) {
            if (emAtraso) {
              modalBox.style.borderTop = '5px solid #ef4444';
              modalIcon.textContent = '⚠️';
              modalTitle.textContent = 'Cliente em Atraso';
              modalTitle.style.color = '#b91c1c';
              modalSubtitle.textContent = 'Pendência financeira vencida detectada';
              modalDetalhes.style.background = '#fef2f2';
              modalDetalhes.style.borderColor = '#fecaca';
              modalDetalhes.style.color = '#7f1d1d';
              btnFecharModal.style.background = '#dc2626';
            } else {
              modalBox.style.borderTop = '5px solid #f59e0b';
              modalIcon.textContent = '💳';
              modalTitle.textContent = 'Cliente com Contas a Pagar';
              modalTitle.style.color = '#b45309';
              modalSubtitle.textContent = 'Compras a prazo em aberto (dentro do vencimento)';
              modalDetalhes.style.background = '#fffbeb';
              modalDetalhes.style.borderColor = '#fde68a';
              modalDetalhes.style.color = '#78350f';
              btnFecharModal.style.background = '#d97706';
            }
          }

          const listaPedidosHtml = detalhesContas.length > 0
            ? `<div style="margin-top: 0.6rem; padding-top: 0.55rem; border-top: 1px dashed ${emAtraso ? '#fca5a5' : '#fcd34d'}; font-size: 0.83rem;">
                <strong>Pedidos em aberto:</strong>
                <ul style="margin: 0.3rem 0 0 1.1rem; padding: 0;">
                  ${detalhesContas.map(c => `
                    <li>
                      ${c.pedido} — Venc.: ${c.vencimento} — <strong>${formatarMoeda(c.valor)}</strong>
                      ${c.vencida ? `<span style="color: #dc2626; font-weight: 700;"> (Vencida há ${c.diasAtraso} dia(s) c/ multa 1%)</span>` : ' (A vencer)'}
                    </li>
                  `).join('')}
                </ul>
               </div>`
            : '';

          modalDetalhes.innerHTML = [
            `<p style="margin-bottom: 0.4rem;"><strong>Cliente:</strong> ${cliente.nome}</p>`,
            cliente.telefone ? `<p style="margin-bottom: 0.4rem;"><strong>Contato:</strong> ${cliente.telefone}</p>` : '',
            diasMaiorAtraso > 0
              ? `<p style="margin-bottom: 0.4rem;"><strong>Maior atraso:</strong> ${diasMaiorAtraso} dia(s) (${qtdComprasVencidas} compra(s) vencida(s) — ${formatarMoeda(totalVencidoComMulta)})</p>`
              : (cliente.statusManual === 'atrasado'
                  ? `<p style="margin-bottom: 0.4rem;"><strong>Situação:</strong> Marcado manualmente como <em>Em atraso</em></p>`
                  : ''),
            qtdComprasAVencer > 0
              ? `<p style="margin-bottom: 0.4rem;"><strong>Contas a vencer:</strong> ${qtdComprasAVencer} compra(s) a prazo (${formatarMoeda(totalAVencer)})</p>`
              : '',
            totalEmAbertoComMulta > 0
              ? `<p style="margin-bottom: 0;"><strong>Total geral a pagar:</strong> <span style="font-size: 1.05rem; font-weight: 800;">${formatarMoeda(totalEmAbertoComMulta)}</span></p>`
              : '',
            listaPedidosHtml
          ].join('');

          modalAtraso.classList.remove('hidden');
        }
      });
    }

    if (btnFecharModal && modalAtraso) {
      btnFecharModal.addEventListener('click', () => {
        modalAtraso.classList.add('hidden');
      });
    }

    if (btnTrocarCliente && modalAtraso && selCliente) {
      btnTrocarCliente.addEventListener('click', () => {
        selCliente.value = 'Consumidor Final';
        clienteSelecionadoAtual = 'Consumidor Final';
        ultimoClienteAlertado = '';
        if (bannerCliente) bannerCliente.innerHTML = '';
        modalAtraso.classList.add('hidden');
        selCliente.focus();
      });
    }

    const addForm = document.getElementById('add-item-form');
    if (addForm) {
      addForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const prodId = document.getElementById('s-produto').value;
        const qtd = parseInt(document.getElementById('s-qtd').value, 10) || 0;

        const produto = Store.getCollection('produtos').find(p => p.id === prodId);
        if (!produto || qtd <= 0) {
          mostrarErro('Selecione um produto válido e quantidade maior que zero.');
          return;
        }

        const itemExistente = carrinhoAtual.find(item => item.produtoId === prodId);
        const qtdJaNoCarrinho = itemExistente ? itemExistente.qtd : 0;

        if (qtdJaNoCarrinho + qtd > Number(produto.estoque)) {
          mostrarErro(`Estoque insuficiente para "${produto.nome}". Disponível: ${produto.estoque} un.`);
          return;
        }

        if (itemExistente) {
          itemExistente.qtd += qtd;
        } else {
          carrinhoAtual.push({
            produtoId: produto.id,
            sku: produto.sku,
            nome: produto.nome,
            custo: Number(produto.custo || 0),
            preco: Number(produto.venda || 0),
            qtd
          });
        }

        categoriaSelecionadaVenda = '';
        if (refreshCallback) refreshCallback();
      });
    }

    document.querySelectorAll('[data-remove-cart]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.removeCart, 10);
        carrinhoAtual.splice(idx, 1);
        if (carrinhoAtual.length === 0) {
          descontoPercentualAtual = 0;
        }
        if (refreshCallback) refreshCallback();
      });
    });

    const inpDesconto = document.getElementById('s-desconto');
    const inpValorFinal = document.getElementById('s-valor-final');
    const alertLimite = document.getElementById('discount-limit-alert');

    const exibirAvisoLimite = (mensagem) => {
      if (!alertLimite) return;
      if (mensagem) {
        alertLimite.textContent = mensagem;
        alertLimite.classList.remove('hidden');
      } else {
        alertLimite.classList.add('hidden');
      }
    };

    const atualizarResumoFinanceiro = (pctAplicado, valorDesc, totalFinal, subtotal, lucroBruto, valorMinimo) => {
      const lucroFinal = Math.max(0, Number((lucroBruto - valorDesc).toFixed(2)));
      const pctFormatado = Number(pctAplicado.toFixed(2));

      const elSubtotal = document.getElementById('sale-subtotal-display');
      const elProfitBase = document.getElementById('sale-profit-base-display');
      const elDiscountRow = document.getElementById('sale-discount-row');
      const elDiscountLabel = document.getElementById('sale-discount-label');
      const elDiscountDisplay = document.getElementById('sale-discount-display');
      const elTotalDisplay = document.getElementById('sale-total-display');
      const elProfitFinal = document.getElementById('sale-profit-final-display');

      if (elSubtotal) elSubtotal.textContent = formatarMoeda(subtotal);
      if (elProfitBase) elProfitBase.textContent = `${formatarMoeda(lucroBruto)} (mín. venda: ${formatarMoeda(valorMinimo)})`;
      if (elDiscountRow) elDiscountRow.style.display = pctFormatado > 0 ? 'flex' : 'none';
      if (elDiscountLabel) {
        elDiscountLabel.textContent = isAdmin
          ? `Desconto (${pctFormatado}% do lucro):`
          : `Desconto (${pctFormatado}%):`;
      }
      if (elDiscountDisplay) elDiscountDisplay.textContent = `- ${formatarMoeda(valorDesc)}`;
      if (elTotalDisplay) elTotalDisplay.textContent = formatarMoeda(totalFinal);
      if (elProfitFinal) elProfitFinal.textContent = `Lucro líquido final: ${formatarMoeda(lucroFinal)}`;
    };

    if (inpDesconto) {
      inpDesconto.addEventListener('input', () => {
        if (carrinhoAtual.length === 0) return;

        const subtotal = carrinhoAtual.reduce((acc, item) => acc + (item.preco * item.qtd), 0);
        const custoTotal = carrinhoAtual.reduce((acc, item) => acc + (item.custo * item.qtd), 0);
        const lucroBruto = Math.max(0, subtotal - custoTotal);
        const valorMinimo = Math.max(0, Number((subtotal - (lucroBruto * (limiteDescontoPct / 100))).toFixed(2)));

        let pct = parseFloat(inpDesconto.value);
        if (isNaN(pct) || pct < 0) {
          pct = 0;
          exibirAvisoLimite('');
        } else if (pct > limiteDescontoPct) {
          pct = limiteDescontoPct;
          inpDesconto.value = String(limiteDescontoPct);
          exibirAvisoLimite(`O desconto máximo permitido é de ${limiteDescontoPct}%.`);
        } else {
          exibirAvisoLimite('');
        }

        descontoPercentualAtual = pct;
        const valorDesc = Number((lucroBruto * (pct / 100)).toFixed(2));
        const totalFinal = Math.max(valorMinimo, Number((subtotal - valorDesc).toFixed(2)));

        if (inpValorFinal) {
          inpValorFinal.value = totalFinal.toFixed(2);
        }

        atualizarResumoFinanceiro(pct, valorDesc, totalFinal, subtotal, lucroBruto, valorMinimo);
      });
    }

    if (inpValorFinal) {
      inpValorFinal.addEventListener('input', () => {
        if (carrinhoAtual.length === 0) return;

        const subtotal = carrinhoAtual.reduce((acc, item) => acc + (item.preco * item.qtd), 0);
        const custoTotal = carrinhoAtual.reduce((acc, item) => acc + (item.custo * item.qtd), 0);
        const lucroBruto = Math.max(0, subtotal - custoTotal);
        const valorMinimo = Math.max(0, Number((subtotal - (lucroBruto * (limiteDescontoPct / 100))).toFixed(2)));

        if (inpValorFinal.value === '') {
          descontoPercentualAtual = 0;
          if (inpDesconto) inpDesconto.value = '';
          exibirAvisoLimite('');
          atualizarResumoFinanceiro(0, 0, subtotal, subtotal, lucroBruto, valorMinimo);
          return;
        }

        let valorInformado = parseFloat(inpValorFinal.value);
        if (isNaN(valorInformado)) return;

        if (valorInformado > subtotal) {
          valorInformado = subtotal;
          exibirAvisoLimite('');
        } else if (valorInformado < valorMinimo) {
          exibirAvisoLimite(
            isAdmin
              ? `Valor mínimo autorizado para esta venda é ${formatarMoeda(valorMinimo)} (limite de ${limiteDescontoPct}%).`
              : `Desconto máximo permitido de ${limiteDescontoPct}% atingido.`
          );
          valorInformado = valorMinimo;
        } else {
          exibirAvisoLimite('');
        }

        const valorDesc = Math.max(0, Number((subtotal - valorInformado).toFixed(2)));
        const pctCalculado = lucroBruto > 0
          ? Math.min(limiteDescontoPct, Number(((valorDesc / lucroBruto) * 100).toFixed(2)))
          : 0;

        descontoPercentualAtual = pctCalculado;

        if (inpDesconto) {
          inpDesconto.value = pctCalculado > 0 ? pctCalculado.toFixed(2).replace(/\.00$/, '') : '';
        }

        atualizarResumoFinanceiro(pctCalculado, valorDesc, valorInformado, subtotal, lucroBruto, valorMinimo);
      });

      inpValorFinal.addEventListener('blur', () => {
        if (carrinhoAtual.length === 0) return;
        const subtotal = carrinhoAtual.reduce((acc, item) => acc + (item.preco * item.qtd), 0);
        const custoTotal = carrinhoAtual.reduce((acc, item) => acc + (item.custo * item.qtd), 0);
        const lucroBruto = Math.max(0, subtotal - custoTotal);
        const valorMinimo = Math.max(0, Number((subtotal - (lucroBruto * (limiteDescontoPct / 100))).toFixed(2)));

        const val = parseFloat(inpValorFinal.value);
        if (isNaN(val) || val > subtotal) {
          inpValorFinal.value = subtotal.toFixed(2);
        } else if (val < valorMinimo) {
          inpValorFinal.value = valorMinimo.toFixed(2);
        } else {
          inpValorFinal.value = val.toFixed(2);
        }
      });
    }

    const selPagamento = document.getElementById('s-pagamento');
    const selStatus = document.getElementById('s-status');
    const wrapVencimento = document.getElementById('wrap-vencimento');

    if (selPagamento && selStatus && wrapVencimento) {
      selPagamento.addEventListener('change', () => {
        if (isPagamentoAPrazo(selPagamento.value)) {
          wrapVencimento.classList.remove('hidden');
          selStatus.value = 'Aguardando pagamento';
        } else {
          wrapVencimento.classList.add('hidden');
          if (selStatus.value === 'Aguardando pagamento') {
            selStatus.value = 'Em separação';
          }
        }
      });
    }

    const finishForm = document.getElementById('finish-sale-form');
    if (finishForm) {
      finishForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (carrinhoAtual.length === 0) return;

        const cliente = document.getElementById('s-cliente').value;
        const pagamento = document.getElementById('s-pagamento').value;
        const status = document.getElementById('s-status').value;
        const isPrazo = isPagamentoAPrazo(pagamento);
        const dataVencimento = isPrazo
          ? document.getElementById('s-vencimento').value
          : null;

        if (isPrazo && !dataVencimento) {
          mostrarErro('Informe a data de vencimento para vendas A Prazo.');
          return;
        }

        const produtosAtuais = Store.getCollection('produtos');
        for (const item of carrinhoAtual) {
          const prod = produtosAtuais.find(p => p.id === item.produtoId);
          if (!prod || Number(prod.estoque) < item.qtd) {
            mostrarErro(`Estoque insuficiente para concluir o item "${item.nome}".`);
            return;
          }
        }

        carrinhoAtual.forEach(item => {
          const prod = produtosAtuais.find(p => p.id === item.produtoId);
          Store.updateItem('produtos', prod.id, {
            estoque: Number(prod.estoque) - item.qtd
          });
        });

        const subtotal = carrinhoAtual.reduce((acc, i) => acc + (i.preco * i.qtd), 0);
        const custoTotal = carrinhoAtual.reduce((acc, i) => acc + (i.custo * i.qtd), 0);
        const lucroBruto = Math.max(0, subtotal - custoTotal);

        const descontoPct = Math.min(limiteDescontoPct, Math.max(0, Number(descontoPercentualAtual) || 0));
        const descontoValor = Number((lucroBruto * (descontoPct / 100)).toFixed(2));
        const total = Math.max(0, Number((subtotal - descontoValor).toFixed(2)));

        const dataFormatada = obterDataHoraAtualBR();
        const quitado = !isPrazo && status !== 'Aguardando pagamento';

        const historicoInicial = [
          {
            icone: '📝',
            titulo: 'Solicitação do Pedido Registrada',
            descricao: `Pedido aberto para ${cliente} • Pagamento: ${pagamento}${isPrazo && dataVencimento ? ` (Venc.: ${formatarDataBR(dataVencimento)})` : ''}.`,
            dataHora: dataFormatada,
            usuario: currentUser.nome,
            cor: '#2563eb'
          }
        ];

        if (status === 'Em separação') {
          historicoInicial.push({
            icone: '📦',
            titulo: 'Pedido em Separação',
            descricao: 'Itens encaminhados para separação no estoque.',
            dataHora: dataFormatada,
            usuario: currentUser.nome,
            cor: '#d97706'
          });
        } else if (status === 'Em entrega') {
          historicoInicial.push({
            icone: '🚚',
            titulo: 'Saiu para Entrega',
            descricao: 'Pedido despachado para entrega ao cliente.',
            dataHora: dataFormatada,
            usuario: currentUser.nome,
            cor: '#0284c7'
          });
        } else if (status === 'Aguardando pagamento') {
          historicoInicial.push({
            icone: '⏳',
            titulo: 'Aguardando Recebimento do Pagamento',
            descricao: `Pagamento pendente (${pagamento})${dataVencimento ? ` • Vencimento em ${formatarDataBR(dataVencimento)}` : ''}.`,
            dataHora: dataFormatada,
            usuario: currentUser.nome,
            cor: '#d97706'
          });
        } else if (status === 'Concluída') {
          historicoInicial.push({
            icone: '💰',
            titulo: 'Pagamento Recebido',
            descricao: `Recebimento confirmado no ato via ${pagamento} (${formatarMoeda(total)}).`,
            dataHora: dataFormatada,
            usuario: currentUser.nome,
            cor: '#059669'
          });
          historicoInicial.push({
            icone: '✅',
            titulo: 'Pedido Finalizado no Sistema',
            descricao: 'Pedido entregue e finalizado no ato da venda.',
            dataHora: dataFormatada,
            usuario: currentUser.nome,
            cor: '#059669'
          });
        }

        Store.addItem('vendas', {
          data: dataFormatada,
          cliente,
          pagamento,
          dataVencimento,
          status,
          quitado,
          dataConclusao: status === 'Concluída' ? dataFormatada : null,
          usuarioConclusao: status === 'Concluída' ? currentUser.nome : null,
          historicoStatus: historicoInicial,
          itens: [...carrinhoAtual],
          subtotal,
          lucroBruto,
          descontoPercentual: descontoPct,
          descontoValor,
          valorOriginal: total,
          total,
          custoTotal,
          vendedorId: currentUser.id,
          vendedorNome: currentUser.nome
        });

        carrinhoAtual = [];
        descontoPercentualAtual = 0;
        ultimoClienteAlertado = '';
        clienteSelecionadoAtual = 'Consumidor Final';
        categoriaSelecionadaVenda = '';
        if (refreshCallback) refreshCallback();
      });
    }

    // Pop-up de Histórico Completo do Pedido ao clicar no #XXXX
    const modalHistPedido = document.getElementById('order-history-modal');
    const modalHistBox = document.getElementById('order-history-modal-box');
    const modalHistTitle = document.getElementById('order-history-modal-title');
    const modalHistSubtitle = document.getElementById('order-history-modal-subtitle');
    const modalHistContent = document.getElementById('order-history-modal-content');
    const btnCloseHist = document.getElementById('btn-close-order-history');
    const btnCloseHistX = document.getElementById('btn-close-order-history-x');

    const fecharModalHistoricoPedido = () => {
      if (modalHistPedido) modalHistPedido.classList.add('hidden');
    };

    if (btnCloseHist) btnCloseHist.addEventListener('click', fecharModalHistoricoPedido);
    if (btnCloseHistX) btnCloseHistX.addEventListener('click', fecharModalHistoricoPedido);
    if (modalHistPedido) {
      modalHistPedido.addEventListener('click', (e) => {
        if (e.target === modalHistPedido) fecharModalHistoricoPedido();
      });
    }

    const abrirModalHistoricoPedido = (vendaId) => {
      const venda = (Store.getCollection('vendas') || []).find(v => String(v.id) === String(vendaId));
      if (!venda || !modalHistPedido || !modalHistContent) return;

      const vencida = verificarVendaVencida(venda);
      const valorBase = Number(venda.valorOriginal ?? venda.total ?? 0);
      const valorAtual = vencida ? valorBase * 1.01 : Number(venda.total || 0);
      const subtotal = Number(venda.subtotal ?? valorBase);
      const descontoValor = Number(venda.descontoValor || 0);
      const multaAplicada = Number(venda.multaAplicada || (vencida ? valorBase * 0.01 : 0));

      let corTopo = '#2563eb';
      if (venda.status === 'Concluída') corTopo = '#059669';
      else if (venda.status === 'Aguardando pagamento' || venda.status === 'Em separação') corTopo = '#d97706';

      if (modalHistBox) modalHistBox.style.borderTop = `5px solid ${corTopo}`;
      if (modalHistTitle) {
        modalHistTitle.textContent = `Histórico do Pedido #${String(venda.id).slice(-4)}`;
        modalHistTitle.style.color = corTopo;
      }
      if (modalHistSubtitle) {
        modalHistSubtitle.textContent = `Solicitado em ${venda.data || '-'} • Status atual: ${venda.status || '-'}`;
      }

      const timeline = construirLinhaDoTempoVenda(venda);
      const timelineHtml = timeline.map((ev, idx) => {
        const isUltimo = idx === timeline.length - 1;
        return `
          <div style="display: flex; gap: 0.75rem; position: relative; padding-bottom: ${isUltimo ? '0' : '1rem'};">
            <div style="display: flex; flex-direction: column; align-items: center;">
              <div style="width: 30px; height: 30px; border-radius: 50%; background: #f8fafc; border: 2px solid ${ev.cor}; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; flex-shrink: 0;">
                ${ev.icone}
              </div>
              ${!isUltimo ? `<div style="width: 2px; flex: 1; background: #cbd5e1; margin-top: 0.25rem;"></div>` : ''}
            </div>
            <div style="flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 9px; padding: 0.6rem 0.8rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.2rem;">
                <strong style="font-size: 0.88rem; color: #0f172a;">${escaparHtml(ev.titulo)}</strong>
                <span style="font-size: 0.75rem; font-weight: 600; color: #475569; background: #e2e8f0; padding: 0.12rem 0.45rem; border-radius: 5px;">
                  🕒 ${escaparHtml(ev.dataHora)}
                </span>
              </div>
              ${ev.descricao ? `<div style="font-size: 0.82rem; color: #334155; margin-bottom: 0.2rem;">${escaparHtml(ev.descricao)}</div>` : ''}
              <div style="font-size: 0.74rem; color: #64748b;">
                Responsável: <strong>${escaparHtml(ev.usuario)}</strong>
              </div>
            </div>
          </div>
        `;
      }).join('');

      const itens = Array.isArray(venda.itens) ? venda.itens : [];
      const linhasItensHtml = itens.length === 0
        ? `<tr><td colspan="4" style="text-align: center; color: #64748b;">Nenhum item registrado.</td></tr>`
        : itens.map(i => `
            <tr>
              <td><strong>${escaparHtml(i.sku || '-')}</strong> - ${escaparHtml(i.nome)}</td>
              <td>${i.qtd} un.</td>
              <td>${formatarMoeda(i.preco)}</td>
              <td><strong>${formatarMoeda(Number(i.preco || 0) * Number(i.qtd || 0))}</strong></td>
            </tr>
          `).join('');

      modalHistContent.innerHTML = `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.75rem 0.9rem; margin-bottom: 1rem; font-size: 0.85rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.5rem;">
          <div>
            <span style="color: #64748b; font-size: 0.75rem; display: block;">Cliente</span>
            <strong>${escaparHtml(venda.cliente || 'Consumidor Final')}</strong>
          </div>
          <div>
            <span style="color: #64748b; font-size: 0.75rem; display: block;">Pagamento</span>
            <strong>${escaparHtml(formatarPagamentoExibicao(venda.pagamento))}</strong>
            ${venda.dataVencimento ? `<div style="font-size: 0.76rem; color: ${vencida ? '#dc2626' : '#b45309'};">Venc.: ${formatarDataBR(venda.dataVencimento)}</div>` : ''}
          </div>
          <div>
            <span style="color: #64748b; font-size: 0.75rem; display: block;">Vendedor</span>
            <strong>${escaparHtml(venda.vendedorNome || '-')}</strong>
          </div>
        </div>

        <h4 style="margin: 0 0 0.65rem 0; font-size: 0.92rem; color: #1e293b;">Linha do Tempo da Compra</h4>
        <div style="margin-bottom: 1.1rem;">
          ${timelineHtml}
        </div>

        <h4 style="margin: 0 0 0.5rem 0; font-size: 0.92rem; color: #1e293b;">Itens do Pedido</h4>
        <div class="table-wrapper" style="margin-bottom: 0.85rem;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Qtd</th>
                <th>Unit.</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${linhasItensHtml}
            </tbody>
          </table>
        </div>

        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 0.75rem 0.9rem; font-size: 0.85rem;">
          ${descontoValor > 0 ? `
            <div style="display: flex; justify-content: space-between; color: #475569; margin-bottom: 0.2rem;">
              <span>Subtotal dos itens:</span>
              <span>${formatarMoeda(subtotal)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; color: #059669; font-weight: 600; margin-bottom: 0.2rem;">
              <span>Desconto aplicado:</span>
              <span>- ${formatarMoeda(descontoValor)}</span>
            </div>
          ` : ''}
          ${multaAplicada > 0 ? `
            <div style="display: flex; justify-content: space-between; color: #dc2626; font-weight: 600; margin-bottom: 0.2rem;">
              <span>Multa por atraso (1%):</span>
              <span>+ ${formatarMoeda(multaAplicada)}</span>
            </div>
          ` : ''}
          <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.25rem; border-top: ${descontoValor > 0 || multaAplicada > 0 ? '1px dashed #cbd5e1' : 'none'};">
            <strong>Valor Total:</strong>
            <span style="font-size: 1.15rem; font-weight: 800; color: ${corTopo};">${formatarMoeda(valorAtual)}</span>
          </div>
        </div>
      `;

      modalHistPedido.classList.remove('hidden');
    };

    // Modal de confirmação de estorno
    const modalEstorno = document.getElementById('cancel-sale-confirm-modal');
    const modalEstornoDetalhes = document.getElementById('cancel-sale-confirm-details');
    const btnAbortarEstorno = document.getElementById('btn-cancel-sale-abort');
    const btnConfirmarEstorno = document.getElementById('btn-cancel-sale-confirm');
    let vendaIdParaEstornar = null;

    const fecharModalEstorno = () => {
      vendaIdParaEstornar = null;
      if (modalEstorno) modalEstorno.classList.add('hidden');
    };

    const executarEstornoVenda = (vendaId) => {
      const venda = (Store.getCollection('vendas') || []).find(v => String(v.id) === String(vendaId));
      if (!venda) return;

      const produtosAtuais = Store.getCollection('produtos') || [];
      (venda.itens || []).forEach(item => {
        const prod = produtosAtuais.find(p => String(p.id) === String(item.produtoId));
        if (prod) {
          Store.updateItem('produtos', prod.id, {
            estoque: Number(prod.estoque || 0) + Number(item.qtd || 0)
          });
        }
      });

      Store.removeItem('vendas', venda.id);
      if (refreshCallback) refreshCallback();
    };

    if (btnAbortarEstorno) btnAbortarEstorno.addEventListener('click', fecharModalEstorno);
    if (modalEstorno) {
      modalEstorno.addEventListener('click', (e) => {
        if (e.target === modalEstorno) fecharModalEstorno();
      });
    }
    if (btnConfirmarEstorno) {
      btnConfirmarEstorno.addEventListener('click', () => {
        if (!vendaIdParaEstornar) return;
        const idAlvo = vendaIdParaEstornar;
        fecharModalEstorno();
        executarEstornoVenda(idAlvo);
      });
    }

    const abrirConfirmacaoEstorno = (vendaId) => {
      const venda = (Store.getCollection('vendas') || []).find(v => String(v.id) === String(vendaId));
      if (!venda || !modalEstorno || !modalEstornoDetalhes) return;

      vendaIdParaEstornar = venda.id;
      const resumoItens = (venda.itens || []).map(i => `${i.qtd}x ${escaparHtml(i.nome)}`).join(', ');

      modalEstornoDetalhes.innerHTML = `
        <p style="margin: 0 0 0.4rem 0;">Deseja realmente estornar o pedido <strong>#${escaparHtml(String(venda.id).slice(-4))}</strong>?</p>
        <p style="margin: 0 0 0.35rem 0; font-size: 0.85rem;"><strong>Cliente:</strong> ${escaparHtml(venda.cliente || 'Consumidor Final')}</p>
        <p style="margin: 0 0 0.35rem 0; font-size: 0.85rem;"><strong>Valor:</strong> ${formatarMoeda(venda.total)}</p>
        <p style="margin: 0 0 0.55rem 0; font-size: 0.84rem;"><strong>Itens:</strong> ${resumoItens || '-'}</p>
        <div style="padding-top: 0.45rem; border-top: 1px dashed #fca5a5; font-size: 0.82rem; font-weight: 600;">
          📦 Os itens desta venda serão devolvidos automaticamente ao estoque e o registro será removido do histórico.
        </div>
      `;

      modalEstorno.classList.remove('hidden');
    };

    // Vincula eventos das linhas do histórico (abrir timeline do pedido, mudança de status e estorno)
    const vincularEventosTabelaHistorico = () => {
      document.querySelectorAll('[data-open-order-history]').forEach(btn => {
        btn.addEventListener('click', () => {
          abrirModalHistoricoPedido(btn.dataset.openOrderHistory);
        });
      });

      document.querySelectorAll('[data-change-status]').forEach(select => {
        select.addEventListener('change', () => {
          const vendaId = select.dataset.changeStatus;
          const novoStatus = select.value;
          const venda = Store.getCollection('vendas').find(v => v.id === vendaId);

          if (venda) {
            const dataAgora = obterDataHoraAtualBR();
            const historicoAtual = Array.isArray(venda.historicoStatus) && venda.historicoStatus.length > 0
              ? [...venda.historicoStatus]
              : construirLinhaDoTempoVenda(venda);

            const updates = {
              status: novoStatus,
              dataAtualizacao: dataAgora
            };

            if (novoStatus === 'Em separação') {
              historicoAtual.push({
                icone: '📦',
                titulo: 'Em Separação',
                descricao: 'Pedido movido para separação no estoque.',
                dataHora: dataAgora,
                usuario: currentUser.nome,
                cor: '#d97706'
              });
            } else if (novoStatus === 'Em entrega') {
              historicoAtual.push({
                icone: '🚚',
                titulo: 'Saiu para Entrega',
                descricao: 'Pedido despachado para entrega ao cliente.',
                dataHora: dataAgora,
                usuario: currentUser.nome,
                cor: '#0284c7'
              });
            } else if (novoStatus === 'Aguardando pagamento') {
              updates.quitado = false;
              historicoAtual.push({
                icone: '⏳',
                titulo: 'Aguardando Recebimento do Pagamento',
                descricao: `Status alterado para aguardando pagamento (${formatarPagamentoExibicao(venda.pagamento)}).`,
                dataHora: dataAgora,
                usuario: currentUser.nome,
                cor: '#d97706'
              });
            } else if (novoStatus === 'Concluída') {
              const vencida = verificarVendaVencida(venda);
              const valorBase = Number(venda.valorOriginal ?? venda.total ?? 0);
              const multa = vencida ? valorBase * 0.01 : 0;
              const valorFinalQuitado = valorBase + multa;

              updates.quitado = true;
              updates.valorOriginal = valorBase;
              updates.multaAplicada = multa;
              updates.total = valorFinalQuitado;
              updates.dataConclusao = dataAgora;
              updates.usuarioConclusao = currentUser.nome;

              historicoAtual.push({
                icone: '💰',
                titulo: 'Pagamento Recebido',
                descricao: `Recebimento de ${formatarMoeda(valorFinalQuitado)} confirmado via ${formatarPagamentoExibicao(venda.pagamento)}${multa > 0 ? ` (inclui multa de ${formatarMoeda(multa)})` : ''}.`,
                dataHora: dataAgora,
                usuario: currentUser.nome,
                cor: '#059669'
              });

              historicoAtual.push({
                icone: '✅',
                titulo: 'Pedido Finalizado no Sistema',
                descricao: 'Entrega e pagamento concluídos e encerrados no sistema.',
                dataHora: dataAgora,
                usuario: currentUser.nome,
                cor: '#059669'
              });
            }

            updates.historicoStatus = historicoAtual;
            Store.updateItem('vendas', vendaId, updates);
            if (refreshCallback) refreshCallback();
          }
        });
      });

      if (isAdmin) {
        document.querySelectorAll('[data-cancel-sale]').forEach(btn => {
          btn.addEventListener('click', () => {
            abrirConfirmacaoEstorno(btn.dataset.cancelSale);
          });
        });
      }
    };

    vincularEventosTabelaHistorico();

    const inpBuscaHistorico = document.getElementById('sales-history-search');
    const btnLimparBuscaHistorico = document.getElementById('btn-clear-sales-search');
    const tbodyHistorico = document.getElementById('sales-history-tbody');
    const contadorHistorico = document.getElementById('sales-history-count');

    const aplicarFiltroHistoricoUI = () => {
      const todasVendas = Store.getCollection('vendas') || [];
      const vendasBase = isAdmin
        ? todasVendas
        : todasVendas.filter(v => v.vendedorId === currentUser.id);

      const filtradas = filtrarVendasHistorico(vendasBase, filtroHistoricoVendas);
      const temFiltro = filtroHistoricoVendas.trim().length > 0;

      if (tbodyHistorico) {
        tbodyHistorico.innerHTML = renderizarLinhasHistorico(filtradas, isAdmin, temFiltro);
        vincularEventosTabelaHistorico();
      }

      if (contadorHistorico) {
        contadorHistorico.textContent = temFiltro
          ? `${filtradas.length} de ${vendasBase.length}`
          : `${vendasBase.length}`;
      }

      if (btnLimparBuscaHistorico) {
        btnLimparBuscaHistorico.classList.toggle('hidden', !temFiltro);
      }
    };

    if (inpBuscaHistorico) {
      inpBuscaHistorico.addEventListener('input', () => {
        filtroHistoricoVendas = inpBuscaHistorico.value;
        aplicarFiltroHistoricoUI();
      });
    }

    if (btnLimparBuscaHistorico && inpBuscaHistorico) {
      btnLimparBuscaHistorico.addEventListener('click', () => {
        filtroHistoricoVendas = '';
        inpBuscaHistorico.value = '';
        aplicarFiltroHistoricoUI();
        inpBuscaHistorico.focus();
      });
    }
  }
};