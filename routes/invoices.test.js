const { beforeAll, afterEach, afterAll, describe, test } = require('@jest/globals');
process.env.NODE_ENV = "test";
const { initializeDatabase } = require('../db');
const setupApp = require("../app");
const axios = require('axios');
const request = require("supertest");
const express = require('express');
const { ExpressError } = require('../expressError');
const net = require('net');

let db;
let app;

function getAvailablePort(startPort = 3000) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', (err) => {
      server.close();
      if (err.code === 'EADDRINUSE') {
        resolve(getAvailablePort(startPort + 1));
      } else {
        reject(err);
      }
    });

    server.once('listening', () => {
      const port = server.address().port;
      server.close();
      resolve(port);
    });

    server.listen(startPort);
  });
}

(async () => {
  try {
    app = await setupApp();
    const newPort = await getAvailablePort();
    app.listen(newPort, function () {
      console.log("Listening on", newPort);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
})();

beforeAll(async () => {
  console.log('Starting database initialization...');
  try {
    db = await initializeDatabase();
    // console.log('Cleaning up database...');
    try {
      await db.query('TRUNCATE TABLE companies RESTART IDENTITY CASCADE');
      await db.query('TRUNCATE TABLE invoices RESTART IDENTITY CASCADE');
      console.log('Database cleaned up successfully.');
    } catch (error) {
      console.error('Failed to clean up database:', error);
    }
    // console.log('Database initialized successfully.');
    let query = `
        INSERT INTO 
            companies 
            (code, name, description)
        VALUES 
            ($1, $2, $3), 
            ($4, $5, $6)
    `;
    let values = [
      'apple', 'Apple Computer', 'Maker of OSX.',
      'ibm', 'IBM', 'Big blue.'
    ];
    try {
      await db.query(query, values);
      console.log(`Companies seeded successfully.`);
    } catch (err) {
      console.error("Error in preseedFunction.  Companies", err.message);
      throw err;
    }
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
    try {
      await db.query(query, values);
      console.log(`Invoices seeded successfully.`);
    } catch (err) {
      console.error("Error in preseedFunction. Invoices", err.message);
      throw err;
    }
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}, 5000);


afterEach(async () => {
  // console.log('Cleaning up database...');
  try {
    await db.query('TRUNCATE TABLE companies RESTART IDENTITY CASCADE');
    await db.query('TRUNCATE TABLE invoices RESTART IDENTITY CASCADE');
    console.log('Database cleaned up successfully.');
  } catch (error) {
    // console.error('Failed to clean up database:', error);
  }
});
describe("GET /invoices/:id", function () {
  afterEach(async () => {
    await db.query('TRUNCATE TABLE companies RESTART IDENTITY CASCADE');
    await db.query('TRUNCATE TABLE invoices RESTART IDENTITY CASCADE');
  });

  test("Returns a single invoice", async function () {
    try {
      const response = await request(app).post('/invoices/').send({
        comp_code: 'ibm',
        amt: '100',
      });
      expect(response.statusCode).toEqual(201);
      expect(response.body.invoice.comp_code).toBe('ibm');

      const invoiceId = response.body.invoice.id;

      const response2 = await request(app).get('/invoices/' + invoiceId);
      expect(response2.body.invoice.id).toEqual(invoiceId);
      expect(response2.body.invoice.amt).toEqual(100);
      expect(response2.body.invoice.paid).toBe(false);
      expect(response2.body.invoice.paid_date).toBe(null);
      expect(response2.body.invoice.company.code).toBe('ibm');
      expect(response2.body.invoice.company.name).toBe('IBM');
      expect(response2.body.invoice.company.description).toBe('Big blue.');
    } catch (error) {
      console.error("Test failed:", error);
      throw error;
    }
  });

  test("Responds with 404 if invoice not found", async function () {
    try {
      const response = await request(app).get('/invoices/999');
      expect(response.statusCode).toEqual(404);
      expect(response.body).toHaveProperty('error');
    } catch (error) {
      console.error("Test failed:", error);
      throw error;
    }
  });

  test("Responds with 400 for invalid input", async function () {
    const response = await request(app).get('/invoices/invalid');
    expect(response.statusCode).toEqual(400);
    expect(response.body).toHaveProperty('error');
  });

  test("Responds with 500 for internal server error", async function () {
    process.env.TEST_DB_ERROR = 'true'
    const response = await request(app).get('/invoices/1');
    expect(response.statusCode).toEqual(500);
    expect(response.body).toHaveProperty('error');
  });
});