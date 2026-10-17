export function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        {eyebrow && (
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-teal-700">
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl font-bold tracking-[-0.04em] text-slate-950 sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Panel({ children, className = "" }) {
  return (
    <section className={`rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_36px_-26px_rgba(22,50,37,0.28)] sm:p-6 ${className}`}>
      {children}
    </section>
  );
}

export function Field({ label, id, className = "", ...props }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-800">
        {label}
      </label>
      <input id={id} className="auth-input" {...props} />
    </div>
  );
}

export function TextAreaField({ label, id, className = "", ...props }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-800">
        {label}
      </label>
      <textarea id={id} className="auth-input min-h-28 resize-y" {...props} />
    </div>
  );
}

export function SelectField({ label, id, className = "", children, ...props }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-800">
        {label}
      </label>
      <select id={id} className="auth-input" {...props}>
        {children}
      </select>
    </div>
  );
}

export function PrimaryButton({ children, className = "", ...props }) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center rounded-xl bg-teal-800 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_16px_-8px_rgba(20,84,67,0.7)] transition hover:-translate-y-0.5 hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, className = "", ...props }) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Notice({ children, tone = "error" }) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "info"
        ? "border-sky-200 bg-sky-50 text-sky-900"
        : "border-red-200 bg-red-50 text-red-900";

  return (
    <p role="status" className={`rounded-xl border px-4 py-3 text-sm leading-6 ${toneClass}`}>
      {children}
    </p>
  );
}

export function LoadingState({ label = "Loading your community…" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
      {label}
    </div>
  );
}

export function EmptyState({ title, description, children }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-5 py-9 text-center">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{description}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export function formatDate(date) {
  if (!date) return "Just now";
  const value = typeof date.toDate === "function" ? date.toDate() : new Date(date);
  if (Number.isNaN(value.getTime())) return "Just now";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(value);
}
