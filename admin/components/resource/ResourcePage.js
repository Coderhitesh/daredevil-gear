'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { api, applyFieldErrors } from '@/lib/api';
import { useAction, useCan, useList, useUrlState } from '@/lib/hooks';
import { PageHeader, DataTable, Pager, Toolbar, SearchInput, FilterSelect, Drawer, Confirm, Spinner, Empty } from '@/components/ui';
import { FieldSet, toBody, toFormValues } from '@/components/form/fields';
import Guard from '@/components/shell/Guard';

/**
 * List + create/edit drawer for simple admin resources backed by the generic CRUD API.
 * props: title, description, path, perm, writePerm, columns, fields, defaults, filters [{ key, label, options }],
 *        searchable, newLabel, entityLabel, prepare(body, doc) → body, notice, extraActions(row), deletable
 */
export default function ResourcePage(props) {
  const { title, description, path, perm, writePerm, columns, filters = [], searchable = true, newLabel = 'Add', notice, limit = 50 } = props;
  const can = useCan();
  const [state, set] = useUrlState({});
  const query = { ...state, limit };
  const list = useList(path, query);
  const [editing, setEditing] = useState(null); // null | {} (new) | doc
  const writable = can(writePerm);

  return (
    <Guard perm={perm}>
      <PageHeader
        title={title}
        description={description}
        actions={
          writable ? (
            <button type="button" className="btn-primary" onClick={() => setEditing({})}>
              <Plus className="h-4 w-4" /> {newLabel}
            </button>
          ) : null
        }
      />
      {notice}
      {searchable || filters.length ? (
        <Toolbar>
          {searchable ? <SearchInput value={state.q} onChange={(q) => set({ q })} /> : null}
          {filters.map((f) => (
            <FilterSelect key={f.key} label={f.label} value={state[f.key]} options={f.options} onChange={(v) => set({ [f.key]: v })} />
          ))}
        </Toolbar>
      ) : null}
      <DataTable
        columns={columns}
        rows={list.items}
        isLoading={list.isLoading}
        error={list.error}
        onRowClick={writable ? (r) => setEditing(r) : undefined}
        empty={<Empty title={`No ${title.toLowerCase()} yet`} action={writable ? <button type="button" className="btn-outline" onClick={() => setEditing({})}>{newLabel}</button> : null} />}
        footer={<Pager meta={list.meta} onPage={(page) => set({ page })} />}
      />
      {editing ? <EditDrawer {...props} doc={editing} onClose={() => setEditing(null)} /> : null}
    </Guard>
  );
}

function EditDrawer({ path, fields, defaults = {}, entityLabel = 'item', prepare, load, doc, onClose, deletable = true, fieldsFor }) {
  const isNew = !doc._id;
  const active = fieldsFor ? fieldsFor(doc) : fields;
  const form = useForm({ defaultValues: toFormValues(active, load ? load(doc) : doc, isNew ? defaults : {}) });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = useAction(
    (values) => {
      let body = toBody(active, values);
      if (prepare) body = prepare(body, doc);
      return isNew ? api(path, { method: 'POST', body }) : api(`${path}/${doc._id}`, { method: 'PATCH', body });
    },
    {
      invalidate: [path],
      success: isNew ? `${cap(entityLabel)} created` : 'Changes saved',
      onSuccess: onClose,
      onError: (err) => (applyFieldErrors(err, form.setError) ? (form.setError('root', { message: err.message }), true) : false),
    }
  );
  const remove = useAction(() => api(`${path}/${doc._id}`, { method: 'DELETE' }), { invalidate: [path], success: `${cap(entityLabel)} deleted`, onSuccess: onClose });

  return (
    <Drawer
      open
      onClose={onClose}
      title={isNew ? `New ${entityLabel}` : `Edit ${entityLabel}`}
      footer={
        <>
          {!isNew && deletable ? (
            <button type="button" className="btn-danger mr-auto" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          ) : null}
          <button type="button" className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="resource-form" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? <Spinner /> : null}
            {isNew ? 'Create' : 'Save changes'}
          </button>
        </>
      }
    >
      <form id="resource-form" onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate className="space-y-4">
        {form.formState.errors.root ? <p className="rounded border border-alert/30 bg-alert-light px-3 py-2 text-sm text-alert">{form.formState.errors.root.message}</p> : null}
        <FieldSet fields={active} form={form} />
      </form>
      <Confirm
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete this ${entityLabel}?`}
        tone="danger"
        confirmLabel="Delete"
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      >
        <p>This cannot be undone. If it is in use, the server will refuse and tell you what to change first.</p>
      </Confirm>
    </Drawer>
  );
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
