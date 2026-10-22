'use client';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Alert, Button, Card, Field, Input, PageHeader } from '@/components/ui';
import { ApiError, errorText, post } from '@/lib/api';

interface Form { fullName: string; mobile: string; email: string; city: string; postalCode: string; addressLine1: string; tags: string; notes: string; marketingConsent: boolean }
interface Candidate { id: string; customerNumber: string; fullName: string; mobile: string | null; email: string | null; city: string | null; matchedOn: string[] }

export default function NewCustomerPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = React.useState('');
  const [dups, setDups] = React.useState<Candidate[] | null>(null);
  const { register, handleSubmit, getValues, formState: { errors, isSubmitting } } = useForm<Form>();

  const body = (v: Form) => ({
    fullName: v.fullName, mobile: v.mobile || undefined, email: v.email || undefined, city: v.city || undefined, postalCode: v.postalCode || undefined,
    addressLine1: v.addressLine1 || undefined, notes: v.notes || undefined, marketingConsent: !!v.marketingConsent,
    tags: v.tags.split(',').map((t) => t.trim()).filter(Boolean),
  });

  async function submit(v: Form, force = false) {
    setError('');
    try {
      const c = await post<{ id: string }>(`/customers${force ? '?force=true' : ''}`, body(v));
      await qc.invalidateQueries({ queryKey: ['customers'] });
      router.push(`/customers/${c.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'DUPLICATE_CUSTOMER') {
        setDups((e.details as { candidates?: Candidate[] } | undefined)?.candidates ?? []);
      } else setError(errorText(e));
    }
  }

  return (
    <>
      <PageHeader title="New customer" description="Just the name is required. Add a mobile number so you can find them quickly." />
      <form onSubmit={handleSubmit((v) => submit(v))} className="space-y-5" noValidate>
        {error && <Alert>{error}</Alert>}
        {dups && (
          <Alert tone="warning">
            <p className="font-semibold">This might be someone you already have</p>
            <ul className="mt-2 space-y-2">
              {dups.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-card p-2 text-foreground">
                  <span className="text-sm"><strong>{d.fullName}</strong> ({d.customerNumber}) · same {d.matchedOn.join(' and ')}<br /><span className="text-muted-foreground">{[d.mobile, d.email, d.city].filter(Boolean).join(' · ')}</span></span>
                  <Link href={`/customers/${d.id}`} className="inline-flex min-h-11 items-center rounded-md border border-input px-3 text-sm font-medium">Open this customer</Link>
                </li>
              ))}
            </ul>
            <Button type="button" variant="secondary" className="mt-3" loading={isSubmitting} onClick={() => submit(getValues(), true)}>No, create a new customer anyway</Button>
          </Alert>
        )}
        <Card className="space-y-4 p-5">
          <Field label="Full name" htmlFor="fullName" error={errors.fullName && 'Enter the customer’s name'}><Input id="fullName" autoComplete="off" autoFocus {...register('fullName', { required: true, minLength: 1 })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mobile number" htmlFor="mobile" hint="With or without country code"><Input id="mobile" type="tel" inputMode="tel" {...register('mobile')} /></Field>
            <Field label="Email" htmlFor="email"><Input id="email" type="email" inputMode="email" {...register('email')} /></Field>
            <Field label="City" htmlFor="city"><Input id="city" {...register('city')} /></Field>
            <Field label="Postal code" htmlFor="postal"><Input id="postal" {...register('postalCode')} /></Field>
          </div>
          <Field label="Address" htmlFor="addr"><Input id="addr" {...register('addressLine1')} /></Field>
          <Field label="Tags" htmlFor="tags" hint="Separate with commas, e.g. VIP, Wedding"><Input id="tags" {...register('tags')} /></Field>
          <Field label="Notes" htmlFor="notes"><textarea id="notes" rows={3} className="w-full rounded-md border border-input bg-card px-3 py-2 text-base sm:text-sm" {...register('notes')} /></Field>
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" {...register('marketingConsent')} />Customer agreed to receive offers and greetings</label>
        </Card>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link href="/customers" className="inline-flex min-h-11 items-center justify-center rounded-md border border-input px-4 text-sm font-medium">Cancel</Link>
          <Button type="submit" loading={isSubmitting}>Save customer</Button>
        </div>
      </form>
    </>
  );
}
