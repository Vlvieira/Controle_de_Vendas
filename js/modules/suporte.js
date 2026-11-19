import { Store } from '../store.js';

const INFO_SISTEMA = {
  nomeAplicacao: 'Sistema de Gestão de Vendas e Estoque',
  criador: 'Victor Luiz Vieira',
  versao: 'v1.4.0',
  dataAtualizacao: '19/11/2026',
  whatsappSuporte: '+55 61 98170-6483', // Formato DDI + DDD + Número (apenas dígitos)
  whatsappExibicao: '(61) 98170-6483',
  emailSuporte: 'VictorluizVieira@gmail.com',
  horarioAtendimento: 'Segunda a Sexta, das 08h às 18h'
};

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

export const SuporteModule = {
  render() {
    const currentUser = Store.getCurrentUser();
    const isAdmin = currentUser?.perfil === 'admin';
    const chamados = Store.getCollection('chamados_suporte') || [];

    const chamadosExibidos = isAdmin
      ? chamados
      : chamados.filter(c => String(c.usuarioId) === String(currentUser?.id));

    const mensagemWhatsApp = encodeURIComponent(
      `Olá ${INFO_SISTEMA.criador}! Preciso de suporte no ${INFO_SISTEMA.nomeAplicacao} (${INFO_SISTEMA.versao}). Usuário: ${currentUser?.nome || 'Não identificado'}.`
    );
    const linkWhatsApp = `https://wa.me/${INFO_SISTEMA.whatsappSuporte}?text=${mensagemWhatsApp}`;

    const linhasChamados = chamadosExibidos.length === 0
      ? `<tr><td colspan="${isAdmin ? 5 : 4}" style="text-align: center; color: #64748b; padding: 1.25rem;">Nenhum chamado registrado até o momento.</td></tr>`
      : [...chamadosExibidos].reverse().map(c => {
          const isResolvido = c.status === 'Resolvido';
          const badgeStyle = isResolvido
            ? 'background: #dcfce7; color: #166534; font-weight: 700;'
            : 'background: #fef3c7; color: #92400e; font-weight: 700;';

          return `
            <tr>
              <td>
                <strong>#${String(c.id).slice(-4)}</strong><br>
                <span style="font-size: 0.78rem; color: #64748b;">${escaparHtml(c.data)}</span>
              </td>
              <td>
                <strong>${escaparHtml(c.assunto)}</strong>
                <div style="font-size: 0.82rem; color: #475569; margin-top: 0.15rem;">${escaparHtml(c.descricao)}</div>
              </td>
              <td>${escaparHtml(c.usuarioNome || '-')}</td>
              <td>
                <span class="status-badge" style="${badgeStyle}">
                  ${isResolvido ? '✅ Resolvido' : '⏳ Aberto'}
                </span>
              </td>
              ${isAdmin ? `
                <td>
                  <button
                    type="button"
                    class="${isResolvido ? 'btn-secondary' : 'btn-edit-sm'}"
                    data-toggle-ticket="${c.id}"
                    style="padding: 0.35rem 0.65rem; font-size: 0.78rem;"
                  >
                    ${isResolvido ? 'Reabrir' : 'Concluir'}
                  </button>
                </td>
              ` : ''}
            </tr>
          `;
        }).join('');

    return `
      <div class="grid-cards" style="margin-bottom: 1.25rem;">
        <div class="card metric-card" style="margin-bottom: 0; border-left: 4px solid #2563eb;">
          <span class="metric-label">Criado por</span>
          <strong class="metric-value" style="font-size: 1.25rem;">${escaparHtml(INFO_SISTEMA.criador)}</strong>
          <span class="metric-sub">${escaparHtml(INFO_SISTEMA.emailSuporte)}</span>
        </div>

        <div class="card metric-card" style="margin-bottom: 0; border-left: 4px solid #10b981;">
          <span class="metric-label">Versão do Sistema</span>
          <strong class="metric-value" style="color: #059669;">${escaparHtml(INFO_SISTEMA.versao)}</strong>
          <span class="metric-sub">Atualizado em ${escaparHtml(INFO_SISTEMA.dataAtualizacao)}</span>
        </div>

        <div class="card metric-card" style="margin-bottom: 0; border-left: 4px solid #8b5cf6;">
          <span class="metric-label">Sessão Atual</span>
          <strong class="metric-value" style="font-size: 1.25rem;">${escaparHtml(currentUser?.nome || '-')}</strong>
          <span class="metric-sub">Perfil: ${isAdmin ? 'Administrador' : 'Vendedor'}</span>
        </div>
      </div>

      <div class="dashboard-split" style="margin-bottom: 1.25rem;">
        <div class="card" style="margin-bottom: 0;">
          <h3 style="margin-bottom: 0.85rem;">📞 Canais de Atendimento e Suporte</h3>
          <p style="font-size: 0.88rem; color: #64748b; margin-bottom: 1rem;">
            Precisa de ajuda técnica, treinamento ou deseja solicitar novas funcionalidades? Entre em contato pelos canais abaixo:
          </p>

          <div style="display: flex; flex-direction: column; gap: 0.7rem; margin-bottom: 1.1rem;">
            <div style="background: #f8fafc; border: 1px solid var(--border); border-radius: 10px; padding: 0.75rem 0.9rem;">
              <span style="font-size: 0.76rem; color: #64748b; display: block;">Desenvolvedor / Responsável</span>
              <strong>${escaparHtml(INFO_SISTEMA.criador)}</strong>
            </div>

            <div style="background: #f8fafc; border: 1px solid var(--border); border-radius: 10px; padding: 0.75rem 0.9rem;">
              <span style="font-size: 0.76rem; color: #64748b; display: block;">E-mail de Suporte</span>
              <strong>${escaparHtml(INFO_SISTEMA.emailSuporte)}</strong>
            </div>

            <div style="background: #f8fafc; border: 1px solid var(--border); border-radius: 10px; padding: 0.75rem 0.9rem;">
              <span style="font-size: 0.76rem; color: #64748b; display: block;">WhatsApp Suporte</span>
              <strong>${escaparHtml(INFO_SISTEMA.whatsappExibicao)}</strong>
            </div>

            <div style="background: #f8fafc; border: 1px solid var(--border); border-radius: 10px; padding: 0.75rem 0.9rem;">
              <span style="font-size: 0.76rem; color: #64748b; display: block;">Horário de Atendimento</span>
              <strong>${escaparHtml(INFO_SISTEMA.horarioAtendimento)}</strong>
            </div>
          </div>

          <div style="display: flex; flex-wrap: wrap; gap: 0.65rem;">
            <a
              href="mailto:${escaparHtml(INFO_SISTEMA.emailSuporte)}?subject=${encodeURIComponent(`Suporte - ${INFO_SISTEMA.nomeAplicacao} (${INFO_SISTEMA.versao})`)}"
              class="btn-primary"
              style="text-decoration: none; text-align: center; flex: 1; min-width: 180px; display: flex; align-items: center; justify-content: center;"
            >
              ✉️ Enviar E-mail
            </a>
            <a
              href="${linkWhatsApp}"
              target="_blank"
              rel="noopener noreferrer"
              class="btn-secondary"
              style="text-decoration: none; text-align: center; flex: 1; min-width: 160px; display: flex; align-items: center; justify-content: center;"
            >
              💬 Falar no WhatsApp
            </a>
          </div>
        </div>

        <div class="card" style="margin-bottom: 0;">
          <h3 style="margin-bottom: 0.85rem;">📝 Abrir Solicitação Interna</h3>
          <div id="support-feedback-msg" class="hidden" style="margin-bottom: 0.75rem; padding: 0.65rem 0.85rem; border-radius: 8px; font-size: 0.86rem;"></div>

          <form id="support-ticket-form" style="display: flex; flex-direction: column; gap: 0.85rem;">
            <div class="form-group" style="margin-bottom: 0;">
              <label for="sup-assunto" style="display: block; margin-bottom: 0.35rem;">Tipo / Assunto *</label>
              <select
                id="sup-assunto"
                required
                style="width: 100%; height: 42px; padding: 0 0.75rem; border: 1px solid var(--border); border-radius: 8px; font-size: 0.92rem; box-sizing: border-box; background-color: #fff;"
              >
                <option value="Dúvida de Operação">Dúvida de Operação</option>
                <option value="Relatar Erro / Problema">Relatar Erro / Problema</option>
                <option value="Sugestão de Melhoria">Sugestão de Melhoria</option>
                <option value="Ajuste de Cadastro / Permissão">Ajuste de Cadastro / Permissão</option>
              </select>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label for="sup-descricao" style="display: block; margin-bottom: 0.35rem;">Descrição Detalhada *</label>
              <textarea
                id="sup-descricao"
                rows="4"
                required
                placeholder="Descreva o que aconteceu ou o que você precisa..."
                style="width: 100%; padding: 0.65rem 0.75rem; border: 1px solid var(--border); border-radius: 8px; font-size: 0.92rem; box-sizing: border-box; font-family: inherit; resize: vertical;"
              ></textarea>
            </div>

            <button type="submit" class="btn-primary" style="width: 100%; height: 42px; margin-top: 0.15rem;">
              + Registrar Solicitação
            </button>
          </form>
        </div>
      </div>

      <div class="card" style="margin-bottom: 1.25rem;">
        <h3 style="margin-bottom: 0.85rem;">📋 Solicitações de Suporte Registradas (${chamadosExibidos.length})</h3>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Protocolo / Data</th>
                <th>Assunto e Descrição</th>
                <th>Solicitante</th>
                <th>Status</th>
                ${isAdmin ? '<th>Ação</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${linhasChamados}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card" style="margin-bottom: 0;">
        <h3 style="margin-bottom: 0.75rem;">🚀 Notas da Versão (${escaparHtml(INFO_SISTEMA.versao)})</h3>
        <ul style="margin: 0; padding-left: 1.25rem; color: #334155; font-size: 0.88rem; line-height: 1.65;">
          <li><strong>Dashboard:</strong> Visualização resumida dos 3 últimos pedidos por status, modal com os 10 mais recentes e atalho direto para o Histórico de Vendas.</li>
          <li><strong>Fluxo de Pedidos:</strong> Novos pedidos iniciam automaticamente em <em>Em separação</em> com transições guiadas (Separação → Entrega → Aguardando Pagamento → Finalizado).</li>
          <li><strong>Histórico de Vendas:</strong> Linha do tempo cronológica ao clicar no número do pedido (<code>#XXXX</code>) e confirmação antes de estornar vendas.</li>
        </ul>
      </div>
    `;
  },

  init(refreshCallback) {
    const currentUser = Store.getCurrentUser();
    const isAdmin = currentUser?.perfil === 'admin';
    const form = document.getElementById('support-ticket-form');
    const feedback = document.getElementById('support-feedback-msg');

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const assunto = document.getElementById('sup-assunto').value;
        const descricao = document.getElementById('sup-descricao').value.trim();

        if (!descricao) return;

        Store.addItem('chamados_suporte', {
          data: obterDataHoraAtualBR(),
          assunto,
          descricao,
          status: 'Aberto',
          usuarioId: currentUser?.id || '',
          usuarioNome: currentUser?.nome || 'Usuário'
        });

        if (feedback) {
          feedback.textContent = 'Solicitação registrada com sucesso!';
          feedback.style.background = '#dcfce7';
          feedback.style.color = '#166534';
          feedback.style.border = '1px solid #86efac';
          feedback.classList.remove('hidden');
        }

        if (refreshCallback) refreshCallback();
      });
    }

    if (isAdmin) {
      document.querySelectorAll('[data-toggle-ticket]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.toggleTicket;
          const chamado = (Store.getCollection('chamados_suporte') || []).find(c => String(c.id) === String(id));
          if (!chamado) return;

          const novoStatus = chamado.status === 'Resolvido' ? 'Aberto' : 'Resolvido';
          Store.updateItem('chamados_suporte', chamado.id, { status: novoStatus });
          if (refreshCallback) refreshCallback();
        });
      });
    }
  }
};