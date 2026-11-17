const STORAGE_KEY = 'gestao_vendas_db_v1';
const SESSION_KEY = 'gestao_vendas_user';

const defaultData = {
  usuarios: [
    { id: '1', nome: 'Administrador', usuario: 'admin', senha: '123', perfil: 'admin' }
  ],
  produtos: [],
  vendas: [],
  clientes: []
};

export const Store = {
  getData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = structuredClone(defaultData);
      this.saveData(initial);
      return initial;
    }
    return JSON.parse(raw);
  },

  saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  },

  getCollection(name) {
    return this.getData()[name] || [];
  },

  addItem(collection, item) {
    const data = this.getData();
    item.id = Date.now().toString();
    data[collection].push(item);
    this.saveData(data);
    return item;
  },

  removeItem(collection, id) {
    const data = this.getData();
    data[collection] = data[collection].filter(item => item.id !== id);
    this.saveData(data);
  },

  updateItem(collection, id, updatedFields) {
    const data = this.getData();
    const index = data[collection].findIndex(item => item.id === id);
    if (index !== -1) {
      data[collection][index] = { ...data[collection][index], ...updatedFields };
      this.saveData(data);
      return data[collection][index];
    }
    return null;
  },

  // --- Métodos de Autenticação ---
  login(usuario, senha) {
    const usuarios = this.getCollection('usuarios');
    const encontrado = usuarios.find(
      u => u.usuario.toLowerCase() === usuario.toLowerCase() && u.senha === senha
    );

    if (encontrado) {
      const sessao = { id: encontrado.id, nome: encontrado.nome, perfil: encontrado.perfil };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessao));
      return sessao;
    }
    return null;
  },

  logout() {
    sessionStorage.removeItem(SESSION_KEY);
  },

  getCurrentUser() {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  }
};
