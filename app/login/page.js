import { LoginForm } from "../../components/access/login-form.js";

export const metadata = {
  title: "Private access · ProjectDeck",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12 text-foreground sm:px-8">
      <section className="w-full max-w-[420px] rounded-2xl border border-line bg-surface p-7 shadow-[var(--card-shadow)] sm:p-9">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-background font-mono text-xs font-bold text-muted">
          PD
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-[-0.025em]">
          ProjectDeck
        </h1>
        <p className="mt-2 text-sm leading-6 text-subtle">
          This developer command center is private. Enter its access password
          to continue.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
