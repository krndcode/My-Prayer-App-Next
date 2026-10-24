import Link from "next/link";

const FEATURES = [
  {
    number: "01",
    title: "Find your prayer people",
    description: "Create or join a group where encouragement and honest prayer belong."
  },
  {
    number: "02",
    title: "Make room for connection",
    description: "Plan a time to gather, or call a group member when you need a listening ear."
  },
  {
    number: "03",
    title: "Carry hope with you",
    description: "Share prayer requests and testimonies with the community you choose."
  }
];

export default function HomePage() {
  return (
    <main className="min-h-dvh overflow-x-clip bg-[#f5f7f3] text-slate-900">
      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between gap-2 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 sm:py-5 lg:px-12">
        <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="My Prayer Line home">
          <span className="brand-mark grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-sm font-bold text-white">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M5 8.5h14M5 15.5h14" />
            </svg>
          </span>
          {/* Brand text is hidden on very narrow phones (under 360px) so the buttons always fit */}
          <span className="hidden truncate whitespace-nowrap text-sm font-bold tracking-tight text-teal-950 min-[360px]:block sm:text-base">
            My Prayer Line
          </span>
        </Link>
        <nav aria-label="Main" className="flex shrink-0 items-center gap-1 sm:gap-6">
          <Link href="/login" className="inline-flex min-h-11 items-center whitespace-nowrap px-3 text-sm font-semibold text-slate-700 transition hover:text-teal-800">
            Sign in
          </Link>
          <Link href="/register" className="inline-flex min-h-11 items-center whitespace-nowrap rounded-xl bg-teal-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-teal-900 sm:min-h-10 sm:px-5">
            <span className="sm:hidden">Join</span>
            <span className="hidden sm:inline">Join the community</span>
          </Link>
        </nav>
      </header>

      <section className="relative mx-auto grid w-full max-w-7xl items-center gap-12 px-4 pb-20 pt-8 sm:gap-14 sm:px-8 sm:pb-28 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:px-12 lg:pb-32 lg:pt-20">
        <div className="pointer-events-none absolute -left-48 top-8 h-96 w-96 rounded-full bg-emerald-100/60 blur-3xl" />
        <div className="relative z-[1] min-w-0 max-w-2xl">
          <p className="inline-flex max-w-full items-center gap-2 rounded-full border border-teal-200/80 bg-white/70 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-teal-800 shadow-sm sm:px-3.5 sm:text-xs sm:tracking-[0.13em]">
            <span className="h-2 w-2 shrink-0 rounded-full bg-teal-500" />
            A place to connect in prayer
          </p>
          <h1 className="mt-6 text-[clamp(2.1rem,10.5vw,3rem)] font-bold leading-[1.06] tracking-[-0.05em] text-slate-950 sm:mt-7 sm:text-6xl sm:leading-[1.04] sm:tracking-[-0.055em] lg:text-[4.6rem]">
            Find community
            <span className="block text-teal-700">in every prayer.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:mt-6 sm:text-lg sm:leading-8">
            Faith was never meant to be carried alone. Gather with people who listen, encourage, and pray alongside you.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:mt-9 sm:flex-row sm:items-center sm:gap-4">
            <Link href="/register" className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-teal-800 px-6 py-3 text-sm font-bold text-white shadow-[0_12px_24px_-12px_rgba(20,84,67,0.6)] transition hover:-translate-y-0.5 hover:bg-teal-900 sm:w-auto">
              Create your account <span aria-hidden="true" className="ml-2">→</span>
            </Link>
            <span className="text-center text-sm text-slate-500 sm:text-left">A gentle space to grow together.</span>
          </div>
          <div className="mt-8 flex items-center gap-3 text-sm text-slate-600 sm:mt-10">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal-100 text-teal-800" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21v-8" />
                <path d="M12 13c-4.4 0-7-2.5-7-6 4.5 0 7 2.2 7 6Z" />
                <path d="M12 11c0-4 2.8-6.5 7-6.5 0 3.7-2.5 6.5-7 6.5Z" />
              </svg>
            </span>
            <span>A welcoming space for every season of faith.</span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[510px] lg:ml-auto">
          <div className="absolute -right-5 -top-6 h-32 w-32 rounded-full bg-amber-100/80 blur-2xl sm:-right-10" />
          <div className="absolute -bottom-8 -left-8 h-40 w-40 rounded-full bg-teal-200/50 blur-3xl" />
          <div className="relative rounded-[2rem] border border-white/80 bg-white/75 p-3 shadow-[0_35px_90px_-38px_rgba(24,62,45,0.35)] backdrop-blur-xl sm:p-5">
            <div className="rounded-[1.5rem] bg-[#f6f8f4] p-4 sm:p-7">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-700 sm:text-xs sm:tracking-[0.16em]">A moment together</p>
                  <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">Today&apos;s encouragement</h2>
                </div>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-teal-100 text-xl text-teal-800" aria-hidden="true">✦</span>
              </div>
              <div className="mt-5 rounded-2xl bg-white p-4 shadow-[0_10px_30px_-22px_rgba(22,50,37,0.35)] sm:mt-6 sm:p-5">
                <p className="text-sm leading-7 text-slate-700">
                  “Let us consider how we may spur one another on toward love and good deeds.”
                </p>
                <p className="mt-3 text-xs font-bold uppercase tracking-[0.13em] text-teal-700">Hebrews 10:24</p>
              </div>
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-teal-100 bg-[#eaf4ed] p-3 sm:p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-lg text-teal-800 shadow-sm" aria-hidden="true">♡</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">You&apos;re not praying alone</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-600">A community that makes space for you.</p>
                </div>
                <span className="ml-auto shrink-0 text-lg text-teal-700" aria-hidden="true">↗</span>
              </div>
              <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-200/80 pt-4">
                <span className="min-w-0 text-xs font-medium text-slate-500">A little encouragement, whenever you need it.</span>
                <span className="flex shrink-0 gap-1" aria-hidden="true">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-700" />
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-200" />
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-200" />
                </span>
              </div>
            </div>
          </div>
          {/* Floating badge: sits below the card's bottom-left corner so it never covers card text */}
          <div className="absolute -bottom-10 -left-3 hidden rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-lg backdrop-blur sm:block lg:-left-6">
            <p className="text-xs font-semibold text-slate-900">A thoughtful place to belong</p>
            <p className="mt-1 text-[11px] text-slate-500">Gather · Pray · Encourage</p>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200/70 bg-white/65">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-8 sm:py-20 lg:px-12">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Grow together</p>
            <h2 className="mt-3 text-[1.75rem] font-bold leading-tight tracking-[-0.04em] text-slate-950 sm:text-4xl">
              Small moments. Deeper connection.
            </h2>
            <p className="mt-3 text-base leading-7 text-slate-600">
              A few simple ways to bring more intention and care to your prayer life.
            </p>
          </div>
          <div className="mt-8 grid gap-4 sm:mt-9 md:grid-cols-3">
            {FEATURES.map((feature) => (
              <article key={feature.number} className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_36px_-28px_rgba(22,50,37,0.32)] transition hover:-translate-y-1 hover:shadow-[0_22px_45px_-28px_rgba(22,50,37,0.32)] sm:p-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-xs font-bold tracking-wide text-teal-800">{feature.number}</span>
                <h3 className="mt-5 text-lg font-bold tracking-tight text-slate-950">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto flex max-w-7xl flex-col items-stretch justify-between gap-7 px-4 py-14 sm:px-8 sm:py-20 md:flex-row md:items-center lg:px-12">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">There is room for you</p>
          <h2 className="mt-3 text-[1.75rem] font-bold leading-tight tracking-[-0.04em] text-slate-950 sm:text-4xl">Begin with a simple hello.</h2>
          <p className="mt-3 text-base leading-7 text-slate-600">Join a community built around care, encouragement, and showing up for one another.</p>
        </div>
        <Link href="/register" className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-teal-800 px-6 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-teal-900 md:w-auto">
          Join My Prayer Line <span aria-hidden="true" className="ml-2">→</span>
        </Link>
      </section>

      <footer className="border-t border-slate-200/80 bg-white/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-8 lg:px-12">
          <span className="font-semibold text-slate-700">My Prayer Line</span>
          <span>A thoughtful place to pray together.</span>
        </div>
      </footer>
    </main>
  );
}