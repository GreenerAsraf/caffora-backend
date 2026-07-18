import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { validate } from '../middleware/validate';
import { createOrderSchema, updateOrderStatusSchema } from '../lib/validations';

const router = Router();

// All order routes require authentication
router.use(requireAuth);

// POST /api/orders — create order from cart
router.post('/', validate(createOrderSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { address } = req.body;
    const userId = req.user!.userId;

    // Get user's cart with items
    const cart = await prisma.cart.findUnique({
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
    const stockErrors: string[] = [];
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
    const order = await prisma.$transaction(async (tx) => {
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
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create order' });
  }
});

// GET /api/orders — user: own orders; admin: all orders
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { page = '1', limit = '10' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    const isAdmin = req.user!.role === 'ADMIN';
    const where = isAdmin ? {} : { userId: req.user!.userId };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
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
      prisma.order.count({ where }),
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
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

// GET /api/orders/:id — order detail
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const order = await prisma.order.findUnique({
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
    if (req.user!.role !== 'ADMIN' && order.userId !== req.user!.userId) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch order' });
  }
});

// PATCH /api/orders/:id/status — admin update status
router.patch('/:id/status', requireRole('ADMIN'), validate(updateOrderStatusSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    const id = req.params.id as string;

    const order = await prisma.order.update({
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
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update order status' });
  }
});

export default router;
