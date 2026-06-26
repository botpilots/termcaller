import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import keywordRoutes from './routes/keywords.js';
import validationRoutes from './routes/validation.js';
import corpusRoutes from './routes/corpus.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/api/auth', authRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/keywords', keywordRoutes);
  app.use('/api/validation', validationRoutes);
  app.use('/api/corpus', corpusRoutes);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', message: 'API is running' });
  });

  const frontendDistPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDistPath));

  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });

  return app;
}
