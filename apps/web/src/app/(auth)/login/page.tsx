'use client';
import Link from 'next/link';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import type { z } from 'zod';
import { api } from '@/lib/api';
import { loginSchema } from '@/lib/schemas';
import { useAuth } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import type { TokenResponse } from '@shared/types/api';

type F = z.infer<typeof loginSchema>;

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setSession, accessToken, hydrated } = useAuth();
  const next = params.get('next') || '/dashboard';
  const { register, handleSubmit, setValue, formState } = useForm<F>({ resolver: zodResolver(loginSchema) });
  const login = useMutation({
    mutationFn: (v: F) => api<TokenResponse>('/auth/login', { method: 'POST', body: v, auth: false }),
    onSuccess: (t) => {
      setSession(t);
      router.replace(next.startsWith('/') ? next : '/dashboard');
    },
  });

  useEffect(() => {
    if (hydrated && accessToken) router.replace('/dashboard');
  }, [hydrated, accessToken, router]);

  const fillDemo = (admin = false) => {
    setValue('email', admin ? 'admin@quantdesk.local' : 'demo@quantdesk.local', { shouldValidate: true });
    setValue('password', admin ? 'Admin@12345' : 'Demo@12345', { shouldValidate: true });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
      <h2 className="text-2xl font-semibold tracking-tight">Log in</h2>
      <p className="mt-1 text-[13px] text-muted">Your paper portfolios, strategies and backtests.</p>
      <form onSubmit={handleSubmit((v) => login.mutate(v))} className="mt-8 space-y-4" noValidate>
        <Field label="Email" htmlFor="email" error={formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={formState.errors.password?.message}>
          <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
        </Field>
        {login.error && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} role="alert" className="rounded-ctl bg-down/10 px-3 py-2 text-xs text-down">
            {login.error.message}
          </motion.p>
        )}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={login.isPending}>
          Log in
        </Button>
      </form>
      <div className="mt-4 flex items-center justify-between text-xs">
        <Link href="/forgot-password" className="text-muted hover:text-ink">
          Forgot password?
        </Link>
        <Link href="/register" className="text-muted hover:text-ink">
          Create an account
        </Link>
      </div>
      <div className="mt-8 rounded-card border border-line p-4">
        <p className="text-xs text-muted">Local demo accounts are created by the seed script.</p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => fillDemo(false)} type="button">
            Use demo trader
          </Button>
          <Button size="sm" variant="ghost" onClick={() => fillDemo(true)} type="button">
            Use admin
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
