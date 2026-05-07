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
    console.log('✅ Database connected successfully');
  }
  return pool;
}

// BEST VERSION: Uses regex to replace ALL ? placeholders
async function query(queryString, params = []) {
  try {
    const connection = await getConnection();
    const request = connection.request();
    
    // Add parameters
    params.forEach((param, index) => {
      request.input(`p${index}`, param);
    });
    
    // Replace ALL ? with @p0, @p1, etc. using regex
    let formattedQuery = queryString;
    let counter = 0;
    formattedQuery = formattedQuery.replace(/\?/g, () => `@p${counter++}`);
    
    // Debug logging (remove in production)
    console.log('SQL:', formattedQuery);
    console.log('Params:', params);
    
    const result = await request.query(formattedQuery);
    return result.recordset;
  } catch (err) {
    console.error('Database error:', err.message);
    console.error('Failed query:', queryString);
    console.error('Params:', params);
    throw err;
  }
}

module.exports = { query, sql };