import { LoginForm } from "./LoginForm";

const DEMO_ACCOUNTS = [
  { role: "Analyst", email: "analyst@demo.local", password: "analyst123", note: "Decides low/medium risk cases" },
  { role: "Admin", email: "admin@demo.local", password: "admin123", note: "Can also decide high risk & reopen" },
];

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-lg font-bold text-white">
            K
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">KYC Review</h1>
          <p className="mt-1 text-sm text-slate-500">Internal compliance tool — proof of concept</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <LoginForm />
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Demo credentials (mock authentication)</p>
          <ul className="mt-2 space-y-1.5">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.email}>
                <span className="font-medium">{a.role}:</span>{" "}
                <code className="rounded bg-amber-100 px-1">{a.email}</code> /{" "}
                <code className="rounded bg-amber-100 px-1">{a.password}</code>
                <span className="block text-xs text-amber-800/80">{a.note}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-amber-800/80">
            Prototype only: this login is not production-grade security. All data is synthetic.
          </p>
        </div>
      </div>
    </main>
  );
}
