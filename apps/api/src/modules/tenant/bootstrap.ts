import { ORDER_STATUSES, PROTECTED_STATUSES, toCanonicalMm } from '@measuremate/validation';
import { Tx } from '../../common/prisma.service';
import { SYSTEM_TEMPLATES } from '../measurements/system-templates';

export const NOTIFICATION_KEYS: Record<string, { subject: string; body: string; purpose: string }> = {
  APPOINTMENT_CONFIRMATION: {
    subject: 'Your appointment is confirmed', purpose: 'TRANSACTIONAL',
    body: 'Hello {{customerName}}, your {{appointmentType}} at {{businessName}} is confirmed for {{when}}.',
  },
  TRIAL_REMINDER: {
    subject: 'Trial reminder', purpose: 'TRANSACTIONAL',
    body: 'Hello {{customerName}}, a reminder: your trial for order {{orderNumber}} is scheduled for {{when}} at {{businessName}}.',
  },
  DELIVERY_REMINDER: {
    subject: 'Delivery reminder', purpose: 'TRANSACTIONAL',
    body: 'Hello {{customerName}}, order {{orderNumber}} is due for delivery on {{when}}.',
  },
  ORDER_READY: {
    subject: 'Your order is ready', purpose: 'TRANSACTIONAL',
    body: 'Good news {{customerName}}! Order {{orderNumber}} is ready for pickup at {{businessName}}.',
  },
  PAYMENT_REMINDER: {
    subject: 'Payment reminder', purpose: 'TRANSACTIONAL',
    body: 'Hello {{customerName}}, a balance of {{amount}} is outstanding on order {{orderNumber}}.',
  },
  INVOICE_SENT: {
    subject: 'Invoice {{invoiceNumber}}', purpose: 'TRANSACTIONAL',
    body: 'Hello {{customerName}}, please find invoice {{invoiceNumber}} for {{amount}} from {{businessName}}.',
  },
  GREETING: {
    subject: 'Warm wishes from {{businessName}}', purpose: 'GREETINGS',
    body: 'Warm wishes {{customerName}} from everyone at {{businessName}}!',
  },
};

// Illustrative default prices (assumption); tenants edit them in Settings > Pricing.
const DEFAULT_PRICES: Record<string, string> = {
  Shirt: '800.00', Trousers: '900.00', Jacket: '4500.00', Kurta: '1200.00', Sherwani: '8000.00', Blouse: '700.00',
  Salwar: '600.00', Churidar: '600.00', Gown: '5000.00', Dress: '2500.00', Skirt: '900.00', Uniform: '700.00',
  Alteration: '150.00', Custom: '1000.00',
};

export async function bootstrapTenant(tx: Tx, tenantId: string, createdBy: string) {
  await tx.productionStage.createMany({
    data: ORDER_STATUSES.map((key, i) => ({
      tenantId, key, sortOrder: i, isSystem: PROTECTED_STATUSES.includes(key),
      label: key.toLowerCase().split('_').map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' '),
    })),
  });

  for (const [key, t] of Object.entries(NOTIFICATION_KEYS)) {
    await tx.notificationTemplate.createMany({
      data: (['EMAIL', 'SMS', 'WHATSAPP', 'IN_APP'] as const).map((channel) => ({
        tenantId, key, channel, subject: channel === 'EMAIL' || channel === 'IN_APP' ? t.subject : null, body: t.body, purpose: t.purpose,
      })),
    });
  }

  for (const tpl of SYSTEM_TEMPLATES) {
    const created = await tx.measurementTemplate.create({
      data: { tenantId, name: tpl.name, category: tpl.category, isSystem: true },
    });
    let sectionOrder = 0;
    for (const s of tpl.sections) {
      const section = await tx.measurementTemplateSection.create({
        data: { tenantId, templateId: created.id, name: s.name, sortOrder: sectionOrder++ },
      });
      await tx.measurementTemplateField.createMany({
        data: s.fields.map(([key, label, min, max, required, help], i) => ({
          tenantId, sectionId: section.id, key, label, helpText: help ?? null, required: !!required,
          minWarnMm: toCanonicalMm(min, 'cm'), maxWarnMm: toCanonicalMm(max, 'cm'), sortOrder: i,
        })),
      });
    }
  }

  const list = await tx.priceList.create({ data: { tenantId, name: 'Standard prices', isDefault: true } });
  const categories = [...new Set(SYSTEM_TEMPLATES.map((t) => t.category))];
  await tx.priceListItem.createMany({
    data: categories.map((garmentType) => ({
      tenantId, priceListId: list.id, garmentType, kind: garmentType === 'Alteration' ? 'ALTERATION' : 'STITCHING',
      price: DEFAULT_PRICES[garmentType] ?? '1000.00',
    })),
  });
  void createdBy;
}
