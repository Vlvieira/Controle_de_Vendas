import { Store } from '../store.js';

function escaparHtml(texto) {
  return String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function atualizarSenhaUsuarioNoStore(usuarioAlvo, novaSenha) {
  if (!usuarioAlvo) return null;

  const usuarioAtualizado = {
    ...usuarioAlvo,
    senha: novaSenha,
    password: novaSenha,
    primeiroAcessoConcluido: true
  };

  if (typeof Store.updateItem === 'function' && usuarioAlvo.id !== undefined) {
    try {
      Store.updateItem('usuarios', usuarioAlvo.id, {
        senha: novaSenha,
        password: novaSenha,
        primeiroAcessoConcluido: true
      });
    } catch (err) {}
  }

  // Garante compatibilidade caso a coleção de usuários tenha outro nome ou esteja direto no localStorage
  if (typeof Store.getCollection === 'function' && typeof Store.saveCollection === 'function') {
    ['usuarios', 'users'].forEach((chave) => {
      try {
        const lista = Store.getCollection(chave);
        if (Array.isArray(lista) && lista.length > 0) {
          const novaLista = lista.map((u) => {
            const mesmoId = usuarioAlvo.id !== undefined && String(u.id) === String(usuarioAlvo.id);
            const mesmoLogin =
              (u.usuario && usuarioAlvo.usuario && String(u.usuario).toLowerCase() === String(usuarioAlvo.usuario).toLowerCase()) ||
              (u.login && usuarioAlvo.login && String(u.login).toLowerCase() === String(usuarioAlvo.login).toLowerCase());

            if (mesmoId || mesmoLogin) {
              return {
                ...u,
                senha: novaSenha,
                password: novaSenha,
                primeiroAcessoConcluido: true
              };
            }
            return u;
          });
          Store.saveCollection(chave, novaLista);
        }
      } catch (err) {}
    });
  }

  return usuarioAtualizado;
}

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

      <!-- Pop-up Obrigatório de Alteração de Senha no Primeiro Acesso -->
      <div id="first-access-password-modal" class="modal-overlay hidden">
        <div class="modal-box" style="max-width: 440px; width: 95%; border-top: 5px solid #2563eb;">
          <div style="display: flex; align-items: center; gap: 0.65rem; margin-bottom: 0.75rem;">
            <span style="font-size: 1.65rem;">🔐</span>
            <div>
              <h3 style="margin: 0; color: #1e3a8a;">Primeiro Acesso Detectado</h3>
              <p id="first-access-user-subtitle" style="font-size: 0.82rem; color: #64748b; margin: 0.15rem 0 0 0;">
                Altere a senha padrão antes de continuar
              </p>
            </div>
          </div>

          <div style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; border-radius: 8px; padding: 0.7rem 0.85rem; font-size: 0.84rem; line-height: 1.45; margin-bottom: 1rem;">
            Por segurança, como você entrou usando a senha temporária <strong>1234</strong>, defina uma nova senha pessoal para acessar o sistema.
          </div>

          <div id="first-access-error" class="error-msg hidden" style="margin-bottom: 0.85rem;"></div>

          <form id="first-access-password-form">
            <div class="form-group">
              <label for="new-user-pass">Nova Senha *</label>
              <input
                type="password"
                id="new-user-pass"
                placeholder="Digite sua nova senha"
                minlength="4"
                required
                autocomplete="new-password"
              >
            </div>

            <div class="form-group">
              <label for="confirm-user-pass">Confirmar Nova Senha *</label>
              <input
                type="password"
                id="confirm-user-pass"
                placeholder="Repita a nova senha"
                minlength="4"
                required
                autocomplete="new-password"
              >
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 0.65rem; margin-top: 1rem;">
              <button type="button" id="btn-cancel-first-access" class="btn-secondary">Cancelar</button>
              <button type="submit" class="btn-primary" style="margin-top: 0; width: auto;">
                ✓ Salvar Senha e Entrar
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  },

  init(onSuccess) {
    const form = document.getElementById('login-form');
    const errorBox = document.getElementById('login-error');

    const modalPrimeiroAcesso = document.getElementById('first-access-password-modal');
    const modalSubtitulo = document.getElementById('first-access-user-subtitle');
    const formNovaSenha = document.getElementById('first-access-password-form');
    const erroNovaSenha = document.getElementById('first-access-error');
    const inpNovaSenha = document.getElementById('new-user-pass');
    const inpConfirmarSenha = document.getElementById('confirm-user-pass');
    const btnCancelarModal = document.getElementById('btn-cancel-first-access');

    let usuarioPendenteTroca = null;
    let loginDigitadoPendente = '';

    const exibirErroModal = (mensagem) => {
      if (!erroNovaSenha) return;
      erroNovaSenha.textContent = mensagem;
      erroNovaSenha.classList.remove('hidden');
    };

    const fecharModalPrimeiroAcesso = () => {
      usuarioPendenteTroca = null;
      loginDigitadoPendente = '';
      if (formNovaSenha) formNovaSenha.reset();
      if (erroNovaSenha) erroNovaSenha.classList.add('hidden');
      if (modalPrimeiroAcesso) modalPrimeiroAcesso.classList.add('hidden');

      if (typeof Store.logout === 'function') {
        try {
          Store.logout();
        } catch (err) {}
      }
    };

    if (btnCancelarModal) {
      btnCancelarModal.addEventListener('click', fecharModalPrimeiroAcesso);
    }

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const user = document.getElementById('login-user').value.trim();
        const pass = document.getElementById('login-pass').value;

        const loggedUser = Store.login(user, pass);

        if (loggedUser) {
          errorBox.classList.add('hidden');

          // Se acessou com a senha padrão "1234", exige a troca antes de liberar o painel
          if (pass === '1234' && modalPrimeiroAcesso) {
            usuarioPendenteTroca = loggedUser;
            loginDigitadoPendente = user;

            if (modalSubtitulo) {
              const nomeExibicao = loggedUser.nome || loggedUser.usuario || user;
              modalSubtitulo.innerHTML = `Olá, <strong>${escaparHtml(nomeExibicao)}</strong> — defina sua nova senha`;
            }

            if (erroNovaSenha) erroNovaSenha.classList.add('hidden');
            if (formNovaSenha) formNovaSenha.reset();
            modalPrimeiroAcesso.classList.remove('hidden');

            if (inpNovaSenha) {
              setTimeout(() => inpNovaSenha.focus(), 50);
            }
            return;
          }

          onSuccess(loggedUser);
        } else {
          errorBox.classList.remove('hidden');
        }
      });
    }

    if (formNovaSenha) {
      formNovaSenha.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!usuarioPendenteTroca) return;

        const novaSenha = inpNovaSenha ? inpNovaSenha.value.trim() : '';
        const confirmarSenha = inpConfirmarSenha ? inpConfirmarSenha.value.trim() : '';

        if (novaSenha.length < 4) {
          exibirErroModal('A nova senha deve ter pelo menos 4 caracteres.');
          return;
        }

        if (novaSenha === '1234') {
          exibirErroModal('A nova senha não pode ser "1234". Escolha uma senha diferente.');
          return;
        }

        if (novaSenha !== confirmarSenha) {
          exibirErroModal('A confirmação da senha não confere. Digite ambas iguais.');
          return;
        }

        const usuarioAtualizado = atualizarSenhaUsuarioNoStore(usuarioPendenteTroca, novaSenha);

        // Reautentica no Store com a nova senha para manter a sessão sincronizada
        let sessaoFinal = usuarioAtualizado;
        if (typeof Store.login === 'function') {
          const relogin = Store.login(loginDigitadoPendente, novaSenha);
          if (relogin) {
            sessaoFinal = relogin;
          }
        }

        const callbackFinal = onSuccess;
        usuarioPendenteTroca = null;
        loginDigitadoPendente = '';
        if (modalPrimeiroAcesso) modalPrimeiroAcesso.classList.add('hidden');

        callbackFinal(sessaoFinal);
      });
    }
  }
};