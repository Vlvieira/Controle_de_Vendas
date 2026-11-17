import { Store } from './store.js';
import { LoginModule } from './modules/login.js';
import { DashboardModule } from './modules/dashboard.js';
import { VendasModule } from './modules/vendas.js';
import { ProdutosModule } from './modules/produtos.js';
import { ClientesModule } from './modules/clientes.js';
import { UsuariosModule } from './modules/usuarios.js';

const modules = {
  dashboard: { title: 'Resumo Geral', instance: DashboardModule },
  vendas:    { title: 'Controle de Vendas', instance: VendasModule },
  produtos:  { title: 'Produtos & Estoque', instance: ProdutosModule },
  clientes:  { title: 'Base de Clientes', instance: ClientesModule },
  usuarios:  { title: 'Gestão de Usuários', instance: UsuariosModule, role: 'admin' }
};

const authView = document.getElementById('auth-view');
const appLayout = document.getElementById('app-layout');
const viewContainer = document.getElementById('app-view');
const moduleTitle = document.getElementById('module-title');
const userDisplay = document.getElementById('user-display');
const navButtons = document.querySelectorAll('.nav-btn');
const logoutBtn = document.getElementById('logout-btn');

function applyPermissions(user) {
  navButtons.forEach(btn => {
    const requiredRole = btn.dataset.role;
    const li = btn.parentElement;
    if (requiredRole && user.perfil !== requiredRole) {
      li.classList.add('hidden');
    } else {
      li.classList.remove('hidden');
    }
  });
}

function loadModule(moduleKey) {
  const selected = modules[moduleKey];
  const currentUser = Store.getCurrentUser();
  if (!selected || !currentUser) return;

  if (selected.role && currentUser.perfil !== selected.role) {
    loadModule('dashboard');
    return;
  }

  moduleTitle.textContent = selected.title;
  navButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.module === moduleKey);
  });

  viewContainer.innerHTML = selected.instance.render();
  if (typeof selected.instance.init === 'function') {
    selected.instance.init(() => loadModule(moduleKey));
  }
}

function showLogin() {
  appLayout.classList.add('hidden');
  authView.classList.remove('hidden');
  authView.innerHTML = LoginModule.render();
  LoginModule.init((user) => {
    startApp(user);
  });
}

function startApp(user) {
  authView.classList.add('hidden');
  appLayout.classList.remove('hidden');
  
  const cargoLabel = user.perfil === 'admin' ? 'Admin' : 'Vendedor';
  userDisplay.textContent = `${user.nome} (${cargoLabel})`;
  
  applyPermissions(user);
  loadModule('dashboard');
}

navButtons.forEach(btn => {
  btn.addEventListener('click', () => loadModule(btn.dataset.module));
});

logoutBtn.addEventListener('click', () => {
  Store.logout();
  showLogin();
});

const currentUser = Store.getCurrentUser();
if (currentUser) {
  startApp(currentUser);
} else {
  showLogin();
}

// Registro do Service Worker para habilitar instalação como PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then(() => console.log('PWA: Service Worker registrado com sucesso.'))
      .catch((err) => console.error('PWA: Erro ao registrar Service Worker:', err));
  });
}
