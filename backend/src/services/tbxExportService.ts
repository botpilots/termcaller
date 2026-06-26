import { create } from 'xmlbuilder2';
import type { PrismaClient } from '@prisma/client';
import { pickCanonicalConceptForKeyword } from './keywordCurationService.js';
import { parseEmbedding } from '../utils/vectorMath.js';

export const TBX_PREFERRED_ADMIN_STATUS = 'preferredTerm-admn-sts';

export interface TbxExportConcept {
  id: string;
  candidateConceptName: string;
  definitionText: string;
  keywords: Array<{ sourceTerm: string }>;
}

export interface TbxExportInput {
  projectName: string;
  defaultLanguage?: string;
  concepts: TbxExportConcept[];
}

export interface TbxExportProjectData {
  projectId: string;
  projectName: string;
  defaultLanguage: string;
  concepts: TbxExportConcept[];
}

export interface TbxKeywordConceptInput {
  id: string;
  candidateConceptName: string;
  definitionText: string;
  vectorEmbedding: string | null;
  excludedFromExport: boolean;
}

export interface TbxKeywordInput {
  sourceTerm: string;
  concepts: TbxKeywordConceptInput[];
}

export function selectCanonicalConceptsForKeywords(
  keywords: TbxKeywordInput[]
): TbxExportConcept[] {
  const concepts: TbxExportConcept[] = [];

  for (const keyword of keywords) {
    const exportable = keyword.concepts.filter(concept => !concept.excludedFromExport);
    if (exportable.length === 0) continue;

    const embedded = exportable
      .map(concept => ({
        id: concept.id,
        definitionText: concept.definitionText,
        vector: parseEmbedding(concept.vectorEmbedding),
      }))
      .filter(
        (entry): entry is { id: string; definitionText: string; vector: number[] } =>
          entry.vector !== null && entry.vector.length > 0
      );

    let canonicalId: string | undefined;
    if (embedded.length > 0) {
      canonicalId = pickCanonicalConceptForKeyword(embedded)?.id;
    }

    const canonical =
      (canonicalId ? exportable.find(concept => concept.id === canonicalId) : undefined) ??
      exportable[0];

    if (!canonical) continue;

    concepts.push({
      id: canonical.id,
      candidateConceptName: canonical.candidateConceptName,
      definitionText: canonical.definitionText,
      keywords: [{ sourceTerm: keyword.sourceTerm }],
    });
  }

  return concepts;
}

function uniqueTerms(concept: TbxExportConcept): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const keyword of concept.keywords) {
    const term = keyword.sourceTerm.trim();
    if (!term || seen.has(term.toLowerCase())) continue;
    seen.add(term.toLowerCase());
    terms.push(term);
  }

  if (terms.length === 0) {
    const fallback = concept.candidateConceptName.trim();
    if (fallback) terms.push(fallback);
  }

  return terms;
}

export function buildTbxBasicXml(input: TbxExportInput): string {
  const defaultLanguage = input.defaultLanguage ?? 'en';
  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('martif', {
    type: 'TBX-Basic',
    'xml:lang': defaultLanguage,
  });

  const header = root.ele('martifHeader');
  const fileDesc = header.ele('fileDesc');
  const titleStmt = fileDesc.ele('titleStmt');
  titleStmt.ele('title').txt(input.projectName);
  const sourceDesc = fileDesc.ele('sourceDesc');
  sourceDesc.ele('p').txt('Exported from Termcaller');

  const body = root.ele('text').ele('body');

  for (const concept of input.concepts) {
    const termEntry = body.ele('termEntry', { id: `c${concept.id}` });
    const definition = concept.definitionText.trim();
    if (definition) {
      termEntry.ele('descrip', { type: 'definition' }).txt(definition);
    }

    const langSet = termEntry.ele('langSet', { 'xml:lang': defaultLanguage });
    for (const term of uniqueTerms(concept)) {
      const tig = langSet.ele('tig');
      tig.ele('term').txt(term);
      tig.ele('termNote', { type: 'administrativeStatus' }).txt(TBX_PREFERRED_ADMIN_STATUS);
    }
  }

  return root.end({ prettyPrint: true });
}

export function sanitizeTbxFilename(projectName: string): string {
  const slug = projectName
    .trim()
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return `${slug || 'termbase'}.tbx`;
}

export async function loadProjectTbxData(
  prisma: PrismaClient,
  projectId: string,
  userId: string,
  defaultLanguage = 'en'
): Promise<TbxExportProjectData | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: {
      keywords: {
        include: {
          concepts: true,
        },
        orderBy: { sourceTerm: 'asc' },
      },
    },
  });

  if (!project) return null;

  return {
    projectId: project.id,
    projectName: project.name,
    defaultLanguage,
    concepts: selectCanonicalConceptsForKeywords(
      project.keywords.map(keyword => ({
        sourceTerm: keyword.sourceTerm,
        concepts: keyword.concepts.map(concept => ({
          id: concept.id,
          candidateConceptName: concept.candidateConceptName,
          definitionText: concept.definitionText,
          vectorEmbedding: concept.vectorEmbedding,
          excludedFromExport: concept.excludedFromExport,
        })),
      }))
    ),
  };
}

export async function exportProjectTbxBasic(
  prisma: PrismaClient,
  projectId: string,
  userId: string,
  defaultLanguage = 'en'
): Promise<{ xml: string; filename: string } | null> {
  const data = await loadProjectTbxData(prisma, projectId, userId, defaultLanguage);
  if (!data) return null;

  const xml = buildTbxBasicXml({
    projectName: data.projectName,
    defaultLanguage: data.defaultLanguage,
    concepts: data.concepts,
  });

  return {
    xml,
    filename: sanitizeTbxFilename(data.projectName),
  };
}
