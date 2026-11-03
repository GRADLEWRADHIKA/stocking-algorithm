'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { z } from 'zod';
import { api } from '@/lib/api';
import { resetConfirmSchema } from '@/lib/schemas';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';

const reqSchema = z.object({ email: z.string().trim().email('Enter a valid email address') });

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<'request' | 'confirm' | 'done'>('request');
  const [devToken, setDevToken] = useState<string | null>(null);
  const reqForm = useForm<z.infer<typeof reqSchema>>({ resolver: zodResolver(reqSchema) });
  const confForm = useForm<z.infer<typeof resetConfirmSchema>>({ resolver: zodResolver(resetConfirmSchema) });

  const request = useMutation({
    mutationFn: (v: { email: string }) => api<{ message: string; dev_reset_token?: string }>('/auth/password-reset/request', { method: 'POST', auth: false, body: v }),
    onSuccess: (r) => {
      setDevToken(r.dev_reset_token ?? null);
      if (r.dev_reset_token) confForm.setValue('token', r.dev_reset_token);
      setStep('confirm');
    },
  });
  const confirm = useMutation({
    mutationFn: (v: { token: string; new_password: string }) => api('/auth/password-reset/confirm', { method: 'POST', auth: false, body: v }),
    onSuccess: () => setStep('done'),
  });

  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight">Reset password</h2>
      <AnimatePresence mode="wait">
        {step === 'request' && (
          <motion.form
            key="r"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            onSubmit={reqForm.handleSubmit((v) => request.mutate(v))}
            className="mt-6 space-y-4"
            noValidate
          >
            <p className="text-[13px] text-muted">There is no email server in local development. In development mode the reset token is shown here instead.</p>
            <Field label="Email" htmlFor="email" error={reqForm.formState.errors.email?.message}>
              <Input id="email" type="email" {...reqForm.register('email')} />
            </Field>
            {request.error && <p className="text-xs text-down">{request.error.message}</p>}
            <Button type="submit" variant="primary" className="w-full" loading={request.isPending}>
              Request reset token
            </Button>
          </motion.form>
        )}
        {step === 'confirm' && (
          <motion.form
            key="c"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            onSubmit={confForm.handleSubmit((v) => confirm.mutate({ token: v.token, new_password: v.new_password }))}
            className="mt-6 space-y-4"
            noValidate
          >
            <p className="text-[13px] text-muted">
              {devToken ? 'Development token filled in below. It expires shortly.' : 'If the account exists, a reset token was issued. Paste it below.'}
            </p>
            <Field label="Reset token" htmlFor="token" error={confForm.formState.errors.token?.message}>
              <Input id="token" className="num text-xs" {...confForm.register('token')} />
            </Field>
            <Field label="New password" htmlFor="np" error={confForm.formState.errors.new_password?.message}>
              <Input id="np" type="password" autoComplete="new-password" {...confForm.register('new_password')} />
            </Field>
            <Field label="Confirm new password" htmlFor="cp" error={confForm.formState.errors.confirm?.message}>
              <Input id="cp" type="password" autoComplete="new-password" {...confForm.register('confirm')} />
            </Field>
            {confirm.error && <p className="text-xs text-down">{confirm.error.message}</p>}
            <Button type="submit" variant="primary" className="w-full" loading={confirm.isPending}>
              Set new password
            </Button>
          </motion.form>
        )}
        {step === 'done' && (
          <motion.div key="d" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-4">
            <p className="text-[13px] text-up">Password updated. Existing sessions were signed out.</p>
            <Button asChild variant="primary" className="w-full">
              <Link href="/login">Back to log in</Link>
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      <Link href="/login" className="mt-6 inline-block text-xs text-muted hover:text-ink">
        ← Back to log in
      </Link>
    </div>
  );
}
