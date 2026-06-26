import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildTbxBasicXml, selectCanonicalConceptsForKeywords, TBX_PREFERRED_ADMIN_STATUS } from '../src/services/tbxExportService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_BASIC = fs.readFileSync(
  path.resolve(__dirname, '../reference/tbx/samples/sample-basic.tbx'),
  'utf8'
);

describe('buildTbxBasicXml', () => {
  it('produces TBX-Basic root without DOCTYPE', () => {
    const xml = buildTbxBasicXml({
      projectName: 'Test Project',
      concepts: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          candidateConceptName: 'manufacturing',
          definitionText: 'A process of making things.',
          keywords: [{ sourceTerm: 'manufacturing' }, { sourceTerm: 'fabrication' }],
        },
      ],
    });

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<martif type="TBX-Basic" xml:lang="en">');
    expect(xml).not.toContain('<!DOCTYPE');
    expect(xml).toContain('<title>Test Project</title>');
  });

  it('maps concept definition to termEntry and keywords to tigs', () => {
    const xml = buildTbxBasicXml({
      projectName: 'Manufacturing',
      concepts: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          candidateConceptName: 'manufacturing',
          definitionText: 'A process of making things.',
          keywords: [{ sourceTerm: 'manufacturing' }, { sourceTerm: 'fabrication' }],
        },
      ],
    });

    expect(xml).toContain('<termEntry id="c11111111-1111-1111-1111-111111111111">');
    expect(xml).toContain('<descrip type="definition">A process of making things.</descrip>');
    expect(xml).toContain('<langSet xml:lang="en">');
    expect(xml).toContain('<term>manufacturing</term>');
    expect(xml).toContain('<term>fabrication</term>');
    expect(xml).toContain(
      `<termNote type="administrativeStatus">${TBX_PREFERRED_ADMIN_STATUS}</termNote>`
    );
  });

  it('deduplicates keyword terms case-insensitively', () => {
    const xml = buildTbxBasicXml({
      projectName: 'Dedupe',
      concepts: [
        {
          id: '22222222-2222-2222-2222-222222222222',
          candidateConceptName: 'seed hose',
          definitionText: 'Flexible hose.',
          keywords: [{ sourceTerm: 'seed hose' }, { sourceTerm: 'Seed Hose' }],
        },
      ],
    });

    expect(xml.match(/<term>seed hose<\/term>/g)).toHaveLength(1);
  });

  it('falls back to candidateConceptName when no keywords are linked', () => {
    const xml = buildTbxBasicXml({
      projectName: 'Fallback',
      concepts: [
        {
          id: '33333333-3333-3333-3333-333333333333',
          candidateConceptName: 'level guard',
          definitionText: 'Sensor for fill level.',
          keywords: [],
        },
      ],
    });

    expect(xml).toContain('<term>level guard</term>');
  });

  it('matches structural patterns from translate-bot sample-basic.tbx', () => {
    expect(SAMPLE_BASIC).toContain('<martif type="TBX-Basic" xml:lang="en">');
    expect(SAMPLE_BASIC).toContain('<descrip type="definition">');
    expect(SAMPLE_BASIC).toContain('<termNote type="administrativeStatus">');
  });

  it('exports one canonical concept per keyword when multiple concepts are linked', () => {
    const concepts = selectCanonicalConceptsForKeywords([
      {
        sourceTerm: 'bracket',
        concepts: [
          {
            id: 'canonical-id',
            candidateConceptName: 'bracket',
            definitionText: 'Structural bracket for engine mount.',
            vectorEmbedding: JSON.stringify([1, 0, 0]),
            excludedFromExport: false,
          },
          {
            id: 'outlier-id',
            candidateConceptName: 'bracket',
            definitionText: 'Flexible hose adapter.',
            vectorEmbedding: JSON.stringify([0, 1, 0]),
            excludedFromExport: false,
          },
        ],
      },
    ]);

    expect(concepts).toHaveLength(1);
    expect(concepts[0]?.id).toBe('canonical-id');
    expect(concepts[0]?.definitionText).toBe('Structural bracket for engine mount.');

    const xml = buildTbxBasicXml({
      projectName: 'Bracket export',
      concepts,
    });

    expect(xml.match(/<termEntry /g)).toHaveLength(1);
    expect(xml).toContain('Structural bracket for engine mount.');
    expect(xml).not.toContain('Flexible hose adapter.');
  });
});
