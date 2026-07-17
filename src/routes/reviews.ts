import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.json({ message: 'Reviews route' });
});

export default router;
