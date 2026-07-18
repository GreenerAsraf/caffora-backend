import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { validate } from '../middleware/validate';
import { createCategorySchema, updateCategorySchema } from '../lib/validations';

const router = Router();

// GET /api/categories — list all
router.get('/', async (req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        _count: { select: { products: true } },
      },
      orderBy: { name: 'asc' },
    });

    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch categories' });
  }
});

// GET /api/categories/:slug — single with products
router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug as string;
    const category = await prisma.category.findUnique({
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
      const ratings = product.reviews.map((r: { rating: number }) => r.rating);
      const avgRating = ratings.length > 0
        ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length
        : 0;
      const { reviews, ...rest } = product;
      return { ...rest, avgRating: Math.round(avgRating * 10) / 10, reviewCount: ratings.length };
    });

    res.json({ success: true, data: { ...category, products: productsWithRating } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch category' });
  }
});

// POST /api/categories — admin create
router.post('/', requireAuth, requireRole('ADMIN'), validate(createCategorySchema), async (req: AuthRequest, res: Response) => {
  try {
    const category = await prisma.category.create({
      data: req.body,
    });

    res.status(201).json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create category' });
  }
});

// PUT /api/categories/:id — admin update
router.put('/:id', requireAuth, requireRole('ADMIN'), validate(updateCategorySchema), async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const category = await prisma.category.update({
      where: { id },
      data: req.body,
    });

    res.json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update category' });
  }
});

// DELETE /api/categories/:id — admin delete
router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    await prisma.category.delete({ where: { id } });
    res.json({ success: true, message: 'Category deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete category' });
  }
});

export default router;
