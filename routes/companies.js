const express = require('express');
const axios = require('axios');
const router = express.Router();
const ExpressError = require("../expressError");
const helpers = require('../helpers');


async function setupCompanyRoutes(db) {
    router.get('', async function (req, res, next) {
        try {
            if (Object.keys(req.body).length !== 0)
                return next(new ExpressError("Extra data not allowed for this endpoint.", 400));
            if (Object.keys(req.params).length !== 0)
                return next(new ExpressError("Extra params not allowed for this endpoint.", 400));
            let retrievedCompanies;
            try {
                if (process.env.TEST_DB_ERROR === 'true')
                    throw new Error('Simulated database error');
                retrievedCompanies = await db.query(`
                    SELECT 
                        code, 
                        name 
                    FROM 
                        companies`);
            } catch (dbError) {
                console.error(dbError);
                return next(new ExpressError(`Failed to get companies: ${dbError.message}`));
            }
            if (!retrievedCompanies ||
                retrievedCompanies.length === 0)
                return next(new ExpressError("There are no companies.", 404));
            return res.json({ companies: retrievedCompanies.rows });
        } catch (err) {
            console.error('Error fetching companies:', err.message);
            next(new ExpressError('Failed to fetch companies'));
        }
    });

    router.get('/:code', async function (req, res, next) {
        try {
            if (Object.keys(req.body).length !== 0)
                return next(new ExpressError("Extra data not allowed in this endpoint.", 400));
            if (Object.keys(req.params).length === 0)
                return next(new ExpressError("Request must have a parameter like: /<Company Code>", 400));
            const searchedCode = helpers.sanitizeInput(req.params.code.toString());
            if (searchedCode == null ||
                typeof searchedCode !== 'string' ||
                searchedCode.length === 0)
                return next(new ExpressError("Code must have an input.", 400));
            if (searchedCode.length > 2048)
                return next(new ExpressError("Code has a max length of 2048.", 400));
            let retrievedCompany;
            try {
                if (process.env.TEST_DB_ERROR === 'true')
                    throw new Error('Simulated database error');
                retrievedCompany = await db.query(
                    `SELECT 
                        code, 
                        name, 
                        description 
                    FROM 
                        companies 
                    WHERE 
                        code = $1`,
                    [searchedCode]);
            } catch (dbError) {
                return next(new ExpressError(`Failed to get company: ${dbError.message}`));
            }
            if (!retrievedCompany ||
                !retrievedCompany.rows ||
                retrievedCompany.rows.length === 0)
                return next(new ExpressError('Company not found for code: ' + searchedCode, 404));
            const retrievedCompanyResponse = retrievedCompany.rows[0];
            let retrievedInvoices;
            try {
                retrievedInvoices = await db.query(
                    `SELECT
                        id
                    FROM 
                        invoices
                    WHERE
                        'code'=$1`,
                    [retrievedCompany.rows[0].code]
                );
            } catch (dbError) {
                console.debug(`Failed to get invoices: ${dbError.message}`);
            }
            if (retrievedInvoices &&
                retrievedInvoices.length !== 0)
                retrievedCompanyResponse.invoices = retrievedInvoices.rows;

            return res.json({ company: retrievedCompanyResponse });
        } catch (err) {
            console.error('Error fetching company', err.message);
            return next(new ExpressError(
                'Failed to fetch company for provided code'));
        }
    });

    router.post('/', async function (req, res, next) {
        try {
            if (Object.keys(req.body).length === 0)
                return next(new ExpressError("Body not found in request.", 400));
            if (Object.keys(req.params).length !== 0)
                return next(new ExpressError("Params are not allowed for this endpoint.", 400));
            const newCode = helpers.sanitizeInput(req.body.code);
            if (newCode == null ||
                typeof newCode !== 'string' ||
                newCode.length === 0)
                return next(new ExpressError("Code must have an input.", 400));
            if (newCode.length > 2048)
                return next(new ExpressError("Code has a max length of 2048.", 400));
            const newName = helpers.sanitizeInput(req.body.name);
            if (typeof newName !== 'string' ||
                newName.length === 0)
                return next(new ExpressError("Name value must have a valid input.", 400));
            const newDescription = helpers.sanitizeInput(req.body.description);
            if (typeof newDescription !== 'string')
                return next(new ExpressError("Description provided must be a string or empty.", 400));
            if (newDescription.length > 2048)
                return next(new ExpressError("Description has a max length of 2048.", 400));
            let newCompany;
            try {
                if (process.env.TEST_DB_ERROR === 'true')
                    throw new Error('Simulated database error');
                newCompany = await db.query(
                    `INSERT INTO 
                        companies 
                        (code, name, description) 
                    VALUES 
                        ($1, $2, $3) 
                    RETURNING 
                        *`,
                    [newCode, newName, newDescription]
                );
            } catch (dbError) {
                if (dbError.message.includes(`duplicate key value violates unique constraint`))
                    return next(new ExpressError(
                        `Company with duplicate code already exists!`, 400));
                return next(new ExpressError(
                    `Failed to create company: ${dbError.message}`));
            }
            if (!newCompany ||
                newCompany.length === 0)
                return next(new ExpressError(
                    `Failed to create company. Check if code '${newCode}' already exists`, 400));
            console.log(`Creating new company: ${JSON.stringify(newCompany.rows[0])}`);
            return res.status(201).json({ company: newCompany.rows[0] });
        } catch (err) {
            console.error('Error creating company:', err.message);
            return next(new ExpressError('Failed to create new company'));
        }
    });

    router.put('/:code', async function (req, res, next) {
        try {
            if (Object.keys(req.body).length === 0)
                return next(new ExpressError("Updated company data not found in request.", 400));
            if (Object.keys(req.params).length === 0)
                return next(new ExpressError("Company Code not found in params.", 400));
            const currentCode = helpers.sanitizeInput(req.params.code);
            if (currentCode == null ||
                typeof currentCode !== 'string' ||
                currentCode.length === 0)
                return next(new ExpressError("Code must have an input: /companies/:code", 400));
            if (currentCode.length > 2048)
                return next(new ExpressError("Code has a max length of 2048.", 400));
            const newName = helpers.sanitizeInput(req.body.name);
            if (typeof newName !== 'string' ||
                newName.length === 0)
                return next(new ExpressError("Name value must have a valid input.", 400));
            if (newName.length > 2048)
                return next(new ExpressError("Name has a max length of 2048.", 400));
            const newDescription = helpers.sanitizeInput(req.body.description);
            if (typeof newDescription !== 'string')
                return next(new ExpressError("Description provided must be a string.", 400));
            if (newDescription.length > 2048)
                return next(new ExpressError("Description has a max length of 2048.", 400));
            let currentCompany;
            try {
                if (process.env.TEST_DB_ERROR === 'true')
                    throw new Error('Simulated database error');
                currentCompany = await db.query(
                    `UPDATE  
                        companies 
                    SET 
                        name=$1,
                        description=$2 
                    WHERE 
                        code=$3 
                    RETURNING 
                        code, 
                        name, 
                        description`,
                    [newName, newDescription, currentCode]
                );
            } catch (dbError) {
                console.debug(`Failed to get invoices: ${dbError.message}`);
            }
            if (!currentCompany ||
                !currentCompany.rows ||
                currentCompany.rows.length === 0)
                return next(new ExpressError(
                    `Failed to update company. Check if Company Code: '${currentCode}' exists`, 400));
            return res.json({ company: currentCompany.rows[0] });
        } catch (err) {
            console.error('Error updating company:', err.message);
            return next(new ExpressError('Failed to update company'));
        }
    });

    router.delete('/:code', async function (req, res, next) {
        try {
            if (Object.keys(req.params).length === 0)
                return next(new ExpressError("Params for endpoint not found in this request. /companies/:code", 400));
            if (Object.keys(req.body).length !== 0)
                return next(new ExpressError("Body not allowed in this request.", 400));
            const currentCode = helpers.sanitizeInput(req.params.code);
            if (currentCode == null ||
                typeof currentCode !== 'string' ||
                currentCode.length === 0)
                return next(new ExpressError("Code must have an input.", 400));
            if (currentCode.length > 2048)
                return next(new ExpressError("Code has a max length of 2048.", 400));
            let currentCompany;
            try {
                if (process.env.TEST_DB_ERROR === 'true')
                    throw new Error('Simulated database error');
                const currentCompany = await db.query(
                    `DELETE FROM 
                        companies 
                    WHERE 
                        code=$1
                    RETURNING
                        code`,
                    [currentCode]
                );
            } catch (dbError) {
                console.debug(`Failed to get invoices: ${dbError.message}`);
            }
            if (!currentCompany ||
                !currentCompany.rows ||
                currentCompany.rows.length === 0)
                return next(new ExpressError(
                    `Failed to delete company. Company Code: '${currentCode}' does not exist`, 400));
            return res.json({ status: "deleted" });
        } catch (err) {
            console.error(`Failed to delete company.`, err.message);
            return next(new ExpressError(
                'Failed to delete company. A server error occured: ' + err.message));
        }
    });

    return router;
}

module.exports = setupCompanyRoutes;
