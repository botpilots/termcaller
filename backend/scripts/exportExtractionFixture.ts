import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROJECT_ID = process.argv[2] ?? '884957d3-a676-4d49-8f2f-6be814878d03';
const outPath =
  process.argv[3] ??
  path.resolve(__dirname, '../../test_data/fixtures/biodrill500-thinking-extraction.json');

const prisma = new PrismaClient();

async function main() {
  const project = await prisma.project.findUnique({
    where: { id: PROJECT_ID },
    include: {
      keywords: { orderBy: { sourceTerm: 'asc' } },
      concepts: true,
      illustrations: { include: { callouts: true } },
    },
  });

  if (!project) {
    throw new Error(`Project not found: ${PROJECT_ID}`);
  }

  const keywordCalloutCounts = new Map<string, number>();
  let calloutCount = 0;

  for (const illustration of project.illustrations) {
    for (const callout of illustration.callouts) {
      calloutCount++;
      keywordCalloutCounts.set(
        callout.sourceTerm,
        (keywordCalloutCounts.get(callout.sourceTerm) ?? 0) + 1
      );
    }
  }

  const keywords = project.keywords.map(k => ({
    sourceTerm: k.sourceTerm,
    calloutCount: keywordCalloutCounts.get(k.sourceTerm) ?? 0,
  }));

  const fixture = {
    projectId: project.id,
    projectName: project.name,
    pdfFile: 'Instructionbook_10081322_BioDrill500.pdf',
    capturedAt: new Date().toISOString(),
    extractionMode: 'with-thinking',
    notes:
      'Baseline snapshot from live extraction with thinking enabled. Compare re-runs via extractionRegression.test.ts.',
    counts: {
      uniqueKeywords: project.keywords.length,
      concepts: project.concepts.length,
      illustrations: project.illustrations.length,
      callouts: calloutCount,
    },
    keywords,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2));
  console.log(`Wrote ${outPath}`);
  console.log(JSON.stringify(fixture.counts, null, 2));
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
