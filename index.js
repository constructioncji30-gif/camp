const express = require('express');
const cors = require('cors');
const Worker = require('./Models/Worker');
const { query } = require('./config/database');
const Staff = require('./Models/Staff');

const app = express();

// ============ CORS FIXES ============
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight OPTIONS requests
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(200);
});

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Debug logging middleware
app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.path}`);
  if (req.method !== 'GET' && req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body));
  }
  next();
});

// --- Helper functions ---
function parseDate(str) {
  if (!str) return null;
  const date = new Date(str);
  return isNaN(date.getTime()) ? null : date;
}

function safeString(str) {
  if (!str) return null;
  return str.toString().trim() !== '' ? str.toString().trim() : null;
}

function prepareWorkerParams(worker) {
  return [
    safeString(worker.name),
    safeString(worker.iqamaNumber),
    safeString(worker.supplier),
    safeString(worker.position),
    safeString(worker.phone),
    parseDate(worker.dateJoined),
    parseDate(worker.leaveDate),
    safeString(worker.roomNumber),
    safeString(worker.MEDICAL) || 'NO'
  ];
}

function prepareStaffParams(staff) {
  return [
    safeString(staff.name),
    safeString(staff.roomNumber),
    safeString(staff.designation),
    safeString(staff.phone),
    safeString(staff.email),
    safeString(staff.department),
    parseDate(staff.dateJoined),
    parseDate(staff.leaveDate)
  ];
}

// ============ WORKER ROUTES ============

// --- GET workers for food card assignment ---
app.get('/workers/for-foodcard-assignment', async (req, res) => {
  try {
    const { search } = req.query;
    
    let sql = `
      SELECT 
        w.id,
        w.name,
        w.iqamaNumber as iqama_number,
        w.supplier,
        w.position,
        w.roomNumber,
        w.MEDICAL
      FROM workers w
      WHERE w.leaveDate IS NULL
        AND w.iqamaNumber IS NOT NULL
        AND w.iqamaNumber != ''
        AND NOT EXISTS (
          SELECT 1 FROM food_cards fc 
          WHERE fc.iqama_number = w.iqamaNumber
        )
    `;
    
    const params = [];
    
    if (search) {
      sql += ' AND (w.name LIKE ? OR w.iqamaNumber LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }
    
    sql += ' ORDER BY w.name';
    
    const rows = await query(sql, params);
    
    res.json({ 
      success: true,
      workers: rows,
      count: rows.length
    });
  } catch (err) {
    console.error("GET /workers/for-foodcard-assignment error:", err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

// --- CREATE worker (POST) - FIXED ---
app.post('/workers', async (req, res) => {
  console.log('=== POST /workers ===');
  console.log('Request body:', JSON.stringify(req.body));
  
  try {
    const workerData = req.body;
    
    // Validate required fields
    if (!workerData.name) {
      return res.status(400).json({ 
        success: false,
        error: "Worker name is required" 
      });
    }
    
    const worker = new Worker(workerData);
    
    const sqlInsert = `
      INSERT INTO workers
        (name, iqamaNumber, supplier, position, phone, dateJoined, leaveDate, roomNumber, MEDICAL)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await query(sqlInsert, prepareWorkerParams(worker));
    console.log('Insert result:', result);

    res.status(201).json({ 
      success: true,
      message: "Worker created successfully", 
      worker: workerData 
    });
  } catch (err) {
    console.error("POST /workers error:", err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

// --- GET workers with pagination + search ---
app.get('/workers', async (req, res) => {
  try {
    let { page, limit, search } = req.query;

    page = parseInt(page) || 1;
    limit = parseInt(limit) || 5;
    search = (search || "").toString();
    const offset = (page - 1) * limit;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM workers
      WHERE name LIKE ?
    `;
    const countResult = await query(countSql, [`%${search}%`]);
    const total = countResult[0]?.total ?? 0;

    const dataSql = `
      SELECT id, name, iqamaNumber, supplier, position, phone, dateJoined, leaveDate, roomNumber, MEDICAL
      FROM workers
      WHERE name LIKE ?
      ORDER BY id
      OFFSET ? ROWS
      FETCH NEXT ? ROWS ONLY
    `;
    const rows = await query(dataSql, [`%${search}%`, offset, limit]);

    const workers = rows.map(row => {
      const w = new Worker({
        name: row.name,
        iqamaNumber: row.iqamaNumber,
        supplier: row.supplier,
        position: row.position,
        phone: row.phone,
        dateJoined: row.dateJoined,
        leaveDate: row.leaveDate,
        roomNumber: row.roomNumber,
        MEDICAL: row.MEDICAL
      });
      w.id = row.id;
      return w;
    });

    res.json({ workers, total });
  } catch (err) {
    console.error("GET /workers error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- GET worker by ID ---
app.get('/workers/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const sqlSelect = `SELECT * FROM workers WHERE id = ?`;
    const result = await query(sqlSelect, [id]);

    if (!result || result.length === 0) {
      return res.status(404).json({ message: "Worker not found" });
    }

    const row = result[0];
    const worker = new Worker({
      name: row.name,
      iqamaNumber: row.iqamaNumber,
      supplier: row.supplier,
      position: row.position,
      phone: row.phone,
      dateJoined: row.dateJoined,
      leaveDate: row.leaveDate,
      roomNumber: row.roomNumber,
      MEDICAL: row.MEDICAL
    });
    worker.id = row.id;

    res.json({ worker });
  } catch (err) {
    console.error("GET /workers/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- UPDATE worker by ID (PUT) - FIXED ---
app.put('/workers/:id', async (req, res) => {
  console.log(`=== PUT /workers/${req.params.id} ===`);
  console.log('Request body:', JSON.stringify(req.body));
  
  try {
    const id = req.params.id;
    const workerData = req.body;

    const sqlUpdate = `
      UPDATE workers
      SET 
        name = ?, 
        iqamaNumber = ?, 
        supplier = ?, 
        position = ?, 
        phone = ?, 
        dateJoined = ?, 
        leaveDate = ?, 
        roomNumber = ?,
        MEDICAL = ?
      WHERE id = ?
    `;

    const params = [...prepareWorkerParams(workerData), id];
    await query(sqlUpdate, params);

    res.json({ 
      success: true,
      message: "Worker updated successfully" 
    });
  } catch (err) {
    console.error("PUT /workers/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- DELETE worker by ID - FIXED ---
app.delete('/workers/:id', async (req, res) => {
  console.log(`=== DELETE /workers/${req.params.id} ===`);
  
  try {
    const id = req.params.id;
    const sqlDelete = `DELETE FROM workers WHERE id = ?`;
    await query(sqlDelete, [id]);

    res.json({ 
      success: true,
      message: "Worker deleted successfully" 
    });
  } catch (err) {
    console.error("DELETE /workers/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- MARK WORKER AS LEFT ---
app.put('/workers/:id/leave', async (req, res) => {
  try {
    const id = req.params.id;
    const { leaveDate } = req.body;

    if (!leaveDate) {
      return res.status(400).json({ error: "Leave date is required" });
    }

    const sqlUpdate = `
      UPDATE workers 
      SET leaveDate = ? 
      WHERE id = ?
    `;

    await query(sqlUpdate, [parseDate(leaveDate), id]);

    res.json({ 
      success: true,
      message: "Worker marked as left successfully",
      leaveDate: leaveDate
    });
  } catch (err) {
    console.error("PUT /workers/:id/leave error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- UPDATE WORKER MEDICAL STATUS ---
app.put('/workers/:id/medical', async (req, res) => {
  try {
    const id = req.params.id;
    const { MEDICAL } = req.body;

    if (!MEDICAL) {
      return res.status(400).json({ error: "MEDICAL status is required" });
    }

    const sqlUpdate = `
      UPDATE workers 
      SET MEDICAL = ? 
      WHERE id = ?
    `;

    await query(sqlUpdate, [MEDICAL, id]);

    res.json({ 
      success: true,
      message: "Worker medical status updated successfully",
      MEDICAL: MEDICAL
    });
  } catch (err) {
    console.error("PUT /workers/:id/medical error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- GET ACTIVE WORKERS ---
app.get('/workers-active', async (req, res) => {
  try {
    const sql = `
      SELECT id, name, iqamaNumber, supplier, position, phone, dateJoined, leaveDate, roomNumber, MEDICAL
      FROM workers
      WHERE leaveDate IS NULL
      ORDER BY id
    `;

    const rows = await query(sql);

    const workers = rows.map(row => {
      const w = new Worker({
        name: row.name,
        iqamaNumber: row.iqamaNumber,
        supplier: row.supplier,
        position: row.position,
        phone: row.phone,
        dateJoined: row.dateJoined,
        leaveDate: row.leaveDate,
        roomNumber: row.roomNumber,
        MEDICAL: row.MEDICAL
      });
      w.id = row.id;
      return w;
    });

    res.json({ workers });
  } catch (err) {
    console.error("GET /workers-active error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- GET LEFT WORKERS ---
app.get('/workers-left', async (req, res) => {
  try {
    const sql = `
      SELECT id, name, iqamaNumber, supplier, position, phone, dateJoined, leaveDate, roomNumber, MEDICAL
      FROM workers
      WHERE leaveDate IS NOT NULL
      ORDER BY leaveDate DESC
    `;

    const rows = await query(sql);

    const workers = rows.map(row => {
      const w = new Worker({
        name: row.name,
        iqamaNumber: row.iqamaNumber,
        supplier: row.supplier,
        position: row.position,
        phone: row.phone,
        dateJoined: row.dateJoined,
        leaveDate: row.leaveDate,
        roomNumber: row.roomNumber,
        MEDICAL: row.MEDICAL
      });
      w.id = row.id;
      return w;
    });

    res.json({ workers });
  } catch (err) {
    console.error("GET /workers-left error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- REACTIVATE WORKER ---
app.put('/workers/:id/reactivate', async (req, res) => {
  try {
    const id = req.params.id;

    const sqlUpdate = `
      UPDATE workers 
      SET leaveDate = NULL 
      WHERE id = ?
    `;

    await query(sqlUpdate, [id]);

    res.json({ 
      success: true,
      message: "Worker reactivated successfully"
    });
  } catch (err) {
    console.error("PUT /workers/:id/reactivate error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- GET available seats for all rooms ---
app.get('/rooms/available-seats', async (req, res) => {
  try {
    const roomCapacities = {
      'C-34': 4,
      'C-35': 4
    };

    const sql = `
      SELECT roomNumber, COUNT(*) AS occupied
      FROM workers
      WHERE roomNumber IS NOT NULL AND leaveDate IS NULL
      GROUP BY roomNumber
    `;

    const result = await query(sql);

    const rooms = result.map(row => {
      const capacity = roomCapacities[row.roomNumber] || 6;
      
      return {
        roomNumber: row.roomNumber,
        availableSeats: Math.max(capacity - row.occupied, 0),
        capacity: capacity,
        occupiedSeats: row.occupied
      };
    });

    res.json({ rooms });
  } catch (err) {
    console.error("GET /rooms/available-seats error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- GET all workers (NO pagination) ---
app.get('/workers-all', async (req, res) => {
  try {
    const sql = `
      SELECT id, name, iqamaNumber, supplier, position, phone, dateJoined, leaveDate, roomNumber, MEDICAL
      FROM workers
      ORDER BY id
    `;

    const rows = await query(sql);

    const workers = rows.map(row => {
      const w = new Worker({
        name: row.name,
        iqamaNumber: row.iqamaNumber,
        supplier: row.supplier,
        position: row.position,
        phone: row.phone,
        dateJoined: row.dateJoined,
        leaveDate: row.leaveDate,
        roomNumber: row.roomNumber,
        MEDICAL: row.MEDICAL
      });
      w.id = row.id;
      return w;
    });

    res.json({ workers });
  } catch (err) {
    console.error("GET /workers-all error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- GET dashboard data ---
app.get("/dashboard", async (req, res) => {
  try {
    const sqlWorkers = `
      SELECT id, name, iqamaNumber, supplier, position, phone, dateJoined, leaveDate, roomNumber, MEDICAL
      FROM workers
      WHERE leaveDate IS NULL
      ORDER BY id
    `;

    const rows = await query(sqlWorkers);

    const workers = rows.map(row => {
      const normalizedPosition = row.position
        ? row.position.trim().toLowerCase().replace(/\b\w/g, char => char.toUpperCase())
        : "Unknown";

      return {
        id: row.id,
        name: row.name,
        iqamaNumber: row.iqamaNumber,
        supplier: row.supplier,
        position: normalizedPosition,
        phone: row.phone,
        dateJoined: row.dateJoined,
        leaveDate: row.leaveDate,
        roomNumber: row.roomNumber,
        MEDICAL: row.MEDICAL
      };
    });

    const countSql = `
      SELECT 
        COUNT(*) as totalEmployees,
        COUNT(CASE WHEN leaveDate IS NULL THEN 1 END) as activeEmployees,
        COUNT(CASE WHEN leaveDate IS NOT NULL THEN 1 END) as leftEmployees
      FROM workers
    `;

    const countResult = await query(countSql);
    const employeeCounts = countResult[0];

    const countMap = {};
    workers.forEach(w => {
      const key = w.position || "Unknown";
      countMap[key] = (countMap[key] || 0) + 1;
    });

    const dashboardCounts = Object.keys(countMap).map(key => ({
      workDetail: key,
      count: countMap[key],
    }));

    res.json({ 
      workers, 
      dashboardCounts,
      employeeCounts: {
        total: employeeCounts.totalEmployees,
        active: employeeCounts.activeEmployees,
        left: employeeCounts.leftEmployees
      }
    });
  } catch (err) {
    console.error("GET /dashboard error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- GET dashboard stats ---
app.get("/dashboard/stats", async (req, res) => {
  try {
    const statsSql = `
      SELECT 
        COUNT(*) as totalWorkers,
        COUNT(CASE WHEN leaveDate IS NULL THEN 1 END) as activeWorkers,
        COUNT(CASE WHEN leaveDate IS NOT NULL THEN 1 END) as leftWorkers,
        COUNT(DISTINCT roomNumber) as occupiedRooms,
        COUNT(DISTINCT supplier) as totalSuppliers
      FROM workers
    `;

    const result = await query(statsSql);
    const stats = result[0];

    res.json({ stats });
  } catch (err) {
    console.error("GET /dashboard/stats error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- GET duplicate workers ---
app.get("/workers-duplicates", async (req, res) => {
  try {
    const sql = `
      SELECT t.*, d.total AS duplicate_count
      FROM workers t
      JOIN (
        SELECT iqamaNumber, COUNT(*) AS total
        FROM workers
        WHERE iqamaNumber IS NOT NULL AND iqamaNumber != ''
        GROUP BY iqamaNumber
        HAVING COUNT(*) > 1
      ) d ON t.iqamaNumber = d.iqamaNumber
      ORDER BY t.iqamaNumber
    `;

    const rows = await query(sql);
    res.json({ duplicates: rows });
  } catch (err) {
    console.error("GET /workers-duplicates error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============ STAFF ROUTES ============

// --- CREATE staff ---
app.post('/staff', async (req, res) => {
  try {
    const staff = new Staff(req.body);
    console.log('Creating staff:', staff);

    const sqlInsert = `
      INSERT INTO staff
        (name, roomNumber, designation, phone, email, department, dateJoined, leaveDate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await query(sqlInsert, prepareStaffParams(staff));

    res.status(201).json({ 
      success: true,
      message: "Staff created successfully", 
      staff 
    });
  } catch (err) {
    console.error("POST /staff error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- GET all staff with pagination ---
app.get('/staff', async (req, res) => {
  try {
    let { page, limit, search } = req.query;

    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
    search = (search || "").toString();
    const offset = (page - 1) * limit;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM staff
      WHERE name LIKE ? OR designation LIKE ? OR roomNumber LIKE ?
    `;
    const countResult = await query(countSql, [`%${search}%`, `%${search}%`, `%${search}%`]);
    const total = countResult[0]?.total ?? 0;

    const dataSql = `
      SELECT id, name, roomNumber, designation, phone, email, department, dateJoined, leaveDate
      FROM staff
      WHERE name LIKE ? OR designation LIKE ? OR roomNumber LIKE ?
      ORDER BY name
      OFFSET ? ROWS
      FETCH NEXT ? ROWS ONLY
    `;
    const rows = await query(dataSql, [`%${search}%`, `%${search}%`, `%${search}%`, offset, limit]);

    const staff = rows.map(row => {
      const s = new Staff({
        name: row.name,
        roomNumber: row.roomNumber,
        designation: row.designation,
        phone: row.phone,
        email: row.email,
        department: row.department,
        dateJoined: row.dateJoined,
        leaveDate: row.leaveDate
      });
      s.id = row.id;
      return s;
    });

    res.json({ staff, total });
  } catch (err) {
    console.error("GET /staff error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- GET staff by ID ---
app.get('/staff/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const sqlSelect = `SELECT * FROM staff WHERE id = ?`;
    const result = await query(sqlSelect, [id]);

    if (!result || result.length === 0) {
      return res.status(404).json({ message: "Staff not found" });
    }

    const row = result[0];
    const staff = new Staff({
      name: row.name,
      roomNumber: row.roomNumber,
      designation: row.designation,
      phone: row.phone,
      email: row.email,
      department: row.department,
      dateJoined: row.dateJoined,
      leaveDate: row.leaveDate
    });
    staff.id = row.id;

    res.json({ staff });
  } catch (err) {
    console.error("GET /staff/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- UPDATE staff by ID ---
app.put('/staff/:id', async (req, res) => {
  try {
    const id = req.params.id;

    const sqlUpdate = `
      UPDATE staff
      SET 
        name = ?, 
        roomNumber = ?, 
        designation = ?, 
        phone = ?, 
        email = ?, 
        department = ?, 
        dateJoined = ?, 
        leaveDate = ?
      WHERE id = ?
    `;

    const params = [
      req.body.name,
      req.body.roomNumber,
      req.body.designation,
      req.body.phone,
      req.body.email,
      req.body.department,
      parseDate(req.body.dateJoined),
      parseDate(req.body.leaveDate),
      id
    ];

    await query(sqlUpdate, params);

    res.json({ 
      success: true,
      message: "Staff updated successfully" 
    });
  } catch (err) {
    console.error("PUT /staff/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- DELETE staff by ID ---
app.delete('/staff/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const sqlDelete = `DELETE FROM staff WHERE id = ?`;
    await query(sqlDelete, [id]);

    res.json({ 
      success: true,
      message: "Staff deleted successfully" 
    });
  } catch (err) {
    console.error("DELETE /staff/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- GET all staff (NO pagination) ---
app.get('/staff-all', async (req, res) => {
  try {
    const sql = `
      SELECT id, name, roomNumber, designation, phone, email, department, dateJoined, leaveDate
      FROM staff
      ORDER BY name
    `;

    const rows = await query(sql);

    const staff = rows.map(row => {
      const s = new Staff({
        name: row.name,
        roomNumber: row.roomNumber,
        designation: row.designation,
        phone: row.phone,
        email: row.email,
        department: row.department,
        dateJoined: row.dateJoined,
        leaveDate: row.leaveDate
      });
      s.id = row.id;
      return s;
    });

    res.json({ staff });
  } catch (err) {
    console.error("GET /staff-all error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- MARK STAFF AS LEFT ---
app.put('/staff/:id/leave', async (req, res) => {
  try {
    const id = req.params.id;
    const { leaveDate } = req.body;

    if (!leaveDate) {
      return res.status(400).json({ error: "Leave date is required" });
    }

    const sqlUpdate = `
      UPDATE staff 
      SET leaveDate = ? 
      WHERE id = ?
    `;

    await query(sqlUpdate, [parseDate(leaveDate), id]);

    res.json({ 
      success: true,
      message: "Staff marked as left successfully",
      leaveDate: leaveDate
    });
  } catch (err) {
    console.error("PUT /staff/:id/leave error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- REACTIVATE STAFF ---
app.put('/staff/:id/reactivate', async (req, res) => {
  try {
    const id = req.params.id;

    const sqlUpdate = `
      UPDATE staff 
      SET leaveDate = NULL 
      WHERE id = ?
    `;

    await query(sqlUpdate, [id]);

    res.json({ 
      success: true,
      message: "Staff reactivated successfully"
    });
  } catch (err) {
    console.error("PUT /staff/:id/reactivate error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============ FOOD CARDS ROUTES ============

// --- GET workers with food cards ---
app.get('/workers/with-foodcards', async (req, res) => {
  try {
    const { search, has_card } = req.query;
    
    let sql = `
      SELECT 
        w.id,
        w.name,
        w.iqamaNumber as iqama_number,
        w.supplier,
        w.position,
        w.roomNumber,
        fc.card_number,
        fc.status as card_status
      FROM workers w
      LEFT JOIN food_cards fc ON w.iqamaNumber = fc.iqama_number
      WHERE w.leaveDate IS NULL
        AND w.iqamaNumber IS NOT NULL
    `;
    
    const params = [];
    
    if (has_card === 'yes') {
      sql += ' AND fc.card_number IS NOT NULL';
    } else if (has_card === 'no') {
      sql += ' AND fc.card_number IS NULL';
    }
    
    if (search) {
      sql += ' AND (w.name LIKE ? OR w.iqamaNumber LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }
    
    sql += ' ORDER BY w.name';
    
    const rows = await query(sql, params);
    
    res.json({ 
      success: true,
      workers: rows,
      count: rows.length
    });
  } catch (err) {
    console.error("GET /workers/with-foodcards error:", err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

// --- ASSIGN food card to worker ---
app.put('/food-cards/:card_number/assign', async (req, res) => {
  try {
    const { card_number } = req.params;
    const { iqama_number } = req.body;
    
    if (!iqama_number) {
      return res.status(400).json({ 
        success: false,
        error: "IQAMA number is required" 
      });
    }
    
    const cardCheck = await query(
      'SELECT id, iqama_number FROM food_cards WHERE card_number = ?',
      [card_number]
    );
    
    if (cardCheck.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: `Food card ${card_number} not found` 
      });
    }
    
    if (cardCheck[0].iqama_number) {
      return res.status(400).json({ 
        success: false,
        error: `Card ${card_number} already assigned` 
      });
    }
    
    const workerCheck = await query(
      'SELECT id, name FROM workers WHERE iqamaNumber = ? AND leaveDate IS NULL',
      [iqama_number]
    );
    
    if (workerCheck.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: `Worker not found or inactive` 
      });
    }
    
    const worker = workerCheck[0];
    
    const workerCardCheck = await query(
      'SELECT card_number FROM food_cards WHERE iqama_number = ?',
      [iqama_number]
    );
    
    if (workerCardCheck.length > 0) {
      return res.status(400).json({ 
        success: false,
        error: `Worker already has card ${workerCardCheck[0].card_number}` 
      });
    }
    
    await query(
      `UPDATE food_cards 
       SET iqama_number = ?, worker_id = ?, status = 'ACTIVE', updated_at = GETDATE()
       WHERE card_number = ?`,
      [iqama_number, worker.id, card_number]
    );
    
    res.json({
      success: true,
      message: `Card ${card_number} assigned successfully`,
      data: {
        card_number,
        iqama_number,
        worker_name: worker.name
      }
    });
  } catch (err) {
    console.error("PUT /food-cards/:card_number/assign error:", err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

// --- UNASSIGN food card ---
app.put('/food-cards/:card_number/unassign', async (req, res) => {
  try {
    const { card_number } = req.params;
    
    const cardCheck = await query(
      'SELECT iqama_number FROM food_cards WHERE card_number = ?',
      [card_number]
    );
    
    if (cardCheck.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: `Card not found` 
      });
    }
    
    if (!cardCheck[0].iqama_number) {
      return res.status(400).json({ 
        success: false,
        error: `Card is not assigned` 
      });
    }
    
    await query(
      `UPDATE food_cards 
       SET iqama_number = NULL, worker_id = NULL, status = 'INACTIVE', updated_at = GETDATE()
       WHERE card_number = ?`,
      [card_number]
    );
    
    res.json({
      success: true,
      message: `Card ${card_number} unassigned successfully`
    });
  } catch (err) {
    console.error("PUT /food-cards/:card_number/unassign error:", err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

// --- GET assigned cards ---
app.get('/food-cards/assigned', async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let whereClause = 'fc.iqama_number IS NOT NULL';
    const params = [];
    
    if (search) {
      whereClause += ' AND (fc.card_number LIKE ? OR fc.iqama_number LIKE ? OR w.name LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    
    const countSql = `
      SELECT COUNT(*) as total
      FROM food_cards fc
      LEFT JOIN workers w ON fc.iqama_number = w.iqamaNumber
      WHERE ${whereClause}
    `;
    
    const countResult = await query(countSql, params);
    const total = countResult[0]?.total || 0;
    
    const dataSql = `
      SELECT 
        fc.id,
        fc.card_number,
        fc.iqama_number,
        fc.status,
        fc.issue_date,
        w.id as worker_id,
        w.name,
        w.supplier,
        w.position,
        w.roomNumber
      FROM food_cards fc
      LEFT JOIN workers w ON fc.iqama_number = w.iqamaNumber
      WHERE ${whereClause}
      ORDER BY fc.card_number
      OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
    `;
    
    const dataParams = [...params, offset, parseInt(limit)];
    const results = await query(dataSql, dataParams);
    
    res.json({ 
      success: true,
      cards: results,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error("GET /food-cards/assigned error:", err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

// --- GET available cards ---
app.get('/food-cards/available', async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let whereClause = 'iqama_number IS NULL';
    const params = [];
    
    if (search) {
      whereClause += ' AND card_number LIKE ?';
      params.push(`%${search}%`);
    }
    
    const countSql = `
      SELECT COUNT(*) as total
      FROM food_cards
      WHERE ${whereClause}
    `;
    
    const countResult = await query(countSql, params);
    const total = countResult[0]?.total || 0;
    
    const dataSql = `
      SELECT 
        id,
        card_number,
        status,
        issue_date
      FROM food_cards
      WHERE ${whereClause}
      ORDER BY card_number
      OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
    `;
    
    const dataParams = [...params, offset, parseInt(limit)];
    const results = await query(dataSql, dataParams);
    
    res.json({ 
      success: true,
      cards: results,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error("GET /food-cards/available error:", err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

// --- GET card summary ---
app.get('/food-cards/summary', async (req, res) => {
  try {
    const sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN iqama_number IS NOT NULL THEN 1 ELSE 0 END) as assigned,
        SUM(CASE WHEN iqama_number IS NULL THEN 1 ELSE 0 END) as available,
        MIN(card_number) as first_card,
        MAX(card_number) as last_card
      FROM food_cards
    `;
    
    const result = await query(sql);
    const summary = result[0];
    
    const assignedPercentage = summary.total > 0 
      ? ((summary.assigned / summary.total) * 100).toFixed(2)
      : "0";
    
    res.json({ 
      success: true,
      summary: {
        ...summary,
        assigned_percentage: assignedPercentage,
        available_percentage: (100 - parseFloat(assignedPercentage)).toFixed(2)
      }
    });
  } catch (err) {
    console.error("GET /food-cards/summary error:", err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

// ============ START SERVER ============

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;