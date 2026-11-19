# GestãoVendas Pro - App Modular (PWA)

## Como executar no VS Code
1. Extraia este arquivo ZIP e abra a pasta `app-vendas-modular` no **VS Code**.
2. Clique com o botão direito no arquivo `index.html` e selecione **Open with Live Server**.
3. Faça login com as credenciais padrão:
   - **Usuário:** `admin`
   - **Senha:** `123`

## Módulos incluídos
- **Login & Permissões (`login.js` / `usuarios.js`):** Separação entre Administrador e Vendedor.
- **Dashboard (`dashboard.js`):** Faturamento, lucro líquido (exclusivo Admin), filtro por período e alertas.
- **Vendas (`vendas.js`):** Carrinho com baixa automática no estoque e controle de status (`Concluída` / `Em entrega`).
- **Produtos & Estoque (`produtos.js`):** Catálogo com ocultação de custo/margem para Vendedores.
- **Clientes (`clientes.js`):** Carteira de clientes com total comprado e pendências a prazo.
- **PWA (`manifest.json` / `sw.js` / `icon.svg`):** Pronto para instalar no celular.
