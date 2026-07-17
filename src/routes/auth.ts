import { Router } from 'express';

const router = Router();

// Routes will be implemented here
router.get('/', (req, res) => {
  res.json({ message: 'Auth routes' });
});

export default router;
