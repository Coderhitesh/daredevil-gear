'use client';

import { Controller } from 'react-hook-form';
import { Input, Textarea, Select, Checkbox } from '@/components/ui';
import { toPaise, toRupees, toLocalInput } from '@/lib/format';
import ImageField from './ImageField';
import ProductPicker from './ProductPicker';

/**
 * Declarative field set for react-hook-form.
 * field: { name: 'a.b', label, type: text|textarea|number|money|checkbox|select|datetime|list|lines|image|html|percent,
 *          options, hint, required, span: 1|2, show(values), placeholder, rows, folder }
 */
const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const set = (obj, path, value) => {
  const keys = path.split('.');
  let o = obj;
  keys.slice(0, -1).forEach((k) => {
    if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
    o = o[k];
  });
  o[keys[keys.length - 1]] = value;
};

/** API document → form values. */
export function toFormValues(fields, doc = {}, defaults = {}) {
  const out = {};
  for (const f of fields) {
    if (f.type === 'heading') continue;
    let v = get(doc, f.name);
    if (v === undefined) v = get(defaults, f.name);
    switch (f.type) {
      case 'money':
        v = toRupees(v);
        break;
      case 'datetime':
        v = toLocalInput(v);
        break;
      case 'list':
        v = Array.isArray(v) ? v.join(', ') : v || '';
        break;
      case 'lines':
        v = Array.isArray(v) ? v.join('\n') : v || '';
        break;
      case 'checkbox':
        v = Boolean(v);
        break;
      case 'select':
        v = v === null || v === undefined ? '' : typeof v === 'object' && v._id ? String(v._id) : String(v);
        break;
      case 'image':
        v = v || null;
        break;
      case 'products':
      case 'multiselect':
        v = (v || []).map((x) => String(x?._id || x));
        break;
      default:
        v = v === null || v === undefined ? '' : v;
    }
    set(out, f.name, v);
  }
  return out;
}

/** Form values → API body (only declared fields, typed). `partial` omits empty optional values. */
export function toBody(fields, values) {
  const out = {};
  for (const f of fields) {
    if (f.readOnly || f.type === 'heading' || (f.type === 'custom' && !f.submit)) continue;
    if (f.show && !f.show(values)) continue;
    const raw = get(values, f.name);
    let v;
    switch (f.type) {
      case 'money':
        v = raw === '' ? (f.nullable ? null : undefined) : toPaise(raw);
        break;
      case 'number':
      case 'percent':
        v = raw === '' || raw === null ? (f.nullable ? null : undefined) : Number(raw);
        break;
      case 'checkbox':
        v = Boolean(raw);
        break;
      case 'datetime':
        v = raw ? new Date(raw).toISOString() : null;
        break;
      case 'list':
        v = String(raw || '').split(',').map((s) => s.trim()).filter(Boolean);
        break;
      case 'lines':
        v = String(raw || '').split('\n').map((s) => s.trim()).filter(Boolean);
        break;
      case 'select':
        v = raw === '' ? (f.nullable ? null : undefined) : f.numeric ? Number(raw) : raw === 'true' ? true : raw === 'false' ? false : raw;
        break;
      case 'image':
        v = raw || null;
        break;
      case 'products':
      case 'multiselect':
        v = raw || [];
        break;
      default:
        v = typeof raw === 'string' ? raw.trim() : raw;
        if (v === '' && !f.allowEmpty && f.type !== 'imageurl') v = f.nullable ? null : undefined;
    }
    if (v !== undefined) set(out, f.name, v);
  }
  return out;
}

export function FieldSet({ fields, form, cols = 2 }) {
  const { register, control, formState, watch } = form;
  const values = watch();
  const err = (name) => get(formState.errors, name)?.message;
  return (
    <div className={`grid gap-4 ${cols === 2 ? 'sm:grid-cols-2' : ''}`}>
      {fields.map((f) => {
        if (f.show && !f.show(values)) return null;
        const span = f.span === 2 || ['textarea', 'html', 'lines', 'image', 'imageurl'].includes(f.type) ? 'sm:col-span-2' : '';
        const common = { label: f.label, hint: f.hint, error: err(f.name), required: f.required, className: span, placeholder: f.placeholder, disabled: f.readOnly };
        if (f.type === 'heading') {
          return (
            <h3 key={f.name} className="border-t border-stone-300 pt-4 font-display text-lg font-semibold sm:col-span-2">
              {f.label}
            </h3>
          );
        }
        switch (f.type) {
          case 'textarea':
          case 'lines':
            return <Textarea key={f.name} rows={f.rows || 4} {...common} {...register(f.name)} />;
          case 'html':
            return <Textarea key={f.name} rows={f.rows || 16} {...common} className={`${span} font-mono`} {...register(f.name)} />;
          case 'checkbox':
            return <Checkbox key={f.name} label={f.label} hint={f.hint} className={`${span} self-end pb-1`} disabled={f.readOnly} {...register(f.name)} />;
          case 'select':
            return <Select key={f.name} options={typeof f.options === 'function' ? f.options(values) : f.options} placeholder={f.placeholder ?? (f.required ? undefined : '—')} {...common} {...register(f.name)} />;
          case 'money':
            return <Input key={f.name} inputMode="decimal" {...common} hint={f.hint || 'Rupees, GST inclusive unless stated'} {...register(f.name)} />;
          case 'number':
          case 'percent':
            return <Input key={f.name} type="number" step={f.step || 'any'} min={f.min} max={f.max} {...common} {...register(f.name)} />;
          case 'datetime':
            return <Input key={f.name} type="datetime-local" {...common} {...register(f.name)} />;
          case 'image':
            return <Controller key={f.name} control={control} name={f.name} render={({ field }) => <ImageField label={f.label} hint={f.hint} value={field.value} onChange={field.onChange} folder={f.folder} className={span} />} />;
          case 'imageurl':
            return <Controller key={f.name} control={control} name={f.name} render={({ field }) => <ImageField label={f.label} hint={f.hint} noAlt value={field.value ? { url: field.value } : null} onChange={(img) => field.onChange(img?.url || '')} folder={f.folder} className={span} />} />;
          case 'products':
            return <Controller key={f.name} control={control} name={f.name} render={({ field }) => <ProductPicker label={f.label} hint={f.hint} value={field.value} onChange={field.onChange} max={f.max} />} />;
          case 'multiselect':
            return (
              <Controller
                key={f.name}
                control={control}
                name={f.name}
                render={({ field }) => (
                  <fieldset className="sm:col-span-2">
                    <legend className="label">{f.label}</legend>
                    <div className="grid gap-1.5 rounded border border-stone-400 p-3 sm:grid-cols-2">
                      {(typeof f.options === 'function' ? f.options(values) : f.options).map(([val, text]) => (
                        <Checkbox
                          key={val}
                          label={text}
                          checked={(field.value || []).includes(String(val))}
                          onChange={(e) => field.onChange(e.target.checked ? [...(field.value || []), String(val)] : (field.value || []).filter((x) => x !== String(val)))}
                        />
                      ))}
                    </div>
                    {f.hint ? <p className="hint">{f.hint}</p> : null}
                  </fieldset>
                )}
              />
            );
          case 'custom':
            return <div key={f.name} className={span}>{f.render({ form, values })}</div>;
          default:
            return <Input key={f.name} type={f.inputType || 'text'} {...common} {...register(f.name)} />;
        }
      })}
    </div>
  );
}
