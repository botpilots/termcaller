import { describe, expect, it, beforeEach } from 'vitest';
import { resolveCorpusStats, resetCorpusIndexCache } from '../src/services/corpusLookup.js';

describe('resolveCorpusStats', () => {
  beforeEach(() => {
    resetCorpusIndexCache();
  });

  it('uses exact phrase stats when the phrase exists in the corpus', () => {
    const stats = resolveCorpusStats('screw');
    expect(stats.inCorpus).toBe(true);
    expect(stats.matchedAsPhrase).toBe(true);
    expect(stats.docFreq).toBeGreaterThan(0);
  });

  it('combines two-word phrases via min doc freq across tokens', () => {
    const master = resolveCorpusStats('master cylinder');
    const slave = resolveCorpusStats('slave cylinder');
    const cylinder = resolveCorpusStats('cylinder');

    expect(master.inCorpus).toBe(true);
    expect(master.matchedAsPhrase).toBe(false);
    expect(slave.inCorpus).toBe(true);
    expect(slave.docFreq).toBeLessThan(master.docFreq);
    expect(master.docFreq).toBeLessThanOrEqual(cylinder.docFreq);
    expect(slave.corpusRarity).toBeGreaterThan(master.corpusRarity);
  });

  it('splits slashes and uses max doc freq for three-word phrases', () => {
    const slashPhrase = resolveCorpusStats('master/slave system');
    const spacedPhrase = resolveCorpusStats('master slave system');
    const slaveAlone = resolveCorpusStats('slave');

    expect(slashPhrase.docFreq).toBeGreaterThan(0);
    expect(slashPhrase.docFreq).toBe(spacedPhrase.docFreq);
    expect(spacedPhrase.docFreq).toBeGreaterThan(slaveAlone.docFreq);
    expect(spacedPhrase.corpusRarity).toBeLessThan(slaveAlone.corpusRarity);
  });

  it('does not treat generic compounds as fully OOV', () => {
    const phrase = resolveCorpusStats('oil pump');
    const oov = resolveCorpusStats('zzznobodyhasthisword');

    expect(phrase.inCorpus).toBe(true);
    expect(phrase.docFreq).toBeGreaterThan(0);
    expect(oov.inCorpus).toBe(false);
    expect(oov.docFreq).toBe(0);
    expect(phrase.docFreq).toBeGreaterThan(oov.docFreq);
  });
});
