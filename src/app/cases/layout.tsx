import Link from "next/link";
import { logout } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/current-user";
import { ROLE_LABELS } from "@/lib/kyc/types";

export default async function CasesLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen">
      <div className="bg-amber-100 px-4 py-1 text-center text-xs text-amber-900">
        Prototype with mock authentication and synthetic data — not for production use.
      </div>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/cases" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-sm font-bold text-white">K</span>
            <span className="font-semibold">KYC Review</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-right">
              <div className="font-medium">{user.name}</div>
              <div className="text-xs text-slate-500">{user.email}</div>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                user.role === "ADMIN" ? "bg-violet-100 text-violet-800" : "bg-sky-100 text-sky-800"
              }`}
            >
              {ROLE_LABELS[user.role]}
            </span>
            <form action={logout}>
              <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
