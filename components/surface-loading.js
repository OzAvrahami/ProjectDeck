export function SurfaceLoading({ title, message }) {
  return (
    <section
      className="mx-auto max-w-[1160px] px-5 py-10 sm:px-8 sm:py-12"
      aria-busy="true"
      aria-live="polite"
    >
      <h1 className="text-[28px] font-semibold tracking-[-0.025em]">
        {title}
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-subtle">
        {message}
      </p>
      <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-[18px]" aria-hidden="true">
        {[0, 1, 2].map((item) => (
          <div className="h-44 animate-pulse rounded-2xl border border-line bg-surface" key={item} />
        ))}
      </div>
    </section>
  );
}
