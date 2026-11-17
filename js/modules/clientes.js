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

export const ClientesModule = {
  render() {
    const currentUser = Store.getCurrentUser();
    const isAdmin = verificarIsAdmin(currentUser);
    const clientes = Store.getCollection('clientes') || [];
    const vendas = Store.getCollection('vendas') || [];
    const pendencias = obterPendenciasClientes();
    const pendenciasAbertas = pendencias.filter(p => p.status === 'pendente');

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
                            <td><strong>${p.solicitanteNome}</strong></td>
                            <td>
                              <strong>${p.clienteNome}</strong>
                              ${p.clienteTelefone ? `<div style="font-size: 0.78rem; color: #64748b;">${p.clienteTelefone}</div>` : ''}
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

    const linhasClientes = clientes.length === 0
      ? `<tr><td colspan="5" style="text-align: center; color: #64748b; padding: 1.5rem;">Nenhum cliente cadastrado.</td></tr>`
      : clientes.map(c => {
          const emAtraso = verificarClienteEmAtraso(c, vendas);
          const reqsCliente = pendenciasAbertas.filter(p => p.clienteId === c.id);
          const temReqAtraso = reqsCliente.some(p => p.acao === 'status_atraso');
          const temReqExclusao = reqsCliente.some(p => p.acao === 'exclusao');

          const badgePendenciaHtml = !isAdmin && reqsCliente.length > 0
            ? `<div style="margin-top: 0.3rem;">
                <span style="display: inline-block; font-size: 0.72rem; font-weight: 600; padding: 0.15rem 0.5rem; border-radius: 999px; background: #fef3c7; color: #92400e;">
                  ⏳ Aguardando aprovação (${reqsCliente.map(r => r.acao === 'exclusao' ? 'Exclusão' : 'Status').join(', ')})
                </span>
               </div>`
            : '';

          const textoBtnStatus = emAtraso ? 'Marcar em Dia' : 'Marcar em Atraso';

          return `
            <tr style="${emAtraso ? 'background-color: #fef2f2;' : ''}">
              <td>
                <strong>${c.nome}</strong>
                ${badgePendenciaHtml}
              </td>
              <td>${c.telefone || '-'}</td>
              <td>${c.documento || c.cpfCnpj || '-'}</td>
              <td>
                <span class="badge ${emAtraso ? 'badge-danger' : 'badge-success'}">
                  ${emAtraso ? '⚠️ Em Atraso' : '✅ Em Dia'}
                </span>
              </td>
              <td style="white-space: nowrap;">
                <button
                  type="button"
                  data-toggle-overdue="${c.id}"
                  ${!isAdmin && temReqAtraso ? 'disabled' : ''}
                  style="padding: 0.35rem 0.65rem; font-size: 0.78rem; font-weight: 600; border-radius: 6px; border: 1px solid ${emAtraso ? '#bbf7d0' : '#fecaca'}; background: ${emAtraso ? '#f0fdf4' : '#fef2f2'}; color: ${emAtraso ? '#166534' : '#b91c1c'}; cursor: ${!isAdmin && temReqAtraso ? 'not-allowed' : 'pointer'}; opacity: ${!isAdmin && temReqAtraso ? '0.6' : '1'}; margin-right: 0.35rem;">
                  ${!isAdmin && temReqAtraso ? 'Solicitado...' : textoBtnStatus}
                </button>
                <button
                  type="button"
                  class="btn-danger-sm"
                  data-delete-client="${c.id}"
                  ${!isAdmin && temReqExclusao ? 'disabled style="opacity: 0.6; cursor: not-allowed;"' : ''}>
                  ${!isAdmin && temReqExclusao ? 'Exclusão Pendente' : 'Excluir'}
                </button>
              </td>
            </tr>
          `;
        }).join('');

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
          <h3 style="margin-bottom: 1rem;">Carteira de Clientes (${clientes.length})</h3>
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
              <tbody>
                ${linhasClientes}
              </tbody>
            </table>
          </div>
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

    // 2) Marcar / Desmarcar em Atraso (com confirmação)
    document.querySelectorAll('[data-toggle-overdue]').forEach(btn => {
      btn.addEventListener('click', () => {
        const clientId = btn.dataset.toggleOverdue;
        const cliente = (Store.getCollection('clientes') || []).find(c => c.id === clientId);
        if (!cliente) return;

        const vendas = Store.getCollection('vendas') || [];
        const atualmenteEmAtraso = verificarClienteEmAtraso(cliente, vendas);
        const novoStatusManual = atualmenteEmAtraso ? 'em_dia' : 'atrasado';
        const acaoTexto = novoStatusManual === 'atrasado' ? 'Marcar em Atraso' : 'Marcar em Dia';

        const mensagemConfirmacao = isAdmin
          ? `Deseja realmente <strong>${acaoTexto.toLowerCase()}</strong> o cliente <strong>"${cliente.nome}"</strong>?`
          : `Deseja enviar uma solicitação ao administrador para <strong>${acaoTexto.toLowerCase()}</strong> o cliente <strong>"${cliente.nome}"</strong>?`;

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
    });

    // 3) Excluir Cliente (com confirmação)
    document.querySelectorAll('[data-delete-client]').forEach(btn => {
      btn.addEventListener('click', () => {
        const clientId = btn.dataset.deleteClient;
        const cliente = (Store.getCollection('clientes') || []).find(c => c.id === clientId);
        if (!cliente) return;

        const mensagemConfirmacao = isAdmin
          ? `Tem certeza que deseja excluir permanentemente o cliente <strong>"${cliente.nome}"</strong>? Esta ação não poderá ser desfeita.`
          : `Deseja enviar uma solicitação de exclusão do cliente <strong>"${cliente.nome}"</strong> para aprovação do administrador?`;

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
    });

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
            mensagem: `Deseja aprovar ${descSolicitacao} do cliente <strong>"${req.clienteNome}"</strong> solicitada por <strong>${req.solicitanteNome}</strong>?`,
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
            mensagem: `Deseja rejeitar a solicitação referente ao cliente <strong>"${req.clienteNome}"</strong> enviada por <strong>${req.solicitanteNome}</strong>?`,
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