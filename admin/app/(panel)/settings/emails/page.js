'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction, useCan } from '@/lib/hooks';
import { PageHeader, Card, Pill, Input, Textarea, Checkbox, Spinner, Notice } from '@/components/ui';
import Guard from '@/components/shell/Guard';

export default function EmailTemplatesPage() {
  const { data: list = [], isLoading } = useQuery({ queryKey: ['/email-templates'], queryFn: () => api('/email-templates') });
  const [key, setKey] = useState(null);
  const current = list.find((t) => t.key === (key || list[0]?.key));

  return (
    <Guard perm="settings:read">
      <PageHeader title="Email templates" description="Customer emails use the branded layout. You can change the wording; order details, links and legal footers are filled in automatically." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card bodyClass="">
          {isLoading ? (
            <div className="skeleton m-4 h-40" />
          ) : (
            <ul className="divide-y divide-stone-200">
              {list.map((t) => (
                <li key={t.key}>
                  <button type="button" onClick={() => setKey(t.key)} className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm ${current?.key === t.key ? 'bg-paper font-semibold' : 'hover:bg-paper'}`}>
                    {t.label}
                    <span className="flex gap-1">
                      {t.critical ? <Pill tone="signal">Required</Pill> : null}
                      {t.override ? <Pill tone="olive">Edited</Pill> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {current ? <TemplateEditor key={current.key + (current.override?.updatedAt || '')} t={current} /> : null}
      </div>
    </Guard>
  );
}

function TemplateEditor({ t }) {
  const can = useCan();
  const o = t.override || {};
  const [v, setV] = useState({ subject: o.subject || '', heading: o.heading || '', intro: o.intro || '', footerNote: o.footerNote || '', isActive: o.isActive ?? true });
  const [nonce, setNonce] = useState(0);
  const up = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = useAction(() => api(`/email-templates/${t.key}`, { method: 'PUT', body: { subject: v.subject.trim() || undefined, heading: v.heading.trim() || undefined, intro: v.intro.trim() || undefined, footerNote: v.footerNote.trim() || undefined, ...(t.critical ? {} : { isActive: v.isActive }) } }), {
    invalidate: ['/email-templates'],
    success: 'Template saved',
    onSuccess: () => setNonce((n) => n + 1),
  });
  const test = useAction(() => api(`/email-templates/${t.key}/test`, { method: 'POST' }), { success: (r) => `Test sent to ${r.sentTo}` });

  return (
    <div className="space-y-4">
      <Card
        title={t.label}
        actions={
          can('settings:write') ? (
            <button type="button" className="btn-outline btn-xs" onClick={() => test.mutate()} disabled={test.isPending}>
              {test.isPending ? <Spinner className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />} Send me a test
            </button>
          ) : null
        }
      >
        <fieldset disabled={!can('settings:write')} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Subject" className="sm:col-span-2" value={v.subject} onChange={up('subject')} placeholder="Leave empty for the default" />
          <Input label="Heading" className="sm:col-span-2" value={v.heading} onChange={up('heading')} placeholder="Leave empty for the default" />
          <Textarea label="Opening paragraph" className="sm:col-span-2" rows={3} value={v.intro} onChange={up('intro')} placeholder="Leave empty for the default" />
          <Textarea label="Note above the footer" className="sm:col-span-2" rows={2} value={v.footerNote} onChange={up('footerNote')} />
          {t.critical ? (
            <div className="sm:col-span-2">
              <Notice tone="info">Security and transactional emails (verification codes, password reset, order confirmation) cannot be switched off.</Notice>
            </div>
          ) : (
            <Checkbox label="Send this email" checked={v.isActive} onChange={up('isActive')} />
          )}
          <div className="flex justify-end sm:col-span-2">
            <button type="button" className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Spinner /> : null} Save template
            </button>
          </div>
        </fieldset>
      </Card>
      <Card title="Preview with sample data" bodyClass="p-0">
        <iframe key={nonce} title={`${t.label} preview`} src={`/api/v1/admin/email-templates/${t.key}/preview`} className="h-[640px] w-full border-0 bg-white" sandbox="" />
      </Card>
    </div>
  );
}
