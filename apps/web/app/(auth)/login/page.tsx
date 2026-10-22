'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert, Button, Card, Field, Input } from '@/components/ui';
import { errorText, post } from '@/lib/api';

const schema = z.object({ email: z.string().trim().email('Enter a valid email'), password: z.string().min(1, 'Enter your password') });
type Form = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = React.useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit(v: Form) {
    setError('');
    try {
      await post('/auth/login', v);
      await qc.invalidateQueries();
      router.push('/dashboard');
    } catch (e) { setError(errorText(e)); }
  }

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Welcome back</h1>
      <p className="mb-5 mt-1 text-sm text-muted-foreground">Sign in to your business.</p>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="username" inputMode="email" {...register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
        </Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>Sign in</Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted-foreground">New here? <Link href="/register" className="font-medium text-primary underline">Register your business</Link></p>
    </Card>
  );
}
