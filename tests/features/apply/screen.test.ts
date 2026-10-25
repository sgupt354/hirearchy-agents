import { describe, expect, it } from 'vitest';
import { GRAD_LABEL, classifyF1, classifyGradWindow, findSentence, gradYearOf, sentences } from '../../../src/features/apply/jobs/screen';

describe('screen: sentences carry the evidence', () => {
  it('does not split inside U.S. / U.S.A.', () => {
    expect(sentences('You must be a U.S. citizen. We value you.')).toEqual(['You must be a U.S. citizen.', 'We value you.']);
    expect(sentences('Based in the U.S.A. today.\nApply now')).toEqual(['Based in the U.S.A. today.', 'Apply now']);
  });

  it('strips HTML and trims long evidence to 320 characters', () => {
    expect(sentences('<p>Hello <b>there</b>.</p>')).toEqual(['Hello there .']);
    const long = `Visa sponsorship is available ${'x'.repeat(400)}.`;
    expect(findSentence(long, [/visa sponsorship/])!.length).toBe(320);
  });
});

describe('screen: F-1 / work authorization', () => {
  it('an explicit "no" wins and quotes the sentence', () => {
    const d = 'We love interns. Visa sponsorship is available for some roles. Candidates must be a U.S. citizen to work on this program.';
    expect(classifyF1(d)).toEqual({ status: 'incompatible', evidence: 'Candidates must be a U.S. citizen to work on this program.' });
    expect(classifyF1('We are unable to sponsor visas for this role.').status).toBe('incompatible');
    expect(classifyF1('Requires an active security clearance.').status).toBe('incompatible');
  });

  it('an explicit "yes" is compatible, with evidence', () => {
    expect(classifyF1('Great team. We will sponsor your H-1B visa.')).toEqual({ status: 'compatible', evidence: 'We will sponsor your H-1B visa.' });
    expect(classifyF1('OPT candidates are welcome to apply.').status).toBe('compatible');
  });

  it('silence is "needs verification", never assumed friendly', () => {
    expect(classifyF1('Build APIs in Go. Great benefits.')).toEqual({ status: 'needs_verification', evidence: null });
    expect(classifyF1('')).toEqual({ status: 'needs_verification', evidence: null });
  });

  it('unrelated "sponsor" (events, relocation) is not counted', () => {
    expect(classifyF1('We sponsor hackathons and relocation for new hires.').status).toBe('needs_verification');
  });
});

describe('screen: graduation window', () => {
  it('a window naming the grad year (or the year before) fits', () => {
    expect(classifyGradWindow('Open to students graduating between December 2026 and June 2027.', 2027)).toEqual({
      status: 'fits', evidence: 'Open to students graduating between December 2026 and June 2027.',
    });
    expect(classifyGradWindow('Class of 2027 welcome.', 2027).status).toBe('fits');
  });

  it('a window that ends before the student graduates excludes them', () => {
    expect(classifyGradWindow('You must have graduated by December 2026.', 2027).status).toBe('excluded');
    expect(classifyGradWindow('Recent graduates from the Class of 2024.', 2027)).toEqual({ status: 'excluded', evidence: 'Recent graduates from the Class of 2024.' });
  });

  it('entry level with no window is "not excluded"; otherwise "unclear"', () => {
    expect(classifyGradWindow('This is an entry-level role on our payments team.', 2027).status).toBe('not_excluded');
    expect(classifyGradWindow('Build things.', 2027, true)).toEqual({ status: 'not_excluded', evidence: null });
    expect(classifyGradWindow('Build things.', 2027)).toEqual({ status: 'unclear', evidence: null });
  });

  it('works for any grad year, not just 2027', () => {
    expect(classifyGradWindow('Graduating in May 2028.', 2028).status).toBe('fits');
    expect(classifyGradWindow('Graduating in May 2028.', 2026).status).not.toBe('fits');
  });

  it('grad year comes from the student\'s own profile dates; labels are plain text', () => {
    expect(gradYearOf('Aug 2023 - May 2027')).toBe(2027);
    expect(gradYearOf('')).toBeNull();
    expect(GRAD_LABEL('fits', 2027)).toBe('Fits May 2027 grads');
  });
});
