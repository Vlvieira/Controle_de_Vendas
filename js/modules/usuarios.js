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
        <td><strong>${u.nome}</strong></td>
        <td>${u.usuario}</td>
        <td><span class="role-badge ${badgeClass}">${roleLabel}</span></td>
        <td>
          ${podeExcluir 
            ? `<button class="btn-danger-sm" data-delete-id="${u.id}">Remover</button>` 
            : `<span style="color: #94a3b8; font-size: 0.8rem;">Protegido</span>`}
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
    `;
  },

  init(refreshCallback) {
    const form = document.getElementById('new-user-form');
    const msgBox = document.getElementById('user-form-msg');

    const vincularAcoesTabelaUsuarios = () => {
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