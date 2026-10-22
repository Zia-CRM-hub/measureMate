'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useToast } from '@/components/toast';
import { Alert, Button, Card, Field, Input, PageHeader, Select, Skeleton } from '@/components/ui';
import { api, errorText, patch } from '@/lib/api';

interface Settings {
  legalName: string | null; addressLine1: string | null; city: string | null; country: string; currency: string; timeZone: string;
  taxLabel: string; taxId: string | null; taxInclusive: boolean; defaultTaxPercent: string; measurementUnit: 'cm' | 'in';
  invoicePrefix: string; orderPrefix: string; customerPrefix: string; brandColor: string; retentionDays: number;
  portalShowMeasurements: boolean; portalQuoteApproval: boolean;
}

export default function BusinessSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/tenant/settings') });
  const { register, handleSubmit, reset, formState: { isDirty } } = useForm<Settings>();
  React.useEffect(() => { if (data) reset(data); }, [data, reset]);

  const save = useMutation({
    mutationFn: (v: Settings) => patch<Settings>('/tenant/settings', {
      legalName: v.legalName || undefined, addressLine1: v.addressLine1 || undefined, city: v.city || undefined,
      country: v.country, currency: v.currency, timeZone: v.timeZone, taxLabel: v.taxLabel, taxId: v.taxId || undefined,
      taxInclusive: !!v.taxInclusive, defaultTaxPercent: String(v.defaultTaxPercent), measurementUnit: v.measurementUnit,
      invoicePrefix: v.invoicePrefix, orderPrefix: v.orderPrefix, customerPrefix: v.customerPrefix, brandColor: v.brandColor,
      portalShowMeasurements: !!v.portalShowMeasurements, portalQuoteApproval: !!v.portalQuoteApproval,
    }),
    onSuccess: () => { toast('Settings saved'); void qc.invalidateQueries({ queryKey: ['settings'] }); void qc.invalidateQueries({ queryKey: ['me'] }); },
    onError: (e) => toast(errorText(e), 'danger'),
  });

  if (isLoading || !data) return <Skeleton className="h-96" />;
  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-6">
      <PageHeader title="Business" description="Details that appear on invoices, receipts and the customer portal."
        actions={<Button type="submit" loading={save.isPending} disabled={!isDirty}>Save changes</Button>} />
      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">Business profile</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Legal name" htmlFor="legalName"><Input id="legalName" {...register('legalName')} /></Field>
          <Field label="Brand colour" htmlFor="brandColor"><Input id="brandColor" type="color" className="p-1" {...register('brandColor')} /></Field>
          <Field label="Address" htmlFor="addr"><Input id="addr" {...register('addressLine1')} /></Field>
          <Field label="City" htmlFor="city"><Input id="city" {...register('city')} /></Field>
        </div>
      </Card>
      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">Currency, tax and units</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Country (2-letter code)" htmlFor="country"><Input id="country" maxLength={2} {...register('country')} /></Field>
          <Field label="Currency (3-letter code)" htmlFor="currency"><Input id="currency" maxLength={3} {...register('currency')} /></Field>
          <Field label="Time zone" htmlFor="tz"><Input id="tz" {...register('timeZone')} /></Field>
          <Field label="Measurement unit" htmlFor="unit"><Select id="unit" {...register('measurementUnit')}><option value="in">Inches</option><option value="cm">Centimetres</option></Select></Field>
          <Field label="Tax name" htmlFor="taxLabel" hint="For example GST, VAT or Sales tax"><Input id="taxLabel" {...register('taxLabel')} /></Field>
          <Field label="Default tax rate (%)" htmlFor="taxPct"><Input id="taxPct" inputMode="decimal" {...register('defaultTaxPercent')} /></Field>
          <Field label="Tax registration number" htmlFor="taxId"><Input id="taxId" {...register('taxId')} /></Field>
          <label className="flex min-h-11 items-center gap-3 self-end text-sm"><input type="checkbox" className="h-5 w-5" {...register('taxInclusive')} />Prices already include tax</label>
        </div>
      </Card>
      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">Numbering</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Customer prefix" htmlFor="cp"><Input id="cp" {...register('customerPrefix')} /></Field>
          <Field label="Order prefix" htmlFor="op"><Input id="op" {...register('orderPrefix')} /></Field>
          <Field label="Invoice prefix" htmlFor="ip"><Input id="ip" {...register('invoicePrefix')} /></Field>
        </div>
      </Card>
      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">Customer portal</h2>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" {...register('portalShowMeasurements')} />Let customers view their own measurements</label>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" {...register('portalQuoteApproval')} />Let customers approve quotations online</label>
        {save.isError && <Alert>{errorText(save.error)}</Alert>}
      </Card>
    </form>
  );
}
