/** Database setup for BizTime. */

const { Client, Pool } = require("pg");
const uriPrefix = "postgresql:///";
let dbName;
if (process.env.NODE_ENV === "test")
    dbName = "biztime_test";
else
    dbName = "biztime";
const requiredTables = ['companies', 'invoices'];
async function createDatabaseIfNotExists() {
    const tempDb = new Client({ connectionString: uriPrefix + "postgres" });
    try {
        await tempDb.connect();
        const result = await tempDb.query(
            `SELECT 
                datname 
            FROM 
                pg_catalog.pg_database 
            WHERE 
                datname = $1`, [dbName]
        );
        if (result.rows.length === 0)
            await tempDb.query(`
                CREATE DATABASE ${dbName}
                `);
    } catch (err) {
        console.error(`Error in createDatabaseIfNotExists:`, err.message);
        throw err;
    } finally {
        await tempDb.end();
    }
}

async function preseedFunction(dbClient, tableName) {
    if (process.env.NODE_ENV === "test")
        return;
    let query;
    let values;
    switch (tableName) {
        case 'companies':
            query = `
                INSERT INTO 
                    companies 
                    (code, name, description)
                VALUES 
                    ($1, $2, $3), 
                    ($4, $5, $6)
            `;
            values = [
                'apple', 'Apple Computer', 'Maker of OSX.',
                'ibm', 'IBM', 'Big blue.'
            ];
            break;
        case 'invoices':
            query = `
                INSERT INTO 
                    invoices 
                    (comp_code, amt, paid, paid_date)
                VALUES 
                    ($1, $2, $3, $4), 
                    ($5, $6, $7, $8), 
                    ($9, $10, $11, $12), 
                    ($13, $14, $15, $16)
            `;
            values = [
                'apple', 100, false, null,
                'apple', 200, false, null,
                'apple', 300, true, '2018-01-01',
                'ibm', 400, false, null
            ];
            break;
        default:
            throw new Error(`Unknown table: ${tableName}`);
    }
    try {
        await dbClient.query(query, values);
        console.log(`Table ${tableName} seeded successfully.`);
    } catch (err) {
        console.error("Error in preseedFunction. Table:", tableName, err.message);
        throw err;
    }
}

async function checkTables() {
    const tempDb = new Client({ connectionString: `${uriPrefix}${dbName}` });
    try {
        await tempDb.connect();
        const result = await tempDb.query(`
            SELECT 
                tablename 
            FROM 
                pg_catalog.pg_tables 
            WHERE 
                schemaname != 'pg_catalog' 
                AND 
                schemaname != 'information_schema'
        `);
        const existingTables = result.rows.map(row => row.tablename);
        for (const table of requiredTables) {
            if (!existingTables.includes(table)) {
                console.log(`Table ${table} does not exist in ${dbName}. Creating...`);
                await createTable(tempDb, table);
                await preseedFunction(tempDb, table);
            }
        }
    } catch (err) {
        console.error(`Error in checkTables():`, err.message);
        throw err;
    } finally {
        await tempDb.end();
    }
}

async function createTable(dbClient, tableName) {
    let query;
    switch (tableName) {
        case 'companies':
            query = `
                CREATE TABLE companies (
                    code TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT
                )`;
            break;
        case 'invoices':
            query = `
                CREATE TABLE invoices (
                    id SERIAL PRIMARY KEY,
                    comp_code TEXT NOT NULL REFERENCES companies ON DELETE CASCADE,
                    amt FLOAT NOT NULL,
                    paid BOOLEAN DEFAULT false NOT NULL,
                    add_date DATE DEFAULT CURRENT_DATE NOT NULL,
                    paid_date DATE,
                    CONSTRAINT invoices_amt_check CHECK ((amt > (0)::double precision))
                )`;
            break;
        default:
            throw new Error(`Unknown table: ${tableName}`);
    }
    try {
        await dbClient.query(query);
        console.log(`Table ${tableName} created successfully.`);
    } catch (err) {
        console.error(`Error creating table ${tableName}:`, err.message);
        throw err;
    }
}

let db;
async function initializeDatabase() {
    try {
        await createDatabaseIfNotExists();
        await checkTables();
        if (!db)
            db = new Pool({ connectionString: `${uriPrefix}${dbName}` });
        await db.connect().then(() => {
            console.log(`Connected to ${dbName}`);
        }).catch((err) => {
            console.error('Error connecting to database:', err);
            throw err;
        });
        return db;
    } catch (error) {
        console.error("Error during database initialization:", error.message);
        throw error;
    }
}

module.exports = { initializeDatabase };
