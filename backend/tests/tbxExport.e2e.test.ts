import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbCandidates = [
  path.resolve(__dirname, '../prisma/database.sqlite'),
  path.resolve(__dirname, '../database.sqlite'),
];
const dbPath = dbCandidates.find((candidate) => fs.existsSync(candidate));
if (dbPath) {
  process.env.DATABASE_URL = `file:${dbPath}`;
}

const prisma = new PrismaClient();
const app = createApp();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-hackathon-key';

const ADMIN_USER_ID = 'f06913c5-4128-4d13-ab32-ba462b6caf55';

function adminToken() {
  return jwt.sign({ userId: ADMIN_USER_ID }, JWT_SECRET, { expiresIn: '1h' });
}

describe('GET /api/projects/:id/export/tbx (admin DB projects)', () => {
  let projectIds: string[] = [];

  beforeAll(async () => {
    if (!dbPath) {
      throw new Error('No SQLite database found for e2e TBX export tests.');
    }

    const projects = await prisma.project.findMany({
      where: { userId: ADMIN_USER_ID },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    projectIds = projects.map((p) => p.id);
    expect(projectIds.length).toBeGreaterThan(0);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get(`/api/projects/${projectIds[0]}/export/tbx`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown project', async () => {
    const res = await request(app)
      .get('/api/projects/00000000-0000-0000-0000-000000000000/export/tbx')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
  });

  it('exports TBX-Basic for each admin project in the database', async () => {
    const token = adminToken();

    for (const projectId of projectIds) {
      const res = await request(app)
        .get(`/api/projects/${projectId}/export/tbx`)
        .set('Authorization', `Bearer ${token}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/xml/);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename=".*\.tbx"/);

      const xml = res.body.toString('utf8');
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<martif type="TBX-Basic" xml:lang="en">');
      expect(xml).not.toContain('<!DOCTYPE');
      expect(xml).toContain('<body>');

      const conceptCount = await prisma.concept.count({ where: { projectId } });
      const termEntryCount = (xml.match(/<termEntry /g) ?? []).length;
      expect(termEntryCount).toBe(conceptCount);
    }
  });
});
