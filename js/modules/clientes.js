import { Store } from '../store.js';

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

function escaparHtml(texto) {
  return String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function obterPendenciasClientes() {
  let registros = [];
  if (typeof Store.getCollection === 'function') {
    try {
      registros = Store.getCollection('pendencias_clientes') || [];
    } catch (err) {
      registros = [];
    }
  }
  if (!Array.isArray(registros) || registros.length === 0) {
    try {
      registros = JSON.parse(localStorage.getItem('pendencias_clientes') || '[]');
    } catch (err) {
      registros = [];
    }
  }
  return Array.isArray(registros) ? registros : [];
}

function salvarPendenciasClientes(lista) {
  localStorage.setItem('pendencias_clientes', JSON.stringify(lista));
  if (typeof Store.saveCollection === 'function') {
    try {
      Store.saveCollection('pendencias_clientes', lista);
    } catch (err) {
      // ignora se Store não possuir saveCollection
    }
  }
}

function criarSolicitacaoCliente({ cliente, acao, novoStatusManual, solicitante }) {
  const pendencias = obterPendenciasClientes();

  // Evita duplicar solicitação pendente idêntica para o mesmo cliente
  const jaExiste = pendencias.some(
    p => p.status === 'pendente' && p.clienteId === cliente.id && p.acao === acao
  );
  if (jaExiste) {
    return false;
  }

  const novaPendencia = {
    id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 6),
    clienteId: cliente.id,
    clienteNome: cliente.nome,
    clienteTelefone: cliente.telefone || '',
    acao, // 'status_atraso' | 'exclusao'
    novoStatusManual: novoStatusManual || null,
    solicitanteId: solicitante?.id || '',
    solicitanteNome: solicitante?.nome || 'Vendedor',
    dataSolicitacao: obterDataHoraAtual(),
    status: 'pendente' // 'pendente' | 'aprovada' | 'rejeitada'
  };

  pendencias.push(novaPendencia);
  salvarPendenciasClientes(pendencias);
  return true;
}

function atualizarStatusPendencia(pendenciaId, novoStatus) {
  const pendencias = obterPendenciasClientes();
  const atualizadas = pendencias.map(p =>
    p.id === pendenciaId
      ? { ...p, status: novoStatus, dataResolucao: obterDataHoraAtual() }
      : p
  );
  salvarPendenciasClientes(atualizadas);
}

function verificarClienteEmAtraso(cliente, vendas) {
  if (cliente.statusManual === 'atrasado') return true;

  const nomeLimpo = (cliente.nome || '').trim().toLowerCase();
  if (!nomeLimpo) return false;

  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  return vendas.some(v => {
    const mesmoCliente = (v.cliente || '').trim().toLowerCase() === nomeLimpo;
    const pendente =
      (v.pagamento === 'A Prazo / Fiado' || v.status === 'Aguardando pagamento') &&
      !v.quitado &&
      v.status !== 'Concluída';

    if (!mesmoCliente || !pendente || !v.dataVencimento) return false;

    const dtVencimento = new Date(v.dataVencimento + 'T00:00:00');
    return inicioHoje > dtVencimento;
  });
}

let feedbackMensagem = null; // { tipo: 'sucesso' | 'aviso', texto: string }
let acaoPendenteConfirmacao = null; // { titulo, mensagem, corBotao, textoBotao, onConfirm }
let clienteSelecionadoMenuId = null;

// Estado dos filtros da Carteira de Clientes
let filtroBuscaCliente = '';
let filtroSituacaoCliente = 'todos'; // 'todos' | 'em_dia' | 'atrasado'

function filtrarClientesLista(clientes, vendas) {
  const termo = normalizarTextoBusca(filtroBuscaCliente);
  const termoNumerico = filtroBuscaCliente.replace(/\D/g, '');

  return (clientes || []).filter(c => {
    const nomeNorm = normalizarTextoBusca(c.nome);
    const telNorm = normalizarTextoBusca(c.telefone);
    const telDigits = String(c.telefone || '').replace(/\D/g, '');
    const docNorm = normalizarTextoBusca(c.documento || c.cpfCnpj);
    const docDigits = String(c.documento || c.cpfCnpj || '').replace(/\D/g, '');
    const obsNorm = normalizarTextoBusca(c.observacoes);

    if (termo) {
      const bateTexto =
        nomeNorm.includes(termo) ||
        telNorm.includes(termo) ||
        docNorm.includes(termo) ||
        obsNorm.includes(termo);

      const bateNumero =
        termoNumerico.length > 0 &&
        (telDigits.includes(termoNumerico) || docDigits.includes(termoNumerico));

      if (!bateTexto && !bateNumero) return false;
    }

    const emAtraso = verificarClienteEmAtraso(c, vendas);
    if (filtroSituacaoCliente === 'em_dia' && emAtraso) return false;
    if (filtroSituacaoCliente === 'atrasado' && !emAtraso) return false;

    return true;
  });
}

function gerarLinhasClientes(clientesFiltrados, totalClientes, vendas, pendenciasAbertas, isAdmin) {
  if (totalClientes === 0) {
    return `<tr><td colspan="5" style="text-align: center; color: #64748b; padding: 1.5rem;">Nenhum cliente cadastrado.</td></tr>`;
  }

  if (clientesFiltrados.length === 0) {
    return `<tr><td colspan="5" style="text-align: center; color: #64748b; padding: 1.5rem;">Nenhum cliente encontrado com os filtros aplicados.</td></tr>`;
  }

  return clientesFiltrados.map(c => {
    const emAtraso = verificarClienteEmAtraso(c, vendas);
    const reqsCliente = pendenciasAbertas.filter(p => p.clienteId === c.id);

    const badgePendenciaHtml = !isAdmin && reqsCliente.length > 0
      ? `<div style="margin-top: 0.3rem;">
          <span style="display: inline-block; font-size: 0.72rem; font-weight: 600; padding: 0.15rem 0.5rem; border-radius: 999px; background: #fef3c7; color: #92400e;">
            ⏳ Aguardando aprovação (${reqsCliente.map(r => r.acao === 'exclusao' ? 'Exclusão' : 'Status').join(', ')})
          </span>
         </div>`
      : '';

    return `
      <tr style="${emAtraso ? 'background-color: #fef2f2;' : ''}">
        <td>
          <strong>${escaparHtml(c.nome)}</strong>
          ${badgePendenciaHtml}
        </td>
        <td>${escaparHtml(c.telefone || '-')}</td>
        <td>${escaparHtml(c.documento || c.cpfCnpj || '-')}</td>
        <td>
          <span class="badge ${emAtraso ? 'badge-danger' : 'badge-success'}">
            ${emAtraso ? '⚠️ Em Atraso' : '✅ Em Dia'}
          </span>
        </td>
        <td style="white-space: nowrap;">
          <button
            type="button"
            data-open-client-actions="${c.id}"
            style="padding: 0.38rem 0.75rem; font-size: 0.8rem; font-weight: 600; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc; color: #0f172a; cursor: pointer;">
            ⚙️ Ações
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

export const ClientesModule = {
  render() {
    const currentUser = Store.getCurrentUser();
    const isAdmin = verificarIsAdmin(currentUser);
    const clientes = Store.getCollection('clientes') || [];
    const vendas = Store.getCollection('vendas') || [];
    const pendencias = obterPendenciasClientes();
    const pendenciasAbertas = pendencias.filter(p => p.status === 'pendente');

    const clientesFiltrados = filtrarClientesLista(clientes, vendas);
    const temFiltroAtivo = Boolean(filtroBuscaCliente.trim() || filtroSituacaoCliente !== 'todos');

    const alertaFeedbackHtml = feedbackMensagem
      ? `<div style="padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.88rem; font-weight: 600; background: ${feedbackMensagem.tipo === 'sucesso' ? '#ecfdf5' : '#fffbeb'}; color: ${feedbackMensagem.tipo === 'sucesso' ? '#065f46' : '#92400e'}; border: 1px solid ${feedbackMensagem.tipo === 'sucesso' ? '#a7f3d0' : '#fde68a'};">
          ${feedbackMensagem.texto}
         </div>`
      : '';

    // Painel de Aprovação visível apenas para o Administrador quando houver pendências
    const painelAprovacaoAdminHtml = isAdmin
      ? `
        <div class="card" style="margin-bottom: 1.5rem; border-left: 4px solid ${pendenciasAbertas.length > 0 ? '#f59e0b' : '#cbd5e1'};">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.85rem;">
            <h3 style="margin: 0;">
              ⏳ Pendências de Aprovação (${pendenciasAbertas.length})
            </h3>
          </div>
          ${
            pendenciasAbertas.length === 0
              ? `<p style="color: #64748b; font-size: 0.9rem; margin: 0;">Nenhuma solicitação pendente de vendedores no momento.</p>`
              : `
                <div class="table-wrapper">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Data / Hora</th>
                        <th>Vendedor</th>
                        <th>Cliente</th>
                        <th>Ação Solicitada</th>
                        <th>Decisão</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${[...pendenciasAbertas].reverse().map(p => {
                        let descricaoAcao = '';
                        if (p.acao === 'exclusao') {
                          descricaoAcao = `<span class="badge badge-danger">Exclusão de Cliente</span>`;
                        } else if (p.novoStatusManual === 'atrasado') {
                          descricaoAcao = `<span class="badge badge-danger">Marcar em Atraso</span>`;
                        } else {
                          descricaoAcao = `<span class="badge badge-success">Regularizar Status (Em dia)</span>`;
                        }

                        return `
                          <tr>
                            <td>${p.dataSolicitacao}</td>
                            <td><strong>${escaparHtml(p.solicitanteNome)}</strong></td>
                            <td>
                              <strong>${escaparHtml(p.clienteNome)}</strong>
                              ${p.clienteTelefone ? `<div style="font-size: 0.78rem; color: #64748b;">${escaparHtml(p.clienteTelefone)}</div>` : ''}
                            </td>
                            <td>${descricaoAcao}</td>
                            <td style="white-space: nowrap;">
                              <button
                                type="button"
                                data-approve-req="${p.id}"
                                style="padding: 0.35rem 0.7rem; font-size: 0.78rem; font-weight: 600; border-radius: 6px; border: none; background: #059669; color: #fff; cursor: pointer; margin-right: 0.35rem;">
                                ✓ Aprovar
                              </button>
                              <button
                                type="button"
                                data-reject-req="${p.id}"
                                class="btn-danger-sm">
                                ✕ Rejeitar
                              </button>
                            </td>
                          </tr>
                        `;
                      }).join('')}
                    </tbody>
                  </table>
                </div>
              `
          }
        </div>
      `
      : '';

    const linhasClientes = gerarLinhasClientes(clientesFiltrados, clientes.length, vendas, pendenciasAbertas, isAdmin);

    return `
      ${alertaFeedbackHtml}
      ${painelAprovacaoAdminHtml}

      <div class="dashboard-split" style="margin-bottom: 1.5rem;">
        <div class="card" style="margin-bottom: 0;">
          <h3 style="margin-bottom: 1rem;">Cadastrar Novo Cliente</h3>
          <div id="client-msg" class="error-msg hidden"></div>
          <form id="client-form">
            <div class="form-group">
              <label for="c-nome">Nome Completo / Razão Social *</label>
              <input type="text" id="c-nome" required placeholder="Ex: João da Silva">
            </div>
            <div class="form-grid">
              <div class="form-group">
                <label for="c-telefone">Telefone / WhatsApp</label>
                <input type="text" id="c-telefone" placeholder="(11) 99999-9999">
              </div>
              <div class="form-group">
                <label for="c-doc">CPF / CNPJ</label>
                <input type="text" id="c-doc" placeholder="000.000.000-00">
              </div>
            </div>
            <div class="form-group">
              <label for="c-obs">Observações</label>
              <input type="text" id="c-obs" placeholder="Endereço, limite ou referência">
            </div>
            <button type="submit" class="btn-primary">Salvar Cliente</button>
          </form>
        </div>

        <div class="card" style="margin-bottom: 0;">
          <div class="toolbar-row" style="margin-bottom: 0.85rem;">
            <h3 id="client-list-title" style="margin: 0;">
              Carteira de Clientes (${temFiltroAtivo ? `${clientesFiltrados.length} de ${clientes.length}` : clientes.length})
            </h3>
            <button
              type="button"
              id="btn-clear-client-filters"
              class="btn-secondary ${temFiltroAtivo ? '' : 'hidden'}"
              style="padding: 0.35rem 0.75rem; font-size: 0.8rem;">
              ✕ Limpar filtros
            </button>
          </div>

          <!-- Filtro de Pesquisa -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.65rem; margin-bottom: 1rem;">
            <div class="form-group" style="margin-bottom: 0;">
              <input
                type="search"
                id="client-search-input"
                value="${escaparHtml(filtroBuscaCliente)}"
                placeholder="🔍 Buscar por nome, telefone ou CPF/CNPJ...">
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <select id="client-filter-situacao">
                <option value="todos" ${filtroSituacaoCliente === 'todos' ? 'selected' : ''}>Todas as situações</option>
                <option value="em_dia" ${filtroSituacaoCliente === 'em_dia' ? 'selected' : ''}>✅ Em Dia</option>
                <option value="atrasado" ${filtroSituacaoCliente === 'atrasado' ? 'selected' : ''}>⚠️ Em Atraso</option>
              </select>
            </div>
          </div>

          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Contato</th>
                  <th>CPF / CNPJ</th>
                  <th>Situação</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody id="client-table-body">
                ${linhasClientes}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Modal de Escolha de Ações do Cliente -->
      <div id="client-actions-choice-modal" class="modal-overlay hidden">
        <div class="modal-box" style="max-width: 390px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.45rem;">
            <h3 style="margin: 0;">Ações do Cliente</h3>
            <button type="button" id="btn-close-choice-modal" class="btn-secondary" style="padding: 0.25rem 0.6rem; font-size: 0.82rem;">✕</button>
          </div>
          <p id="choice-modal-client-name" style="color: #64748b; font-size: 0.88rem; margin-top: 0; margin-bottom: 1rem;"></p>

          <div style="display: flex; flex-direction: column; gap: 0.6rem;">
            <button
              type="button"
              id="btn-choice-overdue"
              style="width: 100%; text-align: left; padding: 0.7rem 0.9rem; font-size: 0.9rem; font-weight: 600; border-radius: 8px; border: 1px solid #fecaca; background: #fef2f2; color: #b91c1c; cursor: pointer;">
              ⚠️ Marcar como atrasado
            </button>

            <button
              type="button"
              id="btn-choice-edit"
              style="width: 100%; text-align: left; padding: 0.7rem 0.9rem; font-size: 0.9rem; font-weight: 600; border-radius: 8px; border: 1px solid #cbd5e1; background: #f8fafc; color: #0f172a; cursor: pointer;">
              ✏️ Editar
            </button>

            <button
              type="button"
              id="btn-choice-delete"
              style="width: 100%; text-align: left; padding: 0.7rem 0.9rem; font-size: 0.9rem; font-weight: 600; border-radius: 8px; border: 1px solid #fecaca; background: #fef2f2; color: #dc2626; cursor: pointer;">
              🗑️ Excluir
            </button>
          </div>

          <div style="display: flex; justify-content: flex-end; margin-top: 1rem;">
            <button type="button" id="btn-cancel-choice-modal" class="btn-secondary">Fechar</button>
          </div>
        </div>
      </div>

      <!-- Modal de Edição do Cliente -->
      <div id="client-edit-modal" class="modal-overlay hidden">
        <div class="modal-box" style="max-width: 480px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h3 style="margin: 0;">✏️ Editar Cliente</h3>
            <button type="button" id="btn-close-edit-client-modal" class="btn-secondary" style="padding: 0.25rem 0.6rem; font-size: 0.82rem;">✕</button>
          </div>
          <div id="edit-client-msg" class="error-msg hidden"></div>
          <form id="edit-client-modal-form">
            <input type="hidden" id="ec-id">
            <div class="form-group">
              <label for="ec-nome">Nome Completo / Razão Social *</label>
              <input type="text" id="ec-nome" required placeholder="Ex: João da Silva">
            </div>
            <div class="form-grid">
              <div class="form-group">
                <label for="ec-telefone">Telefone / WhatsApp</label>
                <input type="text" id="ec-telefone" placeholder="(11) 99999-9999">
              </div>
              <div class="form-group">
                <label for="ec-doc">CPF / CNPJ</label>
                <input type="text" id="ec-doc" placeholder="000.000.000-00">
              </div>
            </div>
            <div class="form-group">
              <label for="ec-obs">Observações</label>
              <input type="text" id="ec-obs" placeholder="Endereço, limite ou referência">
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 0.65rem; margin-top: 1rem;">
              <button type="button" id="btn-cancel-edit-client-modal" class="btn-secondary">Cancelar</button>
              <button type="submit" class="btn-primary" style="margin-top: 0; width: auto;">Salvar Alterações</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Pop-up de Confirmação das Ações -->
      <div id="client-action-confirm-modal" class="modal-overlay hidden">
        <div class="modal-box" style="max-width: 440px;">
          <h3 id="confirm-modal-title" style="margin-top: 0; margin-bottom: 0.65rem;">Confirmar Ação</h3>
          <p id="confirm-modal-message" style="color: #475569; font-size: 0.92rem; line-height: 1.5; margin-bottom: 1.25rem;"></p>
          <div style="display: flex; justify-content: flex-end; gap: 0.65rem;">
            <button type="button" id="btn-cancel-client-action" class="btn-secondary">Cancelar</button>
            <button type="button" id="btn-confirm-client-action" class="btn-primary" style="margin-top: 0; width: auto;">Confirmar</button>
          </div>
        </div>
      </div>
    `;
  },

  init(refreshCallback) {
    const currentUser = Store.getCurrentUser();
    const isAdmin = verificarIsAdmin(currentUser);

    // Limpa mensagem de feedback após renderizar para não persistir indefinidamente
    feedbackMensagem = null;
    acaoPendenteConfirmacao = null;
    clienteSelecionadoMenuId = null;

    // Configuração do modal de confirmação de ações
    const modalConfirm = document.getElementById('client-action-confirm-modal');
    const modalTitle = document.getElementById('confirm-modal-title');
    const modalMessage = document.getElementById('confirm-modal-message');
    const btnCancelAction = document.getElementById('btn-cancel-client-action');
    const btnConfirmAction = document.getElementById('btn-confirm-client-action');

    const fecharConfirmacao = () => {
      acaoPendenteConfirmacao = null;
      if (modalConfirm) modalConfirm.classList.add('hidden');
    };

    const abrirConfirmacao = ({ titulo, mensagem, textoBotao = 'Confirmar', corBotao = '', onConfirm }) => {
      if (!modalConfirm || !modalTitle || !modalMessage || !btnConfirmAction) {
        if (window.confirm(mensagem)) onConfirm();
        return;
      }

      acaoPendenteConfirmacao = onConfirm;
      modalTitle.textContent = titulo;
      modalMessage.innerHTML = mensagem;
      btnConfirmAction.textContent = textoBotao;
      btnConfirmAction.style.background = corBotao || '';
      modalConfirm.classList.remove('hidden');
    };

    if (btnCancelAction) {
      btnCancelAction.addEventListener('click', fecharConfirmacao);
    }

    if (btnConfirmAction) {
      btnConfirmAction.addEventListener('click', () => {
        const executar = acaoPendenteConfirmacao;
        fecharConfirmacao();
        if (typeof executar === 'function') {
          executar();
        }
      });
    }

    if (modalConfirm) {
      modalConfirm.addEventListener('click', (e) => {
        if (e.target === modalConfirm) fecharConfirmacao();
      });
    }

    // Configuração do Modal de Escolha de Ações (Marcar como atrasado, Editar, Excluir)
    const modalEscolha = document.getElementById('client-actions-choice-modal');
    const lblClienteEscolha = document.getElementById('choice-modal-client-name');
    const btnChoiceOverdue = document.getElementById('btn-choice-overdue');
    const btnChoiceEdit = document.getElementById('btn-choice-edit');
    const btnChoiceDelete = document.getElementById('btn-choice-delete');
    const btnCloseChoice = document.getElementById('btn-close-choice-modal');
    const btnCancelChoice = document.getElementById('btn-cancel-choice-modal');

    const fecharModalEscolha = () => {
      clienteSelecionadoMenuId = null;
      if (modalEscolha) modalEscolha.classList.add('hidden');
    };

    if (btnCloseChoice) btnCloseChoice.addEventListener('click', fecharModalEscolha);
    if (btnCancelChoice) btnCancelChoice.addEventListener('click', fecharModalEscolha);
    if (modalEscolha) {
      modalEscolha.addEventListener('click', (e) => {
        if (e.target === modalEscolha) fecharModalEscolha();
      });
    }

    const abrirModalEscolhaCliente = (clientId) => {
      const cliente = (Store.getCollection('clientes') || []).find(c => String(c.id) === String(clientId));
      if (!cliente || !modalEscolha) return;

      clienteSelecionadoMenuId = cliente.id;
      const vendas = Store.getCollection('vendas') || [];
      const pendenciasAbertas = obterPendenciasClientes().filter(p => p.status === 'pendente');
      const reqsCliente = pendenciasAbertas.filter(p => String(p.clienteId) === String(cliente.id));
      const temReqAtraso = reqsCliente.some(p => p.acao === 'status_atraso');
      const temReqExclusao = reqsCliente.some(p => p.acao === 'exclusao');
      const emAtraso = verificarClienteEmAtraso(cliente, vendas);

      if (lblClienteEscolha) {
        lblClienteEscolha.innerHTML = `Selecione uma ação para <strong>${escaparHtml(cliente.nome)}</strong>:`;
      }

      if (btnChoiceOverdue) {
        if (!isAdmin && temReqAtraso) {
          btnChoiceOverdue.textContent = '⏳ Alteração de status já solicitada';
          btnChoiceOverdue.disabled = true;
          btnChoiceOverdue.style.opacity = '0.6';
          btnChoiceOverdue.style.cursor = 'not-allowed';
        } else {
          btnChoiceOverdue.disabled = false;
          btnChoiceOverdue.style.opacity = '1';
          btnChoiceOverdue.style.cursor = 'pointer';
          if (emAtraso) {
            btnChoiceOverdue.textContent = '✅ Marcar em dia';
            btnChoiceOverdue.style.borderColor = '#bbf7d0';
            btnChoiceOverdue.style.background = '#f0fdf4';
            btnChoiceOverdue.style.color = '#166534';
          } else {
            btnChoiceOverdue.textContent = '⚠️ Marcar como atrasado';
            btnChoiceOverdue.style.borderColor = '#fecaca';
            btnChoiceOverdue.style.background = '#fef2f2';
            btnChoiceOverdue.style.color = '#b91c1c';
          }
        }
      }

      if (btnChoiceDelete) {
        if (!isAdmin && temReqExclusao) {
          btnChoiceDelete.textContent = '⏳ Exclusão já solicitada';
          btnChoiceDelete.disabled = true;
          btnChoiceDelete.style.opacity = '0.6';
          btnChoiceDelete.style.cursor = 'not-allowed';
        } else {
          btnChoiceDelete.textContent = '🗑️ Excluir';
          btnChoiceDelete.disabled = false;
          btnChoiceDelete.style.opacity = '1';
          btnChoiceDelete.style.cursor = 'pointer';
        }
      }

      modalEscolha.classList.remove('hidden');
    };

    // Configuração do Modal de Edição de Cliente
    const modalEditar = document.getElementById('client-edit-modal');
    const formEditar = document.getElementById('edit-client-modal-form');
    const msgEditar = document.getElementById('edit-client-msg');
    const btnCloseEditar = document.getElementById('btn-close-edit-client-modal');
    const btnCancelEditar = document.getElementById('btn-cancel-edit-client-modal');

    const fecharModalEditar = () => {
      if (modalEditar) modalEditar.classList.add('hidden');
      if (msgEditar) msgEditar.classList.add('hidden');
    };

    if (btnCloseEditar) btnCloseEditar.addEventListener('click', fecharModalEditar);
    if (btnCancelEditar) btnCancelEditar.addEventListener('click', fecharModalEditar);
    if (modalEditar) {
      modalEditar.addEventListener('click', (e) => {
        if (e.target === modalEditar) fecharModalEditar();
      });
    }

    const abrirModalEditarCliente = (clientId) => {
      const cliente = (Store.getCollection('clientes') || []).find(c => String(c.id) === String(clientId));
      if (!cliente || !modalEditar) return;

      document.getElementById('ec-id').value = cliente.id;
      document.getElementById('ec-nome').value = cliente.nome || '';
      document.getElementById('ec-telefone').value = cliente.telefone || '';
      document.getElementById('ec-doc').value = cliente.documento || cliente.cpfCnpj || '';
      document.getElementById('ec-obs').value = cliente.observacoes || '';

      if (msgEditar) msgEditar.classList.add('hidden');
      modalEditar.classList.remove('hidden');
    };

    if (formEditar) {
      formEditar.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('ec-id').value;
        const nome = document.getElementById('ec-nome').value.trim();
        const telefone = document.getElementById('ec-telefone').value.trim();
        const documento = document.getElementById('ec-doc').value.trim();
        const observacoes = document.getElementById('ec-obs').value.trim();

        if (!nome) {
          if (msgEditar) {
            msgEditar.textContent = 'Informe o nome do cliente.';
            msgEditar.classList.remove('hidden');
          }
          return;
        }

        Store.updateItem('clientes', id, {
          nome,
          telefone,
          documento,
          observacoes
        });

        fecharModalEditar();
        feedbackMensagem = {
          tipo: 'sucesso',
          texto: `Dados do cliente "${nome}" atualizados com sucesso.`
        };

        if (refreshCallback) refreshCallback();
      });
    }

    // Opção 1 do Modal de Escolha: Marcar como atrasado / Marcar em dia
    if (btnChoiceOverdue) {
      btnChoiceOverdue.addEventListener('click', () => {
        const clientId = clienteSelecionadoMenuId;
        fecharModalEscolha();
        if (!clientId) return;

        const cliente = (Store.getCollection('clientes') || []).find(c => String(c.id) === String(clientId));
        if (!cliente) return;

        const vendas = Store.getCollection('vendas') || [];
        const atualmenteEmAtraso = verificarClienteEmAtraso(cliente, vendas);
        const novoStatusManual = atualmenteEmAtraso ? 'em_dia' : 'atrasado';
        const acaoTexto = novoStatusManual === 'atrasado' ? 'Marcar como atrasado' : 'Marcar em dia';

        const mensagemConfirmacao = isAdmin
          ? `Deseja realmente <strong>${acaoTexto.toLowerCase()}</strong> o cliente <strong>"${escaparHtml(cliente.nome)}"</strong>?`
          : `Deseja enviar uma solicitação ao administrador para <strong>${acaoTexto.toLowerCase()}</strong> o cliente <strong>"${escaparHtml(cliente.nome)}"</strong>?`;

        abrirConfirmacao({
          titulo: `Confirmar: ${acaoTexto}`,
          mensagem: mensagemConfirmacao,
          textoBotao: isAdmin ? 'Confirmar Alteração' : 'Enviar Solicitação',
          corBotao: novoStatusManual === 'atrasado' ? '#dc2626' : '#059669',
          onConfirm: () => {
            if (isAdmin) {
              Store.updateItem('clientes', clientId, { statusManual: novoStatusManual });
              feedbackMensagem = {
                tipo: 'sucesso',
                texto: `Situação do cliente "${cliente.nome}" atualizada para ${novoStatusManual === 'atrasado' ? 'Em Atraso' : 'Em Dia'}.`
              };
            } else {
              const criada = criarSolicitacaoCliente({
                cliente,
                acao: 'status_atraso',
                novoStatusManual,
                solicitante: currentUser
              });

              feedbackMensagem = criada
                ? {
                    tipo: 'aviso',
                    texto: `Solicitação para ${novoStatusManual === 'atrasado' ? 'marcar em atraso' : 'regularizar'} "${cliente.nome}" enviada para aprovação do administrador.`
                  }
                : {
                    tipo: 'aviso',
                    texto: `Já existe uma solicitação pendente de alteração de status para "${cliente.nome}".`
                  };
            }

            if (refreshCallback) refreshCallback();
          }
        });
      });
    }

    // Opção 2 do Modal de Escolha: Editar
    if (btnChoiceEdit) {
      btnChoiceEdit.addEventListener('click', () => {
        const clientId = clienteSelecionadoMenuId;
        fecharModalEscolha();
        if (clientId) {
          abrirModalEditarCliente(clientId);
        }
      });
    }

    // Opção 3 do Modal de Escolha: Excluir
    if (btnChoiceDelete) {
      btnChoiceDelete.addEventListener('click', () => {
        const clientId = clienteSelecionadoMenuId;
        fecharModalEscolha();
        if (!clientId) return;

        const cliente = (Store.getCollection('clientes') || []).find(c => String(c.id) === String(clientId));
        if (!cliente) return;

        const mensagemConfirmacao = isAdmin
          ? `Tem certeza que deseja excluir permanentemente o cliente <strong>"${escaparHtml(cliente.nome)}"</strong>? Esta ação não poderá ser desfeita.`
          : `Deseja enviar uma solicitação de exclusão do cliente <strong>"${escaparHtml(cliente.nome)}"</strong> para aprovação do administrador?`;

        abrirConfirmacao({
          titulo: 'Confirmar Exclusão de Cliente',
          mensagem: mensagemConfirmacao,
          textoBotao: isAdmin ? 'Sim, Excluir' : 'Solicitar Exclusão',
          corBotao: '#dc2626',
          onConfirm: () => {
            if (isAdmin) {
              Store.removeItem('clientes', clientId);
              feedbackMensagem = {
                tipo: 'sucesso',
                texto: `Cliente "${cliente.nome}" excluído com sucesso.`
              };
            } else {
              const criada = criarSolicitacaoCliente({
                cliente,
                acao: 'exclusao',
                solicitante: currentUser
              });

              feedbackMensagem = criada
                ? {
                    tipo: 'aviso',
                    texto: `Solicitação de exclusão do cliente "${cliente.nome}" enviada para aprovação do administrador.`
                  }
                : {
                    tipo: 'aviso',
                    texto: `Já existe uma solicitação de exclusão pendente para "${cliente.nome}".`
                  };
            }

            if (refreshCallback) refreshCallback();
          }
        });
      });
    }

    // 1) Cadastro de cliente (permitido para ambos os perfis)
    const clientForm = document.getElementById('client-form');
    if (clientForm) {
      clientForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const nome = document.getElementById('c-nome').value.trim();
        const telefone = document.getElementById('c-telefone').value.trim();
        const documento = document.getElementById('c-doc').value.trim();
        const observacoes = document.getElementById('c-obs').value.trim();
        const msgBox = document.getElementById('client-msg');

        if (!nome) {
          if (msgBox) {
            msgBox.textContent = 'Informe o nome do cliente.';
            msgBox.classList.remove('hidden');
          }
          return;
        }

        Store.addItem('clientes', {
          nome,
          telefone,
          documento,
          observacoes,
          statusManual: 'em_dia'
        });

        feedbackMensagem = {
          tipo: 'sucesso',
          texto: `Cliente "${nome}" cadastrado com sucesso.`
        };

        if (refreshCallback) refreshCallback();
      });
    }

    // Vincula o botão "⚙️ Ações" de cada linha da tabela
    const vincularAcoesTabelaClientes = () => {
      document.querySelectorAll('[data-open-client-actions]').forEach(btn => {
        btn.addEventListener('click', () => {
          abrirModalEscolhaCliente(btn.dataset.openClientActions);
        });
      });
    };

    // Filtro de pesquisa em tempo real sem perder foco do input
    const aplicarFiltrosClientesEmTempoReal = () => {
      const clientes = Store.getCollection('clientes') || [];
      const vendas = Store.getCollection('vendas') || [];
      const pendenciasAbertas = obterPendenciasClientes().filter(p => p.status === 'pendente');
      const clientesFiltrados = filtrarClientesLista(clientes, vendas);
      const temFiltroAtivo = Boolean(filtroBuscaCliente.trim() || filtroSituacaoCliente !== 'todos');

      const tbody = document.getElementById('client-table-body');
      const titleEl = document.getElementById('client-list-title');
      const btnClear = document.getElementById('btn-clear-client-filters');

      if (tbody) {
        tbody.innerHTML = gerarLinhasClientes(clientesFiltrados, clientes.length, vendas, pendenciasAbertas, isAdmin);
        vincularAcoesTabelaClientes();
      }

      if (titleEl) {
        titleEl.textContent = `Carteira de Clientes (${temFiltroAtivo ? `${clientesFiltrados.length} de ${clientes.length}` : clientes.length})`;
      }

      if (btnClear) {
        btnClear.classList.toggle('hidden', !temFiltroAtivo);
      }
    };

    const inpBusca = document.getElementById('client-search-input');
    const selSituacao = document.getElementById('client-filter-situacao');
    const btnClear = document.getElementById('btn-clear-client-filters');

    if (inpBusca) {
      inpBusca.addEventListener('input', () => {
        filtroBuscaCliente = inpBusca.value;
        aplicarFiltrosClientesEmTempoReal();
      });
    }

    if (selSituacao) {
      selSituacao.addEventListener('change', () => {
        filtroSituacaoCliente = selSituacao.value;
        aplicarFiltrosClientesEmTempoReal();
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        filtroBuscaCliente = '';
        filtroSituacaoCliente = 'todos';
        if (inpBusca) inpBusca.value = '';
        if (selSituacao) selSituacao.value = 'todos';
        aplicarFiltrosClientesEmTempoReal();
      });
    }

    vincularAcoesTabelaClientes();

    // 4) Ações do Administrador: Aprovar ou Rejeitar solicitações dos vendedores (com confirmação)
    if (isAdmin) {
      document.querySelectorAll('[data-approve-req]').forEach(btn => {
        btn.addEventListener('click', () => {
          const reqId = btn.dataset.approveReq;
          const pendencias = obterPendenciasClientes();
          const req = pendencias.find(p => p.id === reqId);
          if (!req) return;

          const descSolicitacao = req.acao === 'exclusao'
            ? 'a <strong>exclusão</strong>'
            : `a alteração de status para <strong>${req.novoStatusManual === 'atrasado' ? 'Em Atraso' : 'Em Dia'}</strong>`;

          abrirConfirmacao({
            titulo: 'Confirmar Aprovação',
            mensagem: `Deseja aprovar ${descSolicitacao} do cliente <strong>"${escaparHtml(req.clienteNome)}"</strong> solicitada por <strong>${escaparHtml(req.solicitanteNome)}</strong>?`,
            textoBotao: '✓ Confirmar Aprovação',
            corBotao: '#059669',
            onConfirm: () => {
              if (req.acao === 'exclusao') {
                Store.removeItem('clientes', req.clienteId);
                feedbackMensagem = {
                  tipo: 'sucesso',
                  texto: `Exclusão do cliente "${req.clienteNome}" aprovada e executada.`
                };
              } else if (req.acao === 'status_atraso') {
                Store.updateItem('clientes', req.clienteId, {
                  statusManual: req.novoStatusManual || 'atrasado'
                });
                feedbackMensagem = {
                  tipo: 'sucesso',
                  texto: `Alteração de status de "${req.clienteNome}" aprovada e aplicada.`
                };
              }

              atualizarStatusPendencia(reqId, 'aprovada');
              if (refreshCallback) refreshCallback();
            }
          });
        });
      });

      document.querySelectorAll('[data-reject-req]').forEach(btn => {
        btn.addEventListener('click', () => {
          const reqId = btn.dataset.rejectReq;
          const pendencias = obterPendenciasClientes();
          const req = pendencias.find(p => p.id === reqId);
          if (!req) return;

          abrirConfirmacao({
            titulo: 'Confirmar Rejeição',
            mensagem: `Deseja rejeitar a solicitação referente ao cliente <strong>"${escaparHtml(req.clienteNome)}"</strong> enviada por <strong>${escaparHtml(req.solicitanteNome)}</strong>?`,
            textoBotao: '✕ Confirmar Rejeição',
            corBotao: '#dc2626',
            onConfirm: () => {
              atualizarStatusPendencia(reqId, 'rejeitada');
              feedbackMensagem = {
                tipo: 'aviso',
                texto: `Solicitação referente a "${req.clienteNome}" foi rejeitada.`
              };
              if (refreshCallback) refreshCallback();
            }
          });
        });
      });
    }
  }
};