const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração do PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Middlewares
app.use(cors());
app.use(express.json());

// Rota de teste
app.get('/', (req, res) => {
  res.json({ message: 'API ESP32 Tanques está funcionando!' });
});

// Rota para receber dados do ESP32
app.post('/api/leituras', async (req, res) => {
  try {
    const { esp_id, nivel_tanque1, nivel_tanque2 } = req.body;

    // Validação
    if (!esp_id || !nivel_tanque1 || !nivel_tanque2) {
      return res.status(400).json({ 
        error: 'Dados incompletos. Necessário: esp_id, nivel_tanque1, nivel_tanque2' 
      });
    }

    // Validar formato do ESP_ID (8 dígitos)
    if (!/^\d{8}$/.test(esp_id)) {
      return res.status(400).json({ 
        error: 'ESP_ID deve ter exatamente 8 dígitos numéricos' 
      });
    }

    // Inserir no banco
    const query = `
      INSERT INTO leituras_tanques (esp_id, nivel_tanque1, nivel_tanque2, data_hora)
      VALUES ($1, $2, $3, NOW())
      RETURNING id, data_hora
    `;
    
    const result = await pool.query(query, [esp_id, nivel_tanque1, nivel_tanque2]);

    res.status(201).json({
      success: true,
      message: 'Leitura registrada com sucesso',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Erro ao inserir leitura:', error);
    res.status(500).json({ 
      error: 'Erro ao processar leitura',
      details: error.message 
    });
  }
});

// Rota para obter leituras das últimas 24 horas
app.get('/api/leituras/:esp_id', async (req, res) => {
  try {
    const { esp_id } = req.params;

    const query = `
      SELECT 
        id,
        esp_id,
        nivel_tanque1,
        nivel_tanque2,
        data_hora
      FROM leituras_tanques
      WHERE esp_id = $1 
        AND data_hora >= NOW() - INTERVAL '24 hours'
      ORDER BY data_hora DESC
    `;

    const result = await pool.query(query, [esp_id]);

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });

  } catch (error) {
    console.error('Erro ao buscar leituras:', error);
    res.status(500).json({ 
      error: 'Erro ao buscar leituras',
      details: error.message 
    });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
