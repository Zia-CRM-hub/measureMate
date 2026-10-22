'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fromCanonicalMm } from '@measuremate/validation';
import { ArrowDown, ArrowUp, Copy, Pencil, Plus, Ruler, Trash2 } from 'lucide-react';
import * as React from 'react';
import { useToast } from '@/components/toast';
import { Alert, Badge, Button, Card, Dialog, EmptyState, Field, Input, PageHeader, Skeleton } from '@/components/ui';
import { api, del, errorText, post } from '@/lib/api';
import { can, useMe } from '@/lib/me';
import type { Template } from '@/lib/types';

interface EField { key: string; label: string; helpText: string; required: boolean; minCm: string; maxCm: string }
interface ESection { name: string; fields: EField[] }
interface Editing { id?: string; name: string; category: string; sections: ESection[] }

const blankField = (): EField => ({ key: '', label: '', helpText: '', required: false, minCm: '', maxCm: '' });
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'm_$1').slice(0, 40);

function toEditing(t: Template): Editing {
  return {
    id: t.id, name: t.name, category: t.category,
    sections: t.sections.map((s) => ({
      name: s.name,
      fields: s.fields.map((f) => ({ key: f.key, label: f.label, helpText: f.helpText ?? '', required: f.required, minCm: f.minWarnMm ? fromCanonicalMm(f.minWarnMm, 'cm', 1) : '', maxCm: f.maxWarnMm ? fromCanonicalMm(f.maxWarnMm, 'cm', 1) : '' })),
    })),
  };
}

export default function TemplatesPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const list = useQuery({ queryKey: ['templates'], queryFn: () => api<Template[]>('/measurement-templates') });
  const canManage = can(me, 'measurement.template.manage');
  const clone = useMutation({
    mutationFn: (id: string) => post<Template>(`/measurement-templates/${id}/clone`, {}),
    onSuccess: (t) => { toast('Copy created. You can now edit it.'); void qc.invalidateQueries({ queryKey: ['templates'] }); setEditing(toEditing(t)); },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const archive = useMutation({
    mutationFn: (id: string) => del(`/measurement-templates/${id}`),
    onSuccess: () => { toast('Template archived'); void qc.invalidateQueries({ queryKey: ['templates'] }); },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const groups = React.useMemo(() => {
    const m = new Map<string, Template[]>();
    for (const t of list.data ?? []) m.set(t.category, [...(m.get(t.category) ?? []), t]);
    return [...m];
  }, [list.data]);

  return (
    <>
      <PageHeader title="Measurement templates" description="What you measure for each garment. Built-in templates can be copied and changed."
        actions={canManage ? <Button onClick={() => setEditing({ name: '', category: '', sections: [{ name: 'Measurements', fields: [blankField()] }] })}><Plus className="h-4 w-4" aria-hidden />New template</Button> : undefined} />
      {list.isLoading ? <Skeleton className="h-64" /> : !groups.length ? <Card><EmptyState icon={<Ruler className="h-8 w-8" />} title="No templates" /></Card> : (
        <div className="space-y-6">
          {groups.map(([cat, items]) => (
            <section key={cat} aria-label={cat}>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{cat}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((t) => (
                  <Card key={t.id} className="flex flex-col p-4">
                    <div className="flex items-start justify-between gap-2"><p className="font-medium">{t.name}</p>{t.isSystem && <Badge>Built-in</Badge>}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{t.sections.reduce((n, s) => n + s.fields.length, 0)} measurements in {t.sections.length} sections</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.sections.flatMap((s) => s.fields.map((f) => f.label)).join(', ')}</p>
                    {canManage && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => clone.mutate(t.id)} loading={clone.isPending && clone.variables === t.id}><Copy className="h-4 w-4" aria-hidden />Copy</Button>
                        {!t.isSystem && <Button size="sm" variant="secondary" onClick={() => setEditing(toEditing(t))}><Pencil className="h-4 w-4" aria-hidden />Edit</Button>}
                        {!t.isSystem && <Button size="sm" variant="ghost" onClick={() => archive.mutate(t.id)}>Archive</Button>}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {editing && <Editor initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function Editor({ initial, onClose }: { initial: Editing; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [t, setT] = React.useState<Editing>(initial);
  const setSection = (si: number, fn: (s: ESection) => ESection) => setT((x) => ({ ...x, sections: x.sections.map((s, i) => (i === si ? fn(s) : s)) }));
  const move = <A,>(arr: A[], i: number, d: number) => { const j = i + d; if (j < 0 || j >= arr.length) return arr; const c = [...arr]; [c[i], c[j]] = [c[j]!, c[i]!]; return c; };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: t.name.trim(), category: t.category.trim(),
        sections: t.sections.map((s) => ({
          name: s.name.trim(),
          fields: s.fields.map((f) => ({
            key: f.key || slug(f.label), label: f.label.trim(), helpText: f.helpText || undefined, required: f.required,
            minWarnCm: f.minCm ? Number(f.minCm) : undefined, maxWarnCm: f.maxCm ? Number(f.maxCm) : undefined,
          })),
        })),
      };
      return t.id ? api(`/measurement-templates/${t.id}`, { method: 'PUT', body }) : post('/measurement-templates', body);
    },
    onSuccess: () => { toast('Template saved'); void qc.invalidateQueries({ queryKey: ['templates'] }); onClose(); },
  });

  return (
    <Dialog open onClose={onClose} title={t.id ? 'Edit template' : 'New template'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Save template</Button></>}>
      <div className="space-y-5">
        {save.isError && <Alert>{errorText(save.error)}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Template name" htmlFor="tn"><Input id="tn" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} /></Field>
          <Field label="Garment category" htmlFor="tc"><Input id="tc" value={t.category} onChange={(e) => setT({ ...t, category: e.target.value })} placeholder="e.g. Shirt" /></Field>
        </div>
        {t.sections.map((s, si) => (
          <fieldset key={si} className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <Input aria-label="Section name" value={s.name} onChange={(e) => setSection(si, (x) => ({ ...x, name: e.target.value }))} />
              <Button type="button" variant="ghost" aria-label="Move section up" onClick={() => setT({ ...t, sections: move(t.sections, si, -1) })}><ArrowUp className="h-4 w-4" /></Button>
              <Button type="button" variant="ghost" aria-label="Move section down" onClick={() => setT({ ...t, sections: move(t.sections, si, 1) })}><ArrowDown className="h-4 w-4" /></Button>
              <Button type="button" variant="ghost" aria-label="Remove section" disabled={t.sections.length === 1} onClick={() => setT({ ...t, sections: t.sections.filter((_, i) => i !== si) })}><Trash2 className="h-4 w-4" /></Button>
            </div>
            {s.fields.map((f, fi) => (
              <div key={fi} className="space-y-2 rounded-md bg-muted/50 p-2">
                <div className="flex items-center gap-2">
                  <Input aria-label="Measurement name" placeholder="Measurement, e.g. Chest" value={f.label} onChange={(e) => setSection(si, (x) => ({ ...x, fields: x.fields.map((y, j) => j === fi ? { ...y, label: e.target.value, key: initial.id && y.key ? y.key : slug(e.target.value) } : y) }))} />
                  <Button type="button" variant="ghost" aria-label="Move up" onClick={() => setSection(si, (x) => ({ ...x, fields: move(x.fields, fi, -1) }))}><ArrowUp className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" aria-label="Move down" onClick={() => setSection(si, (x) => ({ ...x, fields: move(x.fields, fi, 1) }))}><ArrowDown className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" aria-label="Remove measurement" disabled={s.fields.length === 1} onClick={() => setSection(si, (x) => ({ ...x, fields: x.fields.filter((_, j) => j !== fi) }))}><Trash2 className="h-4 w-4" /></Button>
                </div>
                <Input aria-label="Help text" placeholder="Help text shown while measuring (optional)" value={f.helpText} onChange={(e) => setSection(si, (x) => ({ ...x, fields: x.fields.map((y, j) => j === fi ? { ...y, helpText: e.target.value } : y) }))} />
                <div className="grid grid-cols-3 items-center gap-2">
                  <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={f.required} onChange={(e) => setSection(si, (x) => ({ ...x, fields: x.fields.map((y, j) => j === fi ? { ...y, required: e.target.checked } : y) }))} />Required</label>
                  <Input aria-label="Warn below (cm)" inputMode="decimal" placeholder="Warn below cm" value={f.minCm} onChange={(e) => setSection(si, (x) => ({ ...x, fields: x.fields.map((y, j) => j === fi ? { ...y, minCm: e.target.value } : y) }))} />
                  <Input aria-label="Warn above (cm)" inputMode="decimal" placeholder="Warn above cm" value={f.maxCm} onChange={(e) => setSection(si, (x) => ({ ...x, fields: x.fields.map((y, j) => j === fi ? { ...y, maxCm: e.target.value } : y) }))} />
                </div>
              </div>
            ))}
            <Button type="button" size="sm" variant="secondary" onClick={() => setSection(si, (x) => ({ ...x, fields: [...x.fields, blankField()] }))}><Plus className="h-4 w-4" aria-hidden />Add measurement</Button>
          </fieldset>
        ))}
        <Button type="button" variant="secondary" onClick={() => setT({ ...t, sections: [...t.sections, { name: 'New section', fields: [blankField()] }] })}><Plus className="h-4 w-4" aria-hidden />Add section</Button>
      </div>
    </Dialog>
  );
}
