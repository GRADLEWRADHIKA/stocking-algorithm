'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAccounts, useCreateAccount } from '@/hooks/queries';
import { useUi } from '@/stores/ui';
import { Select, Field, Input } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import type { PaperAccount } from '@shared/types/api';

const schema = z.object({
  name: z.string().trim().min(2, 'Name it').max(60),
  initial_capital: z.coerce.number().min(10000, 'Minimum ₹10,000').max(1e10, 'Too large'),
});

export function useActiveAccount(): PaperAccount | undefined {
  const { data } = useAccounts();
  const id = useUi((s) => s.activeAccountId);
  return data?.find((a) => a.id === id) ?? data?.[0];
}

export function NewAccountButton() {
  const [open, setOpen] = useState(false);
  const create = useCreateAccount();
  const setActive = useUi((s) => s.setActiveAccount);
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { name: 'Swing book', initial_capital: 1000000 } });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> New account
      </Button>
      <DialogContent title="New paper account" description="Virtual capital for simulated trading. No real money is involved.">
        <form
          className="space-y-3"
          onSubmit={form.handleSubmit((v) =>
            create.mutate(v, {
              onSuccess: (a) => {
                setActive(a.id);
                setOpen(false);
                toast.success(`${a.name} created`);
              },
              onError: (e) => toast.error(e.message),
            }),
          )}
        >
          <Field label="Name" error={form.formState.errors.name?.message}>
            <Input {...form.register('name')} />
          </Field>
          <Field label="Virtual starting capital ₹" error={form.formState.errors.initial_capital?.message}>
            <Input type="number" className="num" {...form.register('initial_capital')} />
          </Field>
          <Button type="submit" variant="primary" className="w-full" loading={create.isPending}>
            Create account
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AccountSwitcher() {
  const { data } = useAccounts();
  const acc = useActiveAccount();
  const setActive = useUi((s) => s.setActiveAccount);
  if (!data?.length) return null;
  return (
    <Select value={acc?.id} onChange={(e) => setActive(Number(e.target.value))} className="h-8 w-auto text-xs" aria-label="Paper account">
      {data.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </Select>
  );
}
