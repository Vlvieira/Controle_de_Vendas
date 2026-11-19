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

function obterDataHoraAtualBR() {
  const agora = new Date();
  return `${agora.toLocaleDateString('pt-BR')} ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
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

function normalizarStatusPedido(status) {
  return String(status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function navegarParaHistoricoVendas(termoFiltro = '') {
  const navVendas =
    document.querySelector('[data-route="vendas"]') ||
    document.querySelector('[data-page="vendas"]') ||
    document.querySelector('[data-module="vendas"]') ||
    document.querySelector('[data-tab="vendas"]') ||
    Array.from(document.querySelectorAll('a, button, [role="button"], li')).find(el => {
      const txt = (el.textContent || '').trim().toLowerCase();
      return txt === 'vendas' || txt.endsWith(' vendas');
    });

  if (navVendas) {
    navVendas.click();
  } else {
    window.location.hash = '#vendas';
  }

  setTimeout(() => {
    const inpBusca = document.getElementById('sales-history-search');
    if (inpBusca && termoFiltro) {
      inpBusca.value = termoFiltro;
      inpBusca.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const alvoHistorico =
      document.getElementById('sales-history-search') ||
      document.getElementById('sales-history-tbody');

    if (alvoHistorico) {
      const cardHistorico = alvoHistorico.closest('.card') || alvoHistorico;
      cardHistorico.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 120);
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

    const vendasAguardandoOrdenadas = [...vendasAguardandoPgto].sort((a, b) =>
      (a.dataVencimento || '').localeCompare(b.dataVencimento || '')
    );

    const valorEstoqueCusto = produtos.reduce((acc, p) => acc + (Number(p.custo || 0) * Number(p.estoque || 0)), 0);
    const produtosEstoqueBaixo = produtos.filter(p => Number(p.estoque) <= 5);

    const vendasEmSeparacao = [...vendasBase].reverse().filter(v => normalizarStatusPedido(v.status) === 'em separacao');
    const vendasEmEntrega = [...vendasBase].reverse().filter(v => normalizarStatusPedido(v.status) === 'em entrega');
    const vendasFinalizadas = [...vendasBase].reverse().filter(v => {
      const st = normalizarStatusPedido(v.status);
      return st === 'concluida' || st === 'finalizada';
    });

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

    const renderizarRodapeVerMais = (grupoKey, totalItens) => {
      if (totalItens <= 3) return '';
      return `
        <div style="margin-top: 0.75rem; padding-top: 0.65rem; border-top: 1px dashed #e2e8f0; display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
          <span style="font-size: 0.78rem; color: #64748b;">Mostrando 3 de ${totalItens}</span>
          <button
            type="button"
            class="btn-secondary"
            data-open-group-modal="${grupoKey}"
            style="padding: 0.35rem 0.75rem; font-size: 0.8rem; font-weight: 600;">
            Ver últimos ${Math.min(10, totalItens)} pedidos
          </button>
        </div>
      `;
    };

    const renderizarListaPedidos = (lista, textoVazio, estiloBadge, grupoKey) => {
      if (lista.length === 0) {
        return `<p style="color: #64748b; font-size: 0.9rem;">${textoVazio}</p>`;
      }
      return `
        <ul class="alert-list">
          ${lista.slice(0, 3).map(v => `
            <li
              class="alert-item"
              data-order-detail-id="${v.id}"
              title="Clique para ver os detalhes completos deste pedido"
              style="cursor: pointer; border-radius: 8px; padding: 0.6rem 0.75rem; transition: background-color 0.15s ease;"
              onmouseover="this.style.backgroundColor='#f1f5f9'"
              onmouseout="this.style.backgroundColor=''">
              <div>
                <strong>#${String(v.id).slice(-4)}</strong> - ${v.cliente || 'Consumidor Final'}
                <div style="font-size: 0.78rem; color: #64748b;">${v.data} &bull; <span style="color: #2563eb; font-weight: 600;">Ver detalhes ↗</span></div>
              </div>
              <span class="status-badge" style="${estiloBadge}">${formatarMoeda(v.total)}</span>
            </li>
          `).join('')}
        </ul>
        ${renderizarRodapeVerMais(grupoKey, lista.length)}
      `;
    };

    const htmlCardAguardandoPgto = vendasAguardandoOrdenadas.length === 0
      ? `<p style="color: #64748b; font-size: 0.9rem;">Nenhum pedido aguardando pagamento no momento.</p>`
      : `
        <ul class="alert-list">
          ${vendasAguardandoOrdenadas.slice(0, 3).map(v => {
            const vencida = verificarVendaVencida(v);
            const valorBase = Number(v.valorOriginal ?? v.total ?? 0);
            const valorExibir = vencida ? valorBase * 1.01 : valorBase;
            const vencTexto = v.dataVencimento ? `Venc.: ${formatarDataBR(v.dataVencimento)}` : 'A prazo';
            const estiloBadge = vencida
              ? 'background: #fee2e2; color: #b91c1c; font-weight: 700;'
              : 'background: #fef3c7; color: #92400e; font-weight: 700;';

            return `
              <li
                class="alert-item"
                data-order-detail-id="${v.id}"
                title="Clique para ver os detalhes completos deste pedido"
                style="cursor: pointer; border-radius: 8px; padding: 0.6rem 0.75rem; transition: background-color 0.15s ease; ${vencida ? 'background-color: #fef2f2;' : ''}"
                onmouseover="this.style.backgroundColor='${vencida ? '#fee2e2' : '#f1f5f9'}'"
                onmouseout="this.style.backgroundColor='${vencida ? '#fef2f2' : ''}'">
                <div>
                  <strong>#${String(v.id).slice(-4)}</strong> - ${v.cliente || 'Consumidor Final'}
                  <div style="font-size: 0.78rem; color: ${vencida ? '#dc2626' : '#64748b'};">
                    ${vencida ? '⚠️ ' : ''}${vencTexto} &bull; <span style="color: #2563eb; font-weight: 600;">Ver detalhes ↗</span>
                  </div>
                </div>
                <span class="status-badge" style="${estiloBadge}">${formatarMoeda(valorExibir)}</span>
              </li>
            `;
          }).join('')}
        </ul>
        ${renderizarRodapeVerMais('aguardando', vendasAguardandoOrdenadas.length)}
      `;

    const htmlSeparacao = renderizarListaPedidos(
      vendasEmSeparacao,
      'Nenhum pedido em separação no momento.',
      'background: #fef3c7; color: #92400e; font-weight: 700;',
      'separacao'
    );

    const htmlEntregas = renderizarListaPedidos(
      vendasEmEntrega,
      'Nenhum pedido pendente de entrega no momento.',
      'background: #dbeafe; color: #1e40af; font-weight: 700;',
      'entrega'
    );

    const htmlFinalizados = renderizarListaPedidos(
      vendasFinalizadas,
      'Nenhum pedido finalizado ainda.',
      'background: #dcfce7; color: #166534; font-weight: 700;',
      'finalizados'
    );

    const margemLucroPct = totalFaturado > 0 ? ((lucroLiquido / totalFaturado) * 100).toFixed(1) : '0.0';
    const ticketMedio = qtdVendas > 0 ? (totalFaturado + totalAguardandoPgto) / qtdVendas : 0;

    const cardLucroOuTicketHtml = isAdmin
      ? `<div class="card metric-card" style="margin-bottom: 0; border-left: 4px solid #10b981;">
          <span class="metric-label">Lucro Líquido Realizado</span>
          <strong class="metric-value" style="color: #059669;">${formatarMoeda(lucroLiquido)}</strong>
          <span class="metric-sub">Margem de ${margemLucroPct}%</span>
        </div>`
      : `<div class="card metric-card" style="margin-bottom: 0; border-left: 4px solid #10b981;">
          <span class="metric-label">Ticket Médio</span>
          <strong class="metric-value">${formatarMoeda(ticketMedio)}</strong>
          <span class="metric-sub">Média por pedido no período</span>
        </div>`;

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

        ${cardLucroOuTicketHtml}

        <div class="card metric-card" style="margin-bottom: 0; border-left: 4px solid #8b5cf6;">
          <span class="metric-label">Capital em Estoque</span>
          <strong class="metric-value">${formatarMoeda(valorEstoqueCusto)}</strong>
          <span class="metric-sub">${produtos.length} produto(s) cadastrado(s)</span>
        </div>
      </div>

      <div class="dashboard-split" style="margin-bottom: 1.25rem;">
        <div class="card" style="margin-bottom: 0; border-top: 4px solid #f59e0b;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
            <h3 style="margin: 0;">📦 Pedidos em Separação (${vendasEmSeparacao.length})</h3>
            ${vendasEmSeparacao.length > 0 ? `<span style="font-size: 0.76rem; color: #64748b;"></span>` : ''}
          </div>
          ${htmlSeparacao}
        </div>

        <div class="card" style="margin-bottom: 0; border-top: 4px solid #2563eb;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
            <h3 style="margin: 0;">🚚 Pedidos Em Entrega (${vendasEmEntrega.length})</h3>
            ${vendasEmEntrega.length > 0 ? `<span style="font-size: 0.76rem; color: #64748b;"></span>` : ''}
          </div>
          ${htmlEntregas}
        </div>
      </div>

      <div class="dashboard-split" style="margin-bottom: 1.25rem;">
        <div class="card" style="margin-bottom: 0; border-top: 4px solid #f59e0b;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; gap: 0.5rem;">
            <h3 style="margin: 0;">⏳ AGUARDANDO PAGAMENTO (${vendasAguardandoOrdenadas.length})</h3>
            ${vendasAguardandoOrdenadas.length > 0
              ? `<span style="font-size: 0.82rem; font-weight: 700; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; padding: 0.2rem 0.55rem; border-radius: 6px;">Total: ${formatarMoeda(totalAguardandoPgto)}</span>`
              : ''}
          </div>
          ${htmlCardAguardandoPgto}
        </div>

        <div class="card" style="margin-bottom: 0; border-top: 4px solid #10b981;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
            <h3 style="margin: 0;">✅ Pedidos Finalizados (${vendasFinalizadas.length})</h3>
            ${vendasFinalizadas.length > 0 ? `<span style="font-size: 0.76rem; color: #64748b;"></span>` : ''}
          </div>
          ${htmlFinalizados}
        </div>
      </div>

      <div class="card" style="margin-bottom: 0;">
        <h3 style="margin-bottom: 0.75rem;">⚠️ Alertas de Estoque Baixo (≤ 5 un.)</h3>
        ${htmlEstoqueBaixo}
      </div>

      <!-- Pop-up com os últimos 10 pedidos da categoria selecionada -->
      <div id="modal-lista-pedidos-grupo" class="modal-overlay hidden">
        <div id="modal-grupo-box" class="modal-box" style="max-width: 640px; width: 95%; border-top: 5px solid #2563eb;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.75rem; margin-bottom: 0.9rem;">
            <div>
              <h3 id="modal-grupo-titulo" style="margin: 0; color: #0f172a;">Últimos 10 Pedidos</h3>
              <p id="modal-grupo-subtitulo" style="font-size: 0.82rem; color: #64748b; margin-top: 0.2rem;"></p>
            </div>
            <button type="button" id="btn-close-grupo-x" class="btn-secondary" style="padding: 0.35rem 0.7rem;">✕</button>
          </div>

          <ul id="modal-grupo-lista" class="alert-list" style="max-height: 360px; overflow-y: auto; margin-bottom: 1rem;"></ul>

          <div id="modal-grupo-mais-banner" class="hidden" style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 0.75rem 0.9rem; margin-bottom: 1rem; font-size: 0.84rem; color: #334155; display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
            <span id="modal-grupo-mais-texto"></span>
            <button type="button" id="btn-ir-historico-vendas" class="btn-primary" style="margin-top: 0; width: auto; padding: 0.45rem 0.85rem; font-size: 0.82rem;">
              Ver no Histórico de Vendas →
            </button>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 0.6rem;">
            <button type="button" id="btn-ir-historico-vendas-sec" class="btn-secondary">Ir para Histórico de Vendas</button>
            <button type="button" id="btn-close-grupo" class="btn-primary" style="margin-top: 0; width: auto;">Fechar</button>
          </div>
        </div>
      </div>

      <!-- Pop-up de Detalhes do Pedido (Separação / Em Entrega / Aguardando Pgto / Finalizados) -->
      <div id="modal-detalhe-pedido" class="modal-overlay hidden">
        <div id="modal-pedido-box" class="modal-box" style="max-width: 580px; border-top: 5px solid #2563eb;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <div>
              <h3 id="modal-pedido-titulo" style="margin: 0; color: #1e3a8a;">Detalhes do Pedido</h3>
              <p id="modal-pedido-subtitulo" style="font-size: 0.82rem; color: #64748b; margin-top: 0.2rem;"></p>
            </div>
            <button type="button" id="btn-close-pedido-x" class="btn-secondary" style="padding: 0.35rem 0.7rem;">✕</button>
          </div>

          <div id="modal-pedido-conteudo"></div>

          <div style="display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.6rem; margin-top: 1rem;">
            <button type="button" id="btn-voltar-separacao" class="btn-primary hidden" style="margin-top: 0; width: auto; background: #d97706;">
              📦 Em Separação
            </button>
            <button type="button" id="btn-enviar-entrega" class="btn-primary hidden" style="margin-top: 0; width: auto; background: #2563eb;">
              🚚 Pedido em entrega
            </button>
            <button type="button" id="btn-aguardando-pgto" class="btn-primary hidden" style="margin-top: 0; width: auto; background: #f59e0b;">
              ⏳ Aguardando Pagamento
            </button>
            <button type="button" id="btn-concluir-pedido" class="btn-primary hidden" style="margin-top: 0; width: auto; background: #059669;">
              ✅ Pedido Finalizado
            </button>
            <button type="button" id="btn-close-pedido" class="btn-secondary">Fechar</button>
          </div>
        </div>
      </div>
    `;
  },

  init(refreshCallback) {
    const currentUser = Store.getCurrentUser();
    const isAdmin = currentUser?.perfil === 'admin';

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

    const modalPedido = document.getElementById('modal-detalhe-pedido');
    const modalPedidoBox = document.getElementById('modal-pedido-box');
    const modalPedidoTitulo = document.getElementById('modal-pedido-titulo');
    const modalPedidoSubtitulo = document.getElementById('modal-pedido-subtitulo');
    const modalPedidoConteudo = document.getElementById('modal-pedido-conteudo');
    const btnClosePedido = document.getElementById('btn-close-pedido');
    const btnClosePedidoX = document.getElementById('btn-close-pedido-x');
    const btnVoltarSeparacao = document.getElementById('btn-voltar-separacao');
    const btnEnviarEntrega = document.getElementById('btn-enviar-entrega');
    const btnAguardandoPgto = document.getElementById('btn-aguardando-pgto');
    const btnConcluirPedido = document.getElementById('btn-concluir-pedido');

    let pedidoSelecionadoId = null;

    const fecharModalPedido = () => {
      pedidoSelecionadoId = null;
      if (modalPedido) modalPedido.classList.add('hidden');
    };

    const registrarEventoHistorico = (venda, novoEvento) => {
      const historicoAtual = Array.isArray(venda.historicoStatus) ? [...venda.historicoStatus] : [];
      historicoAtual.push({
        ...novoEvento,
        dataHora: obterDataHoraAtualBR(),
        usuario: currentUser?.nome || '-'
      });
      return historicoAtual;
    };

    const abrirModalDetalhesPedido = (vendaId) => {
      const vendas = Store.getCollection('vendas') || [];
      const clientes = Store.getCollection('clientes') || [];
      const venda = vendas.find(v => String(v.id) === String(vendaId));

      if (!venda || !modalPedido || !modalPedidoConteudo) return;

      pedidoSelecionadoId = venda.id;

      const stNorm = normalizarStatusPedido(venda.status);
      const isSeparacao = stNorm === 'em separacao';
      const isEntrega = stNorm === 'em entrega';
      const isFinalizado = stNorm === 'concluida' || stNorm === 'finalizada';
      const isAguardandoPgto =
        !isSeparacao &&
        !isEntrega &&
        !isFinalizado &&
        (stNorm === 'aguardando pagamento' ||
          venda.pagamento === 'A Prazo' ||
          venda.pagamento === 'A Prazo / Fiado') &&
        !venda.quitado;

      let iconeStatus = '📋';
      let corTopo = '#2563eb';
      let corTitulo = '#1e3a8a';
      let labelStatus = venda.status || '-';

      if (isSeparacao) {
        iconeStatus = '📦';
        corTopo = '#f59e0b';
        corTitulo = '#92400e';
        labelStatus = 'Em separação';
      } else if (isEntrega) {
        iconeStatus = '🚚';
        corTopo = '#2563eb';
        corTitulo = '#1e3a8a';
        labelStatus = 'Em entrega';
      } else if (isAguardandoPgto) {
        iconeStatus = '⏳';
        corTopo = '#f59e0b';
        corTitulo = '#92400e';
        labelStatus = 'Aguardando pagamento';
      } else if (isFinalizado) {
        iconeStatus = '✅';
        corTopo = '#10b981';
        corTitulo = '#065f46';
        labelStatus = 'Finalizado';
      }

      if (modalPedidoBox) modalPedidoBox.style.borderTop = `5px solid ${corTopo}`;
      if (modalPedidoTitulo) {
        modalPedidoTitulo.textContent = `${iconeStatus} Pedido #${String(venda.id).slice(-4)} — ${labelStatus}`;
        modalPedidoTitulo.style.color = corTitulo;
      }
      if (modalPedidoSubtitulo) {
        modalPedidoSubtitulo.textContent = `Registrado em ${venda.data || '-'} • Vendedor: ${venda.vendedorNome || '-'}`;
      }

      // Controle exato dos botões por etapa do pedido:
      // - Em Separação: "Pedido em entrega" + "Fechar"
      // - Em Entrega: "Em Separação" + "Aguardando Pagamento" + "Fechar"
      // - Aguardando Pagamento: "Pedido em entrega" + "Pedido Finalizado" + "Fechar"
      // - Finalizado: apenas "Fechar"
      if (btnVoltarSeparacao) {
        btnVoltarSeparacao.classList.toggle('hidden', !isEntrega);
      }
      if (btnEnviarEntrega) {
        btnEnviarEntrega.classList.toggle('hidden', !(isSeparacao || isAguardandoPgto));
      }
      if (btnAguardandoPgto) {
        btnAguardandoPgto.classList.toggle('hidden', !isEntrega);
      }
      if (btnConcluirPedido) {
        btnConcluirPedido.classList.toggle('hidden', !isAguardandoPgto);
      }

      const nomeCliente = (venda.cliente || 'Consumidor Final').trim();
      const clienteCadastro = clientes.find(
        c => (c.nome || '').trim().toLowerCase() === nomeCliente.toLowerCase()
      );

      const itens = Array.isArray(venda.itens) ? venda.itens : [];
      const subtotal = Number(venda.subtotal ?? venda.total ?? 0);
      const descontoValor = Number(venda.descontoValor || 0);
      const total = Number(venda.total || 0);

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

      modalPedidoConteudo.innerHTML = `
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

        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 0.85rem 1rem;">
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
            <strong style="color: #0f172a;">Total do Pedido:</strong>
            <span style="font-size: 1.25rem; font-weight: 800; color: ${corTitulo};">${formatarMoeda(total)}</span>
          </div>
        </div>
      `;

      modalPedido.classList.remove('hidden');
    };

    if (btnClosePedido) btnClosePedido.addEventListener('click', fecharModalPedido);
    if (btnClosePedidoX) btnClosePedidoX.addEventListener('click', fecharModalPedido);

    if (modalPedido) {
      modalPedido.addEventListener('click', (e) => {
        if (e.target === modalPedido) fecharModalPedido();
      });
    }

    document.querySelectorAll('[data-order-detail-id]').forEach(itemEl => {
      itemEl.addEventListener('click', () => {
        abrirModalDetalhesPedido(itemEl.dataset.orderDetailId);
      });
    });

    // Pop-up dos últimos 10 pedidos por grupo + redirecionamento para Histórico de Vendas
    const modalGrupo = document.getElementById('modal-lista-pedidos-grupo');
    const modalGrupoBox = document.getElementById('modal-grupo-box');
    const modalGrupoTitulo = document.getElementById('modal-grupo-titulo');
    const modalGrupoSubtitulo = document.getElementById('modal-grupo-subtitulo');
    const modalGrupoLista = document.getElementById('modal-grupo-lista');
    const modalGrupoMaisBanner = document.getElementById('modal-grupo-mais-banner');
    const modalGrupoMaisTexto = document.getElementById('modal-grupo-mais-texto');
    const btnCloseGrupo = document.getElementById('btn-close-grupo');
    const btnCloseGrupoX = document.getElementById('btn-close-grupo-x');
    const btnIrHistorico = document.getElementById('btn-ir-historico-vendas');
    const btnIrHistoricoSec = document.getElementById('btn-ir-historico-vendas-sec');

    let statusFiltroGrupoAtual = '';

    const fecharModalGrupo = () => {
      if (modalGrupo) modalGrupo.classList.add('hidden');
    };

    if (btnCloseGrupo) btnCloseGrupo.addEventListener('click', fecharModalGrupo);
    if (btnCloseGrupoX) btnCloseGrupoX.addEventListener('click', fecharModalGrupo);

    if (modalGrupo) {
      modalGrupo.addEventListener('click', (e) => {
        if (e.target === modalGrupo) fecharModalGrupo();
      });
    }

    const irParaHistoricoVendas = () => {
      fecharModalGrupo();
      navegarParaHistoricoVendas(statusFiltroGrupoAtual);
    };

    if (btnIrHistorico) btnIrHistorico.addEventListener('click', irParaHistoricoVendas);
    if (btnIrHistoricoSec) btnIrHistoricoSec.addEventListener('click', irParaHistoricoVendas);

    document.querySelectorAll('[data-open-group-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const grupoKey = btn.dataset.openGroupModal;
        const todasVendas = Store.getCollection('vendas') || [];
        const vendasBase = isAdmin
          ? todasVendas
          : todasVendas.filter(v => v.vendedorId === currentUser.id);

        const agora = new Date();
        const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());

        let listaCompleta = [];
        let tituloModal = '';
        let corTopo = '#2563eb';
        let estiloBadgePadrao = 'background: #dbeafe; color: #1e40af; font-weight: 700;';
        let isGrupoAguardando = false;

        if (grupoKey === 'separacao') {
          listaCompleta = [...vendasBase].reverse().filter(v => normalizarStatusPedido(v.status) === 'em separacao');
          tituloModal = `📦 Pedidos em Separação (${listaCompleta.length})`;
          corTopo = '#f59e0b';
          estiloBadgePadrao = 'background: #fef3c7; color: #92400e; font-weight: 700;';
          statusFiltroGrupoAtual = 'Em separação';
        } else if (grupoKey === 'entrega') {
          listaCompleta = [...vendasBase].reverse().filter(v => normalizarStatusPedido(v.status) === 'em entrega');
          tituloModal = `🚚 Pedidos Em Entrega (${listaCompleta.length})`;
          corTopo = '#2563eb';
          estiloBadgePadrao = 'background: #dbeafe; color: #1e40af; font-weight: 700;';
          statusFiltroGrupoAtual = 'Em entrega';
        } else if (grupoKey === 'finalizados') {
          listaCompleta = [...vendasBase].reverse().filter(v => {
            const st = normalizarStatusPedido(v.status);
            return st === 'concluida' || st === 'finalizada';
          });
          tituloModal = `✅ Pedidos Finalizados (${listaCompleta.length})`;
          corTopo = '#10b981';
          estiloBadgePadrao = 'background: #dcfce7; color: #166534; font-weight: 700;';
          statusFiltroGrupoAtual = 'Concluída';
        } else if (grupoKey === 'aguardando') {
          isGrupoAguardando = true;
          const vendasFiltradas = vendasBase.filter(v => {
            if (filtroAtual === 'tudo') return true;
            const dataVenda = obterDataVenda(v);
            if (filtroAtual === 'hoje') return dataVenda >= inicioHoje;
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
                if (dataVenda < new Date(anoI, mesI - 1, diaI, 0, 0, 0)) return false;
              }
              if (dataFimCustom) {
                const [anoF, mesF, diaF] = dataFimCustom.split('-').map(Number);
                if (dataVenda > new Date(anoF, mesF - 1, diaF, 23, 59, 59, 999)) return false;
              }
              return true;
            }
            return true;
          });

          const aguardando = vendasFiltradas.filter(
            v => (v.status === 'Aguardando pagamento' || v.pagamento === 'A Prazo' || v.pagamento === 'A Prazo / Fiado') && !v.quitado && v.status !== 'Concluída'
          );
          listaCompleta = [...aguardando].sort((a, b) =>
            (a.dataVencimento || '').localeCompare(b.dataVencimento || '')
          );
          tituloModal = `⏳ Aguardando Pagamento (${listaCompleta.length})`;
          corTopo = '#f59e0b';
          statusFiltroGrupoAtual = 'Aguardando pagamento';
        }

        if (!modalGrupo || !modalGrupoLista) return;

        const ultimosDez = listaCompleta.slice(0, 10);
        const temMaisDeDez = listaCompleta.length > 10;

        if (modalGrupoBox) modalGrupoBox.style.borderTop = `5px solid ${corTopo}`;
        if (modalGrupoTitulo) modalGrupoTitulo.textContent = tituloModal;
        if (modalGrupoSubtitulo) {
          modalGrupoSubtitulo.textContent = temMaisDeDez
            ? `Exibindo os 10 pedidos mais recentes de ${listaCompleta.length}. Clique em um pedido para ver detalhes.`
            : `Exibindo os ${ultimosDez.length} pedidos desta lista. Clique em um pedido para ver detalhes.`;
        }

        modalGrupoLista.innerHTML = ultimosDez.map(v => {
          if (isGrupoAguardando) {
            const vencida = verificarVendaVencida(v);
            const valorBase = Number(v.valorOriginal ?? v.total ?? 0);
            const valorExibir = vencida ? valorBase * 1.01 : valorBase;
            const vencTexto = v.dataVencimento ? `Venc.: ${formatarDataBR(v.dataVencimento)}` : 'A prazo';
            const estiloBadge = vencida
              ? 'background: #fee2e2; color: #b91c1c; font-weight: 700;'
              : 'background: #fef3c7; color: #92400e; font-weight: 700;';

            return `
              <li
                class="alert-item"
                data-modal-order-id="${v.id}"
                style="cursor: pointer; border-radius: 8px; padding: 0.6rem 0.75rem; transition: background-color 0.15s ease; ${vencida ? 'background-color: #fef2f2;' : ''}"
                onmouseover="this.style.backgroundColor='${vencida ? '#fee2e2' : '#f1f5f9'}'"
                onmouseout="this.style.backgroundColor='${vencida ? '#fef2f2' : ''}'">
                <div>
                  <strong>#${String(v.id).slice(-4)}</strong> - ${v.cliente || 'Consumidor Final'}
                  <div style="font-size: 0.78rem; color: ${vencida ? '#dc2626' : '#64748b'};">
                    ${vencida ? '⚠️ ' : ''}${vencTexto} &bull; <span style="color: #2563eb; font-weight: 600;">Ver detalhes ↗</span>
                  </div>
                </div>
                <span class="status-badge" style="${estiloBadge}">${formatarMoeda(valorExibir)}</span>
              </li>
            `;
          }

          return `
            <li
              class="alert-item"
              data-modal-order-id="${v.id}"
              style="cursor: pointer; border-radius: 8px; padding: 0.6rem 0.75rem; transition: background-color 0.15s ease;"
              onmouseover="this.style.backgroundColor='#f1f5f9'"
              onmouseout="this.style.backgroundColor=''">
              <div>
                <strong>#${String(v.id).slice(-4)}</strong> - ${v.cliente || 'Consumidor Final'}
                <div style="font-size: 0.78rem; color: #64748b;">${v.data} &bull; <span style="color: #2563eb; font-weight: 600;">Ver detalhes ↗</span></div>
              </div>
              <span class="status-badge" style="${estiloBadgePadrao}">${formatarMoeda(v.total)}</span>
            </li>
          `;
        }).join('');

        modalGrupoLista.querySelectorAll('[data-modal-order-id]').forEach(el => {
          el.addEventListener('click', () => {
            const id = el.dataset.modalOrderId;
            fecharModalGrupo();
            abrirModalDetalhesPedido(id);
          });
        });

        if (modalGrupoMaisBanner && modalGrupoMaisTexto) {
          if (temMaisDeDez) {
            modalGrupoMaisTexto.innerHTML = `Existem <strong>${listaCompleta.length}</strong> pedidos no total. Para consultar os anteriores aos 10 últimos, acesse o Histórico de Vendas.`;
            modalGrupoMaisBanner.classList.remove('hidden');
            modalGrupoMaisBanner.style.display = 'flex';
          } else {
            modalGrupoMaisBanner.classList.add('hidden');
            modalGrupoMaisBanner.style.display = 'none';
          }
        }

        modalGrupo.classList.remove('hidden');
      });
    });

    // Ações de transição de status nos botões do modal de detalhes
    if (btnVoltarSeparacao) {
      btnVoltarSeparacao.addEventListener('click', () => {
        if (!pedidoSelecionadoId) return;
        const vendas = Store.getCollection('vendas') || [];
        const venda = vendas.find(v => String(v.id) === String(pedidoSelecionadoId));
        if (!venda) return;

        Store.updateItem('vendas', venda.id, {
          status: 'Em separação',
          dataAtualizacao: obterDataHoraAtualBR(),
          historicoStatus: registrarEventoHistorico(venda, {
            icone: '📦',
            titulo: 'Retornado para Separação',
            descricao: 'Pedido retornado para separação no estoque.',
            cor: '#d97706'
          })
        });

        fecharModalPedido();
        if (refreshCallback) refreshCallback();
      });
    }

    if (btnEnviarEntrega) {
      btnEnviarEntrega.addEventListener('click', () => {
        if (!pedidoSelecionadoId) return;
        const vendas = Store.getCollection('vendas') || [];
        const venda = vendas.find(v => String(v.id) === String(pedidoSelecionadoId));
        if (!venda) return;

        Store.updateItem('vendas', venda.id, {
          status: 'Em entrega',
          dataAtualizacao: obterDataHoraAtualBR(),
          historicoStatus: registrarEventoHistorico(venda, {
            icone: '🚚',
            titulo: 'Saiu para Entrega',
            descricao: 'Pedido encaminhado para entrega ao cliente.',
            cor: '#0284c7'
          })
        });

        fecharModalPedido();
        if (refreshCallback) refreshCallback();
      });
    }

    if (btnAguardandoPgto) {
      btnAguardandoPgto.addEventListener('click', () => {
        if (!pedidoSelecionadoId) return;
        const vendas = Store.getCollection('vendas') || [];
        const venda = vendas.find(v => String(v.id) === String(pedidoSelecionadoId));
        if (!venda) return;

        Store.updateItem('vendas', venda.id, {
          status: 'Aguardando pagamento',
          quitado: false,
          dataAtualizacao: obterDataHoraAtualBR(),
          historicoStatus: registrarEventoHistorico(venda, {
            icone: '⏳',
            titulo: 'Aguardando Recebimento do Pagamento',
            descricao: `Pedido entregue e aguardando confirmação do pagamento (${formatarPagamentoExibicao(venda.pagamento)}).`,
            cor: '#d97706'
          })
        });

        fecharModalPedido();
        if (refreshCallback) refreshCallback();
      });
    }

    if (btnConcluirPedido) {
      btnConcluirPedido.addEventListener('click', () => {
        if (!pedidoSelecionadoId) return;
        const vendas = Store.getCollection('vendas') || [];
        const venda = vendas.find(v => String(v.id) === String(pedidoSelecionadoId));
        if (!venda) return;

        const vencida = verificarVendaVencida(venda);
        const valorBase = Number(venda.valorOriginal ?? venda.total ?? 0);
        const multa = vencida ? valorBase * 0.01 : 0;
        const valorFinalQuitado = valorBase + multa;
        const dataAgora = obterDataHoraAtualBR();

        const historicoAtual = registrarEventoHistorico(venda, {
          icone: '💰',
          titulo: 'Pagamento Recebido',
          descricao: `Recebimento de ${formatarMoeda(valorFinalQuitado)} confirmado via ${formatarPagamentoExibicao(venda.pagamento)}${multa > 0 ? ` (inclui multa de ${formatarMoeda(multa)})` : ''}.`,
          cor: '#059669'
        });

        historicoAtual.push({
          icone: '✅',
          titulo: 'Pedido Finalizado no Sistema',
          descricao: 'Entrega e pagamento concluídos e encerrados no sistema.',
          dataHora: dataAgora,
          usuario: currentUser?.nome || '-',
          cor: '#059669'
        });

        Store.updateItem('vendas', venda.id, {
          status: 'Concluída',
          quitado: true,
          valorOriginal: valorBase,
          multaAplicada: multa,
          total: valorFinalQuitado,
          dataAtualizacao: dataAgora,
          dataConclusao: dataAgora,
          usuarioConclusao: currentUser?.nome || '-',
          historicoStatus: historicoAtual
        });

        fecharModalPedido();
        if (refreshCallback) refreshCallback();
      });
    }
  }
};