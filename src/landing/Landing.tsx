import { useEffect, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from 'react';
import {
  ArrowLeftRight, ArrowRight, Award, Bot, CalendarCheck, ChartColumn, CircleCheck, CirclePause, CirclePlay, Clock, Cpu,
  ExternalLink, EyeOff, FileText, Handshake, Lock, LockOpen, Menu, MessageSquare, Plus, Radio, RotateCcw, Search, Share2,
  ShieldCheck, Star, TriangleAlert, User, Users, X,
} from './icons';
import { Presence, Reveal, cn, useInView, useReducedMotion } from './motion';

// The marketing site (originally built in Lovable), ported section by section with its exact classes, copy and
// timings. Styles come from the site's own compiled stylesheet (site.css); "Try the live demo" opens the app.

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

export const DEMO = '/app/';
const GITHUB = 'https://github.com/sgupt354/hirearchy-agents';

function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-[1200px] px-6', className)}>{children}</div>;
}

function SectionHeader({ eyebrow, title, body, center }: { eyebrow: string; title: string; body?: string; center?: boolean }) {
  return (
    <Reveal className={cn('max-w-2xl', center && 'mx-auto text-center')}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold leading-tight md:text-[44px]">{title}</h2>
      {body && <p className="mt-4 text-lg leading-relaxed">{body}</p>}
    </Reveal>
  );
}

function LogoMark({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 5 L5 18 L19 18 Z" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.6" />
      <circle cx="12" cy="5" r="3" className="fill-primary" />
      <circle cx="5" cy="18" r="3" className="fill-cyan" />
      <circle cx="19" cy="18" r="3" className="fill-primary" />
    </svg>
  );
}

function Logo() {
  return (
    <span className="inline-flex items-center gap-2 font-display text-lg font-bold tracking-tight text-foreground">
      <LogoMark />
      Hirearchy
    </span>
  );
}

const external = (href: string) => (href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {});

function CtaLink({ href, children, small, className }: { href: string; children: ReactNode; small?: boolean; className?: string }) {
  return (
    <a
      href={href}
      {...external(href)}
      className={cn(
        'group inline-flex items-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-card transition hover:bg-primary/90',
        small ? 'h-9 px-4' : 'h-11 px-5',
        className,
      )}
    >
      {children}
    </a>
  );
}

const NAV: [string, string][] = [
  ['Product', '#product'],
  ['How it works', '#how'],
  ['Privacy', '#privacy'],
  ['Demo', '#demo'],
];

function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <header className={cn('sticky top-0 z-50 transition-colors', scrolled || open ? 'border-b bg-background/80 backdrop-blur-lg' : 'border-b border-transparent')}>
      <Container className="flex h-16 items-center justify-between">
        <a href="#top" aria-label="Hirearchy home"><Logo /></a>
        <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
          {NAV.map(([label, href]) => (
            <a key={href} href={href} className="text-sm font-medium text-foreground/80 transition hover:text-foreground">{label}</a>
          ))}
        </nav>
        <div className="hidden items-center gap-6 md:flex">
          <a href={GITHUB} target="_blank" rel="noreferrer" className="text-sm font-medium text-foreground/80 hover:text-foreground">GitHub</a>
          <CtaLink href={DEMO} small>
            Try the live demo <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </CtaLink>
        </div>
        <button className="md:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <X className="h-6 w-6 text-foreground" /> : <Menu className="h-6 w-6 text-foreground" />}
        </button>
      </Container>
      {open && (
        <nav className="lp-menu overflow-hidden md:hidden" aria-label="Mobile">
          <Container className="flex flex-col gap-1 pb-6">
            {[...NAV, ['GitHub', GITHUB] as [string, string]].map(([label, href]) => (
              <a key={href} href={href} {...external(href)} onClick={() => setOpen(false)} className="py-3 text-base font-medium text-foreground">{label}</a>
            ))}
            <CtaLink href={DEMO} className="mt-2 justify-center">
              Try the live demo <ArrowRight className="h-4 w-4" />
            </CtaLink>
          </Container>
        </nav>
      )}
    </header>
  );
}

function Mesh({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <div className="mesh absolute -inset-x-20 -top-1/3 h-[85%] origin-top-left -skew-y-6 opacity-60 blur-2xl" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-background" />
    </div>
  );
}

function Hero() {
  return (
    <section id="top" className="relative -mt-16 overflow-hidden pt-16">
      <Mesh />
      <Container className="relative grid items-center gap-16 py-20 md:py-28 lg:grid-cols-12">
        <div className="lp-rise lp-rise-16 lg:col-span-7">
          <p className="eyebrow">AI agents for the job hunt</p>
          <h1 className="mt-4 text-[40px] font-bold leading-[1.05] md:text-[68px]">Land the interview. Your agent finds your prep circle.</h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed md:text-xl">
            The moment you land an interview, your AI agent finds students in the same hiring process who can cover your weak spots, negotiates
            with their agents, and shares names only once everyone agrees.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <CtaLink href={DEMO}>
              Try the live demo <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </CtaLink>
            <a href="#demo" className="inline-flex h-11 items-center gap-2 rounded-full border bg-background/70 px-5 text-sm font-semibold text-foreground backdrop-blur transition hover:bg-background">
              <CirclePlay className="h-4 w-4 text-primary" /> Watch the demo
            </a>
          </div>
        </div>
        <div className="flex justify-center lg:col-span-5">
          <HeroPhone />
        </div>
      </Container>
    </section>
  );
}

/** The agent's iMessage thread, on a loop: congrats → typing → the circle → quick replies. */
function HeroPhone() {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(reduced ? 4 : 0);
  useEffect(() => {
    if (reduced) return setStep(4);
    const t = setTimeout(() => setStep((s) => (s + 1) % 5), [900, 1400, 1400, 1000, 4200][step]);
    return () => clearTimeout(t);
  }, [step, reduced]);
  return (
    <div className="relative w-[300px] rounded-[48px] border-[10px] border-ink bg-ink shadow-lift" role="img" aria-label="iMessage conversation with your Hirearchy agent">
      <div className="absolute left-1/2 top-2 z-10 h-6 w-24 -translate-x-1/2 rounded-full bg-ink" />
      <div className="flex h-[580px] flex-col overflow-hidden rounded-[38px] bg-background">
        <div className="flex flex-col items-center border-b bg-muted pb-3 pt-10">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10">
            <LogoMark className="h-5 w-5 text-foreground" />
          </div>
          <p className="mt-1 text-xs font-medium text-foreground">Hirearchy agent</p>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4 text-[14px] leading-snug">
          {step >= 1 && <div className="lp-rise max-w-[80%] self-start rounded-2xl rounded-bl-md bg-bubble px-3.5 py-2 text-foreground">Congrats on your Microsoft interview.</div>}
          {step === 2 && (
            <div className="lp-rise flex gap-1 self-start rounded-2xl bg-bubble px-4 py-3">
              {[0, 1, 2].map((i) => <span key={i} className="lp-dot h-2 w-2 rounded-full bg-muted-foreground/60" style={{ animationDelay: `${i * 0.2}s` }} />)}
            </div>
          )}
          {step >= 3 && (
            <div className="lp-rise max-w-[85%] self-start rounded-2xl rounded-bl-md bg-bubble px-3.5 py-2 text-foreground">
              I found two students in your pipeline to prep with. Tonight, 8:00–9:00 PM?
            </div>
          )}
          {step >= 4 && (
            <div className="lp-rise mt-auto flex flex-wrap justify-end gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"><CircleCheck className="h-3.5 w-3.5" />I'm in</span>
              <span className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold text-foreground"><Clock className="h-3.5 w-3.5" />Suggest a time</span>
              <span className="rounded-full border px-3 py-1.5 text-xs font-semibold text-foreground">Not now</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Problem() {
  const stats: [string, string, string][] = [
    ['273', 'applicants per tech internship posting', 'Source: Handshake, 2025'],
    ['1', 'person prepping: you, alone', ''],
    ['0', 'tools connecting students in the same pipeline', ''],
  ];
  return (
    <section className="bg-muted py-20 md:py-[120px]">
      <Container>
        <SectionHeader eyebrow="The problem" title="Interview prep is a solo sport. It shouldn't be." />
        <div className="mt-14 grid gap-10 md:grid-cols-3">
          {stats.map(([n, label, source], i) => (
            <Reveal key={n} delay={i * 0.08} className="border-t pt-6">
              <p className="font-display text-6xl font-bold tracking-tight text-foreground md:text-7xl">{n}</p>
              <p className="mt-3 text-lg text-foreground">{label}</p>
              {source && <p className="mt-2 text-xs">{source}</p>}
            </Reveal>
          ))}
        </div>
        <Reveal>
          <p className="mt-14 max-w-2xl text-lg leading-relaxed">Dozens of students at your school are interviewing at the same company the same week. Nobody connects them.</p>
        </Reveal>
      </Container>
    </section>
  );
}

const STEPS: [string, string][] = [
  ['Discover', 'Your agent spots two students interviewing in the same pipeline.'],
  ['Match', 'Skills line up. Each covers a weak spot for someone else.'],
  ['Negotiate', 'Schedules conflict. The agents negotiate a window on their own.'],
  ['Ask you', 'Nothing happens without you. Your agent pauses for approval.'],
  ['Unlock', 'Everyone agreed. Names are shared, and the session is on.'],
];
const NODES: Record<'you' | 'a2' | 'a3', [number, number]> = { you: [200, 60], a2: [70, 250], a3: [330, 250] };
const EDGES: ['you' | 'a2' | 'a3', 'you' | 'a2' | 'a3', string][] = [
  ['you', 'a2', 'DSA'],
  ['you', 'a3', 'System Design'],
  ['a2', 'a3', 'Behavioral'],
];

function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, 120);
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (inView) setPlaying(true);
  }, [inView]);
  useEffect(() => {
    if (!playing || step >= 4) return;
    const t = setTimeout(() => setStep((s) => s + 1), reduced ? 1200 : 2600);
    return () => clearTimeout(t);
  }, [playing, step, reduced]);
  const pick = (i: number) => {
    setPlaying(false);
    setStep(i);
  };
  return (
    <section id="how" className="scroll-mt-16 py-20 md:py-[120px]">
      <Container>
        <SectionHeader eyebrow="How it works" title="Three agents. One prep circle. Zero awkward asks." />
        <div ref={ref} className="mt-14 grid gap-10 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <ol className="flex flex-col gap-2">
              {STEPS.map(([title, body], i) => (
                <li key={title}>
                  <button
                    onClick={() => pick(i)}
                    aria-current={step === i ? 'step' : undefined}
                    className={cn('flex w-full gap-4 rounded-2xl border p-4 text-left transition', step === i ? 'border-primary/30 bg-accent/60 shadow-card' : 'border-transparent hover:bg-muted')}
                  >
                    <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold', i <= step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground ring-1 ring-border')}>
                      {i + 1}
                    </span>
                    <span>
                      <span className="block font-semibold text-foreground">{title}</span>
                      <span className={cn('block text-sm leading-relaxed transition-all', step === i ? 'mt-1 opacity-100' : 'h-0 overflow-hidden opacity-0')}>{body}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <button
              onClick={() => {
                setStep(0);
                setPlaying(true);
              }}
              className="mt-4 inline-flex items-center gap-2 px-4 text-sm font-semibold text-primary hover:text-primary/80"
            >
              <RotateCcw className="h-4 w-4" /> Replay
            </button>
          </Reveal>
          <Reveal className="lg:col-span-7" delay={0.1}>
            <AgentDiagram step={step} />
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

function Badge({ show, className, children }: { show: boolean; className: string; children: ReactNode }) {
  return (
    <Presence
      show={show}
      className={cn('absolute left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border bg-background px-3 py-1.5 text-xs font-semibold shadow-card', className)}
    >
      {children}
    </Presence>
  );
}

function AgentDiagram({ step }: { step: number }) {
  const unlocked = step >= 4;
  const negotiating = step === 2;
  return (
    <div className="relative rounded-2xl border bg-muted p-4 shadow-card md:p-8">
      <div className="relative mx-auto aspect-[400/330] max-w-[520px]">
        <svg viewBox="0 0 400 330" className="absolute inset-0 h-full w-full" aria-label={`Agent diagram, step ${step + 1}: ${STEPS[step]?.[0] ?? ''}`} role="img">
          {EDGES.map(([from, to, skill], i) => {
            const [x1, y1] = NODES[from];
            const [x2, y2] = NODES[to];
            return (
              <g key={skill}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} className={cn('stroke-primary', negotiating && 'dash-flow')} strokeWidth={2}
                  style={{ opacity: step >= 1 ? 0.7 : 0, transition: `opacity .6s ease ${i * 0.15}s` }} />
                <text x={(x1 + x2) / 2 + (i === 2 ? 0 : i === 0 ? -34 : 34)} y={(y1 + y2) / 2 + (i === 2 ? 20 : 0)} textAnchor="middle"
                  className="fill-foreground text-[11px] font-semibold" style={{ opacity: step >= 1 ? 1 : 0, transition: `opacity .3s ease ${0.4 + i * 0.15}s` }}>
                  {skill}
                </text>
              </g>
            );
          })}
          {(Object.keys(NODES) as (keyof typeof NODES)[]).map((id) => (
            <circle key={id} cx={NODES[id][0]} cy={NODES[id][1]} r={30} className={id === 'you' ? 'fill-primary' : 'fill-background stroke-border'} strokeWidth={2} />
          ))}
        </svg>
        {(Object.keys(NODES) as (keyof typeof NODES)[]).map((id) => (
          <div key={id} className="absolute flex -translate-x-1/2 flex-col items-center" style={{ left: `${(NODES[id][0] / 400) * 100}%`, top: `${((NODES[id][1] + 36) / 330) * 100}%` }}>
            <span className="text-xs font-semibold text-foreground">{id === 'you' ? 'You' : id === 'a2' ? 'Applicant 2' : 'Applicant 3'}</span>
            <span className={cn('mt-0.5 inline-flex items-center gap-1 text-[11px] transition-colors', unlocked ? 'text-success' : 'text-muted-foreground')}>
              {unlocked ? <LockOpen className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
              <span key={String(unlocked)} className="lp-fade">{unlocked ? 'Name shared' : 'Hidden'}</span>
            </span>
          </div>
        ))}
        <Badge show={step === 2} className="top-[50%] text-amber"><TriangleAlert className="h-3.5 w-3.5" />Schedules conflict</Badge>
        <Badge show={step === 2} className="top-[62%] text-primary">Agents negotiating</Badge>
        <Badge show={step >= 3} className="top-[50%] text-success"><CalendarCheck className="h-3.5 w-3.5" />Window agreed: 7:30–9:00 PM</Badge>
        <Badge show={step === 3} className="top-[62%] text-violet"><CirclePause className="h-3.5 w-3.5" />Needs your approval</Badge>
      </div>
    </div>
  );
}

function Browser({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-background shadow-card">
      <div className="flex items-center gap-1.5 border-b bg-muted px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="ml-2 truncate text-[10px] text-muted-foreground">hirearchy-agents.vercel.app</span>
      </div>
      <div className="p-3 text-xs">{children}</div>
    </div>
  );
}

function Row({ a, b, tone = 'text-foreground' }: { a: string; b: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between border-b py-1.5 last:border-0">
      <span>{a}</span>
      <span className={cn('font-semibold', tone)}>{b}</span>
    </div>
  );
}

const TOOLS: { icon: IconType; title: string; line: string; detail: string; className: string; visual: ReactNode }[] = [
  {
    icon: Users,
    title: 'Prep circle',
    line: 'Agents form a three-way prep group.',
    detail: "Each person covers someone else's weak spot. The agents settle the time.",
    className: 'lg:col-span-2 lg:row-span-2',
    visual: (
      <Browser>
        <p className="font-semibold text-foreground">Microsoft SWE Intern · Prep circle</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[['You', 'Behavioral'], ['Applicant 2', 'DSA'], ['Applicant 3', 'System Design']].map(([who, skill]) => (
            <div key={who} className="rounded-lg border bg-muted p-2">
              <p className="font-semibold text-foreground">{who}</p>
              <p className="text-muted-foreground">Covers {skill}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-success/10 px-2 py-1.5 font-semibold text-success">
          <CircleCheck className="h-3.5 w-3.5" />Window agreed: 7:30–9:00 PM
        </div>
      </Browser>
    ),
  },
  {
    icon: Search,
    title: 'Find',
    line: 'Your agent texts you new matching internships.',
    detail: 'Matched to your skills, delivered where you already chat.',
    className: '',
    visual: <Browser><Row a="SWE Intern" b="New match" tone="text-primary" /><Row a="Data Intern" b="New match" tone="text-primary" /></Browser>,
  },
  {
    icon: ChartColumn,
    title: 'Pipeline',
    line: 'Anonymous cohort stats, shown only with 3+ reports.',
    detail: 'Below three reports, nothing is shown. Small groups stay private.',
    className: '',
    visual: <Browser><Row a="Reached final round" b="4 reports" /><Row a="Avg. days to reply" b="9" /></Browser>,
  },
  {
    icon: MessageSquare,
    title: 'Mock interview',
    line: 'Reciprocal mock swaps with private scores.',
    detail: 'You interview them, they interview you. Scores stay with you.',
    className: '',
    visual: <Browser><Row a="Communication" b="4 / 5" /><Row a="Problem solving" b="Private" tone="text-violet" /></Browser>,
  },
  {
    icon: FileText,
    title: 'Intel',
    line: 'Give-to-get anonymized interview reports.',
    detail: 'Share a report to unlock others. Every report is anonymized.',
    className: '',
    visual: <Browser><Row a="Round 2 · Technical" b="Unlocked" tone="text-success" /><Row a="Round 3 · Onsite" b="Give one to unlock" tone="text-muted-foreground" /></Browser>,
  },
  {
    icon: Handshake,
    title: 'Referral',
    line: 'Connection first; proof of work earns it.',
    detail: 'A human always decides. Agents never refer on their own.',
    className: '',
    visual: <Browser><Row a="Fit check" b="Passed" tone="text-success" /><Row a="Referral" b="Awaiting human" tone="text-violet" /></Browser>,
  },
];

function Product() {
  const [active, setActive] = useState<number | null>(null);
  return (
    <section id="product" className="scroll-mt-16 bg-muted py-20 md:py-[120px]">
      <Container>
        <SectionHeader eyebrow="Product" title="One agent for the whole hiring journey." body="Six tools, one private agent. Hover or tap a card to see more." />
        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((t, i) => {
            const open = active === i;
            const big = i === 0;
            return (
              <Reveal key={t.title} delay={i * 0.04} className={t.className}>
                <button
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  onClick={() => setActive(open ? null : i)}
                  aria-expanded={open}
                  className="flex h-full w-full flex-col rounded-2xl border bg-card p-6 text-left shadow-card transition duration-300 hover:-translate-y-0.5 hover:shadow-lift md:p-8"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-primary"><t.icon className="h-5 w-5" /></span>
                  <h3 className={cn('mt-5 font-semibold', big ? 'text-2xl' : 'text-lg')}>{t.title}</h3>
                  <p className="mt-2 leading-relaxed">{t.line}</p>
                  <p className={cn('text-sm leading-relaxed text-primary transition-all duration-300', open || big ? 'mt-2 max-h-12 opacity-100' : 'max-h-0 opacity-0')}>{t.detail}</p>
                  <div className={cn('mt-auto pt-6 transition duration-300', big || open ? 'opacity-100' : 'opacity-60')}>{t.visual}</div>
                </button>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

function ProofOfWork() {
  const line = useRef<HTMLDivElement>(null);
  const drawn = useInView(line);
  const steps: [IconType, string][] = [
    [Users, 'Prep sessions'],
    [Star, 'Peer ratings'],
    [ChartColumn, 'Mock scores'],
    [ShieldCheck, 'Private fit check'],
    [Handshake, 'Human-approved referral'],
  ];
  return (
    <section className="py-20 md:py-[120px]">
      <Container>
        <SectionHeader center eyebrow="Proof of work" title="Your prep circle becomes your proof of work." />
        <div className="relative mt-16">
          <div
            ref={line}
            aria-hidden
            className="absolute left-[10%] right-[10%] top-7 hidden h-0.5 origin-left bg-gradient-to-r from-primary to-cyan md:block"
            style={{ transform: `scaleX(${drawn ? 1 : 0})`, transition: 'transform 1.2s ease-out' }}
          />
          <ol className="relative grid gap-8 md:grid-cols-5">
            {steps.map(([Icon, label], i) => (
              <Reveal key={label} delay={0.15 + i * 0.15} className="flex flex-col items-center text-center">
                <span className="grid h-14 w-14 place-items-center rounded-full border bg-background text-primary shadow-card"><Icon className="h-6 w-6" /></span>
                <span className="mt-4 text-sm font-semibold text-foreground">{label}</span>
              </Reveal>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}

const TERMINAL = ['$ npm run test:sabotage', 'Planting 12 privacy bugs...', '12 of 12 caught', '482 tests passing'];

function SabotageTerminal() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const [lines, setLines] = useState(0);
  useEffect(() => {
    if (!inView || lines >= TERMINAL.length) return;
    const t = setTimeout(() => setLines(lines + 1), lines === 0 ? 300 : 900);
    return () => clearTimeout(t);
  }, [inView, lines]);
  return (
    <div ref={ref} className="rounded-2xl border border-primary-foreground/10 bg-ink-soft shadow-lift">
      <div className="flex gap-1.5 border-b border-primary-foreground/10 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-primary-foreground/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-primary-foreground/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-primary-foreground/20" />
      </div>
      <div className="min-h-[180px] p-6 font-mono text-sm leading-7" aria-live="polite">
        {TERMINAL.slice(0, lines).map((l, i) => (
          <p key={l} className={cn('lp-fade', i === 0 ? 'text-primary-foreground' : i >= 2 ? 'text-success' : 'text-primary-foreground/60')}>{l}</p>
        ))}
        {lines < TERMINAL.length && <span className="inline-block h-4 w-2 animate-pulse bg-primary-foreground/70 align-middle" />}
      </div>
    </div>
  );
}

function Privacy() {
  const rows: [IconType, string, string][] = [
    [Share2, 'Shared', 'Skills, approximate times'],
    [FileText, 'Summarized', 'Interview date becomes "time-sensitive"'],
    [EyeOff, 'Hidden until everyone agrees', 'Name, email, contact'],
  ];
  return (
    <section id="privacy" className="scroll-mt-16 bg-ink py-20 text-primary-foreground/70 md:py-[120px]">
      <Container>
        <Reveal className="max-w-2xl">
          <p className="eyebrow !text-cyan">Privacy</p>
          <h2 className="mt-3 text-3xl font-bold !text-primary-foreground md:text-[44px]">Private by default. Revealed only by consent.</h2>
        </Reveal>
        <div className="mt-14 grid gap-12 lg:grid-cols-2">
          <Reveal>
            <div className="divide-y divide-primary-foreground/10 rounded-2xl border border-primary-foreground/10">
              {rows.map(([Icon, title, body]) => (
                <div key={title} className="flex items-start gap-4 p-5">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-cyan" />
                  <div>
                    <p className="font-semibold text-primary-foreground">{title}</p>
                    <p className="mt-1 text-sm">{body}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-6 leading-relaxed">Your agent asks you before: joining a session, revealing your name, making a referral.</p>
          </Reveal>
          <Reveal delay={0.1}>
            <SabotageTerminal />
            <p className="mt-4 text-sm">We broke our own code on purpose. Our tests caught every leak.</p>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

function Demo() {
  return (
    <section id="demo" className="scroll-mt-16 bg-muted py-20 md:py-[120px]">
      <Container>
        <SectionHeader center eyebrow="Demo" title="See it in action." />
        <Reveal className="mx-auto mt-14 max-w-4xl">
          <div className="relative grid aspect-video place-items-center overflow-hidden rounded-2xl border bg-ink shadow-lift">
            <div aria-hidden className="mesh absolute inset-0 opacity-30" />
            <div className="relative flex flex-col items-center gap-4">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-primary-foreground text-primary shadow-lift"><CirclePlay className="h-8 w-8" /></span>
              <span className="text-sm font-semibold text-primary-foreground">Demo video coming soon</span>
            </div>
          </div>
        </Reveal>
        <Reveal className="mx-auto mt-16 max-w-5xl">
          <div className="rounded-t-2xl border-[10px] border-b-0 border-ink bg-ink">
            <iframe src={DEMO} title="Hirearchy live app" loading="lazy" className="aspect-[16/10] w-full rounded-t-md bg-background" />
          </div>
          <div className="mx-auto h-4 w-[106%] -translate-x-[3%] rounded-b-xl bg-ink-soft" />
          <div className="mt-6 text-center">
            <a href={DEMO} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80">
              Open full screen <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

function ArchitectureAndTeam() {
  const layers: [IconType, string, string][] = [
    [User, 'Student', ''],
    [Bot, 'Personal agent', 'Private data + rules'],
    [Radio, 'Broker', 'Anonymous listings only'],
    [Cpu, 'Deterministic engine', 'Matching, scheduling, consent'],
  ];
  const team: [string, string, string][] = [
    ['S', 'Sumedha', 'Engine, journey, mock interviews, trust, referrals'],
    ['A', 'Aditya', 'Integrations, find, pipeline stats, intel'],
  ];
  return (
    <section className="py-20 md:py-[120px]">
      <Container className="grid gap-16 lg:grid-cols-2">
        <div>
          <SectionHeader eyebrow="Architecture" title="Rules decide. Language only polishes." />
          <Reveal className="mt-10">
            <ol className="flex flex-col items-start gap-1">
              {layers.map(([Icon, title, body], i) => (
                <li key={title} className="flex w-full flex-col items-start">
                  {i > 0 && <ArrowLeftRight aria-hidden className="my-1 ml-6 h-4 w-4 rotate-90 text-muted-foreground" />}
                  <div className="flex w-full items-center gap-4 rounded-2xl border bg-card p-4 shadow-card">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-primary"><Icon className="h-4 w-4" /></span>
                    <div>
                      <p className="font-semibold text-foreground">{title}</p>
                      {body && <p className="text-sm">{body}</p>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm">Language model used only for friendly wording.</p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {['React', 'TypeScript', 'Vite', 'Vitest', 'Supabase', 'Vercel', 'Discord'].map((t) => (
                <li key={t} className="rounded-full border px-3 py-1 text-xs font-medium text-foreground">{t}</li>
              ))}
            </ul>
          </Reveal>
        </div>
        <div>
          <SectionHeader eyebrow="Team" title="Built by two." />
          <div className="mt-10 grid gap-4">
            {team.map(([initial, name, role], i) => (
              <Reveal key={name} delay={i * 0.08}>
                <div className="flex items-start gap-4 rounded-2xl border bg-card p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary font-display text-lg font-bold text-primary-foreground">{initial}</span>
                  <div>
                    <h3 className="text-lg font-semibold">{name}</h3>
                    <p className="mt-1 text-sm leading-relaxed">{role}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

const FAQ: [string, string][] = [
  ['Is this just matching?', 'No. Each agent has private data and its own rules, and decides for itself. The broker never sees private data.'],
  ['Why not a group chat?', 'Nobody posts their weak spots publicly, and nobody finds a three-way match by scrolling.'],
  ['What if someone lies about their skills?', 'Peer ratings and mock scores build a reliability record.'],
  ['Which messaging apps does it work with?', 'The agent lives in your messages: an iMessage-style chat in the demo, plus live Discord DMs. The agent protocol is app-agnostic, so new apps plug in without changing the rules.'],
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="bg-muted py-20 md:py-[120px]">
      <div className="mx-auto w-full max-w-3xl px-6">
        <SectionHeader center eyebrow="FAQ" title="Questions, answered." />
        <Reveal className="mt-12 divide-y rounded-2xl border bg-card shadow-card">
          {FAQ.map(([q, a], i) => (
            <div key={q}>
              <h3>
                <button className="flex w-full items-center justify-between gap-4 p-6 text-left text-base font-semibold text-foreground" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                  {q}
                  <Plus className={cn('h-5 w-5 shrink-0 text-primary transition-transform', open === i && 'rotate-45')} />
                </button>
              </h3>
              <div className={cn('grid transition-all duration-300', open === i ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                <p className="overflow-hidden px-6 leading-relaxed"><span className="block pb-6">{a}</span></p>
              </div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden py-24 md:py-32">
      <Mesh className="opacity-80" />
      <Container className="relative text-center">
        <Reveal>
          <Award aria-hidden className="mx-auto h-8 w-8 text-primary" />
          <h2 className="mx-auto mt-6 max-w-3xl text-3xl font-bold leading-tight md:text-5xl">Stop prepping alone. Your agent already found your circle.</h2>
          <CtaLink href={DEMO} className="mt-10">
            Try the live demo <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </CtaLink>
        </Reveal>
      </Container>
    </section>
  );
}

function Footer() {
  const cols: [string, [string, string][]][] = [
    ['Product', [['Live demo', DEMO], ['How it works', '#how'], ['Privacy', '#privacy']]],
    ['Resources', [['GitHub', GITHUB], ['Demo video', '#demo']]],
  ];
  return (
    <footer className="border-t py-16">
      <Container>
        <div className="grid gap-10 md:grid-cols-4">
          {cols.map(([title, links]) => (
            <div key={title}>
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <ul className="mt-4 space-y-3 text-sm">
                {links.map(([label, href]) => (
                  <li key={label}><a href={href} {...external(href)} className="hover:text-foreground">{label}</a></li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <p className="text-sm font-semibold text-foreground">Project</p>
            <p className="mt-4 text-sm">Built by students, for students.</p>
          </div>
        </div>
        <div className="mt-16 flex items-center justify-between border-t pt-8">
          <Logo />
          <p className="text-sm">© 2026 Hirearchy</p>
        </div>
      </Container>
    </footer>
  );
}

export function Landing() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <Product />
        <ProofOfWork />
        <Privacy />
        <Demo />
        <ArchitectureAndTeam />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
