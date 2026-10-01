import Link from "next/link";
import { NavLinks } from "@/components/NavLinks";
import { logout } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/kyc/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = await prisma.notification.count({ where: { userId: user.id, readAt: null } });

  const links = [
    { href: "/cases", label: "Queue" },
    { href: "/dashboard", label: "Dashboard" },
    ...(user.role === "ADMIN" ? [{ href: "/admin/rules", label: "Rules" }] : []),
  ];

  return (
    <div className="min-h-screen">
      <div className="bg-amber-100 px-4 py-1 text-center text-xs text-amber-900">
        Prototype with synthetic data — not for production use.
      </div>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/cases" className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-sm font-bold text-white">K</span>
              <span className="font-semibold">KYC Review</span>
            </Link>
            <NavLinks links={links} />
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/notifications"
              className="relative rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              aria-label={`Notifications (${unread} unread)`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
              </svg>
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
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
