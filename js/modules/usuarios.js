import { Store } from '../store.js';

export const UsuariosModule = {
  render() {
    const usuarios = Store.getCollection('usuarios');
    const currentUser = Store.getCurrentUser();

    const linhasTabela = usuarios.map(u => {
      const isAdmin = u.perfil === 'admin';
      const badgeClass = isAdmin ? 'role-admin' : 'role-vendedor';
      const roleLabel = isAdmin ? 'Administrador' : 'Vendedor';
      const podeExcluir = u.id !== currentUser.id && u.usuario !== 'admin';

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
        <h3 style="margin-bottom: 0.75rem;">Equipe Cadastrada (${usuarios.length})</h3>
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
            <tbody>
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

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const nome = document.getElementById('u-nome').value.trim();
      const usuario = document.getElementById('u-login').value.trim().toLowerCase();
      const senha = document.getElementById('u-senha').value;
      const perfil = document.getElementById('u-perfil').value;

      const existentes = Store.getCollection('usuarios');
      if (existentes.some(u => u.usuario.toLowerCase() === usuario)) {
        msgBox.textContent = 'Este login de usuário já existe. Escolha outro.';
        msgBox.classList.remove('hidden');
        return;
      }

      Store.addItem('usuarios', { nome, usuario, senha, perfil });
      if (refreshCallback) refreshCallback();
    });

    document.querySelectorAll('[data-delete-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.deleteId;
        Store.removeItem('usuarios', id);
        if (refreshCallback) refreshCallback();
      });
    });
  }
};
