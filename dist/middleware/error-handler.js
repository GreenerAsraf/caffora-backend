"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const client_1 = require("@prisma/client");
const errorHandler = (err, req, res, _next) => {
    // Prisma known errors
    if (err instanceof client_1.Prisma.PrismaClientKnownRequestError) {
        switch (err.code) {
            case 'P2002': {
                const target = err.meta?.target?.join(', ') || 'field';
                res.status(409).json({
                    success: false,
                    message: `A record with this ${target} already exists`,
                });
                return;
            }
            case 'P2025':
                res.status(404).json({
                    success: false,
                    message: 'Record not found',
                });
                return;
            case 'P2003':
                res.status(400).json({
                    success: false,
                    message: 'Related record not found',
                });
                return;
            default:
                break;
        }
    }
    // Prisma validation errors
    if (err instanceof client_1.Prisma.PrismaClientValidationError) {
        res.status(400).json({
            success: false,
            message: 'Invalid data provided',
        });
        return;
    }
    // Default server error
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        success: false,
        message: err.message || 'Internal server error',
    });
};
exports.errorHandler = errorHandler;
