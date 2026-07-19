"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateRoleSchema = exports.updateProfileSchema = exports.createReviewSchema = exports.createPaymentIntentSchema = exports.updateOrderStatusSchema = exports.createOrderSchema = exports.updateCartItemSchema = exports.addCartItemSchema = exports.updateCategorySchema = exports.createCategorySchema = exports.updateProductSchema = exports.createProductSchema = exports.loginSchema = exports.registerSchema = void 0;
const zod_1 = require("zod");
// Auth schemas
exports.registerSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters'),
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(6, 'Password must be at least 6 characters'),
});
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(1, 'Password is required'),
});
// Product schemas
exports.createProductSchema = zod_1.z.object({
    title: zod_1.z.string().min(2, 'Title must be at least 2 characters'),
    description: zod_1.z.string().min(10, 'Description must be at least 10 characters'),
    price: zod_1.z.number().positive('Price must be positive'),
    comparePrice: zod_1.z.number().positive().optional().nullable(),
    images: zod_1.z.array(zod_1.z.string().url()).min(1, 'At least one image is required'),
    stock: zod_1.z.number().int().min(0).default(0),
    categoryId: zod_1.z.string().uuid('Invalid category ID').optional().nullable(),
});
exports.updateProductSchema = exports.createProductSchema.partial();
// Category schemas
exports.createCategorySchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters'),
    slug: zod_1.z.string().min(2, 'Slug must be at least 2 characters').regex(/^[a-z0-9-]+$/, 'Slug must be lowercase with hyphens only'),
    image: zod_1.z.string().url().optional().nullable(),
    description: zod_1.z.string().optional().nullable(),
});
exports.updateCategorySchema = exports.createCategorySchema.partial();
// Cart schemas
exports.addCartItemSchema = zod_1.z.object({
    productId: zod_1.z.string().uuid('Invalid product ID'),
    quantity: zod_1.z.number().int().min(1, 'Quantity must be at least 1').default(1),
});
exports.updateCartItemSchema = zod_1.z.object({
    quantity: zod_1.z.number().int().min(1, 'Quantity must be at least 1'),
});
// Order schemas
exports.createOrderSchema = zod_1.z.object({
    address: zod_1.z.object({
        fullName: zod_1.z.string().min(2, 'Full name is required'),
        street: zod_1.z.string().min(5, 'Street address is required'),
        city: zod_1.z.string().min(2, 'City is required'),
        state: zod_1.z.string().min(2, 'State is required'),
        zipCode: zod_1.z.string().min(3, 'Zip code is required'),
        country: zod_1.z.string().min(2, 'Country is required'),
        phone: zod_1.z.string().min(5, 'Phone number is required'),
    }),
});
exports.updateOrderStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
});
// Payment schemas
exports.createPaymentIntentSchema = zod_1.z.object({
    orderId: zod_1.z.string().uuid('Invalid order ID').optional(),
});
// Review schemas
exports.createReviewSchema = zod_1.z.object({
    productId: zod_1.z.string().uuid('Invalid product ID'),
    rating: zod_1.z.number().int().min(1, 'Rating must be between 1 and 5').max(5, 'Rating must be between 1 and 5'),
    comment: zod_1.z.string().optional().nullable(),
});
// User schemas
exports.updateProfileSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters').optional(),
    avatar: zod_1.z.string().url().optional().nullable(),
});
exports.updateRoleSchema = zod_1.z.object({
    role: zod_1.z.enum(['USER', 'ADMIN']),
});
