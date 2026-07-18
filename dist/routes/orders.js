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
// All order routes require authentication
router.use(auth_1.requireAuth);
// POST /api/orders — create order from cart
router.post('/', (0, validate_1.validate)(validations_1.createOrderSchema), async (req, res) => {
    try {
        const { address } = req.body;
        const userId = req.user.userId;
        // Get user's cart with items
        const cart = await prisma_1.default.cart.findUnique({
            where: { userId },
            include: {
                items: {
                    include: { product: true },
                },
            },
        });
        if (!cart || cart.items.length === 0) {
            res.status(400).json({ success: false, message: 'Cart is empty' });
            return;
        }
        // Validate stock for all items
        const stockErrors = [];
        for (const item of cart.items) {
            if (item.quantity > item.product.stock) {
                stockErrors.push(`"${item.product.title}" only has ${item.product.stock} in stock`);
            }
        }
        if (stockErrors.length > 0) {
            res.status(400).json({
                success: false,
                message: 'Insufficient stock',
                errors: stockErrors,
            });
            return;
        }
        // Calculate total
        const total = cart.items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
        // Create order + order items + reduce stock + clear cart in a transaction
        const order = await prisma_1.default.$transaction(async (tx) => {
            // Create order
            const newOrder = await tx.order.create({
                data: {
                    userId,
                    total: Math.round(total * 100) / 100,
                    address,
                    items: {
                        create: cart.items.map((item) => ({
                            productId: item.productId,
                            quantity: item.quantity,
                            price: item.product.price,
                        })),
                    },
                },
                include: {
                    items: {
                        include: {
                            product: { select: { id: true, title: true, images: true } },
                        },
                    },
                },
            });
            // Reduce stock for each product
            for (const item of cart.items) {
                await tx.product.update({
                    where: { id: item.productId },
                    data: { stock: { decrement: item.quantity } },
                });
            }
            // Clear cart
            await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
            return newOrder;
        });
        res.status(201).json({ success: true, data: order });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create order' });
    }
});
// GET /api/orders — user: own orders; admin: all orders
router.get('/', async (req, res) => {
    try {
        const { page = '1', limit = '10' } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
        const skip = (pageNum - 1) * limitNum;
        const isAdmin = req.user.role === 'ADMIN';
        const where = isAdmin ? {} : { userId: req.user.userId };
        const [orders, total] = await Promise.all([
            prisma_1.default.order.findMany({
                where,
                include: {
                    items: {
                        include: {
                            product: { select: { id: true, title: true, images: true } },
                        },
                    },
                    ...(isAdmin ? { user: { select: { id: true, name: true, email: true } } } : {}),
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limitNum,
            }),
            prisma_1.default.order.count({ where }),
        ]);
        res.json({
            success: true,
            data: {
                orders,
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
        res.status(500).json({ success: false, message: 'Failed to fetch orders' });
    }
});
// GET /api/orders/:id — order detail
router.get('/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const order = await prisma_1.default.order.findUnique({
            where: { id },
            include: {
                items: {
                    include: {
                        product: { select: { id: true, title: true, slug: true, images: true, price: true } },
                    },
                },
                user: { select: { id: true, name: true, email: true } },
            },
        });
        if (!order) {
            res.status(404).json({ success: false, message: 'Order not found' });
            return;
        }
        // Users can only view their own orders (admins can view any)
        if (req.user.role !== 'ADMIN' && order.userId !== req.user.userId) {
            res.status(403).json({ success: false, message: 'Access denied' });
            return;
        }
        res.json({ success: true, data: order });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch order' });
    }
});
// PATCH /api/orders/:id/status — admin update status
router.patch('/:id/status', (0, role_1.requireRole)('ADMIN'), (0, validate_1.validate)(validations_1.updateOrderStatusSchema), async (req, res) => {
    try {
        const { status } = req.body;
        const id = req.params.id;
        const order = await prisma_1.default.order.update({
            where: { id },
            data: { status },
            include: {
                items: {
                    include: {
                        product: { select: { id: true, title: true, images: true } },
                    },
                },
            },
        });
        res.json({ success: true, data: order });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update order status' });
    }
});
exports.default = router;
