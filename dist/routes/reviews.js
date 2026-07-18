"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../lib/prisma"));
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const validations_1 = require("../lib/validations");
const router = (0, express_1.Router)();
// GET /api/reviews/product/:productId — list reviews for a product
router.get('/product/:productId', async (req, res) => {
    try {
        const productId = req.params.productId;
        const reviews = await prisma_1.default.review.findMany({
            where: { productId },
            include: {
                user: { select: { id: true, name: true, avatar: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        const ratings = reviews.map((r) => r.rating);
        const avgRating = ratings.length > 0
            ? ratings.reduce((a, b) => a + b, 0) / ratings.length
            : 0;
        res.json({
            success: true,
            data: {
                reviews,
                avgRating: Math.round(avgRating * 10) / 10,
                reviewCount: reviews.length,
            },
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch reviews' });
    }
});
// POST /api/reviews — authenticated user adds review (one per product)
router.post('/', auth_1.requireAuth, (0, validate_1.validate)(validations_1.createReviewSchema), async (req, res) => {
    try {
        const { productId, rating, comment } = req.body;
        const userId = req.user.userId;
        // Verify product exists
        const product = await prisma_1.default.product.findUnique({ where: { id: productId } });
        if (!product) {
            res.status(404).json({ success: false, message: 'Product not found' });
            return;
        }
        // Check if user already reviewed this product
        const existingReview = await prisma_1.default.review.findUnique({
            where: { userId_productId: { userId, productId } },
        });
        if (existingReview) {
            res.status(409).json({ success: false, message: 'You have already reviewed this product' });
            return;
        }
        const review = await prisma_1.default.review.create({
            data: { userId, productId, rating, comment },
            include: {
                user: { select: { id: true, name: true, avatar: true } },
            },
        });
        res.status(201).json({ success: true, data: review });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create review' });
    }
});
// DELETE /api/reviews/:id — user deletes own review or admin deletes any
router.delete('/:id', auth_1.requireAuth, async (req, res) => {
    try {
        const id = req.params.id;
        const review = await prisma_1.default.review.findUnique({
            where: { id },
        });
        if (!review) {
            res.status(404).json({ success: false, message: 'Review not found' });
            return;
        }
        // Only the review author or an admin can delete
        if (req.user.role !== 'ADMIN' && review.userId !== req.user.userId) {
            res.status(403).json({ success: false, message: 'Access denied' });
            return;
        }
        await prisma_1.default.review.delete({ where: { id } });
        res.json({ success: true, message: 'Review deleted' });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete review' });
    }
});
exports.default = router;
