import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";

async function markAllRead() {
  "use server";
  const user = await requireUser();
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        {unread > 0 && (
          <form action={markAllRead}>
            <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
              Mark all as read
            </button>
          </form>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {notifications.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-slate-500">You have no notifications.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {notifications.map((n) => (
              <li key={n.id} className={`px-4 py-3 ${n.readAt ? "" : "bg-indigo-50/50"}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium">
                      {!n.readAt && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-indigo-600" aria-label="Unread" />}
                      {n.caseId ? (
                        <Link href={`/cases/${n.caseId}`} className="hover:text-indigo-600">{n.title}</Link>
                      ) : (
                        n.title
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-slate-600">{n.body}</p>
                  </div>
                  <time className="shrink-0 text-xs text-slate-500">{formatDateTime(n.createdAt)}</time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
