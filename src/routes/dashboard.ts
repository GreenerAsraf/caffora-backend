import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/role';

const router = Router();

router.use(requireAuth);

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const formatMonth = (date: Date) =>
  date.toLocaleString('en-US', { month: 'short', year: 'numeric' });

// GET /api/dashboard - user dashboard overview
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const [user, recentOrders, orderStats, wishlist] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, role: true, avatar: true, createdAt: true },
      }),
      prisma.order.findMany({
        where: { userId },
        include: {
          items: {
            include: {
              product: { select: { id: true, title: true, slug: true, images: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.order.aggregate({
        where: { userId },
        _count: { id: true },
        _sum: { total: true },
      }),
      prisma.wishlist.findUnique({
        where: { userId },
        select: { products: { select: { id: true } } },
      }),
    ]);

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.json({
      success: true,
      data: {
        user,
        stats: {
          orderCount: orderStats._count.id,
          lifetimeSpend: Math.round((orderStats._sum.total ?? 0) * 100) / 100,
          wishlistCount: wishlist?.products.length ?? 0,
        },
        recentOrders,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard' });
  }
});

// GET /api/dashboard/wishlist - products saved by current user
router.get('/wishlist', async (req: AuthRequest, res: Response) => {
  try {
    const wishlist = await prisma.wishlist.findUnique({
      where: { userId: req.user!.userId },
      include: {
        products: {
          include: {
            category: { select: { id: true, name: true, slug: true } },
            reviews: { select: { rating: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const products = (wishlist?.products ?? []).map((product) => {
      const ratings = product.reviews.map((review) => review.rating);
      const avgRating = ratings.length
        ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
        : 0;
      const { reviews, ...rest } = product;

      return {
        ...rest,
        avgRating: Math.round(avgRating * 10) / 10,
        reviewCount: ratings.length,
      };
    });

    res.json({ success: true, data: { products } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch wishlist' });
  }
});

// POST /api/dashboard/wishlist/toggle - toggle a product in the wishlist
router.post('/wishlist/toggle', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { productId } = req.body;

    if (!productId) {
      res.status(400).json({ success: false, message: 'Product ID is required' });
      return;
    }

    // Ensure wishlist exists for user
    let wishlist = await prisma.wishlist.findUnique({
      where: { userId },
      include: { products: { select: { id: true } } },
    });

    if (!wishlist) {
      wishlist = await prisma.wishlist.create({
        data: { userId },
        include: { products: { select: { id: true } } },
      });
    }

    const hasProduct = wishlist.products.some((p) => p.id === productId);

    if (hasProduct) {
      // Remove
      await prisma.wishlist.update({
        where: { id: wishlist.id },
        data: {
          products: { disconnect: { id: productId } },
        },
      });
      res.json({ success: true, message: 'Removed from wishlist', data: { added: false } });
    } else {
      // Add
      await prisma.wishlist.update({
        where: { id: wishlist.id },
        data: {
          products: { connect: { id: productId } },
        },
      });
      res.json({ success: true, message: 'Added to wishlist', data: { added: true } });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to toggle wishlist' });
  }
});

// GET /api/dashboard/admin - admin dashboard overview
router.get('/admin', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const [revenue, userCount, orderCount, productCount, recentOrders, lowStockProducts] =
      await Promise.all([
        prisma.order.aggregate({ _sum: { total: true } }),
        prisma.user.count(),
        prisma.order.count(),
        prisma.product.count(),
        prisma.order.findMany({
          include: {
            user: { select: { id: true, name: true, email: true } },
            items: {
              include: {
                product: { select: { id: true, title: true, images: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 8,
        }),
        prisma.product.findMany({
          where: { stock: { lte: 10 } },
          include: { category: { select: { id: true, name: true, slug: true } } },
          orderBy: { stock: 'asc' },
          take: 8,
        }),
      ]);

    res.json({
      success: true,
      data: {
        stats: {
          revenue: Math.round((revenue._sum.total ?? 0) * 100) / 100,
          userCount,
          orderCount,
          productCount,
        },
        recentOrders,
        lowStockProducts,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch admin dashboard' });
  }
});

// GET /api/dashboard/admin/analytics - chart-ready admin analytics
router.get('/admin/analytics', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const monthCount = 6;
    const now = new Date();
    const firstMonth = new Date(now.getFullYear(), now.getMonth() - (monthCount - 1), 1);

    const [orders, categoryCounts] = await Promise.all([
      prisma.order.findMany({
        where: { createdAt: { gte: firstMonth } },
        select: { total: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.category.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          _count: { select: { products: true } },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    const monthly = Array.from({ length: monthCount }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (monthCount - 1 - index), 1);
      return {
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        month: formatMonth(date),
        revenue: 0,
        orders: 0,
      };
    });

    const monthlyByKey = new Map(monthly.map((item) => [item.key, item]));

    orders.forEach((order) => {
      const month = startOfMonth(order.createdAt);
      const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
      const item = monthlyByKey.get(key);

      if (item) {
        item.revenue += order.total;
        item.orders += 1;
      }
    });

    res.json({
      success: true,
      data: {
        revenueByMonth: monthly.map(({ month, revenue }) => ({
          month,
          revenue: Math.round(revenue * 100) / 100,
        })),
        ordersByMonth: monthly.map(({ month, orders }) => ({ month, orders })),
        productsByCategory: categoryCounts.map((category) => ({
          id: category.id,
          name: category.name,
          slug: category.slug,
          value: category._count.products,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch analytics' });
  }
});

export default router;
