import { Store } from '../store.js';

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

// Estado dos filtros da Equipe Cadastrada
let filtroBuscaUsuario = '';
let filtroPerfilUsuario = 'todos'; // 'todos' | 'admin' | 'vendedor'

function filtrarUsuariosLista(usuarios) {
  const termo = normalizarTextoBusca(filtroBuscaUsuario);

  return (usuarios || []).filter(u => {
    const nomeNorm = normalizarTextoBusca(u.nome);
    const usuarioNorm = normalizarTextoBusca(u.usuario);

    if (termo && !nomeNorm.includes(termo) && !usuarioNorm.includes(termo)) {
      return false;
    }

    if (filtroPerfilUsuario !== 'todos' && u.perfil !== filtroPerfilUsuario) {
      return false;
    }

    return true;
  });
}

function gerarLinhasTabelaUsuarios(usuariosFiltrados, totalUsuarios, currentUser) {
  if (totalUsuarios === 0) {
    return `<tr><td colspan="4" style="text-align: center; color: #64748b; padding: 1.5rem;">Nenhum usuário cadastrado.</td></tr>`;
  }

  if (usuariosFiltrados.length === 0) {
    return `<tr><td colspan="4" style="text-align: center; color: #64748b; padding: 1.5rem;">Nenhum usuário encontrado com os filtros aplicados.</td></tr>`;
  }

  return usuariosFiltrados.map(u => {
    const isAdmin = u.perfil === 'admin';
    const badgeClass = isAdmin ? 'role-admin' : 'role-vendedor';
    const roleLabel = isAdmin ? 'Administrador' : 'Vendedor';
    const podeExcluir = currentUser && u.id !== currentUser.id && u.usuario !== 'admin';

    return `
      <tr>
        <td><strong>${escaparHtml(u.nome)}</strong></td>
        <td>${escaparHtml(u.usuario)}</td>
        <td><span class="role-badge ${badgeClass}">${roleLabel}</span></td>
        <td style="white-space: nowrap;">
          <div style="display: inline-flex; align-items: center; gap: 0.4rem;">
            <button
              type="button"
              data-edit-user-id="${u.id}"
              style="padding: 0.3rem 0.6rem; font-size: 0.78rem; font-weight: 600; border-radius: 6px; border: 1px solid #bfdbfe; background: #eff6ff; color: #1d4ed8; cursor: pointer;"
            >
              Editar
            </button>
            ${podeExcluir
              ? `<button type="button" class="btn-danger-sm" data-delete-id="${u.id}">Remover</button>`
              : `<span style="color: #94a3b8; font-size: 0.8rem;">Protegido</span>`}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

export const UsuariosModule = {
  render() {
    const usuarios = Store.getCollection('usuarios') || [];
    const currentUser = Store.getCurrentUser();

    const usuariosFiltrados = filtrarUsuariosLista(usuarios);
    const temFiltroAtivo = Boolean(filtroBuscaUsuario.trim() || filtroPerfilUsuario !== 'todos');
    const linhasTabela = gerarLinhasTabelaUsuarios(usuariosFiltrados, usuarios.length, currentUser);

    return `
      <div class="card">
        <h3 style="margin-bottom: 1rem;">Cadastrar Novo Usuário</h3>
        <div id="user-form-msg" class="error-msg hidden"></div>

        <form id="new-user-form" class="form-grid">
          <div class="form-group" style="margin-bottom: 0;">
            <label for="u-nome">Nome Completo</label>
            <input type="text" id="u-nome" placeholder="Ex: Carlos Silva" required>
          </div>

          <div class="form-group" style="margin-bottom: 0;">
            <label for="u-login">Login de Acesso</label>
            <input type="text" id="u-login" placeholder="Ex: carlos" required>
          </div>

          <div class="form-group" style="margin-bottom: 0;">
            <label for="u-senha">Senha</label>
            <input type="password" id="u-senha" placeholder="••••••" required>
          </div>

          <div class="form-group" style="margin-bottom: 0;">
            <label for="u-perfil">Nível de Acesso</label>
            <select id="u-perfil">
              <option value="vendedor">Vendedor</option>
              <option value="admin">Administrador</option>
            </select>
          </div>

          <button type="submit" class="btn-primary" style="margin-top: 0;">+ Criar Acesso</button>
        </form>
      </div>

      <div class="card">
        <div class="toolbar-row" style="margin-bottom: 0.75rem;">
          <h3 id="user-list-title" style="margin: 0;">
            Equipe Cadastrada (${temFiltroAtivo ? `${usuariosFiltrados.length} de ${usuarios.length}` : usuarios.length})
          </h3>
          <button
            type="button"
            id="btn-clear-user-filters"
            class="btn-secondary ${temFiltroAtivo ? '' : 'hidden'}"
            style="padding: 0.35rem 0.75rem; font-size: 0.8rem;">
            ✕ Limpar filtros
          </button>
        </div>

        <!-- Filtro de Pesquisa -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.65rem; margin-bottom: 1rem;">
          <div class="form-group" style="margin-bottom: 0;">
            <input
              type="search"
              id="user-search-input"
              value="${escaparHtml(filtroBuscaUsuario)}"
              placeholder="🔍 Buscar por nome ou usuário...">
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <select id="user-filter-perfil">
              <option value="todos" ${filtroPerfilUsuario === 'todos' ? 'selected' : ''}>Todas as permissões</option>
              <option value="admin" ${filtroPerfilUsuario === 'admin' ? 'selected' : ''}>Administrador</option>
              <option value="vendedor" ${filtroPerfilUsuario === 'vendedor' ? 'selected' : ''}>Vendedor</option>
            </select>
          </div>
        </div>

        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Usuário</th>
                <th>Permissão</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody id="user-table-body">
              ${linhasTabela}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Pop-up de Edição de Usuário -->
      <div id="edit-user-modal" class="modal-overlay hidden">
        <div class="modal-box" style="max-width: 460px; width: 95%; border-top: 5px solid #2563eb;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.75rem; margin-bottom: 0.85rem;">
            <div>
              <h3 style="margin: 0; color: #1e3a8a;">Editar Usuário</h3>
              <p id="edit-user-subtitle" style="font-size: 0.82rem; color: #64748b; margin: 0.2rem 0 0 0;">
                Atualize os dados de acesso da equipe
              </p>
            </div>
            <button type="button" id="btn-close-edit-user-x" class="btn-secondary" style="padding: 0.35rem 0.7rem;">✕</button>
          </div>

          <div id="edit-user-error" class="error-msg hidden" style="margin-bottom: 0.85rem;"></div>

          <form id="edit-user-form">
            <input type="hidden" id="edit-u-id">

            <div class="form-group">
              <label for="edit-u-nome">Nome Completo *</label>
              <input type="text" id="edit-u-nome" required>
            </div>

            <div class="form-group">
              <label for="edit-u-login">Login de Acesso *</label>
              <input type="text" id="edit-u-login" required>
            </div>

            <div class="form-group">
              <label for="edit-u-senha">Nova Senha <span style="font-weight: 400; color: #64748b;">(deixe em branco para manter a atual)</span></label>
              <input type="password" id="edit-u-senha" placeholder="••••••" autocomplete="new-password">
            </div>

            <div class="form-group">
              <label for="edit-u-perfil">Nível de Acesso</label>
              <select id="edit-u-perfil">
                <option value="vendedor">Vendedor</option>
                <option value="admin">Administrador</option>
              </select>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 0.65rem; margin-top: 1.1rem;">
              <button type="button" id="btn-cancel-edit-user" class="btn-secondary">Cancelar</button>
              <button type="submit" class="btn-primary" style="margin-top: 0; width: auto;">✓ Salvar Alterações</button>
            </div>
          </form>
        </div>
      </div>
    `;
  },

  init(refreshCallback) {
    const form = document.getElementById('new-user-form');
    const msgBox = document.getElementById('user-form-msg');

    // Elementos do Modal de Edição
    const modalEdit = document.getElementById('edit-user-modal');
    const formEdit = document.getElementById('edit-user-form');
    const erroEdit = document.getElementById('edit-user-error');
    const subtitleEdit = document.getElementById('edit-user-subtitle');
    const inpEditId = document.getElementById('edit-u-id');
    const inpEditNome = document.getElementById('edit-u-nome');
    const inpEditLogin = document.getElementById('edit-u-login');
    const inpEditSenha = document.getElementById('edit-u-senha');
    const selEditPerfil = document.getElementById('edit-u-perfil');
    const btnCloseEditX = document.getElementById('btn-close-edit-user-x');
    const btnCancelEdit = document.getElementById('btn-cancel-edit-user');

    const fecharModalEdicao = () => {
      if (erroEdit) erroEdit.classList.add('hidden');
      if (formEdit) formEdit.reset();
      if (modalEdit) modalEdit.classList.add('hidden');
    };

    const abrirModalEdicao = (usuarioId) => {
      const usuarios = Store.getCollection('usuarios') || [];
      const usuarioAlvo = usuarios.find(u => String(u.id) === String(usuarioId));
      if (!usuarioAlvo || !modalEdit) return;

      const currentUser = Store.getCurrentUser();
      const isAdminPrincipal = usuarioAlvo.usuario === 'admin';
      const isProprioUsuario = currentUser && String(usuarioAlvo.id) === String(currentUser.id);

      if (erroEdit) erroEdit.classList.add('hidden');
      if (inpEditId) inpEditId.value = usuarioAlvo.id;
      if (inpEditNome) inpEditNome.value = usuarioAlvo.nome || '';
      if (inpEditLogin) {
        inpEditLogin.value = usuarioAlvo.usuario || '';
        inpEditLogin.disabled = isAdminPrincipal;
      }
      if (inpEditSenha) inpEditSenha.value = '';
      if (selEditPerfil) {
        selEditPerfil.value = usuarioAlvo.perfil || 'vendedor';
        selEditPerfil.disabled = isAdminPrincipal || isProprioUsuario;
      }
      if (subtitleEdit) {
        subtitleEdit.textContent = `Editando acesso de ${usuarioAlvo.nome} (@${usuarioAlvo.usuario})`;
      }

      modalEdit.classList.remove('hidden');
      if (inpEditNome) setTimeout(() => inpEditNome.focus(), 50);
    };

    if (btnCloseEditX) btnCloseEditX.addEventListener('click', fecharModalEdicao);
    if (btnCancelEdit) btnCancelEdit.addEventListener('click', fecharModalEdicao);
    if (modalEdit) {
      modalEdit.addEventListener('click', (e) => {
        if (e.target === modalEdit) fecharModalEdicao();
      });
    }

    if (formEdit) {
      formEdit.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = inpEditId.value;
        const nome = inpEditNome.value.trim();
        const loginNovo = inpEditLogin.value.trim().toLowerCase();
        const novaSenha = inpEditSenha.value;
        const perfilNovo = selEditPerfil.value;

        if (!nome || !loginNovo) {
          erroEdit.textContent = 'Preencha o nome completo e o login de acesso.';
          erroEdit.classList.remove('hidden');
          return;
        }

        const usuarios = Store.getCollection('usuarios') || [];
        const usuarioOriginal = usuarios.find(u => String(u.id) === String(id));
        if (!usuarioOriginal) return;

        const loginDuplicado = usuarios.some(
          u => String(u.id) !== String(id) && String(u.usuario || '').toLowerCase() === loginNovo
        );
        if (loginDuplicado) {
          erroEdit.textContent = 'Este login de usuário já está em uso por outro cadastro.';
          erroEdit.classList.remove('hidden');
          return;
        }

        const updates = {
          nome,
          usuario: usuarioOriginal.usuario === 'admin' ? 'admin' : loginNovo,
          perfil: usuarioOriginal.usuario === 'admin' ? 'admin' : perfilNovo
        };

        if (novaSenha && novaSenha.trim().length > 0) {
          updates.senha = novaSenha;
          updates.password = novaSenha;
        }

        Store.updateItem('usuarios', usuarioOriginal.id, updates);

        // Mantém a sessão sincronizada se o administrador editou o próprio cadastro
        const currentUser = Store.getCurrentUser();
        if (currentUser && String(currentUser.id) === String(usuarioOriginal.id) && typeof Store.login === 'function') {
          const senhaSessao = updates.senha || usuarioOriginal.senha;
          try {
            Store.login(updates.usuario, senhaSessao);
          } catch (err) {}
        }

        fecharModalEdicao();
        if (refreshCallback) refreshCallback();
      });
    }

    const vincularAcoesTabelaUsuarios = () => {
      document.querySelectorAll('[data-edit-user-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          abrirModalEdicao(btn.dataset.editUserId);
        });
      });

      document.querySelectorAll('[data-delete-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.deleteId;
          Store.removeItem('usuarios', id);
          if (refreshCallback) refreshCallback();
        });
      });
    };

    const aplicarFiltrosUsuariosEmTempoReal = () => {
      const usuarios = Store.getCollection('usuarios') || [];
      const currentUser = Store.getCurrentUser();
      const usuariosFiltrados = filtrarUsuariosLista(usuarios);
      const temFiltroAtivo = Boolean(filtroBuscaUsuario.trim() || filtroPerfilUsuario !== 'todos');

      const tbody = document.getElementById('user-table-body');
      const titleEl = document.getElementById('user-list-title');
      const btnClear = document.getElementById('btn-clear-user-filters');

      if (tbody) {
        tbody.innerHTML = gerarLinhasTabelaUsuarios(usuariosFiltrados, usuarios.length, currentUser);
        vincularAcoesTabelaUsuarios();
      }

      if (titleEl) {
        titleEl.textContent = `Equipe Cadastrada (${temFiltroAtivo ? `${usuariosFiltrados.length} de ${usuarios.length}` : usuarios.length})`;
      }

      if (btnClear) {
        btnClear.classList.toggle('hidden', !temFiltroAtivo);
      }
    };

    const inpBusca = document.getElementById('user-search-input');
    const selPerfil = document.getElementById('user-filter-perfil');
    const btnClear = document.getElementById('btn-clear-user-filters');

    if (inpBusca) {
      inpBusca.addEventListener('input', () => {
        filtroBuscaUsuario = inpBusca.value;
        aplicarFiltrosUsuariosEmTempoReal();
      });
    }

    if (selPerfil) {
      selPerfil.addEventListener('change', () => {
        filtroPerfilUsuario = selPerfil.value;
        aplicarFiltrosUsuariosEmTempoReal();
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        filtroBuscaUsuario = '';
        filtroPerfilUsuario = 'todos';
        if (inpBusca) inpBusca.value = '';
        if (selPerfil) selPerfil.value = 'todos';
        aplicarFiltrosUsuariosEmTempoReal();
      });
    }

    vincularAcoesTabelaUsuarios();

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const nome = document.getElementById('u-nome').value.trim();
        const usuario = document.getElementById('u-login').value.trim().toLowerCase();
        const senha = document.getElementById('u-senha').value;
        const perfil = document.getElementById('u-perfil').value;

        const existentes = Store.getCollection('usuarios') || [];
        if (existentes.some(u => u.usuario.toLowerCase() === usuario)) {
          msgBox.textContent = 'Este login de usuário já existe. Escolha outro.';
          msgBox.classList.remove('hidden');
          return;
        }

        Store.addItem('usuarios', { nome, usuario, senha, perfil });
        if (refreshCallback) refreshCallback();
      });
    }
  }
};