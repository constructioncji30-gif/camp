 


const express = require('express');
const cors = require('cors');
const Worker = require('./Models/Worker');
const { query } = require('./config/database');
const Staff = require('./Models/Staff');

const app = express();
app.use(cors());
app.use(express.json());

// --- Helper functions ---
function parseDate(str) {
  return str ? new Date(str) : null;
}

function safeString(str) {
  return str ?? null; // undefined => null
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
    safeString(worker.roomNumber)
  ];
}

// --- CREATE worker ---
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
app.post('/workers', async (req, res) => {
  try {
    const worker = new Worker(req.body);
 
    const sqlInsert = `
      INSERT INTO workers
        (name, iqamaNumber, supplier, position, phone, dateJoined, leaveDate, roomNumber)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await query(sqlInsert, prepareWorkerParams(worker));

    res.status(201).json({ message: "Worker created successfully", worker });
  } catch (err) {
    console.error("POST /workers error:", err);
    res.status(500).json({ error: err.message });
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
      SELECT id, name, iqamaNumber, supplier, position, phone, dateJoined, leaveDate, roomNumber
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
        MEDICAL:row.MEDICAL,
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
      MEDICAL:row.MEDICAL
    });
    worker.id = row.id;

    res.json({ worker });
  } catch (err) {
    console.error("GET /workers/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- UPDATE worker by ID ---
app.put('/workers/:id', async (req, res) => {
  try {
    const id = req.params.id;

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
        row.MEDICAL=?,
      WHERE id = ?
    `;

    await query(sqlUpdate, [...prepareWorkerParams(req.body), id]);

    res.json({ message: "Worker updated successfully" });
  } catch (err) {
    console.error("PUT /workers/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- DELETE worker by ID ---
app.delete('/workers/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const sqlDelete = `DELETE FROM workers WHERE id = ?`;
    await query(sqlDelete, [id]);

    res.json({ message: "Worker deleted successfully" });
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

    // Validate leave date
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
      message: "Worker marked as left successfully",
      leaveDate: leaveDate
    });
  } catch (err) {
    console.error("PUT /workers/:id/leave error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/workers/:id/MEDICAL', async (req, res) => {
  try {
    const id = req.params.id;
    const { MEDICAL } = req.body;

    // Validate leave date
    if (!MEDICAL) {
      return res.status(400).json({ error: "Leave date is required" });
    }

    const sqlUpdate = `
      UPDATE workers 
      SET MEDICAL = ? 
      WHERE id = ?
    `;

    await query(sqlUpdate, [MEDICAL, id]);

    res.json({ 
      message: "Worker marked as MEDICAL successfully",
      MEDICAL: MEDICAL
    });
  } catch (err) {
    console.error("PUT /workers/:id/MEDICAL error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- GET ACTIVE WORKERS (leaveDate IS NULL) ---
app.get('/workers-active', async (req, res) => {
  try {
    const sql = `
      SELECT id, name, iqamaNumber, supplier, position, phone, dateJoined, leaveDate, roomNumber,MEDICAL
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
        MEDICAL:row.MEDICAL
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

// --- GET LEFT WORKERS (leaveDate IS NOT NULL) ---
app.get('/workers-left', async (req, res) => {
  try {
    const sql = `
      SELECT id, name, iqamaNumber, supplier, position, phone, dateJoined, leaveDate, roomNumber,MEDICAL
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
        MEDICAL:row.MEDICAL
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

// --- REACTIVATE WORKER (set leaveDate to NULL) ---
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
      message: "Worker reactivated successfully"
    });
  } catch (err) {
    console.error("PUT /workers/:id/reactivate error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET available seats for all rooms (only active workers)
app.get('/rooms/available-seats', async (req, res) => {
  try {
    // Room capacity configuration
    const roomCapacities = {
      'C-34': 4,
      'C-35': 4
      // Add other special capacity rooms here
      // Default capacity is 6
    };

    // Count how many ACTIVE workers are assigned to each room
    const sql = `
      SELECT roomNumber, COUNT(*) AS occupied
      FROM workers
      WHERE roomNumber IS NOT NULL AND leaveDate IS NULL
      GROUP BY roomNumber
    `;

    const result = await query(sql);

    // Map results and calculate available seats
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
// --- GET all workers (NO pagination, NO search) ---
app.get('/workers-all', async (req, res) => {
  try {
    const sql = `
      SELECT id, name, iqamaNumber, supplier, position, phone, dateJoined, leaveDate, roomNumber,MEDICAL
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
        MEDICAL:row.MEDICAL
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

// --- GET dashboard data (only active workers) ---
app.get("/dashboard", async (req, res) => {
  try {
    const sqlWorkers = `
      SELECT id, name, iqamaNumber, supplier, position, phone, dateJoined, leaveDate, roomNumber,MEDICAL
      FROM workers
      WHERE leaveDate IS NULL  -- Only active workers
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
        MEDICAL:row.MEDICAL
      };
    });

    // ⭐ GET TOTAL EMPLOYEE COUNTS
    const countSql = `
      SELECT 
        COUNT(*) as totalEmployees,
        COUNT(CASE WHEN leaveDate IS NULL THEN 1 END) as activeEmployees,
        COUNT(CASE WHEN leaveDate IS NOT NULL THEN 1 END) as leftEmployees
      FROM workers
    `;

    const countResult = await query(countSql);
    const employeeCounts = countResult[0]; // Get first row

    // Count by normalized work detail
    const countMap = {};

    workers.forEach(w => {
      const key = w.position || "Unknown";
      countMap[key] = (countMap[key] || 0) + 1;
    });

    const dashboardCounts = Object.keys(countMap).map(key => ({
      workDetail: key,
      count: countMap[key],
    }));

    // ⭐ RETURN ALL DATA INCLUDING COUNTS
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

// --- Start server ---


// STAFF CRUD API ROUTES

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

    const params = [
      staff.name,
      staff.roomNumber,
      staff.designation,
      staff.phone,
      staff.email,
      staff.department,
      parseDate(staff.dateJoined),
      parseDate(staff.leaveDate)
    ];

    await query(sqlInsert, params);

    res.status(201).json({ message: "Staff created successfully", staff });
  } catch (err) {
    console.error("POST /staff error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- GET all staff with pagination + search ---
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

    res.json({ message: "Staff updated successfully" });
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

    res.json({ message: "Staff deleted successfully" });
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
      message: "Staff reactivated successfully"
    });
  } catch (err) {
    console.error("PUT /staff/:id/reactivate error:", err);
    res.status(500).json({ error: err.message });
  }
});
// Node.js/Express route
app.get("/workers-duplicates", async (req, res) => {
  const quer = `
    SELECT t.*, d.total AS duplicate_count
    FROM workers t
    JOIN (
        SELECT iqamaNumber, COUNT(*) AS total
        FROM workers
        GROUP BY iqamaNumber
        HAVING COUNT(*) > 1
    ) d ON t.iqamaNumber = d.iqamaNumber
    ORDER BY t.iqamaNumber;
  `;

  const rows = await query(quer);
  res.json({ duplicates: rows });
});



// ==================== FOOD CARDS BUSINESS LOGIC APIS ====================

// 1. GET workers for food card assignment (dropdown)


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
// 2. ASSIGN food card to worker
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
    
    // Check if card exists
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
    
    // Check if card already assigned
    if (cardCheck[0].iqama_number) {
      return res.status(400).json({ 
        success: false,
        error: `Card ${card_number} already assigned` 
      });
    }
    
    // Check if worker exists
    const workerCheck = await query(
      'SELECT id, name FROM workers WHERE iqamaNumber = ? AND leaveDate IS NULL',
      [iqama_number]
    );
    
    if (workerCheck.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: `Worker not found` 
      });
    }
    
    const worker = workerCheck[0];
    
    // Check if worker already has card
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
    
    // Assign card
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

// 3. UNASSIGN food card
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
        error: `Card not assigned` 
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
      message: `Card ${card_number} unassigned`
    });
  } catch (err) {
    console.error("PUT /food-cards/:card_number/unassign error:", err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

// 4. GET assigned cards with worker info
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
    
    // Count
    const countSql = `
      SELECT COUNT(*) as total
      FROM food_cards fc
      LEFT JOIN workers w ON fc.iqama_number = w.iqamaNumber
      WHERE ${whereClause}
    `;
    
    const countResult = await query(countSql, params);
    const total = countResult[0]?.total || 0;
    
    // Data
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

// 5. GET available cards
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
    
    // Count
    const countSql = `
      SELECT COUNT(*) as total
      FROM food_cards
      WHERE ${whereClause}
    `;
    
    const countResult = await query(countSql, params);
    const total = countResult[0]?.total || 0;
    
    // Data
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

// 6. GET card summary
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

// 7. INITIALIZE food cards (ZJ001-ZJ0138)
 

// --- Start server ---
 
 const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});