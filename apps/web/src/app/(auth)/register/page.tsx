'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import type { z } from 'zod';
import { api } from '@/lib/api';
import { registerSchema } from '@/lib/schemas';
import { useAuth } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import type { TokenResponse } from '@shared/types/api';

type F = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const setSession = useAuth((s) => s.setSession);
  const { register, handleSubmit, formState } = useForm<F>({ resolver: zodResolver(registerSchema) });
  const m = useMutation({
    mutationFn: (v: F) =>
      api<TokenResponse>('/auth/register', { method: 'POST', auth: false, body: { full_name: v.full_name, email: v.email, password: v.password } }),
    onSuccess: (t) => {
      setSession(t);
      router.replace('/dashboard');
    },
  });
  const e = formState.errors;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
      <h2 className="text-2xl font-semibold tracking-tight">Create an account</h2>
      <p className="mt-1 text-[13px] text-muted">Stored in your local database only.</p>
      <form onSubmit={handleSubmit((v) => m.mutate(v))} className="mt-8 space-y-4" noValidate>
        <Field label="Full name" htmlFor="full_name" error={e.full_name?.message}>
          <Input id="full_name" autoComplete="name" {...register('full_name')} />
        </Field>
        <Field label="Email" htmlFor="email" error={e.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={e.password?.message} hint="8+ characters with a letter and a number">
          <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
        </Field>
        <Field label="Confirm password" htmlFor="confirm" error={e.confirm?.message}>
          <Input id="confirm" type="password" autoComplete="new-password" {...register('confirm')} />
        </Field>
        {m.error && (
          <p role="alert" className="rounded-ctl bg-down/10 px-3 py-2 text-xs text-down">
            {m.error.message}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={m.isPending}>
          Create account
        </Button>
      </form>
      <p className="mt-4 text-xs text-muted">
        Already registered?{' '}
        <Link href="/login" className="text-ink hover:underline">
          Log in
        </Link>
      </p>
    </motion.div>
  );
}
