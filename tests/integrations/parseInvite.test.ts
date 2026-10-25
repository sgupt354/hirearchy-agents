import { describe, expect, it } from 'vitest';
import { parseInvite } from '../../src/integrations';

const demo = { company: 'Microsoft', role: 'SWE Intern', stage: 'interview' };

describe('parseInvite — invitations', () => {
  it('parses the exact Microsoft demo invitation', async () => {
    expect(
      await parseInvite('Microsoft would like to invite you to a technical interview for our SWE Intern position.'),
    ).toEqual(demo);
  });

  it('parses the phone-screen variation', async () => {
    expect(
      await parseInvite(
        "Congratulations! We'd like to move forward with a phone screen for the Software Engineer Intern role at Microsoft.",
      ),
    ).toEqual(demo);
  });

  it('parses the onsite variation', async () => {
    expect(
      await parseInvite('Your Microsoft onsite interview for the SWE Intern position is ready to schedule.'),
    ).toEqual(demo);
  });

  it('is case-insensitive', async () => {
    expect(
      await parseInvite('MICROSOFT WOULD LIKE TO INVITE YOU TO A TECHNICAL INTERVIEW FOR OUR SWE INTERN POSITION.'),
    ).toEqual(demo);
  });

  it('tolerates multiline emails with extra whitespace', async () => {
    const email = `
      Hi Aditya,

      Microsoft   would like to invite you to a
      technical   interview for our SWE Intern position.

      Best,
      Recruiting
    `;
    expect(await parseInvite(email)).toEqual(demo);
  });
});

describe('parseInvite — non-invitations', () => {
  const cases: Array<[string, string]> = [
    ['empty string', ''],
    ['whitespace only', '   \n\t  '],
    ['application received', 'We have received your application for the SWE Intern position at Microsoft.'],
    [
      'rejection',
      'Thank you for your interest in Microsoft. After careful review we will not be moving forward with your SWE Intern application.',
    ],
    ['recruiter marketing', 'Microsoft is now hiring! Apply now to our Software Engineer Intern openings.'],
    ['job recommendation', 'Job recommendations for you: Software Engineer Intern at Microsoft.'],
    ['offer email', 'We are pleased to offer you the SWE Intern position at Microsoft.'],
    ['random company mention', 'I rebooted my laptop and Microsoft Teams finally works again.'],
    [
      'job posting',
      'Job posting: Software Engineer Intern — Microsoft, Redmond WA. Responsibilities include writing production code.',
    ],
    ['past interview follow-up', 'Thanks for interviewing with Microsoft for the SWE Intern position last week.'],
    ['unknown company', 'Acme Robotics would like to invite you to a technical interview for our SWE Intern position.'],
    ['unknown role', 'Microsoft would like to invite you to a technical interview for our Marine Biologist position.'],
  ];

  it.each(cases)('returns null for %s', async (_label, input) => {
    expect(await parseInvite(input)).toBeNull();
  });

  it('does not throw on arbitrary strings', async () => {
    const junk = ['\u0000\uFFFD', '(((((', '😀'.repeat(50), 'a'.repeat(5000)];
    for (const input of junk) {
      await expect(parseInvite(input)).resolves.toBeNull();
    }
  });
});
