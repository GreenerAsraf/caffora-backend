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
// GET /api/products — list with search, filter, sort, pagination
router.get('/', async (req, res) => {
    try {
        const { q, category, minPrice, maxPrice, rating, sort = 'newest', page = '1', limit = '12', } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
        const skip = (pageNum - 1) * limitNum;
        // Build where clause
        const where = {};
        if (q) {
            where.OR = [
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
            ];
        }
        if (category && category !== 'all') {
            where.categoryId = category;
        }
        if (minPrice || maxPrice) {
            where.price = {};
            if (minPrice)
                where.price.gte = parseFloat(minPrice);
            if (maxPrice)
                where.price.lte = parseFloat(maxPrice);
        }
        // Build orderBy
        let orderBy = { createdAt: 'desc' };
        switch (sort) {
            case 'price_asc':
                orderBy = { price: 'asc' };
                break;
            case 'price_desc':
                orderBy = { price: 'desc' };
                break;
            case 'newest':
                orderBy = { createdAt: 'desc' };
                break;
            case 'oldest':
                orderBy = { createdAt: 'asc' };
                break;
        }
        const [products, total] = await Promise.all([
            prisma_1.default.product.findMany({
                where,
                include: {
                    category: { select: { id: true, name: true, slug: true } },
                    reviews: { select: { rating: true } },
                },
                orderBy,
                skip,
                take: limitNum,
            }),
            prisma_1.default.product.count({ where }),
        ]);
        // Add average rating and filter by rating if needed
        const productsWithRating = products.map((product) => {
            const ratings = product.reviews.map((r) => r.rating);
            const avgRating = ratings.length > 0
                ? ratings.reduce((a, b) => a + b, 0) / ratings.length
                : 0;
            const { reviews, ...rest } = product;
            return { ...rest, avgRating: Math.round(avgRating * 10) / 10, reviewCount: ratings.length };
        });
        // Filter by minimum rating (post-query since Prisma can't aggregate-filter)
        let filteredProducts = productsWithRating;
        if (rating) {
            const minRating = parseFloat(rating);
            filteredProducts = productsWithRating.filter((p) => p.avgRating >= minRating);
        }
        res.json({
            success: true,
            data: {
                products: filteredProducts,
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
        res.status(500).json({ success: false, message: 'Failed to fetch products' });
    }
});
// GET /api/products/:id — single product with details
router.get('/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id);
        const product = await prisma_1.default.product.findFirst({
            where: isUuid ? { id } : { slug: id },
            include: {
                category: { select: { id: true, name: true, slug: true } },
                reviews: {
                    include: {
                        user: { select: { id: true, name: true, avatar: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                },
            },
        });
        if (!product) {
            res.status(404).json({ success: false, message: 'Product not found' });
            return;
        }
        const ratings = product.reviews.map((r) => r.rating);
        const avgRating = ratings.length > 0
            ? ratings.reduce((a, b) => a + b, 0) / ratings.length
            : 0;
        res.json({
            success: true,
            data: {
                ...product,
                avgRating: Math.round(avgRating * 10) / 10,
                reviewCount: ratings.length,
            },
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch product' });
    }
});
// POST /api/products — admin create
router.post('/', auth_1.requireAuth, (0, role_1.requireRole)('ADMIN'), (0, validate_1.validate)(validations_1.createProductSchema), async (req, res) => {
    try {
        const { title, description, price, comparePrice, images, stock, categoryId } = req.body;
        // Generate slug from title
        const slug = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
        // Check for slug uniqueness
        const existingProduct = await prisma_1.default.product.findUnique({ where: { slug } });
        const finalSlug = existingProduct ? `${slug}-${Date.now()}` : slug;
        const product = await prisma_1.default.product.create({
            data: {
                title,
                slug: finalSlug,
                description,
                price,
                comparePrice,
                images,
                stock,
                categoryId,
            },
            include: {
                category: { select: { id: true, name: true, slug: true } },
            },
        });
        res.status(201).json({ success: true, data: product });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create product' });
    }
});
// PUT /api/products/:id — admin update
router.put('/:id', auth_1.requireAuth, (0, role_1.requireRole)('ADMIN'), (0, validate_1.validate)(validations_1.updateProductSchema), async (req, res) => {
    try {
        const id = req.params.id;
        const product = await prisma_1.default.product.update({
            where: { id },
            data: req.body,
            include: {
                category: { select: { id: true, name: true, slug: true } },
            },
        });
        res.json({ success: true, data: product });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update product' });
    }
});
// DELETE /api/products/:id — admin delete
router.delete('/:id', auth_1.requireAuth, (0, role_1.requireRole)('ADMIN'), async (req, res) => {
    try {
        const id = req.params.id;
        await prisma_1.default.product.delete({ where: { id } });
        res.json({ success: true, message: 'Product deleted' });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete product' });
    }
});
exports.default = router;
