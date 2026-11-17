import { Store } from '../store.js';

export const LoginModule = {
  render() {
    return `
      <div class="login-card">
        <div class="login-header">
          <h2>Gestão<span>Vendas</span></h2>
          <p>Acesse o sistema com suas credenciais</p>
        </div>

        <div id="login-error" class="error-msg hidden">Usuário ou senha inválidos.</div>

        <form id="login-form">
          <div class="form-group">
            <label for="login-user">Usuário</label>
            <input type="text" id="login-user" placeholder="Ex: admin" required autocomplete="username">
          </div>

          <div class="form-group">
            <label for="login-pass">Senha</label>
            <input type="password" id="login-pass" placeholder="••••••" required autocomplete="current-password">
          </div>

          <button type="submit" class="btn-primary">Entrar no Sistema</button>
        </form>

        <p style="text-align: center; font-size: 0.78rem; color: #94a3b8; margin-top: 1.25rem;">
          Acesso padrão: <strong>admin</strong> / Senha: <strong>123</strong>
        </p>
      </div>
    `;
  },

  init(onSuccess) {
    const form = document.getElementById('login-form');
    const errorBox = document.getElementById('login-error');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const user = document.getElementById('login-user').value.trim();
      const pass = document.getElementById('login-pass').value;

      const loggedUser = Store.login(user, pass);

      if (loggedUser) {
        errorBox.classList.add('hidden');
        onSuccess(loggedUser);
      } else {
        errorBox.classList.remove('hidden');
      }
    });
  }
};
