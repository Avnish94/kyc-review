import Link from "next/link";

export default function CaseNotFound() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-10 text-center shadow-sm">
      <h1 className="text-lg font-semibold">Case not found</h1>
      <p className="mt-1 text-sm text-slate-500">It may have been removed, or the link is incorrect.</p>
      <Link href="/cases" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">Back to queue</Link>
    </div>
  );
}
