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
// All cart routes require authentication
router.use(auth_1.requireAuth);
// GET /api/cart — get user's cart with items
router.get('/', async (req, res) => {
    try {
        const cart = await prisma_1.default.cart.findUnique({
            where: { userId: req.user.userId },
            include: {
                items: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                title: true,
                                slug: true,
                                price: true,
                                comparePrice: true,
                                images: true,
                                stock: true,
                            },
                        },
                    },
                },
            },
        });
        if (!cart) {
            res.json({
                success: true,
                data: { id: null, items: [], total: 0, itemCount: 0 },
            });
            return;
        }
        const total = cart.items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
        const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
        res.json({
            success: true,
            data: {
                id: cart.id,
                items: cart.items,
                total: Math.round(total * 100) / 100,
                itemCount,
            },
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch cart' });
    }
});
// POST /api/cart/items — add item to cart
router.post('/items', (0, validate_1.validate)(validations_1.addCartItemSchema), async (req, res) => {
    try {
        const { productId, quantity } = req.body;
        // Verify product exists and has stock
        const product = await prisma_1.default.product.findUnique({ where: { id: productId } });
        if (!product) {
            res.status(404).json({ success: false, message: 'Product not found' });
            return;
        }
        if (product.stock < quantity) {
            res.status(400).json({ success: false, message: `Only ${product.stock} items in stock` });
            return;
        }
        // Get or create cart
        let cart = await prisma_1.default.cart.findUnique({ where: { userId: req.user.userId } });
        if (!cart) {
            cart = await prisma_1.default.cart.create({ data: { userId: req.user.userId } });
        }
        // Check if item already exists in cart
        const existingItem = await prisma_1.default.cartItem.findUnique({
            where: { cartId_productId: { cartId: cart.id, productId } },
        });
        if (existingItem) {
            const newQuantity = existingItem.quantity + quantity;
            if (newQuantity > product.stock) {
                res.status(400).json({ success: false, message: `Only ${product.stock} items in stock` });
                return;
            }
            await prisma_1.default.cartItem.update({
                where: { id: existingItem.id },
                data: { quantity: newQuantity },
            });
        }
        else {
            await prisma_1.default.cartItem.create({
                data: { cartId: cart.id, productId, quantity },
            });
        }
        // Return updated cart
        const updatedCart = await prisma_1.default.cart.findUnique({
            where: { id: cart.id },
            include: {
                items: {
                    include: {
                        product: {
                            select: { id: true, title: true, slug: true, price: true, comparePrice: true, images: true, stock: true },
                        },
                    },
                },
            },
        });
        const total = updatedCart.items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
        const itemCount = updatedCart.items.reduce((sum, item) => sum + item.quantity, 0);
        res.json({
            success: true,
            data: {
                id: updatedCart.id,
                items: updatedCart.items,
                total: Math.round(total * 100) / 100,
                itemCount,
            },
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to add item to cart' });
    }
});
// PUT /api/cart/items/:itemId — update quantity
router.put('/items/:itemId', (0, validate_1.validate)(validations_1.updateCartItemSchema), async (req, res) => {
    try {
        const { quantity } = req.body;
        const itemId = req.params.itemId;
        const cartItem = await prisma_1.default.cartItem.findUnique({
            where: { id: itemId },
            include: { cart: true, product: true },
        });
        if (!cartItem || cartItem.cart.userId !== req.user.userId) {
            res.status(404).json({ success: false, message: 'Cart item not found' });
            return;
        }
        if (quantity > cartItem.product.stock) {
            res.status(400).json({ success: false, message: `Only ${cartItem.product.stock} items in stock` });
            return;
        }
        await prisma_1.default.cartItem.update({
            where: { id: itemId },
            data: { quantity },
        });
        res.json({ success: true, message: 'Cart item updated' });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update cart item' });
    }
});
// DELETE /api/cart/items/:itemId — remove item
router.delete('/items/:itemId', async (req, res) => {
    try {
        const itemId = req.params.itemId;
        const cartItem = await prisma_1.default.cartItem.findUnique({
            where: { id: itemId },
            include: { cart: true },
        });
        if (!cartItem || cartItem.cart.userId !== req.user.userId) {
            res.status(404).json({ success: false, message: 'Cart item not found' });
            return;
        }
        await prisma_1.default.cartItem.delete({ where: { id: itemId } });
        res.json({ success: true, message: 'Item removed from cart' });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to remove cart item' });
    }
});
// DELETE /api/cart — clear entire cart
router.delete('/', async (req, res) => {
    try {
        const cart = await prisma_1.default.cart.findUnique({ where: { userId: req.user.userId } });
        if (cart) {
            await prisma_1.default.cartItem.deleteMany({ where: { cartId: cart.id } });
        }
        res.json({ success: true, message: 'Cart cleared' });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to clear cart' });
    }
});
exports.default = router;
