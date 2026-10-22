'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert, Button, Card, Field, Input } from '@/components/ui';
import { errorText, post } from '@/lib/api';

const schema = z.object({ fullName: z.string().trim().min(2, 'Enter your name'), password: z.string().min(10, 'Use at least 10 characters').max(128) });
type Form = z.infer<typeof schema>;

function AcceptForm() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = React.useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit(v: Form) {
    setError('');
    try { await post('/auth/accept-invite', { token, ...v }); await qc.invalidateQueries(); router.push('/dashboard'); }
    catch (e) { setError(errorText(e)); }
  }
  if (!token) return <Card className="p-6"><Alert>This invitation link is missing its token. Ask your manager to send it again.</Alert></Card>;
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Join your team</h1>
      <p className="mb-5 mt-1 text-sm text-muted-foreground">Choose a password to finish setting up your account.</p>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Your name" htmlFor="fullName" error={errors.fullName?.message}><Input id="fullName" autoComplete="name" {...register('fullName')} /></Field>
        <Field label="Password" htmlFor="password" hint="At least 10 characters" error={errors.password?.message}><Input id="password" type="password" autoComplete="new-password" {...register('password')} /></Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>Accept invitation</Button>
      </form>
    </Card>
  );
}

export default function AcceptInvitePage() {
  return <React.Suspense fallback={null}><AcceptForm /></React.Suspense>;
}
