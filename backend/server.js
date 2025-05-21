const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware para servir arquivos estáticos da pasta "public"
app.use(express.static(path.join(__dirname, '../public')));

// Middleware para tratar JSON
app.use(express.json());

// Rota POST para receber pedidos
app.post('/pedidos', (req, res) => {
  const pedido = req.body;
  console.log('Pedido recebido:', pedido);

  fs.appendFile('pedidos.json', JSON.stringify(pedido) + ',\n', err => {
    if (err) {
      console.error('Erro ao salvar pedido:', err);
      return res.status(500).send('Erro ao salvar');
    }
    res.send('Pedido salvo com sucesso!');
  });
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
