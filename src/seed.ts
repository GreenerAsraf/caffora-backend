import bcrypt from 'bcryptjs';
import prisma from './lib/prisma';

const categories = [
  {
    name: 'Coffee Beans',
    slug: 'coffee-beans',
    image: 'https://images.unsplash.com/photo-1447933601403-0c6688de566e',
    description: 'Fresh whole beans for espresso, pour-over, and cold brew rituals.',
  },
  {
    name: 'Brewing Gear',
    slug: 'brewing-gear',
    image: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c',
    description: 'Reliable tools for cafe-quality cups at home.',
  },
  {
    name: 'Cafe Essentials',
    slug: 'cafe-essentials',
    image: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085',
    description: 'Serveware, syrups, and accessories for a polished coffee bar.',
  },
];

const products = [
  {
    title: 'Amber Roast Espresso Blend',
    slug: 'amber-roast-espresso-blend',
    description: 'A balanced espresso blend with cocoa, toasted almond, and a clean caramel finish.',
    price: 18.5,
    comparePrice: 22,
    images: ['https://images.unsplash.com/photo-1559056199-641a0ac8b55e'],
    stock: 42,
    categorySlug: 'coffee-beans',
  },
  {
    title: 'Ethiopia Guji Filter Roast',
    slug: 'ethiopia-guji-filter-roast',
    description: 'A floral single-origin coffee with peach, bergamot, and honey sweetness.',
    price: 24,
    comparePrice: null,
    images: ['https://images.unsplash.com/photo-1611854779393-1b2da9d400fe'],
    stock: 30,
    categorySlug: 'coffee-beans',
  },
  {
    title: 'Cold Brew Reserve Beans',
    slug: 'cold-brew-reserve-beans',
    description: 'Low-acid beans roasted for smooth cold brew with dark chocolate notes.',
    price: 21,
    comparePrice: 25,
    images: ['https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd'],
    stock: 36,
    categorySlug: 'coffee-beans',
  },
  {
    title: 'Precision Pour-Over Kettle',
    slug: 'precision-pour-over-kettle',
    description: 'A gooseneck kettle with steady flow control for repeatable extraction.',
    price: 68,
    comparePrice: 79,
    images: ['https://images.unsplash.com/photo-1509042239860-f550ce710b93'],
    stock: 14,
    categorySlug: 'brewing-gear',
  },
  {
    title: 'Ceramic V60 Brewer Set',
    slug: 'ceramic-v60-brewer-set',
    description: 'A ceramic dripper, server, and starter filter pack for clean daily brewing.',
    price: 44,
    comparePrice: null,
    images: ['https://images.unsplash.com/photo-1521302080334-4bebac2763a6'],
    stock: 18,
    categorySlug: 'brewing-gear',
  },
  {
    title: 'Barista Milk Pitcher',
    slug: 'barista-milk-pitcher',
    description: 'A stainless milk pitcher shaped for latte art control and quick cleanup.',
    price: 19,
    comparePrice: 24,
    images: ['https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5'],
    stock: 8,
    categorySlug: 'cafe-essentials',
  },
];

async function main() {
  const password = await bcrypt.hash('password123', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@caffora.dev' },
    update: { role: 'ADMIN', password },
    create: {
      name: 'Caffora Admin',
      email: 'admin@caffora.dev',
      password,
      role: 'ADMIN',
    },
  });

  const user = await prisma.user.upsert({
    where: { email: 'mira@caffora.dev' },
    update: { password },
    create: {
      name: 'Mira Carter',
      email: 'mira@caffora.dev',
      password,
      role: 'USER',
    },
  });

  const categoryBySlug = new Map<string, string>();

  for (const category of categories) {
    const saved = await prisma.category.upsert({
      where: { slug: category.slug },
      update: category,
      create: category,
    });
    categoryBySlug.set(saved.slug, saved.id);
  }

  const productIds: string[] = [];

  for (const product of products) {
    const categoryId = categoryBySlug.get(product.categorySlug);
    if (!categoryId) {
      throw new Error(`Missing category for ${product.title}`);
    }

    const { categorySlug, ...productData } = product;
    const saved = await prisma.product.upsert({
      where: { slug: product.slug },
      update: { ...productData, categoryId },
      create: { ...productData, categoryId },
    });
    productIds.push(saved.id);
  }

  await prisma.wishlist.upsert({
    where: { userId: user.id },
    update: { products: { set: productIds.slice(0, 3).map((id) => ({ id })) } },
    create: {
      userId: user.id,
      products: { connect: productIds.slice(0, 3).map((id) => ({ id })) },
    },
  });

  const existingOrder = await prisma.order.findFirst({ where: { userId: user.id } });

  if (!existingOrder) {
    await prisma.order.create({
      data: {
        userId: user.id,
        total: 86.5,
        status: 'DELIVERED',
        paymentId: 'seed_payment_caffora_001',
        address: {
          fullName: 'Mira Carter',
          street: '42 Market Street',
          city: 'Seattle',
          state: 'WA',
          zipCode: '98101',
          country: 'United States',
          phone: '+1 206 555 0142',
        },
        items: {
          create: [
            { productId: productIds[0], quantity: 1, price: 18.5 },
            { productId: productIds[3], quantity: 1, price: 68 },
          ],
        },
      },
    });
  }

  console.info('Seed complete');
  console.info('Admin: admin@caffora.dev / password123');
  console.info('User: mira@caffora.dev / password123');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
