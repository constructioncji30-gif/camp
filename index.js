const express = require('express');
const cors = require('cors');
const sql = require('mssql');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`[${req.method}] ${req.url}`);
    console.log('Body:', req.body);
    next();
  });
}

// Database configuration
const dbConfig = {
  server: process.env.DB_SERVER || 'db50897.databaseasp.net',
  database: process.env.DB_NAME || 'db50897',
  user: process.env.DB_USER || 'db50897',
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT) || 1433,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  },
  connectionTimeout: 30000,
  requestTimeout: 30000,
  pool: {
    max: 1,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

// Database connection function for serverless
let pool = null;

async function getConnection() {
  try {
    if (pool && pool.connected) {
      return pool;
    }
    pool = await sql.connect(dbConfig);
    return pool;
  } catch (err) {
    console.error('Database connection error:', err);
    throw err;
  }
}

async function query(sqlString, params = []) {
  try {
    const connection = await getConnection();
    const request = connection.request();
    
    params.forEach((param, index) => {
      request.input(`p${index}`, param);
    });
    
    let formattedSql = sqlString;
    for (let i = 0; i < params.length; i++) {
      formattedSql = formattedSql.replace('?', `@p${i}`);
    }
    
    const result = await request.query(formattedSql);
    return result.recordset;
  } catch (err) {
    console.error('Query error:', err);
    throw err;
  }
}

// Helper functions
function parseDate(str) {
  if (!str) return null;
  const date = new Date(str);
  return isNaN(date.getTime()) ? null : date;
}

function safeString(str) {
  return str && str.toString().trim() !== '' ? str.toString().trim() : null;
}

// ==================== TEST ROUTES ====================

// Simple GET test
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'API is working on Vercel!',
    method: 'GET',
    timestamp: new Date().toISOString()
  });
});

// Simple POST test
app.post('/api/test', (req, res) => {
  console.log('POST test received:', req.body);
  res.json({ 
    success: true, 
    message: 'POST is working!',
    received: req.body,
    method: 'POST'
  });
});

// ==================== WORKER ROUTES ====================

// CREATE worker (POST)
app.post('/api/workers', async (req, res) => {
  console.log('POST /api/workers - Body:', JSON.stringify(req.body));
  
  try {
    const { name, iqamaNumber, supplier, position, phone, dateJoined, leaveDate, roomNumber, MEDICAL } = req.body;
    
    // Validation
    if (!name) {
      return res.status(400).json({ 
        success: false, 
        error: 'Worker name is required' 
      });
    }
    
    const sqlInsert = `
      INSERT INTO workers
        (name, iqamaNumber, supplier, position, phone, dateJoined, leaveDate, roomNumber, MEDICAL)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      safeString(name),
      safeString(iqamaNumber),
      safeString(supplier),
      safeString(position),
      safeString(phone),
      parseDate(dateJoined),
      parseDate(leaveDate),
      safeString(roomNumber),
      safeString(MEDICAL) || 'NO'
    ];
    
    await query(sqlInsert, params);
    
    res.status(201).json({ 
      success: true, 
      message: "Worker created successfully",
      worker: req.body
    });
    
  } catch (error) {
    console.error('POST /api/workers error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET all workers (with pagination)
app.get('/api/workers', async (req, res) => {
  console.log('GET /api/workers - Query:', req.query);
  
  try {
    let { page, limit, search } = req.query;
    
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
    search = search || '';
    const offset = (page - 1) * limit;
    
    // Get total count
    const countSql = `
      SELECT COUNT(*) as total 
      FROM workers 
      WHERE name LIKE ? OR iqamaNumber LIKE ?
    `;
    const countResult = await query(countSql, [`%${search}%`, `%${search}%`]);
    const total = countResult[0]?.total || 0;
    
    // Get workers
    const dataSql = `
      SELECT id, name, iqamaNumber, supplier, position, phone, 
             dateJoined, leaveDate, roomNumber, MEDICAL
      FROM workers
      WHERE name LIKE ? OR iqamaNumber LIKE ?
      ORDER BY id
      OFFSET ? ROWS
      FETCH NEXT ? ROWS ONLY
    `;
    
    const workers = await query(dataSql, [`%${search}%`, `%${search}%`, offset, limit]);
    
    res.json({
      success: true,
      workers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('GET /api/workers error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET active workers
app.get('/api/workers/active', async (req, res) => {
  try {
    const sql = `
      SELECT id, name, iqamaNumber, supplier, position, phone, 
             dateJoined, leaveDate, roomNumber, MEDICAL
      FROM workers
      WHERE leaveDate IS NULL
      ORDER BY name
    `;
    
    const workers = await query(sql, []);
    
    res.json({
      success: true,
      workers,
      count: workers.length
    });
    
  } catch (error) {
    console.error('GET /api/workers/active error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET single worker by ID
app.get('/api/workers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const sql = `SELECT * FROM workers WHERE id = ?`;
    const workers = await query(sql, [id]);
    
    if (workers.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Worker not found' 
      });
    }
    
    res.json({
      success: true,
      worker: workers[0]
    });
    
  } catch (error) {
    console.error('GET /api/workers/:id error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// UPDATE worker
app.put('/api/workers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, iqamaNumber, supplier, position, phone, dateJoined, leaveDate, roomNumber, MEDICAL } = req.body;
    
    const sql = `
      UPDATE workers 
      SET name = ?, iqamaNumber = ?, supplier = ?, position = ?, 
          phone = ?, dateJoined = ?, leaveDate = ?, roomNumber = ?, MEDICAL = ?
      WHERE id = ?
    `;
    
    const params = [
      safeString(name),
      safeString(iqamaNumber),
      safeString(supplier),
      safeString(position),
      safeString(phone),
      parseDate(dateJoined),
      parseDate(leaveDate),
      safeString(roomNumber),
      safeString(MEDICAL) || 'NO',
      id
    ];
    
    await query(sql, params);
    
    res.json({
      success: true,
      message: 'Worker updated successfully'
    });
    
  } catch (error) {
    console.error('PUT /api/workers/:id error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// DELETE worker
app.delete('/api/workers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const sql = `DELETE FROM workers WHERE id = ?`;
    await query(sql, [id]);
    
    res.json({
      success: true,
      message: 'Worker deleted successfully'
    });
    
  } catch (error) {
    console.error('DELETE /api/workers/:id error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Mark worker as left
app.put('/api/workers/:id/leave', async (req, res) => {
  try {
    const { id } = req.params;
    const { leaveDate } = req.body;
    
    if (!leaveDate) {
      return res.status(400).json({ 
        success: false, 
        error: 'Leave date is required' 
      });
    }
    
    const sql = `UPDATE workers SET leaveDate = ? WHERE id = ?`;
    await query(sql, [parseDate(leaveDate), id]);
    
    res.json({
      success: true,
      message: 'Worker marked as left'
    });
    
  } catch (error) {
    console.error('PUT /api/workers/:id/leave error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Reactivate worker
app.put('/api/workers/:id/reactivate', async (req, res) => {
  try {
    const { id } = req.params;
    
    const sql = `UPDATE workers SET leaveDate = NULL WHERE id = ?`;
    await query(sql, [id]);
    
    res.json({
      success: true,
      message: 'Worker reactivated'
    });
    
  } catch (error) {
    console.error('PUT /api/workers/:id/reactivate error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ==================== DASHBOARD ROUTES ====================

app.get('/api/dashboard', async (req, res) => {
  try {
    // Get all active workers
    const workersSql = `
      SELECT id, name, iqamaNumber, supplier, position, phone, 
             dateJoined, roomNumber, MEDICAL
      FROM workers
      WHERE leaveDate IS NULL
      ORDER BY id
    `;
    const workers = await query(workersSql, []);
    
    // Get counts
    const countsSql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN leaveDate IS NULL THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN leaveDate IS NOT NULL THEN 1 ELSE 0 END) as left_workers
      FROM workers
    `;
    const counts = await query(countsSql, []);
    
    // Get work detail counts
    const workDetails = {};
    workers.forEach(w => {
      const position = w.position || 'Unknown';
      workDetails[position] = (workDetails[position] || 0) + 1;
    });
    
    const dashboardCounts = Object.entries(workDetails).map(([workDetail, count]) => ({
      workDetail,
      count
    }));
    
    res.json({
      success: true,
      workers,
      dashboardCounts,
      employeeCounts: {
        total: counts[0]?.total || 0,
        active: counts[0]?.active || 0,
        left: counts[0]?.left_workers || 0
      }
    });
    
  } catch (error) {
    console.error('GET /api/dashboard error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ==================== ROOT ROUTE ====================
app.get('/api', (req, res) => {
  res.json({
    name: 'Worker Management API',
    version: '1.0.0',
    status: 'running',
    endpoints: [
      'GET  /api/test',
      'POST /api/test',
      'GET  /api/workers',
      'POST /api/workers',
      'GET  /api/workers/:id',
      'PUT  /api/workers/:id',
      'DELETE /api/workers/:id',
      'GET  /api/workers/active',
      'GET  /api/dashboard'
    ]
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    error: `Route ${req.originalUrl} not found` 
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ 
    success: false, 
    error: err.message || 'Internal server error' 
  });
});

// Export for Vercel
module.exports = app;