import Mountains from '../ui/Mountains';

export default function AuthShell({ title, intro, children, aside }) {
  return (
    <div className="wrap grid gap-10 pt-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-16 md:pt-16">
      <div className="panel max-w-lg p-6 sm:p-9">
        <h1 className="font-display text-display-md">{title}</h1>
        {intro ? <p className="mt-2 text-graphite">{intro}</p> : null}
        <div className="mt-7">{children}</div>
      </div>
      <aside className="relative hidden min-h-[460px] overflow-hidden rounded-3xl bg-night p-10 text-white shadow-lift md:flex md:flex-col md:justify-end">
        <div className="dusk absolute inset-0" aria-hidden="true" />
        <Mountains className="absolute inset-x-0 bottom-0 h-1/2 w-full" />
        <div className="relative">{aside}</div>
      </aside>
    </div>
  );
}
