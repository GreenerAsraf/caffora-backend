import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { validate } from '../middleware/validate';
import { createProductSchema, updateProductSchema } from '../lib/validations';

const router = Router();

// GET /api/products — list with search, filter, sort, pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      q,
      category,
      minPrice,
      maxPrice,
      rating,
      sort = 'newest',
      page = '1',
      limit = '12',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string, 10) || 12));
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: any = {};

    if (q) {
      where.OR = [
        { title: { contains: q as string, mode: 'insensitive' } },
        { description: { contains: q as string, mode: 'insensitive' } },
      ];
    }

    if (category && category !== 'all') {
      where.categoryId = category as string;
    }

    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = parseFloat(minPrice as string);
      if (maxPrice) where.price.lte = parseFloat(maxPrice as string);
    }

    // Build orderBy
    let orderBy: any = { createdAt: 'desc' };
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
      prisma.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          reviews: { select: { rating: true } },
        },
        orderBy,
        skip,
        take: limitNum,
      }),
      prisma.product.count({ where }),
    ]);

    // Add average rating and filter by rating if needed
    const productsWithRating = products.map((product) => {
      const ratings = product.reviews.map((r: { rating: number }) => r.rating);
      const avgRating = ratings.length > 0
        ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length
        : 0;
      const { reviews, ...rest } = product;
      return { ...rest, avgRating: Math.round(avgRating * 10) / 10, reviewCount: ratings.length };
    });

    // Filter by minimum rating (post-query since Prisma can't aggregate-filter)
    let filteredProducts = productsWithRating;
    if (rating) {
      const minRating = parseFloat(rating as string);
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
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});

// GET /api/products/:id — single product with details
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id);
    const product = await prisma.product.findFirst({
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
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch product' });
  }
});

// POST /api/products — admin create
router.post('/', requireAuth, requireRole('ADMIN'), validate(createProductSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, price, comparePrice, images, stock, categoryId } = req.body;

    // Generate slug from title
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    // Check for slug uniqueness
    const existingProduct = await prisma.product.findUnique({ where: { slug } });
    const finalSlug = existingProduct ? `${slug}-${Date.now()}` : slug;

    const product = await prisma.product.create({
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
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create product' });
  }
});

// PUT /api/products/:id — admin update
router.put('/:id', requireAuth, requireRole('ADMIN'), validate(updateProductSchema), async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const product = await prisma.product.update({
      where: { id },
      data: req.body,
      include: {
        category: { select: { id: true, name: true, slug: true } },
      },
    });

    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update product' });
  }
});

// DELETE /api/products/:id — admin delete
router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    await prisma.product.delete({ where: { id } });
    res.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete product' });
  }
});

export default router;
