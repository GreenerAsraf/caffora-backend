import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { addCartItemSchema, updateCartItemSchema } from '../lib/validations';

const router = Router();

// All cart routes require authentication
router.use(requireAuth);

// GET /api/cart — get user's cart with items
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const cart = await prisma.cart.findUnique({
      where: { userId: req.user!.userId },
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
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch cart' });
  }
});

// POST /api/cart/items — add item to cart
router.post('/items', validate(addCartItemSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { productId, quantity } = req.body;

    // Verify product exists and has stock
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    if (product.stock < quantity) {
      res.status(400).json({ success: false, message: `Only ${product.stock} items in stock` });
      return;
    }

    // Get or create cart
    let cart = await prisma.cart.findUnique({ where: { userId: req.user!.userId } });
    if (!cart) {
      cart = await prisma.cart.create({ data: { userId: req.user!.userId } });
    }

    // Check if item already exists in cart
    const existingItem = await prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: cart.id, productId } },
    });

    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;
      if (newQuantity > product.stock) {
        res.status(400).json({ success: false, message: `Only ${product.stock} items in stock` });
        return;
      }

      await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQuantity },
      });
    } else {
      await prisma.cartItem.create({
        data: { cartId: cart.id, productId, quantity },
      });
    }

    // Return updated cart
    const updatedCart = await prisma.cart.findUnique({
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

    const total = updatedCart!.items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    const itemCount = updatedCart!.items.reduce((sum, item) => sum + item.quantity, 0);

    res.json({
      success: true,
      data: {
        id: updatedCart!.id,
        items: updatedCart!.items,
        total: Math.round(total * 100) / 100,
        itemCount,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add item to cart' });
  }
});

// PUT /api/cart/items/:itemId — update quantity
router.put('/items/:itemId', validate(updateCartItemSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { quantity } = req.body;
    const itemId = req.params.itemId as string;

    const cartItem = await prisma.cartItem.findUnique({
      where: { id: itemId },
      include: { cart: true, product: true },
    });

    if (!cartItem || cartItem.cart.userId !== req.user!.userId) {
      res.status(404).json({ success: false, message: 'Cart item not found' });
      return;
    }

    if (quantity > cartItem.product.stock) {
      res.status(400).json({ success: false, message: `Only ${cartItem.product.stock} items in stock` });
      return;
    }

    await prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
    });

    res.json({ success: true, message: 'Cart item updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update cart item' });
  }
});

// DELETE /api/cart/items/:itemId — remove item
router.delete('/items/:itemId', async (req: AuthRequest, res: Response) => {
  try {
    const itemId = req.params.itemId as string;

    const cartItem = await prisma.cartItem.findUnique({
      where: { id: itemId },
      include: { cart: true },
    });

    if (!cartItem || cartItem.cart.userId !== req.user!.userId) {
      res.status(404).json({ success: false, message: 'Cart item not found' });
      return;
    }

    await prisma.cartItem.delete({ where: { id: itemId } });

    res.json({ success: true, message: 'Item removed from cart' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to remove cart item' });
  }
});

// DELETE /api/cart — clear entire cart
router.delete('/', async (req: AuthRequest, res: Response) => {
  try {
    const cart = await prisma.cart.findUnique({ where: { userId: req.user!.userId } });

    if (cart) {
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    }

    res.json({ success: true, message: 'Cart cleared' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to clear cart' });
  }
});

export default router;
