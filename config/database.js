// const sql = require('msnodesqlv8');

// const dbConfig = {
//   connectionString: 
//     "server=localhost\\SQLEXPRESS;Database=Company Management;Trusted_Connection=Yes;Driver={SQL Server Native Client 11.0}"
// };

// function query(queryString, params = []) {
//   return new Promise((resolve, reject) => {
//     sql.query(dbConfig.connectionString, queryString, params, (err, rows) => {
//       if (err) reject(err);
//       else resolve(rows);
//     });
//   });
// }

// module.exports = { query };


const sql = require('mssql');
 
const dbConfig = {
  user: 'db50902',
  password: '9p-D%Fi3o_4G',
  server: 'db50902.public.databaseasp.net',
  port: 1433,
  database: 'db50902',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  }
};

let pool = null;

async function getConnection() {
  if (!pool) {
    pool = await sql.connect(dbConfig);
  }
  return pool;
}

async function query(queryString, params = []) {
  try {
    const connection = await getConnection();
    const request = connection.request();
    
    // Add parameters if provided
    params.forEach((param, index) => {
      request.input(`param${index}`, param);
    });
    
    const result = await request.query(queryString);
    return result.recordset;
  } catch (err) {
    console.error('Database error:', err);
    throw err;
  }
}

module.exports = { query, sql };