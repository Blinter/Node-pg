const express = require('express');
const axios = require('axios');
const router = express.Router();
const ExpressError = require("../expressError");
const helpers = require('../helpers');


async function setupInvoiceRoutes(db) {
    router.get('', async function (req, res, next) {
        try {
            if (Object.keys(req.body).length !== 0)
                return next(new ExpressError("Extra data not allowed for this endpoint.", 400));
            if (Object.keys(req.params).length !== 0)
                return next(new ExpressError("Extra params not allowed for this endpoint.", 400));
            let retrievedInvoices;
            try {
                if (process.env.TEST_DB_ERROR === 'true')
                    throw new Error('Simulated database error');
                retrievedInvoices = await db.query(`
                    SELECT 
                        id, 
                        comp_code 
                    FROM 
                        invoices`);
            } catch (dbError) {
                return next(new ExpressError(`Failed to read invoices: ${dbError.message}`));
            }
            if (!retrievedInvoices ||
                retrievedInvoices.length === 0)
                return next(new ExpressError("There are no invoices to retrieve.", 404));
            return res.json({ invoices: retrievedInvoices.rows });
        } catch (err) {
            console.error('Error fetching invoices:', err.message);
            return next(new ExpressError('There was an error retrieving invoices.', 404));
        }
    });

    router.get('/:id', async function (req, res, next) {
        let searchedInvoiceId;
        try {
            if (Object.keys(req.body).length !== 0)
                return next(new ExpressError("Extra data not allowed in this endpoint.", 400));
            if (Object.keys(req.params).length === 0)
                return next(new ExpressError("Request must have a parameter like /<Invoice Number>", 400));
            searchedInvoiceId = helpers.sanitizeInput(req.params.id);
            if (searchedInvoiceId == null ||
                typeof searchedInvoiceId !== 'string' ||
                searchedInvoiceId.length === 0)
                return next(new ExpressError("Invoice ID must have an input like /<Invoice Number>", 400));
            if (isNaN(searchedInvoiceId) ||
                !isFinite(searchedInvoiceId))
                return next(new ExpressError("Invoice ID must be a number.", 400));
            let retrievedInvoice;
            try {
                if (process.env.TEST_DB_ERROR === 'true')
                    throw new Error('Simulated database error');
                retrievedInvoice = await db.query(
                    `SELECT 
                        i.id, 
                        i.amt, 
                        i.paid, 
                        i.add_date, 
                        i.paid_date, 
                        c.code AS company_code, 
                        c.name AS company_name, 
                        c.description AS company_description
                    FROM 
                        invoices AS i 
                    LEFT JOIN 
                        companies AS c 
                    ON
                        i.comp_code = c.code 
                    WHERE 
                        i.id=$1`,
                    [searchedInvoiceId]
                );
            } catch (dbError) {
                return next(new ExpressError(
                    `Failed to retrieve Invoice for ID ${searchedInvoiceId} - ${dbError.message}`));
            }
            if (!retrievedInvoice ||
                !retrievedInvoice.rows ||
                retrievedInvoice.rows.length === 0)
                return next(new ExpressError('Invoice not found for ID:' + searchedInvoiceId, 404));
            const currentInvoice = retrievedInvoice.rows[0];
            return res.json({
                invoice: {
                    id: currentInvoice.id,
                    amt: currentInvoice.amt,
                    paid: currentInvoice.paid,
                    add_date: currentInvoice.add_date,
                    paid_date: currentInvoice.paid_date,
                    company: {
                        code: currentInvoice.company_code,
                        name: currentInvoice.company_name,
                        description: currentInvoice.company_description ?
                            currentInvoice.company_description : ""
                    }
                }
            });
        } catch (err) {
            console.error('Error fetching Invoice', searchedInvoiceId + ":", err.message);
            return next(new ExpressError(
                'Failed to fetch invoice for ID:' + searchedInvoiceId));
        }
    });

    router.post('', async function (req, res, next) {
        try {
            if (Object.keys(req.body).length === 0)
                return next(new ExpressError("Body not found in request.", 400));
            if (Object.keys(req.params).length !== 0)
                return next(new ExpressError("Params are not allowed for this endpoint.", 400));
            const newCode = helpers.sanitizeInput(req.body.comp_code);
            if (newCode == null ||
                typeof newCode !== 'string' ||
                newCode.length === 0)
                return next(new ExpressError("Code must have an input.", 400));
            if (newCode.length > 2048)
                return next(new ExpressError("Code has a max length of 2048.", 400));
            const newAmount = helpers.sanitizeInput(req.body.amt);
            if (typeof newAmount !== 'string' ||
                newAmount.length === 0)
                return next(new ExpressError("Amount value must have a valid input.", 400));
            if (isNaN(newAmount) ||
                !isFinite(newAmount))
                return next(new ExpressError("Amount must be a number.", 400));
            let newInvoice;
            try {
                if (process.env.TEST_DB_ERROR === 'true')
                    throw new Error('Simulated database error');
                newInvoice = await db.query(
                    `INSERT INTO 
                        invoices 
                        (comp_code, amt)
                    VALUES 
                        ($1, $2) 
                    RETURNING 
                        id, 
                        comp_code, 
                        amt,
                        paid, 
                        add_date, 
                        paid_date`,
                    [newCode, newAmount]
                );
            } catch (dbError) {
                return next(new ExpressError(`Failed to create invoice: ${dbError.message}`));
            }
            if (!newInvoice ||
                newInvoice.length === 0)
                return next(new ExpressError(`Failed to create invoice. Check your inputs`));
            console.log(`Creating new invoice: ${JSON.stringify(newInvoice.rows[0])}`);
            return res.status(201).json({ invoice: newInvoice.rows[0] });
        } catch (err) {
            console.error('Error creating invoice:', err.message);
            return next(new ExpressError('Failed to create new invoice'));
        }
    });

    router.put('/:id', async function (req, res, next) {
        try {
            if (Object.keys(req.body).length === 0)
                return next(new ExpressError("Updated invoice data not found in request.", 400));
            if (Object.keys(req.params).length === 0)
                return next(new ExpressError("Your request must have a parameter like /<Invoice Number>", 400));
            const searchedInvoiceId = helpers.sanitizeInput(req.params.id);
            if (searchedInvoiceId == null ||
                typeof searchedInvoiceId !== 'string' ||
                searchedInvoiceId.length === 0)
                return next(new ExpressError("Invoice ID must have an input like /<Invoice Number>", 400));
            if (isNaN(searchedInvoiceId) ||
                !isFinite(searchedInvoiceId))
                return next(new ExpressError("Invoice ID must be a number.", 400));
            const updatedAmt = helpers.sanitizeInput(req.body.amt);
            if (updatedAmt == null ||
                typeof updatedAmt !== 'string' ||
                updatedAmt.length === 0)
                return next(new ExpressError("Invoice Amount must have an input in body like {amt: xxxx}", 400));
            if (!isNaN(updatedAmt) ||
                !isFinite(updatedAmt))
                return next(new ExpressError("Invoice Amount must be a number.", 400));
            let updatedInvoice;
            try {
                if (process.env.TEST_DB_ERROR === 'true')
                    throw new Error('Simulated database error');
                updatedInvoice = await db.query(
                    `UPDATE FROM 
                        invoices 
                    SET 
                        amt=$1
                    WHERE
                        id=$2 
                    RETURNING 
                        id, 
                        comp_code, 
                        amt, 
                        paid, 
                        add_date, 
                        paid_date`,
                    [updatedAmt, searchedInvoiceId]
                );
            } catch (dbError) {
                return next(new ExpressError(`Failed to update invoice: ${dbError.message}`));
            }
            if (updatedInvoice.length === 0)
                return next(new ExpressError(
                    `Failed to update invoice. Check if Invoice: '${searchedInvoiceId}' does not exist.`, 400));
            return res.json({ invoice: updatedInvoice.rows[0] });
        } catch (err) {
            console.error('Error updating invoice:', err.message);
            return next(new ExpressError(
                'Failed to update invoice.'));
        }
    });

    router.delete('/:code', async function (req, res, next) {
        try {
            if (Object.keys(req.body).length !== 0)
                return next(new ExpressError("Extra data not allowed in this endpoint.", 400));
            if (Object.keys(req.params).length === 0)
                return next(new ExpressError("Your request must have a parameter like /<Invoice Number>", 400));
            const currentInvoiceId = helpers.sanitizeInput(req.params.id.toString());
            if (!currentInvoiceId ||
                isNaN(currentInvoiceId)) {
                return next(new ExpressError("Invoice ID must be a valid number.", 400));
            }
            if (isNaN(currentInvoiceId) ||
                !isFinite(currentInvoiceId))
                return next(new ExpressError("Invoice ID must be a number.", 400));
            let deletedInvoice;
            try {
                if (process.env.TEST_DB_ERROR === 'true')
                    throw new Error('Simulated database error');
                deletedInvoice = await db.query(
                    `DELETE FROM 
                        invoices 
                    WHERE 
                        id=$1
                    RETURNING id`,
                    [currentInvoiceId]
                );
            } catch (dbError) {
                return next(new ExpressError(`Failed to delete invoice: ${dbError.message}`));
            }

            if (deletedInvoice.length === 0)
                return next(new ExpressError(
                    `Failed to delete Invoice. Check Invoice ID if valid.`, 404));
            return next(new ExpressError('Failed to delete invoice'));
        } catch (err) {
            console.error(`Failed to delete invoice.`, err.message);
            return next(new ExpressError('Failed to delete invoice'));
        }
    });

    return router;
}

module.exports = setupInvoiceRoutes;
