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
    } catch (error) {
        console.error('Failed to initialize database:', error);
        throw error;
    }
}, 1000);

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

describe("GET /companies/:code", function () {
    const testCompany = {
        code: "goog",
        name: "Google",
        description: "G",
        invoices: [],
    };

    afterEach(async () => {
        await db.query('TRUNCATE TABLE companies RESTART IDENTITY CASCADE');
        await db.query('TRUNCATE TABLE invoices RESTART IDENTITY CASCADE');
    });
    beforeEach(async () => {
        await db.query(
            `INSERT INTO companies(code, name, description) VALUES($1, $2, $3)`,
            [testCompany.code, testCompany.name, testCompany.description]
        );
    });

    test("Returns a single company", async function () {
        try {
            const response = await request(app).get(`/companies/${testCompany.code}`);
            expect(response.statusCode).toEqual(200);
            expect(response.body).toEqual({ company: testCompany });
        } catch (error) {
            console.error("Test failed:", error);
            throw error;
        }
    }, 1000);

    test("Responds with 404 if company not found", async function () {
        const response = await request(app).get(`/companies/nonexistent`);
        expect(response.statusCode).toEqual(404);
        expect(response.body).toHaveProperty('error');
    });

    test("Responds with 500 for internal server error", async function () {
        process.env.TEST_DB_ERROR = 'true';
        const response = await request(app).get(`/companies/${testCompany.code}`);
        expect(response.statusCode).toEqual(500);
        expect(response.body).toHaveProperty('error');
        delete process.env.TEST_DB_ERROR;
    });
});

describe("POST /companies", function () {
    afterEach(async function () {
        await db.query('TRUNCATE TABLE companies RESTART IDENTITY CASCADE');
        await db.query('TRUNCATE TABLE invoices RESTART IDENTITY CASCADE');
    });

    test("Creates a new company successfully", async function () {
        const response = await request(app).post('/companies').send({
            code: 'new-code',
            name: 'New Company',
            description: 'Description'
        });
        expect(response.statusCode).toEqual(201);
        expect(response.body.company.code).toBe('new-code');
    });

    test("Handles invalid input", async function () {
        const response = await request(app).post('/companies').send({
            code: null,
            name: '',
            description: 'Invalid'
        });

        expect(response.statusCode).toEqual(400);
        expect(response.body.message).toContain('Code must have an input.');
    });

    test("Checks for existing company", async function () {
        const existingCompany = [{ code: 'existing-code', name: 'Existing Company' }];
        const response = await request(app).post('/companies').send({
            code: 'existing-code',
            name: 'New Company',
            description: 'Description'
        });
        expect(response.statusCode).toEqual(201);

        const response2 = await request(app).post('/companies').send({
            code: 'existing-code',
            name: 'New Company',
            description: 'Description'
        });
        expect(response2.statusCode).toEqual(400);
        expect(response2.body.message).toContain(`duplicate code already exists`);
    });

    test("Handles database errors", async function () {
        process.env.TEST_DB_ERROR = 'true';
        const response = await request(app).post('/companies').send({
            code: 'new-code',
            name: 'New Company',
            description: 'Description'
        });
        expect(response.statusCode).toEqual(500);
        expect(response.body).toHaveProperty('error');
        delete process.env.TEST_DB_ERROR;
        expect(response.body.message).toContain('Failed to create company');
    });
});