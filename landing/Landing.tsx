import { ArrowLeftRight, ArrowRight, Check, Heart, Link2, Moon, SlidersHorizontal, Sun, WandSparkles } from 'lucide-react';
import { MEMBER_COLORS } from '../src/lib/colors';

const APP_URL = 'https://app.campoutapp.com';

const PEOPLE: Record<string, string> = {
  Alex: MEMBER_COLORS[0],
  Priya: MEMBER_COLORS[1],
  Jordan: MEMBER_COLORS[2],
  Sam: MEMBER_COLORS[3],
  Maya: MEMBER_COLORS[4],
  Theo: MEMBER_COLORS[5],
  You: '#ea580c',
};

// The mockup spans 6 PM → 9 AM; hours below are offsets from 6 PM.
const SPAN = 15;
const NIGHT_START = 5; // 11 PM
const NIGHT_END = 13; // 7 AM

// Two lanes by day, one shared lane overnight.
type Lane = 0 | 1 | 'night';
type Shift = [who: string, lane: Lane, start: number, end: number];

const DAYS: { label: string; desktopOnly?: boolean; shifts: Shift[] }[] = [
  {
    label: 'Fri 15',
    shifts: [
      ['Alex', 0, 0, 3], ['Priya', 0, 3, 5], ['Jordan', 1, 0, 2], ['Sam', 1, 2, 5],
      ['Maya', 'night', 5, 8], ['Theo', 'night', 8, 11], ['Alex', 'night', 11, 13],
      ['Jordan', 0, 13, 15], ['Priya', 1, 13, 15],
    ],
  },
  {
    label: 'Sat 16',
    shifts: [
      ['Theo', 0, 0, 3], ['You', 0, 3, 5], ['Priya', 1, 0, 2], ['Alex', 1, 2, 5],
      ['Sam', 'night', 5, 8], ['Maya', 'night', 8, 11], ['Priya', 'night', 11, 13],
      ['Jordan', 0, 13, 15], ['Theo', 1, 13, 15],
    ],
  },
  {
    label: 'Sun 17',
    shifts: [
      ['Sam', 0, 0, 2], ['Jordan', 0, 2, 5], ['Maya', 1, 0, 3], ['Theo', 1, 3, 5],
      ['Alex', 'night', 5, 8], ['Priya', 'night', 8, 10], ['Maya', 'night', 10, 13],
      ['Theo', 0, 13, 15], ['Sam', 1, 13, 15],
    ],
  },
  {
    label: 'Mon 18',
    desktopOnly: true,
    shifts: [
      ['Priya', 0, 0, 3], ['Maya', 0, 3, 5], ['Theo', 1, 0, 2], ['Jordan', 1, 2, 5],
      ['Sam', 'night', 5, 8], ['You', 'night', 8, 11], ['Alex', 'night', 11, 13],
      ['Theo', 0, 13, 15], ['Priya', 1, 13, 15],
    ],
  },
];

function hourLabel(offset: number): string {
  const h = (18 + offset) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`;
}

function rangeLabel(start: number, end: number): string {
  const s = hourLabel(start);
  const e = hourLabel(end);
  return s.slice(-1) === e.slice(-1) ? `${s.slice(0, -1)}–${e}` : `${s}–${e}`;
}

const pct = (hours: number) => `${(hours / SPAN) * 100}%`;

function TentMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 3l5.5 2L16 7z" fill="#f97316" />
      <path d="M16 8L4.5 27h23z" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M16 15.5l-4 11.5h8z" fill="#fdba74" />
    </svg>
  );
}

function ShiftBlock({ shift }: { shift: Shift }) {
  const [who, lane, start, end] = shift;
  const color = PEOPLE[who];
  const night = lane === 'night';
  const style = night
    ? {
        background: `color-mix(in oklab, ${color} 30%, #1d2350)`,
        borderColor: `color-mix(in oklab, ${color} 60%, white)`,
        color: 'white',
      }
    : {
        background: `color-mix(in oklab, ${color} 12%, white)`,
        borderColor: color,
        color: `color-mix(in oklab, ${color} 78%, black)`,
      };

  return (
    <div
      className="absolute p-[1.5px]"
      style={{
        top: pct(start),
        height: pct(end - start),
        left: lane === 1 ? '50%' : 0,
        width: night ? '100%' : '50%',
      }}
    >
      <div
        className="flex h-full flex-col overflow-hidden rounded-[5px] border-l-2 px-1 py-1 text-[10px] leading-tight sm:px-1.5 sm:text-[11px]"
        style={style}
      >
        <span className={`truncate ${who === 'You' ? 'font-semibold' : 'font-medium'}`}>{who}</span>
        <span className="hidden truncate font-geist-mono text-[10px] opacity-70 sm:block">{rangeLabel(start, end)}</span>
      </div>
    </div>
  );
}

function ScheduleMockup() {
  const cols = 'grid grid-cols-[2rem_repeat(3,minmax(0,1fr))] gap-x-1 sm:grid-cols-[2.75rem_repeat(4,minmax(0,1fr))]';

  return (
    <div
      role="img"
      aria-label="An example tent schedule: four days of overlapping shifts with every slot covered, including overnight."
      className="overflow-hidden rounded-xl border border-gray-200 bg-white text-left shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_48px_-16px_rgba(0,0,0,0.14)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-baseline gap-x-2.5">
          <span className="text-sm font-semibold">Joe's Tent</span>
          <span className="text-xs text-gray-500">6 members · 2 per shift · 1 overnight</span>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
          <Check className="size-3" strokeWidth={2.5} />
          Every slot covered
        </span>
      </div>

      <div className="px-3 sm:px-4">
        <div className={`${cols} pt-3 pb-1`}>
          <span />
          {DAYS.map((day) => (
            <span
              key={day.label}
              className={`font-geist-mono text-[10px] uppercase tracking-wider text-gray-500 ${day.desktopOnly ? 'hidden sm:block' : ''}`}
            >
              {day.label}
            </span>
          ))}
        </div>

        <div className="py-3">
          <div className={`${cols} relative h-[340px] sm:h-[380px]`}>
            {/* Night sky, full-bleed to the card edges */}
            <div
              className="absolute -inset-x-3 bg-[#0f1330] sm:-inset-x-4"
              style={{ top: pct(NIGHT_START), height: pct(NIGHT_END - NIGHT_START) }}
            >
              <Moon className="absolute left-2 top-1 size-3 fill-amber-200 text-amber-200 sm:left-5 sm:top-2" />
              <span className="absolute left-1.5 top-[38%] size-0.5 rounded-full bg-white/70 motion-safe:animate-twinkle sm:left-2" />
              <span className="absolute left-6 top-[58%] size-[3px] rounded-full bg-white/50 sm:left-9" />
              <span
                className="absolute left-2 top-[82%] size-0.5 rounded-full bg-white/60 motion-safe:animate-twinkle sm:left-4"
                style={{ animationDelay: '1.6s' }}
              />
              <span className="absolute right-1 top-[24%] size-0.5 rounded-full bg-white/60 sm:right-1.5" />
            </div>

            <div className="relative">
              {[0, 3, 6, 9, 12, 15].map((h) => (
                <span
                  key={h}
                  className={`absolute right-1.5 -translate-y-1/2 font-geist-mono text-[10px] ${
                    h > NIGHT_START && h < NIGHT_END ? 'text-indigo-200/60' : 'text-gray-400'
                  }`}
                  style={{ top: pct(h) }}
                >
                  {hourLabel(h)}
                </span>
              ))}
              <Sun className="absolute right-2 size-3 text-amber-500" style={{ top: `calc(${pct(NIGHT_END)} + 6px)` }} />
            </div>

            {DAYS.map((day) => (
              <div key={day.label} className={`relative ${day.desktopOnly ? 'hidden sm:block' : ''}`}>
                {day.shifts.map((shift) => (
                  <ShiftBlock key={`${shift[0]}-${shift[2]}`} shift={shift} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CampScene() {
  return (
    <svg viewBox="0 0 200 92" className="mx-auto w-44" aria-hidden="true">
      <defs>
        <mask id="moon-cut">
          <rect width="200" height="92" fill="white" />
          <circle cx="182" cy="13" r="6.5" fill="black" />
        </mask>
      </defs>
      <circle cx="178" cy="16" r="7" fill="#fbbf24" mask="url(#moon-cut)" />
      <circle cx="24" cy="18" r="1.2" fill="#d4d4d8" className="motion-safe:animate-twinkle" />
      <circle cx="140" cy="10" r="1" fill="#d4d4d8" />
      <circle cx="112" cy="30" r="1.2" fill="#d4d4d8" className="motion-safe:animate-twinkle" style={{ animationDelay: '2s' }} />

      <path d="M8 84h184" stroke="#e4e4e7" strokeWidth="1.5" strokeLinecap="round" />

      <path d="M72 24v-10" stroke="#0a0a0a" strokeWidth="2" strokeLinecap="round" />
      <path d="M72 14l10 3.5-10 3.5z" fill="#f97316" />
      <path d="M72 24L36 84h72z" fill="white" stroke="#0a0a0a" strokeWidth="2" strokeLinejoin="round" />
      <path d="M72 46L60 84h24z" fill="#fdba74" />

      <path d="M136 83l24-7M138 76l24 7" stroke="#92400e" strokeWidth="3" strokeLinecap="round" />
      <g className="origin-bottom [transform-box:fill-box] motion-safe:animate-flicker">
        <path d="M149 78c-9-5-8-14 0-26 8 12 9 21 0 26z" fill="#f97316" />
        <path d="M149 78c-4.5-3-4-8 0-14 4 6 4.5 11 0 14z" fill="#fcd34d" />
      </g>
    </svg>
  );
}

const STEPS = [
  {
    icon: SlidersHorizontal,
    title: 'Set up your tent',
    body: 'Pick your dates, how many people need to be in the tent, and a lighter headcount for overnight.',
    visual: (
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between rounded-md border border-gray-200 px-2.5 py-1.5">
          <span className="text-gray-600">In the tent</span>
          <span className="font-geist-mono">2</span>
        </div>
        <div className="flex items-center justify-between rounded-md border border-gray-200 px-2.5 py-1.5">
          <span className="flex items-center gap-1.5 text-gray-600">
            <Moon className="size-3" /> Overnight
          </span>
          <span className="font-geist-mono">1</span>
        </div>
      </div>
    ),
  },
  {
    icon: Link2,
    title: 'Share one link',
    body: 'Everyone paints in when they’re free. No accounts, just a name and password. Or import straight from Google Calendar.',
    visual: (
      <div className="flex flex-wrap gap-1.5 text-xs text-gray-700">
        {[
          ['bg-green-500', 'Available'],
          ['bg-amber-400', 'Not preferred'],
          ['bg-red-500', 'Unavailable'],
        ].map(([dot, label]) => (
          <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2 py-0.5">
            <span className={`size-1.5 rounded-full ${dot}`} />
            {label}
          </span>
        ))}
      </div>
    ),
  },
  {
    icon: WandSparkles,
    title: 'Generate the schedule',
    body: 'One click covers every slot, spreads the hours evenly, keeps shifts to three hours, and flags any gap it can’t fill.',
    visual: (
      <div>
        <div className="flex h-10 items-end gap-1.5 border-b border-gray-200">
          {[82, 94, 88, 100, 86, 91].map((h, i) => (
            <span key={i} className="flex-1 rounded-t-sm" style={{ height: `${h}%`, background: MEMBER_COLORS[i] }} />
          ))}
        </div>
        <p className="mt-2 font-geist-mono text-[10px] uppercase tracking-wider text-gray-400">Hours per person</p>
      </div>
    ),
  },
  {
    icon: ArrowLeftRight,
    title: 'Swap when life happens',
    body: 'Midterm moved? Propose a trade right on the schedule. Nothing changes until they say yes.',
    visual: (
      <div className="flex items-center gap-2 text-[11px] leading-tight">
        <span
          className="flex-1 rounded-[5px] border-l-2 px-2 py-1.5"
          style={{ background: `color-mix(in oklab, ${PEOPLE.Maya} 12%, white)`, borderColor: PEOPLE.Maya, color: PEOPLE.Maya }}
        >
          <span className="block font-medium">Maya</span>
          <span className="font-geist-mono text-[10px] opacity-70">Sat 2–5a</span>
        </span>
        <ArrowLeftRight className="size-3.5 shrink-0 text-gray-400" />
        <span
          className="flex-1 rounded-[5px] border-l-2 px-2 py-1.5"
          style={{ background: `color-mix(in oklab, ${PEOPLE.You} 12%, white)`, borderColor: PEOPLE.You, color: '#9a3412' }}
        >
          <span className="block font-semibold">You</span>
          <span className="font-geist-mono text-[10px] opacity-70">Mon 3–5p</span>
        </span>
      </div>
    ),
  },
];

const primaryButton =
  'group inline-flex items-center justify-center gap-1.5 rounded-lg bg-gray-950 font-medium text-white transition-colors hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-950';

export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-clip bg-white font-geist text-gray-950 antialiased selection:bg-orange-200">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[680px] bg-[linear-gradient(to_right,#0000000a_1px,transparent_1px),linear-gradient(to_bottom,#0000000a_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]"
      />

      <header className="relative mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <a href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <TentMark className="size-6 text-gray-950" />
          Campout
        </a>
        <nav className="flex items-center gap-5 text-sm">
          <a href="#how" className="hidden text-gray-600 transition-colors hover:text-gray-950 sm:block">
            How it works
          </a>
          <a href={APP_URL} className={`${primaryButton} h-8 px-3`}>
            Start a group
          </a>
        </nav>
      </header>

      <main className="relative">
        <section className="mx-auto max-w-5xl px-6 pt-16 text-center sm:pt-24">
          <div className="motion-safe:animate-rise">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600">
              <Moon className="size-3 fill-amber-300 text-amber-400" />
              Built for tenting season
            </span>
            <h1 className="mt-6 text-5xl font-semibold tracking-[-0.045em] sm:text-7xl">
              Tent shifts,{' '}
              <span className="relative whitespace-nowrap">
                sorted.
                <svg
                  viewBox="0 0 200 12"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  className="absolute -bottom-1.5 left-0 h-2.5 w-full sm:-bottom-2 sm:h-3"
                >
                  <path
                    d="M3 8.5C38 3 70 3.5 104 6.5S170 9 197 3.5"
                    fill="none"
                    stroke="#f97316"
                    strokeWidth="4"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              </span>
            </h1>
            <p className="mx-auto mt-7 max-w-xl text-lg leading-relaxed text-gray-600">
              Campout turns everyone’s availability into a fair schedule that keeps your tent covered around the
              clock, 3&nbsp;a.m. included. Less group-chat math, more sleep.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a href={APP_URL} className={`${primaryButton} h-11 w-full px-5 sm:w-auto`}>
                Start a group
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </a>
              <a
                href="#how"
                className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-gray-200 bg-white px-5 font-medium text-gray-900 transition-colors hover:bg-gray-50 sm:w-auto"
              >
                How it works
              </a>
            </div>
            <p className="mt-4 text-sm text-gray-500">No sign-up needed. Setup takes about a minute.</p>
          </div>

          <div className="relative isolate -mx-3 mt-16 max-w-3xl sm:mx-auto motion-safe:animate-rise sm:mt-20" style={{ animationDelay: '120ms' }}>
            <div
              aria-hidden="true"
              className="absolute inset-x-10 -bottom-10 top-1/3 -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(251,146,60,0.22),transparent)] blur-2xl"
            />
            <ScheduleMockup />
            <div aria-hidden="true" className="absolute left-full top-[318px] ml-1 hidden w-28 text-left lg:block">
              <svg viewBox="0 0 56 40" className="h-10 w-14 text-gray-400">
                <path
                  d="M52 36C44 16 24 6 4 10M11.5 12.5L4 10l6-5.3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <p className="ml-5 -rotate-3 font-hand text-[22px] leading-6 text-gray-600">
                you, 3 a.m.,
                <br />
                thriving
              </p>
            </div>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-5xl scroll-mt-8 px-6 pt-28 sm:pt-36">
          <p className="font-geist-mono text-xs uppercase tracking-widest text-orange-600">How it works</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
            Four steps. <span className="text-gray-400">Zero spreadsheets.</span>
          </h2>

          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, body, visual }, i) => (
              <div key={title} className="flex flex-col bg-white p-6">
                <div className="flex items-center justify-between text-gray-400">
                  <span className="font-geist-mono text-xs">0{i + 1}</span>
                  <Icon className="size-4" />
                </div>
                <h3 className="mt-5 font-medium">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{body}</p>
                <div className="mt-auto pt-6">{visual}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 pt-28 text-center sm:pt-36">
          <CampScene />
          <h2 className="mt-6 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">See you in the tent.</h2>
          <p className="mt-3 text-gray-600">Your group chat will thank you.</p>
          <a href={APP_URL} className={`${primaryButton} mt-8 h-11 px-5`}>
            Start a group
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </section>
      </main>

      <footer className="mx-auto mt-24 max-w-5xl border-t border-gray-100 px-6 py-8 sm:mt-28">
        <div className="flex flex-col items-center justify-center gap-x-3 gap-y-1 text-sm text-gray-500 sm:flex-row">
          <span>
            Made with <Heart className="inline size-3.5 -translate-y-px fill-rose-500 text-rose-500" aria-label="love" /> by{' '}
            <span className="text-gray-900">Siddharth Kini</span>
          </span>
          <span aria-hidden="true" className="hidden text-gray-300 sm:inline">
            ·
          </span>
          <span>Inspired by tenting at K-Ville</span>
        </div>
      </footer>
    </div>
  );
}
