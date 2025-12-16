const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Log de inicialização
console.log('🚀 Iniciando servidor...');
console.log('📊 Variáveis de ambiente:');
console.log('   PORT:', PORT);
console.log('   DATABASE_URL:', process.env.DATABASE_URL ? '✓ Configurada' : '✗ NÃO configurada');

// Configuração do PostgreSQL
let pool;
try {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
  console.log('✓ Pool de conexões criado');
} catch (error) {
  console.error('✗ Erro ao criar pool:', error.message);
}

// Middlewares
app.use(cors());
app.use(express.json());

// Log de todas as requisições
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ===== ROTAS =====

// Rota raiz
app.get('/', (req, res) => {
  console.log('📍 Rota / acessada');
  res.json({ 
    message: 'API ESP32 Tanques está funcionando!',
    status: 'online',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Rota de status do banco
app.get('/api/status', async (req, res) => {
  console.log('📍 Rota /api/status acessada');
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✓ Banco de dados conectado');
    res.json({ 
      database: 'conectado',
      timestamp: result.rows[0].now
    });
  } catch (error) {
    console.error('✗ Erro ao conectar banco:', error.message);
    res.status(500).json({ 
      database: 'erro',
      error: error.message 
    });
  }
});

// Rota POST para receber dados do ESP32
app.post('/api/leituras', async (req, res) => {
  console.log('📍 Rota POST /api/leituras acessada');
  console.log('📦 Body recebido:', req.body);
  
  try {
    const { esp_id, nivel_tanque1, nivel_tanque2 } = req.body;

    // Validação
    if (!esp_id || nivel_tanque1 === undefined || nivel_tanque2 === undefined) {
      console.log('⚠️ Dados incompletos');
      return res.status(400).json({ 
        error: 'Dados incompletos',
        mensagem: 'Necessário enviar: esp_id, nivel_tanque1, nivel_tanque2'
      });
    }

    // Validar ESP_ID
    if (!/^\d{8}$/.test(esp_id)) {
      console.log('⚠️ ESP_ID inválido:', esp_id);
      return res.status(400).json({ 
        error: 'ESP_ID inválido',
        mensagem: 'ESP_ID deve ter exatamente 8 dígitos numéricos'
      });
    }

    // Validar níveis
    if (isNaN(nivel_tanque1) || isNaN(nivel_tanque2)) {
      console.log('⚠️ Valores inválidos');
      return res.status(400).json({ 
        error: 'Valores inválidos',
        mensagem: 'nivel_tanque1 e nivel_tanque2 devem ser números'
      });
    }

    // Inserir no banco
    const query = `
      INSERT INTO leituras_tanques (esp_id, nivel_tanque1, nivel_tanque2, data_hora)
      VALUES ($1, $2, $3, NOW())
      RETURNING id, data_hora
    `;
    
    console.log('💾 Inserindo no banco...');
    const result = await pool.query(query, [esp_id, nivel_tanque1, nivel_tanque2]);

    console.log('✓ Leitura salva - ID:', result.rows[0].id);
    
    res.status(201).json({
      success: true,
      message: 'Leitura registrada com sucesso',
      data: {
        id: result.rows[0].id,
        esp_id: esp_id,
        nivel_tanque1: parseFloat(nivel_tanque1),
        nivel_tanque2: parseFloat(nivel_tanque2),
        data_hora: result.rows[0].data_hora
      }
    });

  } catch (error) {
    console.error('✗ Erro ao inserir leitura:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: error.message 
    });
  }
});

// Rota GET para obter leituras
app.get('/api/leituras/:esp_id', async (req, res) => {
  console.log('📍 Rota GET /api/leituras/:esp_id acessada');
  
  try {
    const { esp_id } = req.params;
    console.log('🔍 Buscando leituras para ESP_ID:', esp_id);

    // Validar ESP_ID
    if (!/^\d{8}$/.test(esp_id)) {
      console.log('⚠️ ESP_ID inválido:', esp_id);
      return res.status(400).json({ 
        error: 'ESP_ID inválido',
        mensagem: 'ESP_ID deve ter exatamente 8 dígitos numéricos'
      });
    }

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

    console.log('💾 Executando query no banco...');
    const result = await pool.query(query, [esp_id]);
    console.log('✓ Query executada - Registros encontrados:', result.rows.length);

    res.json({
      success: true,
      count: result.rows.length,
      esp_id: esp_id,
      periodo: 'últimas 24 horas',
      data: result.rows
    });

  } catch (error) {
    console.error('✗ Erro ao buscar leituras:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      error: 'Erro ao buscar leituras',
      details: error.message 
    });
  }
});

// Rota 404
app.use((req, res) => {
  console.log('⚠️ Rota não encontrada:', req.method, req.path);
  res.status(404).json({ 
    error: 'Rota não encontrada',
    path: req.path,
    method: req.method,
    rotas_disponiveis: {
      'GET /': 'Página inicial',
      'GET /api/status': 'Status do banco',
      'POST /api/leituras': 'Enviar leitura',
      'GET /api/leituras/:esp_id': 'Obter leituras'
    }
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║     🚀 SERVIDOR ONLINE!               ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`📡 Porta: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`📊 Rotas disponíveis:`);
  console.log(`   GET  /`);
  console.log(`   GET  /api/status`);
  console.log(`   POST /api/leituras`);
  console.log(`   GET  /api/leituras/:esp_id`);
  console.log('═══════════════════════════════════════\n');
});

// Tratamento de erros
process.on('unhandledRejection', (error) => {
  console.error('❌ Erro não tratado:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Exceção não capturada:', error);
});
