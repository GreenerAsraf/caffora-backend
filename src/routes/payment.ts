import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createPaymentIntentSchema } from '../lib/validations';

const router = Router();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const currency = process.env.STRIPE_CURRENCY || 'usd';

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2026-06-24.dahlia' })
  : null;

const toCents = (amount: number) => Math.round(amount * 100);

// POST /api/payment/create-intent - create Stripe PaymentIntent for an order or current cart
router.post('/create-intent', requireAuth, validate(createPaymentIntentSchema), async (req: AuthRequest, res: Response) => {
  if (!stripe) {
    res.status(500).json({ success: false, message: 'Stripe is not configured' });
    return;
  }

  try {
    const userId = req.user!.userId;
    const { orderId } = req.body as { orderId?: string };

    if (orderId) {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, userId: true, total: true, status: true, paymentId: true },
      });

      if (!order || order.userId !== userId) {
        res.status(404).json({ success: false, message: 'Order not found' });
        return;
      }

      if (order.status !== 'PENDING') {
        res.status(400).json({ success: false, message: 'Only pending orders can be paid' });
        return;
      }

      if (order.paymentId) {
        res.status(400).json({ success: false, message: 'Order already has a payment' });
        return;
      }

      const amountInCents = toCents(order.total);

      if (amountInCents < 50) {
        res.status(400).json({ success: false, message: 'Order total must be at least $0.50' });
        return;
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency,
        automatic_payment_methods: { enabled: true },
        metadata: {
          userId,
          orderId: order.id,
        },
      });

      res.json({
        success: true,
        data: {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          amount: order.total,
          currency,
        },
      });
      return;
    }

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

    const total = cart.items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    const roundedTotal = Math.round(total * 100) / 100;
    const amountInCents = toCents(roundedTotal);

    if (amountInCents < 50) {
      res.status(400).json({ success: false, message: 'Order total must be at least $0.50' });
      return;
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata: {
        userId,
        cartId: cart.id,
      },
    });

    res.json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: roundedTotal,
        currency,
      },
    });
  } catch (error: any) {
    if (error.type === 'StripeInvalidRequestError') {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    res.status(500).json({ success: false, message: 'Failed to create payment intent' });
  }
});

// POST /api/payment/webhook - handle Stripe webhooks
router.post('/webhook', async (req: Request, res: Response) => {
  if (!stripe) {
    res.status(500).json({ success: false, message: 'Stripe is not configured' });
    return;
  }

  const sig = req.headers['stripe-signature'] as string | undefined;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret || webhookSecret.startsWith('placeholder')) {
    res.status(400).json({ success: false, message: 'Stripe webhook signing secret is not configured' });
    return;
  }

  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const { userId, orderId } = paymentIntent.metadata;

        if (orderId) {
          await prisma.order.updateMany({
            where: { id: orderId, userId, status: 'PENDING' },
            data: {
              paymentId: paymentIntent.id,
              status: 'PROCESSING',
            },
          });
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const { userId, orderId } = paymentIntent.metadata;

        if (orderId) {
          await prisma.order.updateMany({
            where: { id: orderId, userId, status: 'PENDING' },
            data: { status: 'CANCELLED' },
          });
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Webhook signature verification failed' });
  }
});

export default router;
