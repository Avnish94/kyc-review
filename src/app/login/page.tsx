import { getOidcConfig, isMockLoginEnabled } from "@/lib/auth/oidc";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

const DEMO_ACCOUNTS = [
  { role: "Analyst", email: "analyst@demo.local", password: "analyst123", note: "Works assigned cases; decides low/medium risk" },
  { role: "Analyst", email: "analyst2@demo.local", password: "analyst123", note: "Second analyst, for assignment demos" },
  { role: "Admin", email: "admin@demo.local", password: "admin123", note: "Approves high-risk cases, edits rules, exports" },
  { role: "Admin", email: "admin2@demo.local", password: "admin123", note: "Second Admin, for four-eyes approval demos" },
];

const ERRORS: Record<string, string> = {
  sso_failed: "Microsoft sign-in failed. Please try again.",
  sso_disabled: "Microsoft sign-in is not configured.",
  no_role: "Your Microsoft account has no KYC Review role. Ask an administrator to assign KYC.Analyst or KYC.Admin.",
  inactive: "Your account has been deactivated.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const ssoEnabled = getOidcConfig() !== null;
  const mockEnabled = isMockLoginEnabled();

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

        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {error && ERRORS[error] && (
            <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{ERRORS[error]}</p>
          )}
          {ssoEnabled && (
            <a
              href="/auth/entra/start"
              className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
            >
              <svg viewBox="0 0 21 21" className="h-4 w-4" aria-hidden>
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              Sign in with Microsoft
            </a>
          )}
          {ssoEnabled && mockEnabled && (
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <div className="h-px flex-1 bg-slate-200" /> or use a demo account <div className="h-px flex-1 bg-slate-200" />
            </div>
          )}
          {mockEnabled && <LoginForm />}
        </div>

        {mockEnabled && (
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
              Prototype only: password login is mock authentication, not production-grade security. All data is synthetic.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
