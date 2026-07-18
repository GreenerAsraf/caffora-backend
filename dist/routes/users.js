"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../lib/prisma"));
const auth_1 = require("../middleware/auth");
const role_1 = require("../middleware/role");
const validate_1 = require("../middleware/validate");
const validations_1 = require("../lib/validations");
const router = (0, express_1.Router)();
// All user routes require authentication
router.use(auth_1.requireAuth);
// GET /api/users — admin list all users
router.get('/', (0, role_1.requireRole)('ADMIN'), async (req, res) => {
    try {
        const { page = '1', limit = '10' } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
        const skip = (pageNum - 1) * limitNum;
        const [users, total] = await Promise.all([
            prisma_1.default.user.findMany({
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    avatar: true,
                    createdAt: true,
                    _count: { select: { orders: true, reviews: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limitNum,
            }),
            prisma_1.default.user.count(),
        ]);
        res.json({
            success: true,
            data: {
                users,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    totalPages: Math.ceil(total / limitNum),
                },
            },
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch users' });
    }
});
// GET /api/users/:id — admin get user details
router.get('/:id', (0, role_1.requireRole)('ADMIN'), async (req, res) => {
    try {
        const id = req.params.id;
        const user = await prisma_1.default.user.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                avatar: true,
                createdAt: true,
                _count: { select: { orders: true, reviews: true } },
            },
        });
        if (!user) {
            res.status(404).json({ success: false, message: 'User not found' });
            return;
        }
        res.json({ success: true, data: user });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch user' });
    }
});
// PATCH /api/users/:id/role — admin toggle role
router.patch('/:id/role', (0, role_1.requireRole)('ADMIN'), (0, validate_1.validate)(validations_1.updateRoleSchema), async (req, res) => {
    try {
        const { role } = req.body;
        const id = req.params.id;
        // Prevent admin from changing their own role
        if (id === req.user.userId) {
            res.status(400).json({ success: false, message: 'Cannot change your own role' });
            return;
        }
        const user = await prisma_1.default.user.update({
            where: { id },
            data: { role },
            select: { id: true, name: true, email: true, role: true },
        });
        res.json({ success: true, data: user });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update user role' });
    }
});
// PUT /api/users/profile — user update own profile
router.put('/profile', (0, validate_1.validate)(validations_1.updateProfileSchema), async (req, res) => {
    try {
        const user = await prisma_1.default.user.update({
            where: { id: req.user.userId },
            data: req.body,
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                avatar: true,
                createdAt: true,
            },
        });
        res.json({ success: true, data: user });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update profile' });
    }
});
exports.default = router;
