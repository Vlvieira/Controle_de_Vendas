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

let carrinhoAtual = [];
let descontoPercentualAtual = 0;
let ultimoClienteAlertado = '';
let clienteSelecionadoAtual = 'Consumidor Final';

function obterLimiteDesconto(isAdmin) {
  return isAdmin ? 50 : 40;
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

    const produtos = Store.getCollection('produtos');
    const clientes = Store.getCollection('clientes');
    const todasVendas = Store.getCollection('vendas');

    const vendasExibidas = isAdmin
      ? todasVendas
      : todasVendas.filter(v => v.vendedorId === currentUser.id);

    const produtosDisponiveis = produtos.filter(p => Number(p.estoque) > 0);

    const optionsProdutos = produtosDisponiveis.length === 0
      ? `<option value="">Nenhum produto com estoque disponível</option>`
      : produtosDisponiveis.map(p => `
          <option value="${p.id}">
            ${p.sku} - ${p.nome} (${formatarMoeda(p.venda)} | Estoque: ${p.estoque})
          </option>
        `).join('');

    const optionsClientes = clientes.map(c => `
      <option value="${c.nome}" ${c.nome === clienteSelecionadoAtual ? 'selected' : ''}>${c.nome}${c.telefone ? ` (${c.telefone})` : ''}</option>
    `).join('');

    const infoClienteAtual = verificarSituacaoCliente(clienteSelecionadoAtual);
    const bannerClienteHtml = renderizarBannerSituacaoCliente(infoClienteAtual);

    // Cálculo com desconto incidindo sobre o LUCRO (Venda - Custo) limitado a 50% (admin) ou 40% (vendedor)
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
            <td><strong>${item.sku}</strong> - ${item.nome}</td>
            <td>${formatarMoeda(item.preco)}</td>
            <td>${item.qtd} un.</td>
            <td><strong>${formatarMoeda(item.preco * item.qtd)}</strong></td>
            <td>
              <button type="button" class="btn-danger-sm" data-remove-cart="${idx}">Remover</button>
            </td>
          </tr>
        `).join('');

    const linhasHistorico = vendasExibidas.length === 0
      ? `<tr><td colspan="${isAdmin ? 8 : 7}" style="text-align: center; color: #64748b; padding: 1.5rem;">Nenhuma venda registrada ainda.</td></tr>`
      : [...vendasExibidas].reverse().map(v => {
          const resumoItens = (v.itens || []).map(i => `${i.qtd}x ${i.nome}`).join(', ');
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
              <td><strong>#${v.id.slice(-4)}</strong><br><span style="font-size: 0.78rem; color: #64748b;">${v.data}</span></td>
              <td>${v.cliente || 'Consumidor Final'}</td>
              <td style="max-width: 240px;">${resumoItens}</td>
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
                  <button class="btn-danger-sm" data-cancel-sale="${v.id}" title="Cancelar venda e devolver estoque">Estornar</button>
                </td>
              ` : ''}
            </tr>
          `;
        }).join('');

    return `
      <div class="dashboard-split" style="margin-bottom: 1.5rem;">
        <div class="card" style="margin-bottom: 0;">
          <h3 style="margin-bottom: 1rem;">1. Selecionar Produtos</h3>
          <div id="sale-msg" class="error-msg hidden"></div>

          <form id="add-item-form">
            <div class="form-group">
              <label for="s-produto">Produto em Estoque</label>
              <select id="s-produto" required>
                ${optionsProdutos}
              </select>
            </div>

            <div class="form-group">
              <label for="s-qtd">Quantidade</label>
              <input type="number" id="s-qtd" min="1" value="1" required>
            </div>

            <button type="submit" class="btn-primary">+ Adicionar ao Pedido</button>
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
                  <option value="Concluída">✅ Concluída</option>
                  <option value="Em separação">📦 Em separação</option>
                  <option value="Em entrega">🚚 Em entrega</option>
                  <option value="Aguardando pagamento">⏳ Aguardando pagamento</option>
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
        <h3 style="margin-bottom: 1rem;">Histórico de Vendas (${vendasExibidas.length})</h3>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Pedido / Data</th>
                <th>Cliente</th>
                <th>Itens</th>
                <th>Pagamento</th>
                <th>Total</th>
                <th>Status</th>
                <th>Vendedor</th>
                ${isAdmin ? '<th>Ações</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${linhasHistorico}
            </tbody>
          </table>
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

    // Pop-up e banner de alerta quando cliente selecionado estiver em atraso ou com contas a pagar
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

    // Sincronização bidirecional entre Desconto (%) e Valor de Venda Final (R$) com limite de 50% (admin) ou 40% (vendedor)
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

    // 1) Quando digita o percentual de desconto -> preenche Valor de Venda Final
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

    // 2) Quando digita o Valor de Venda Final -> preenche automaticamente o percentual de desconto
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

    // Exibe campo de vencimento e ajusta status automaticamente quando selecionar "A Prazo"
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
            selStatus.value = 'Concluída';
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

        // Valida novamente estoque antes de baixar
        const produtosAtuais = Store.getCollection('produtos');
        for (const item of carrinhoAtual) {
          const prod = produtosAtuais.find(p => p.id === item.produtoId);
          if (!prod || Number(prod.estoque) < item.qtd) {
            mostrarErro(`Estoque insuficiente para concluir o item "${item.nome}".`);
            return;
          }
        }

        // Baixa estoque dos produtos vendidos
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

        const agora = new Date();
        const dataFormatada = `${agora.toLocaleDateString('pt-BR')} ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

        const quitado = !isPrazo && status !== 'Aguardando pagamento';

        Store.addItem('vendas', {
          data: dataFormatada,
          cliente,
          pagamento,
          dataVencimento,
          status,
          quitado,
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
        if (refreshCallback) refreshCallback();
      });
    }

    // Alterar status da venda diretamente no histórico
    document.querySelectorAll('[data-change-status]').forEach(select => {
      select.addEventListener('change', () => {
        const vendaId = select.dataset.changeStatus;
        const novoStatus = select.value;
        const venda = Store.getCollection('vendas').find(v => v.id === vendaId);

        if (venda) {
          const updates = { status: novoStatus };
          if (novoStatus === 'Concluída') {
            const vencida = verificarVendaVencida(venda);
            const valorBase = Number(venda.valorOriginal ?? venda.total ?? 0);
            const multa = vencida ? valorBase * 0.01 : 0;

            updates.quitado = true;
            updates.valorOriginal = valorBase;
            updates.multaAplicada = multa;
            updates.total = valorBase + multa;
          } else if (novoStatus === 'Aguardando pagamento') {
            updates.quitado = false;
          }
          Store.updateItem('vendas', vendaId, updates);
          if (refreshCallback) refreshCallback();
        }
      });
    });

    // Estornar venda (Admin) -> devolve itens ao estoque
    if (isAdmin) {
      document.querySelectorAll('[data-cancel-sale]').forEach(btn => {
        btn.addEventListener('click', () => {
          const vendaId = btn.dataset.cancelSale;
          const venda = Store.getCollection('vendas').find(v => v.id === vendaId);
          if (!venda) return;

          const produtosAtuais = Store.getCollection('produtos');
          (venda.itens || []).forEach(item => {
            const prod = produtosAtuais.find(p => p.id === item.produtoId);
            if (prod) {
              Store.updateItem('produtos', prod.id, {
                estoque: Number(prod.estoque) + item.qtd
              });
            }
          });

          Store.removeItem('vendas', vendaId);
          if (refreshCallback) refreshCallback();
        });
      });
    }
  }
};