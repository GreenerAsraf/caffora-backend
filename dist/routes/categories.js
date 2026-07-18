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
// GET /api/categories — list all
router.get('/', async (req, res) => {
    try {
        const categories = await prisma_1.default.category.findMany({
            include: {
                _count: { select: { products: true } },
            },
            orderBy: { name: 'asc' },
        });
        res.json({ success: true, data: categories });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch categories' });
    }
});
// GET /api/categories/:slug — single with products
router.get('/:slug', async (req, res) => {
    try {
        const slug = req.params.slug;
        const category = await prisma_1.default.category.findUnique({
            where: { slug },
            include: {
                products: {
                    include: {
                        reviews: { select: { rating: true } },
                    },
                },
            },
        });
        if (!category) {
            res.status(404).json({ success: false, message: 'Category not found' });
            return;
        }
        // Add average rating to each product
        const productsWithRating = category.products.map((product) => {
            const ratings = product.reviews.map((r) => r.rating);
            const avgRating = ratings.length > 0
                ? ratings.reduce((a, b) => a + b, 0) / ratings.length
                : 0;
            const { reviews, ...rest } = product;
            return { ...rest, avgRating: Math.round(avgRating * 10) / 10, reviewCount: ratings.length };
        });
        res.json({ success: true, data: { ...category, products: productsWithRating } });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch category' });
    }
});
// POST /api/categories — admin create
router.post('/', auth_1.requireAuth, (0, role_1.requireRole)('ADMIN'), (0, validate_1.validate)(validations_1.createCategorySchema), async (req, res) => {
    try {
        const category = await prisma_1.default.category.create({
            data: req.body,
        });
        res.status(201).json({ success: true, data: category });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create category' });
    }
});
// PUT /api/categories/:id — admin update
router.put('/:id', auth_1.requireAuth, (0, role_1.requireRole)('ADMIN'), (0, validate_1.validate)(validations_1.updateCategorySchema), async (req, res) => {
    try {
        const id = req.params.id;
        const category = await prisma_1.default.category.update({
            where: { id },
            data: req.body,
        });
        res.json({ success: true, data: category });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update category' });
    }
});
// DELETE /api/categories/:id — admin delete
router.delete('/:id', auth_1.requireAuth, (0, role_1.requireRole)('ADMIN'), async (req, res) => {
    try {
        const id = req.params.id;
        await prisma_1.default.category.delete({ where: { id } });
        res.json({ success: true, message: 'Category deleted' });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete category' });
    }
});
exports.default = router;
