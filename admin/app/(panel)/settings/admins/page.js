'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Copy } from 'lucide-react';
import { ADMIN_ROLES, PERMISSIONS } from '@/lib/shared';
import { api } from '@/lib/api';
import { useAction, useAdmin } from '@/lib/hooks';
import { ago, humanize } from '@/lib/format';
import { PageHeader, DataTable, Status, Pill, Modal, Input, Select, Spinner, Notice, Confirm, Card } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import Guard from '@/components/shell/Guard';

const ROLE_HELP = {
  super_admin: 'Everything, including admin users',
  admin: 'Everything except managing admin users',
  catalog_manager: 'Products, categories, inventory, imports',
  order_manager: 'Orders, shipping, refunds, returns, inventory',
  support: 'Orders (read), customers, reviews, grievances',
  content_editor: 'Homepage, banners, pages, menus, reviews',
};

export default function AdminsPage() {
  const { data: me } = useAdmin();
  const { data: admins = [], isLoading, error } = useQuery({ queryKey: ['/admins'], queryFn: () => api('/admins') });
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState(null);
  const [secret, setSecret] = useState(null);

  return (
    <Guard perm="admins:manage">
      <PageHeader
        title="Admin users"
        description="There is no public admin sign-up. Create staff accounts here with the least access they need. Every admin must set up two-factor sign-in."
        actions={
          <button type="button" className="btn-primary" onClick={() => setCreate(true)}>
            <Plus className="h-4 w-4" /> Add admin
          </button>
        }
      />
      {secret ? (
        <div className="mb-4">
          <TempPassword {...secret} onDone={() => setSecret(null)} />
        </div>
      ) : null}
      <DataTable
        rows={admins}
        isLoading={isLoading}
        error={error}
        rowKey={(a) => a.id}
        onRowClick={(a) => a.id !== me?.id && setEdit(a)}
        columns={[
          { key: 'name', label: 'Name', render: (a) => <>{a.name}<span className="block text-xs text-graphite-400">{a.email}</span></> },
          { key: 'role', label: 'Role', render: (a) => <><Pill tone={a.role === 'super_admin' ? 'signal' : 'muted'}>{humanize(a.role)}</Pill><span className="block text-xs text-graphite-400">{ROLE_HELP[a.role]}</span></> },
          { key: 'mfa', label: 'Two-factor', render: (a) => (a.mfaEnabled ? <Pill tone="okay">On</Pill> : <Pill tone="caution">Not set up</Pill>) },
          { key: 'lastLoginAt', label: 'Last sign-in', render: (a) => ago(a.lastLoginAt) },
          { key: 'status', label: 'Status', render: (a) => <Status value={a.status} /> },
        ]}
      />
      <Card title="What each role can do" className="mt-4" bodyClass="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Permission</th>
              {ADMIN_ROLES.map((r) => (
                <th key={r} className="text-center">{humanize(r)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(PERMISSIONS).map(([p, roles]) => (
              <tr key={p}>
                <td className="font-mono text-xs">{p}</td>
                {ADMIN_ROLES.map((r) => (
                  <td key={r} className="text-center">{roles.includes(r) ? <span className="text-okay" aria-label="Allowed">●</span> : <span className="text-stone-400" aria-label="Not allowed">·</span>}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {create ? <CreateAdmin onClose={() => setCreate(false)} onCreated={(r) => (setCreate(false), setSecret({ email: r.email, password: r.temporaryPassword }))} /> : null}
      {edit ? <EditAdmin admin={edit} onClose={() => setEdit(null)} onPassword={(p) => setSecret({ email: edit.email, password: p })} /> : null}
    </Guard>
  );
}

function TempPassword({ email, password, onDone }) {
  const toast = useToast();
  return (
    <Notice
      tone="caution"
      title={`Temporary password for ${email}`}
      action={<button type="button" className="btn-outline btn-xs" onClick={onDone}>I have handed it over</button>}
    >
      <p>Shown only once. Share it privately (not by email). The admin must change it from My account and set up two-factor at first sign-in.</p>
      <button type="button" className="mt-2 inline-flex items-center gap-2 rounded bg-white px-3 py-1.5 font-mono text-sm" onClick={() => navigator.clipboard?.writeText(password).then(() => toast.show('Copied'))}>
        {password} <Copy className="h-3.5 w-3.5" />
      </button>
    </Notice>
  );
}

function CreateAdmin({ onClose, onCreated }) {
  const [v, setV] = useState({ name: '', email: '', role: 'support' });
  const save = useAction(() => api('/admins', { method: 'POST', body: { name: v.name.trim(), email: v.email.trim(), role: v.role } }), { invalidate: ['/admins'], success: 'Admin created', onSuccess: onCreated });
  return (
    <Modal
      open
      onClose={onClose}
      title="Add admin"
      size="sm"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={save.isPending || !v.name.trim() || !v.email.includes('@')} onClick={() => save.mutate()}>{save.isPending ? <Spinner /> : null} Create</button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Name" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <Input label="Work email" type="email" required value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        <Select label="Role" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })} options={ADMIN_ROLES.filter((r) => r !== 'super_admin').map((r) => [r, `${humanize(r)}: ${ROLE_HELP[r]}`])} hint="Super admins can only be promoted from an existing account." />
      </div>
    </Modal>
  );
}

function EditAdmin({ admin, onClose, onPassword }) {
  const [role, setRole] = useState(admin.role);
  const [confirm, setConfirm] = useState(null);
  const patch = useAction((body) => api(`/admins/${admin.id}`, { method: 'PATCH', body }), {
    invalidate: ['/admins'],
    success: 'Admin updated. Their sessions were signed out.',
    onSuccess: (r) => {
      if (r.temporaryPassword) onPassword(r.temporaryPassword);
      onClose();
    },
  });
  return (
    <Modal open onClose={onClose} title={admin.name}>
      <div className="space-y-4">
        <Select label="Role" value={role} onChange={(e) => setRole(e.target.value)} options={ADMIN_ROLES.map((r) => [r, `${humanize(r)}: ${ROLE_HELP[r]}`])} />
        <button type="button" className="btn-dark" disabled={role === admin.role || patch.isPending} onClick={() => patch.mutate({ role })}>Save role</button>
        <div className="flex flex-wrap gap-2 border-t border-stone-300 pt-4">
          <button type="button" className="btn-outline" onClick={() => setConfirm({ resetPassword: true, title: 'Reset password?', text: 'A new temporary password is generated and all their sessions end.' })}>Reset password</button>
          {admin.mfaEnabled ? <button type="button" className="btn-outline" onClick={() => setConfirm({ resetMfa: true, title: 'Reset two-factor?', text: 'They will have to set up an authenticator again at next sign-in. Only do this after confirming their identity.' })}>Reset two-factor</button> : null}
          {admin.status === 'active' ? (
            <button type="button" className="btn-danger" onClick={() => setConfirm({ status: 'suspended', title: 'Suspend this admin?', text: 'They are signed out immediately and cannot sign in.' })}>Suspend</button>
          ) : (
            <button type="button" className="btn-outline" onClick={() => patch.mutate({ status: 'active' })}>Reactivate</button>
          )}
        </div>
      </div>
      <Confirm open={Boolean(confirm)} onClose={() => setConfirm(null)} title={confirm?.title} tone={confirm?.status ? 'danger' : 'dark'} busy={patch.isPending} onConfirm={() => patch.mutate(Object.fromEntries(Object.entries(confirm).filter(([k]) => !['title', 'text'].includes(k))))}>
        <p>{confirm?.text}</p>
      </Confirm>
    </Modal>
  );
}
