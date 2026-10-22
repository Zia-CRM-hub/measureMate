'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert, Button, Card, Field, Input, Select } from '@/components/ui';
import { errorText, post } from '@/lib/api';

const COUNTRIES = [
  { code: 'IN', name: 'India', currency: 'INR', tz: 'Asia/Kolkata', unit: 'in' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', tz: 'Europe/London', unit: 'in' },
  { code: 'US', name: 'United States', currency: 'USD', tz: 'America/New_York', unit: 'in' },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED', tz: 'Asia/Dubai', unit: 'cm' },
  { code: 'PK', name: 'Pakistan', currency: 'PKR', tz: 'Asia/Karachi', unit: 'in' },
  { code: 'BD', name: 'Bangladesh', currency: 'BDT', tz: 'Asia/Dhaka', unit: 'in' },
  { code: 'NG', name: 'Nigeria', currency: 'NGN', tz: 'Africa/Lagos', unit: 'in' },
  { code: 'AU', name: 'Australia', currency: 'AUD', tz: 'Australia/Sydney', unit: 'cm' },
];

const schema = z.object({
  businessName: z.string().trim().min(2, 'Enter your business name'),
  ownerName: z.string().trim().min(2, 'Enter your name'),
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(10, 'Use at least 10 characters').max(128),
  country: z.string(),
  measurementUnit: z.enum(['cm', 'in']),
});
type Form = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = React.useState('');
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema), defaultValues: { country: 'IN', measurementUnit: 'in' },
  });

  async function onSubmit(v: Form) {
    setError('');
    const c = COUNTRIES.find((x) => x.code === v.country)!;
    try {
      await post('/auth/register', { ...v, currency: c.currency, timeZone: c.tz });
      await qc.invalidateQueries();
      router.push('/dashboard');
    } catch (e) { setError(errorText(e)); }
  }

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Set up your business</h1>
      <p className="mb-5 mt-1 text-sm text-muted-foreground">Free 14-day trial of the Professional plan. No card needed.</p>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Business name" htmlFor="businessName" error={errors.businessName?.message}><Input id="businessName" autoComplete="organization" {...register('businessName')} /></Field>
        <Field label="Your name" htmlFor="ownerName" error={errors.ownerName?.message}><Input id="ownerName" autoComplete="name" {...register('ownerName')} /></Field>
        <Field label="Email" htmlFor="email" error={errors.email?.message}><Input id="email" type="email" inputMode="email" autoComplete="username" {...register('email')} /></Field>
        <Field label="Password" htmlFor="password" hint="At least 10 characters" error={errors.password?.message}><Input id="password" type="password" autoComplete="new-password" {...register('password')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Country" htmlFor="country">
            <Select id="country" {...register('country', { onChange: (e) => setValue('measurementUnit', COUNTRIES.find((c) => c.code === e.target.value)?.unit as 'cm' | 'in') })}>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Measurements in" htmlFor="unit"><Select id="unit" {...register('measurementUnit')}><option value="in">Inches</option><option value="cm">Centimetres</option></Select></Field>
        </div>
        <Button type="submit" className="w-full" loading={isSubmitting}>Create my business</Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted-foreground">Already registered? <Link href="/login" className="font-medium text-primary underline">Sign in</Link></p>
    </Card>
  );
}
