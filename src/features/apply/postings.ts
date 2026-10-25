import type { ScoredPosting } from './jobs/match';
import type { TrackedPosting } from './store';

// Demo postings for the Apply tab when nothing has been tracked from live search (labelled "Demo posting").
const demo = (id: string, company: string, title: string, location: string, description: string): TrackedPosting => ({
  id: `demo-apply:${id}`, company, provider: 'greenhouse', title, location, url: '', posted: null, description,
  score: 0, isIntern: true, visaFlag: false, years: null, reasons: [], source: 'demo', trackedAt: '',
});

export const DEMO_POSTINGS: TrackedPosting[] = [
  demo('stripe', 'Stripe', 'Software Engineer, Intern', 'Seattle, WA',
    'Build and ship APIs used by millions of businesses. You will write production code in TypeScript, Ruby or Go, work with PostgreSQL and ' +
    'Kafka, and write tests for everything you ship. We look for students graduating in 2027 who have built real projects, know data ' +
    'structures and algorithms, and are curious about distributed systems. Experience with Docker or Kubernetes is a plus.'),
  demo('microsoft', 'Microsoft', 'Software Engineer Intern', 'Redmond, WA',
    'Join an Azure team building cloud services. You will design, code and test features in C# or Java, use Git and CI/CD, and work with ' +
    'SQL databases. Strong problem solving with data structures and algorithms. Bonus: experience with Python, Linux or operating systems.'),
  demo('datadog', 'Datadog', 'Software Engineer Intern', 'New York, NY',
    'Work on observability products that process trillions of data points. Write Go and Python services, build React frontends, and ' +
    'improve performance of distributed systems. Experience with AWS, Docker and Kafka is helpful.'),
];

export const postingKey = (p: Pick<ScoredPosting, 'id'>) => p.id;
