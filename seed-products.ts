import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding fake data...');

  // Create categories
  const categories = [
    {
      name: 'Coffee Beans',
      slug: 'coffee-beans',
      description: 'Premium roasted coffee beans from around the world.',
      image: 'https://images.unsplash.com/photo-1559525839-b184a4d698c7?auto=format&fit=crop&w=800&q=80',
    },
    {
      name: 'Brewing Equipment',
      slug: 'brewing-equipment',
      description: 'High quality equipment for the perfect brew.',
      image: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=800&q=80',
    },
    {
      name: 'Accessories',
      slug: 'accessories',
      description: 'Mugs, filters, and other coffee accessories.',
      image: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=80',
    },
  ];

  const createdCategories = [];
  for (const category of categories) {
    const existing = await prisma.category.findUnique({ where: { slug: category.slug } });
    if (!existing) {
      createdCategories.push(await prisma.category.create({ data: category }));
    } else {
      createdCategories.push(existing);
    }
  }

  // Create products
  const products = [
    {
      title: 'Ethiopian Yirgacheffe Light Roast',
      slug: 'ethiopian-yirgacheffe-light-roast',
      description: 'A bright, floral, and citrusy light roast coffee bean from the Yirgacheffe region of Ethiopia. Known for its clean taste and vibrant acidity.',
      price: 1899,
      comparePrice: 2200,
      stock: 50,
      images: ['https://images.unsplash.com/photo-1559525839-b184a4d698c7?auto=format&fit=crop&w=800&q=80'],
      categoryId: createdCategories.find(c => c.slug === 'coffee-beans')?.id,
    },
    {
      title: 'Colombian Supremo Medium Roast',
      slug: 'colombian-supremo-medium-roast',
      description: 'A well-balanced medium roast with notes of chocolate and caramel. Classic Colombian profile, perfect for a smooth everyday cup.',
      price: 1650,
      stock: 120,
      images: ['https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=800&q=80'],
      categoryId: createdCategories.find(c => c.slug === 'coffee-beans')?.id,
    },
    {
      title: 'Sumatra Mandheling Dark Roast',
      slug: 'sumatra-mandheling-dark-roast',
      description: 'A heavy-bodied, earthy, and spicy dark roast from Indonesia. Low acidity and intense flavor.',
      price: 1950,
      stock: 8,
      images: ['https://images.unsplash.com/photo-1507133750070-44473e3518dc?auto=format&fit=crop&w=800&q=80'],
      categoryId: createdCategories.find(c => c.slug === 'coffee-beans')?.id,
    },
    {
      title: 'Pour Over Glass Coffeemaker',
      slug: 'pour-over-glass-coffeemaker',
      description: 'Classic glass pour-over coffeemaker. Includes a wood collar and leather tie. Brews up to 6 cups of pure coffee.',
      price: 4500,
      comparePrice: 5000,
      stock: 25,
      images: ['https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=800&q=80'],
      categoryId: createdCategories.find(c => c.slug === 'brewing-equipment')?.id,
    },
    {
      title: 'Professional Burr Coffee Grinder',
      slug: 'professional-burr-coffee-grinder',
      description: 'Precision burr grinder with 40 grind settings. Get the perfect grind size for espresso, drip, or french press.',
      price: 12999,
      stock: 12,
      images: ['https://images.unsplash.com/photo-1585145155160-c3d555776d5e?auto=format&fit=crop&w=800&q=80'],
      categoryId: createdCategories.find(c => c.slug === 'brewing-equipment')?.id,
    },
    {
      title: 'Matte Black Ceramic Coffee Mug',
      slug: 'matte-black-ceramic-coffee-mug',
      description: 'Sleek, minimalist 12oz ceramic mug with a matte black finish. Microwave and dishwasher safe.',
      price: 1400,
      stock: 200,
      images: ['https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=80'],
      categoryId: createdCategories.find(c => c.slug === 'accessories')?.id,
    }
  ];

  let added = 0;
  for (const product of products) {
    const existing = await prisma.product.findUnique({ where: { slug: product.slug } });
    if (!existing) {
      await prisma.product.create({ data: product });
      added++;
    }
  }

  console.log(`Seeding finished. Added ${added} products.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
