const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env
require('dotenv').config();

let sslCert;

// Check if SSL certificate is available
try {
    sslCert = fs.readFileSync(path.join(__dirname, 'DigiCertGlobalRootCA.crt.pem'));
    console.log('[SSL Certificate] Loaded successfully.');
} catch (err) {
    console.warn('[SSL Certificate] Not loaded. Proceeding without SSL. Error:', err.message);
    sslCert = null; // Proceed without SSL if the certificate is not found
}

// Create a connection pool
const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306, // Add this line to specify the port
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
    ssl: sslCert ? { ca: sslCert } : undefined,
});


// Function to test the connection (optional, for debugging)
const testConnection = async () => {
    console.log('[MySQL Connection Test] Starting...');
    try {
        const connection = await db.getConnection();
        console.log('[MySQL Connection Test] Connection established successfully.');
        connection.release();
    } catch (err) {
        console.error('[MySQL Connection Test Error] Failed to connect to the database:', err.message);
    }
};

// Test the connection (optional, remove in production)
testConnection();

module.exports = db;
