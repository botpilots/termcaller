import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { exportProjectTbxBasic, sanitizeTbxFilename } from '../src/services/tbxExportService.js';

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

const outDir = process.env.OUT_DIR ?? path.resolve(__dirname, '../tests/output/tbx');
const adminUserId = process.env.ADMIN_USER_ID ?? 'f06913c5-4128-4d13-ab32-ba462b6caf55';

const prisma = new PrismaClient();

async function main() {
  if (!dbPath) {
    console.error('No SQLite database found.');
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const projects = await prisma.project.findMany({
    where: { userId: adminUserId },
    select: { id: true, name: true },
    orderBy: { createdAt: 'desc' },
  });

  if (projects.length === 0) {
    console.error('No projects found for admin user.');
    process.exit(1);
  }

  for (const project of projects) {
    const exported = await exportProjectTbxBasic(prisma, project.id, adminUserId);
    if (!exported) {
      console.error(`Failed to export project ${project.id}`);
      continue;
    }

    const filename = `${project.id}_${sanitizeTbxFilename(project.name)}`;
    const outPath = path.join(outDir, filename);
    fs.writeFileSync(outPath, exported.xml, 'utf8');
    const termEntries = (exported.xml.match(/<termEntry /g) ?? []).length;
    console.log(`Wrote ${outPath} (${termEntries} term entries)`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
