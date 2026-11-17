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

function verificarVendaVencida(venda) {
  const isPendentePrazo =
    (venda.pagamento === 'A Prazo' || venda.pagamento === 'A Prazo / Fiado' || venda.status === 'Aguardando pagamento') &&
    !venda.quitado &&
    venda.status !== 'Concluída';

  if (!isPendentePrazo || !venda.dataVencimento) return false;

  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dtVencimento = new Date(venda.dataVencimento + 'T00:00:00');

  return inicioHoje > dtVencimento;
}

function formatarPagamentoExibicao(pagamento) {
  return pagamento === 'A Prazo / Fiado' ? 'A Prazo' : (pagamento || '-');
}

let filtroAtual = 'tudo';
let dataInicioCustom = '';
let dataFimCustom = '';

export const DashboardModule = {
  render() {
    const currentUser = Store.getCurrentUser();
    const isAdmin = currentUser?.perfil === 'admin';
    const produtos = Store.getCollection('produtos') || [];
    const todasVendas = Store.getCollection('vendas') || [];

    const vendasBase = isAdmin
      ? todasVendas
      : todasVendas.filter(v => v.vendedorId === currentUser.id);

    const agora = new Date();
    const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());

    const vendasFiltradas = vendasBase.filter(v => {
      if (filtroAtual === 'tudo') return true;
      const dataVenda = obterDataVenda(v);

      if (filtroAtual === 'hoje') {
        return dataVenda >= inicioHoje;
      }
      if (filtroAtual === '7dias') {
        const seteDiasAtras = new Date(inicioHoje);
        seteDiasAtras.setDate(inicioHoje.getDate() - 7);
        return dataVenda >= seteDiasAtras;
      }
      if (filtroAtual === 'mes') {
        const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
        return dataVenda >= inicioMes;
      }
      if (filtroAtual === 'personalizado') {
        if (dataInicioCustom) {
          const [anoI, mesI, diaI] = dataInicioCustom.split('-').map(Number);
          const dtInicio = new Date(anoI, mesI - 1, diaI, 0, 0, 0);
          if (dataVenda < dtInicio) return false;
        }
        if (dataFimCustom) {
          const [anoF, mesF, diaF] = dataFimCustom.split('-').map(Number);
          const dtFim = new Date(anoF, mesF - 1, diaF, 23, 59, 59, 999);
          if (dataVenda > dtFim) return false;
        }
        return true;
      }
      return true;
    });

    // Faturamento efetivado vs Aguardando pagamento (A Prazo)
    const vendasAguardandoPgto = vendasFiltradas.filter(
      v => (v.status === 'Aguardando pagamento' || v.pagamento === 'A Prazo' || v.pagamento === 'A Prazo / Fiado') && !v.quitado && v.status !== 'Concluída'
    );

    const vendasRecebidas = vendasFiltradas.filter(
      v => !((v.status === 'Aguardando pagamento' || v.pagamento === 'A Prazo' || v.pagamento === 'A Prazo / Fiado') && !v.quitado && v.status !== 'Concluída')
    );

    const totalFaturado = vendasRecebidas.reduce((acc, v) => acc + Number(v.total || 0), 0);
    const totalCustoVendas = vendasRecebidas.reduce((acc, v) => acc + Number(v.custoTotal || 0), 0);
    const lucroLiquido = totalFaturado - totalCustoVendas;
    const qtdVendas = vendasFiltradas.length;

    const totalAguardandoPgto = vendasAguardandoPgto.reduce((acc, v) => {
      const valorBase = Number(v.valorOriginal ?? v.total ?? 0);
      const vencida = verificarVendaVencida(v);
      return acc + (vencida ? valorBase * 1.01 : valorBase);
    }, 0);

    const qtdVencidasNoPeriodo = vendasAguardandoPgto.filter(v => verificarVendaVencida(v)).length;

    // Monta as linhas detalhadas para o pop-up de valores a receber
    const listaModalAguardando = vendasAguardandoPgto.length === 0
      ? `<p style="color: #64748b; font-size: 0.92rem; text-align: center; padding: 1.25rem 0;">Nenhum valor aguardando pagamento no período selecionado.</p>`
      : `<div class="table-wrapper" style="max-height: 340px; overflow-y: auto; margin-bottom: 1rem;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Pedido</th>
                <th>Vencimento</th>
                <th>Valor a Receber</th>
              </tr>
            </thead>
            <tbody>
              ${[...vendasAguardandoPgto].sort((a, b) => (a.dataVencimento || '').localeCompare(b.dataVencimento || '')).map(v => {
                const vencida = verificarVendaVencida(v);
                const valorBase = Number(v.valorOriginal ?? v.total ?? 0);
                const valorComMulta = vencida ? valorBase * 1.01 : valorBase;
                const vencTexto = v.dataVencimento ? formatarDataBR(v.dataVencimento) : 'Sem data';

                return `
                  <tr style="${vencida ? 'background-color: #fef2f2;' : ''}">
                    <td><strong>${v.cliente || 'Consumidor Final'}</strong></td>
                    <td>#${String(v.id).slice(-4)}<br><span style="font-size: 0.75rem; color: #64748b;">${v.data}</span></td>
                    <td>
                      <span class="stock-badge ${vencida ? 'stock-empty' : 'stock-low'}">
                        ${vencida ? '⚠️ Vencida: ' : ''}${vencTexto}
                      </span>
                    </td>
                    <td>
                      <strong style="color: ${vencida ? '#dc2626' : '#0f172a'};">${formatarMoeda(valorComMulta)}</strong>
                      ${vencida ? `<div style="font-size: 0.72rem; color: #dc2626;">c/ multa 1% (Orig.: ${formatarMoeda(valorBase)})</div>` : ''}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>`;

    const valorEstoqueCusto = produtos.reduce((acc, p) => acc + (Number(p.custo || 0) * Number(p.estoque || 0)), 0);
    const produtosEstoqueBaixo = produtos.filter(p => Number(p.estoque) <= 5);
    const vendasEmEntrega = vendasBase.filter(v => v.status === 'Em entrega');

    const htmlEstoqueBaixo = produtosEstoqueBaixo.length === 0
      ? `<p style="color: #64748b; font-size: 0.9rem;">Todos os produtos estão com estoque confortável.</p>`
      : `<ul class="alert-list">
          ${produtosEstoqueBaixo.map(p => `
            <li class="alert-item">
              <span><strong>${p.sku}</strong> - ${p.nome}</span>
              <span class="stock-badge ${Number(p.estoque) === 0 ? 'stock-empty' : 'stock-low'}">
                ${p.estoque} un.
              </span>
            </li>
          `).join('')}
        </ul>`;

    const htmlEntregas = vendasEmEntrega.length === 0
      ? `<p style="color: #64748b; font-size: 0.9rem;">Nenhum pedido pendente de entrega no momento.</p>`
      : `<ul class="alert-list">
          ${vendasEmEntrega.slice(0, 8).map(v => `
            <li
              class="alert-item"
              data-delivery-order-id="${v.id}"
              title="Clique para ver os detalhes completos deste pedido"
              style="cursor: pointer; border-radius: 8px; padding: 0.6rem 0.75rem; transition: background-color 0.15s ease;"
              onmouseover="this.style.backgroundColor='#f1f5f9'"
              onmouseout="this.style.backgroundColor=''">
              <div>
                <strong>#${String(v.id).slice(-4)}</strong> - ${v.cliente || 'Consumidor Final'}
                <div style="font-size: 0.78rem; color: #64748b;">${v.data} &bull; <span style="color: #2563eb; font-weight: 600;">Ver detalhes ↗</span></div>
              </div>
              <span class="status-badge status-entrega">${formatarMoeda(v.total)}</span>
            </li>
          `).join('')}
        </ul>`;

    return `
      <div class="filter-bar">
        <span style="font-size: 0.9rem; color: var(--text-muted); font-weight: 600;">
          Período de Análise (${isAdmin ? 'Geral' : 'Minhas Vendas'}):
        </span>

        <div class="filter-controls-wrap">
          <div class="filter-pills">
            <button class="filter-pill ${filtroAtual === 'hoje' ? 'active' : ''}" data-period="hoje">Hoje</button>
            <button class="filter-pill ${filtroAtual === '7dias' ? 'active' : ''}" data-period="7dias">7 dias</button>
            <button class="filter-pill ${filtroAtual === 'mes' ? 'active' : ''}" data-period="mes">Este Mês</button>
            <button class="filter-pill ${filtroAtual === 'tudo' ? 'active' : ''}" data-period="tudo">Tudo</button>
            <button class="filter-pill ${filtroAtual === 'personalizado' ? 'active' : ''}" data-period="personalizado">📅 Personalizado</button>
          </div>

          ${filtroAtual === 'personalizado' ? `
            <div class="custom-date-box">
              <label for="dash-dt-inicio">De:</label>
              <input type="date" id="dash-dt-inicio" value="${dataInicioCustom}">
              <label for="dash-dt-fim">Até:</label>
              <input type="date" id="dash-dt-fim" value="${dataFimCustom}">
              <button type="button" id="btn-apply-dates" class="btn-edit-sm">Filtrar</button>
            </div>
          ` : ''}
        </div>
      </div>

      <div class="grid-cards">
        <div class="card metric-card" style="margin-bottom: 0; border-left: 4px solid #2563eb;">
          <span class="metric-label">Faturamento Recebido</span>
          <strong class="metric-value">${formatarMoeda(totalFaturado)}</strong>
          <span class="metric-sub">${vendasRecebidas.length} venda(s) quitada(s)</span>
        </div>

        <div id="card-aguardando-pgto" class="card metric-card" style="margin-bottom: 0; border-left: 4px solid #f59e0b; background: #fffbeb; cursor: pointer;" title="Clique para ver os clientes e valores a receber">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span class="metric-label" style="color: #92400e;">⏳ Aguardando Pagamento</span>
            <span style="font-size: 0.75rem; color: #b45309; font-weight: 700;">Ver lista ↗</span>
          </div>
          <strong class="metric-value" style="color: #b45309;">${formatarMoeda(totalAguardandoPgto)}</strong>
          <span class="metric-sub" style="color: #92400e;">
            ${vendasAguardandoPgto.length} pedido(s) a prazo${qtdVencidasNoPeriodo > 0 ? ` (${qtdVencidasNoPeriodo} vencido(s) c/ multa)` : ''}
          </span>
        </div>

        ${isAdmin ? `
          <div class="card metric-card" style="margin-bottom: 0; border-left: 4px solid #10b981;">
            <span class="metric-label">Lucro Líquido Realizado</span>
            <strong class="metric-value" style="color: #059669;">${formatarMoeda(lucroLiquido)}</strong>
            <span class="metric-sub">Margem de ${totalFaturado > 0 ? ((lucroLiquido / totalFaturado) * 100).toFixed(1) : '0.0'}%</span>
          </div>
        ` : `
          <div class="card metric-card" style="margin-bottom: 0; border-left: 4px solid #10b981;">
            <span class="metric-label">Ticket Médio</span>
            <strong class="metric-value">${formatarMoeda(qtdVendas > 0 ? (totalFaturado + totalAguardandoPgto) / qtdVendas : 0)}</strong>
            <span class="metric-sub">Média por pedido no período</span>
          </div>
        `}

        <div class="card metric-card" style="margin-bottom: 0; border-left: 4px solid #8b5cf6;">
          <span class="metric-label">Capital em Estoque</span>
          <strong class="metric-value">${formatarMoeda(valorEstoqueCusto)}</strong>
          <span class="metric-sub">${produtos.length} produto(s) cadastrado(s)</span>
        </div>
      </div>

      <div class="dashboard-split">
        <div class="card" style="margin-bottom: 0;">
          <h3 style="margin-bottom: 0.75rem;">⚠️ Alertas de Estoque Baixo (≤ 5 un.)</h3>
          ${htmlEstoqueBaixo}
        </div>

        <div class="card" style="margin-bottom: 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
            <h3 style="margin: 0;">🚚 Pedidos Em Entrega (${vendasEmEntrega.length})</h3>
            ${vendasEmEntrega.length > 0 ? `<span style="font-size: 0.76rem; color: #64748b;">Clique no pedido para abrir</span>` : ''}
          </div>
          ${htmlEntregas}
        </div>
      </div>

      <!-- Pop-up de Detalhes: Valores Aguardando Pagamento -->
      <div id="modal-aguardando-pgto" class="modal-overlay hidden">
        <div class="modal-box" style="max-width: 620px; border-top: 5px solid #f59e0b;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <div>
              <h3 style="margin: 0; color: #92400e;">⏳ Valores Aguardando Pagamento</h3>
              <p style="font-size: 0.82rem; color: #64748b; margin-top: 0.2rem;">
                Relação de clientes e pedidos a prazo para entrar no caixa
              </p>
            </div>
            <button type="button" id="btn-close-aguardando-x" class="btn-secondary" style="padding: 0.35rem 0.7rem;">✕</button>
          </div>

          ${listaModalAguardando}

          <div style="display: flex; justify-content: space-between; align-items: center; background: #fffbeb; padding: 0.85rem 1rem; border-radius: 10px; border: 1px solid #fde68a; margin-bottom: 1rem;">
            <strong style="color: #92400e;">Total a Receber:</strong>
            <span style="font-size: 1.25rem; font-weight: 800; color: #b45309;">${formatarMoeda(totalAguardandoPgto)}</span>
          </div>

          <div style="display: flex; justify-content: flex-end;">
            <button type="button" id="btn-close-aguardando" class="btn-primary" style="margin-top: 0; width: auto;">Fechar</button>
          </div>
        </div>
      </div>

      <!-- Pop-up de Detalhes do Pedido Em Entrega -->
      <div id="modal-pedido-entrega" class="modal-overlay hidden">
        <div class="modal-box" style="max-width: 580px; border-top: 5px solid #2563eb;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <div>
              <h3 id="modal-entrega-titulo" style="margin: 0; color: #1e3a8a;">🚚 Detalhes do Pedido</h3>
              <p id="modal-entrega-subtitulo" style="font-size: 0.82rem; color: #64748b; margin-top: 0.2rem;"></p>
            </div>
            <button type="button" id="btn-close-entrega-x" class="btn-secondary" style="padding: 0.35rem 0.7rem;">✕</button>
          </div>

          <div id="modal-entrega-conteudo"></div>

          <div style="display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.6rem; margin-top: 1rem;">
            <button type="button" id="btn-concluir-entrega" class="btn-primary" style="margin-top: 0; width: auto; background: #059669;">
              ✅ Marcar como Concluída
            </button>
            <button type="button" id="btn-close-entrega" class="btn-secondary">Fechar</button>
          </div>
        </div>
      </div>
    `;
  },

  init(refreshCallback) {
    document.querySelectorAll('[data-period]').forEach(btn => {
      btn.addEventListener('click', () => {
        filtroAtual = btn.dataset.period;
        if (refreshCallback) refreshCallback();
      });
    });

    const btnApplyDates = document.getElementById('btn-apply-dates');
    if (btnApplyDates) {
      btnApplyDates.addEventListener('click', () => {
        const dtIni = document.getElementById('dash-dt-inicio').value;
        const dtFim = document.getElementById('dash-dt-fim').value;
        dataInicioCustom = dtIni;
        dataFimCustom = dtFim;
        if (refreshCallback) refreshCallback();
      });
    }

    // Pop-up ao clicar no card "Aguardando Pagamento"
    const cardAguardando = document.getElementById('card-aguardando-pgto');
    const modalAguardando = document.getElementById('modal-aguardando-pgto');
    const btnCloseAguardando = document.getElementById('btn-close-aguardando');
    const btnCloseAguardandoX = document.getElementById('btn-close-aguardando-x');

    if (cardAguardando && modalAguardando) {
      cardAguardando.addEventListener('click', () => {
        modalAguardando.classList.remove('hidden');
      });
    }

    const fecharModal = () => {
      if (modalAguardando) modalAguardando.classList.add('hidden');
    };

    if (btnCloseAguardando) btnCloseAguardando.addEventListener('click', fecharModal);
    if (btnCloseAguardandoX) btnCloseAguardandoX.addEventListener('click', fecharModal);

    if (modalAguardando) {
      modalAguardando.addEventListener('click', (e) => {
        if (e.target === modalAguardando) fecharModal();
      });
    }

    // Pop-up ao clicar em um pedido na lista "Pedidos Em Entrega"
    const modalEntrega = document.getElementById('modal-pedido-entrega');
    const modalEntregaTitulo = document.getElementById('modal-entrega-titulo');
    const modalEntregaSubtitulo = document.getElementById('modal-entrega-subtitulo');
    const modalEntregaConteudo = document.getElementById('modal-entrega-conteudo');
    const btnCloseEntrega = document.getElementById('btn-close-entrega');
    const btnCloseEntregaX = document.getElementById('btn-close-entrega-x');
    const btnConcluirEntrega = document.getElementById('btn-concluir-entrega');

    let pedidoEntregaSelecionadoId = null;

    const fecharModalEntrega = () => {
      pedidoEntregaSelecionadoId = null;
      if (modalEntrega) modalEntrega.classList.add('hidden');
    };

    if (btnCloseEntrega) btnCloseEntrega.addEventListener('click', fecharModalEntrega);
    if (btnCloseEntregaX) btnCloseEntregaX.addEventListener('click', fecharModalEntrega);

    if (modalEntrega) {
      modalEntrega.addEventListener('click', (e) => {
        if (e.target === modalEntrega) fecharModalEntrega();
      });
    }

    document.querySelectorAll('[data-delivery-order-id]').forEach(itemEl => {
      itemEl.addEventListener('click', () => {
        const vendaId = itemEl.dataset.deliveryOrderId;
        const vendas = Store.getCollection('vendas') || [];
        const clientes = Store.getCollection('clientes') || [];
        const venda = vendas.find(v => String(v.id) === String(vendaId));

        if (!venda || !modalEntrega || !modalEntregaConteudo) return;

        pedidoEntregaSelecionadoId = venda.id;

        const nomeCliente = (venda.cliente || 'Consumidor Final').trim();
        const clienteCadastro = clientes.find(
          c => (c.nome || '').trim().toLowerCase() === nomeCliente.toLowerCase()
        );

        const itens = Array.isArray(venda.itens) ? venda.itens : [];
        const subtotal = Number(venda.subtotal ?? venda.total ?? 0);
        const descontoValor = Number(venda.descontoValor || 0);
        const total = Number(venda.total || 0);

        if (modalEntregaTitulo) {
          modalEntregaTitulo.textContent = `🚚 Pedido #${String(venda.id).slice(-4)}`;
        }
        if (modalEntregaSubtitulo) {
          modalEntregaSubtitulo.textContent = `Registrado em ${venda.data || '-'} • Vendedor: ${venda.vendedorNome || '-'}`;
        }

        const linhasItensHtml = itens.length === 0
          ? `<tr><td colspan="4" style="text-align: center; color: #64748b;">Sem itens detalhados.</td></tr>`
          : itens.map(i => `
              <tr>
                <td><strong>${i.sku || '-'}</strong> - ${i.nome}</td>
                <td>${i.qtd} un.</td>
                <td>${formatarMoeda(i.preco)}</td>
                <td><strong>${formatarMoeda(Number(i.preco || 0) * Number(i.qtd || 0))}</strong></td>
              </tr>
            `).join('');

        modalEntregaConteudo.innerHTML = `
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.85rem 1rem; margin-bottom: 1rem; font-size: 0.88rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 0.55rem;">
            <div>
              <span style="color: #64748b; display: block; font-size: 0.76rem;">Cliente</span>
              <strong>${nomeCliente}</strong>
              ${clienteCadastro?.telefone ? `<div style="font-size: 0.78rem; color: #475569;">📞 ${clienteCadastro.telefone}</div>` : ''}
            </div>
            <div>
              <span style="color: #64748b; display: block; font-size: 0.76rem;">Pagamento</span>
              <strong>${formatarPagamentoExibicao(venda.pagamento)}</strong>
              ${venda.dataVencimento ? `<div style="font-size: 0.78rem; color: #b45309;">Venc.: ${formatarDataBR(venda.dataVencimento)}</div>` : ''}
            </div>
            ${clienteCadastro?.observacoes ? `
              <div style="grid-column: 1 / -1; padding-top: 0.35rem; border-top: 1px dashed #cbd5e1;">
                <span style="color: #64748b; display: block; font-size: 0.76rem;">Observação / Endereço do Cliente</span>
                <span>${clienteCadastro.observacoes}</span>
              </div>
            ` : ''}
          </div>

          <div class="table-wrapper" style="max-height: 240px; overflow-y: auto; margin-bottom: 1rem;">
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

          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 0.85rem 1rem;">
            ${descontoValor > 0 ? `
              <div style="display: flex; justify-content: space-between; font-size: 0.84rem; color: #475569; margin-bottom: 0.25rem;">
                <span>Subtotal:</span>
                <span>${formatarMoeda(subtotal)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.84rem; color: #059669; font-weight: 600; margin-bottom: 0.35rem;">
                <span>Desconto aplicado:</span>
                <span>- ${formatarMoeda(descontoValor)}</span>
              </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong style="color: #1e3a8a;">Total do Pedido:</strong>
              <span style="font-size: 1.25rem; font-weight: 800; color: #1d4ed8;">${formatarMoeda(total)}</span>
            </div>
          </div>
        `;

        modalEntrega.classList.remove('hidden');
      });
    });

    if (btnConcluirEntrega) {
      btnConcluirEntrega.addEventListener('click', () => {
        if (!pedidoEntregaSelecionadoId) return;
        const vendas = Store.getCollection('vendas') || [];
        const venda = vendas.find(v => String(v.id) === String(pedidoEntregaSelecionadoId));
        if (!venda) return;

        const vencida = verificarVendaVencida(venda);
        const valorBase = Number(venda.valorOriginal ?? venda.total ?? 0);
        const multa = vencida ? valorBase * 0.01 : 0;

        Store.updateItem('vendas', venda.id, {
          status: 'Concluída',
          quitado: true,
          valorOriginal: valorBase,
          multaAplicada: multa,
          total: valorBase + multa
        });

        fecharModalEntrega();
        if (refreshCallback) refreshCallback();
      });
    }
  }
};