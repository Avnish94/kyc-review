"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/lib/auth/actions";

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">Email</label>
        <input
          id="email" name="email" type="email" autoComplete="username" required
          defaultValue={state.email} className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700">Password</label>
        <input
          id="password" name="password" type="password" autoComplete="current-password" required
          className={inputClass}
        />
      </div>
      {state.error && (
        <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>
      )}
      <button
        type="submit" disabled={pending}
        className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
