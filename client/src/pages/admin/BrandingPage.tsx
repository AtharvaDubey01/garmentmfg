import React, { useEffect, useRef, useState } from 'react';
import { Toast } from '../../components/common/Toast';
import { PRODUCT_NAME, useBranding } from '../../context/BrandingContext';

// Admin > Company Branding (admins only): the company's name and logo, shown on the login page,
// the menu, the home page, printed Job Orders / Lot Operation sheets and report exports.
// The picture is shrunk here before it is sent, so big photos from a phone are fine too.

const MAX_W = 800;
const MAX_H = 400;
const MAX_BYTES = 1024 * 1024;

/** Shrink a PNG / JPG to at most 800 x 400 and return it as a data: URL (PNG keeps a see-through background) */
async function shrinkLogo(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('Please choose a PNG or JPG picture.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That file could not be opened as a picture.'));
      i.src = url;
    });
    const scale = Math.min(1, MAX_W / img.naturalWidth, MAX_H / img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    if (file.type === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL(file.type, 0.9);
    if ((dataUrl.length - dataUrl.indexOf(',')) * 0.75 > MAX_BYTES) {
      throw new Error('This picture is still too big after shrinking. Please choose a smaller one.');
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const BrandingPage: React.FC = () => {
  const branding = useBranding();
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(branding.companyName);
  // undefined = keep the current logo, string = a new picture. Once a company has its own logo,
  // the page only offers to change it (not to go back to the GarmentMFG logo).
  const [newLogo, setNewLogo] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // the name arrives a moment after the page opens
  useEffect(() => setName(branding.companyName), [branding.companyName]);

  const shownLogo = newLogo ?? branding.logoUrl;
  const usingDefault = newLogo === undefined && !branding.hasLogo;
  const changed = name.trim() !== branding.companyName || newLogo !== undefined;

  const pickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // so the same file can be picked again
    if (!file) return;
    try {
      setNewLogo(await shrinkLogo(file));
    } catch (err: any) {
      setToast({ type: 'error', message: err.message });
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { companyName: name.trim() };
      if (newLogo !== undefined) body.logo = newLogo;
      const res = await fetch('/api/admin/branding', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Could not save');
      await branding.refresh();
      setNewLogo(undefined);
      setToast({ type: 'success', message: 'Company branding saved' });
    } catch (err: any) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fill-screen" style={{ maxWidth: '760px', margin: '0 auto', overflowY: 'auto' }}>
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>Company Branding</h1>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '6px', marginBottom: '22px' }}>
        Your company's name and logo, shown on the login page, the menu, the home page, printed Job Orders and Lot Operation
        sheets, and report exports.
      </div>

      <div style={card}>
        <label style={labelStyle} htmlFor="company-name">Company name</label>
        <input
          id="company-name"
          type="text"
          value={name}
          maxLength={200}
          placeholder="e.g. ABC Garments (P) Ltd"
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
        <div style={hintStyle}>Leave it empty to show "{PRODUCT_NAME}".</div>

        <label style={{ ...labelStyle, marginTop: '22px' }}>Logo</label>
        <div style={logoBox}>
          <img src={shownLogo} alt="Logo" style={{ maxWidth: '100%', maxHeight: '140px', objectFit: 'contain' }} />
        </div>
        <div style={hintStyle}>
          {usingDefault ? `This is the ${PRODUCT_NAME} logo, shown until you choose your own.` : 'Your company logo.'} PNG or JPG; big
          pictures are made smaller automatically. A PNG with a see-through background looks best.
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg" onChange={pickFile} style={{ display: 'none' }} />
          <button type="button" onClick={() => fileInput.current?.click()} style={secondaryBtn}>
            <i className="bi bi-image" /> {usingDefault ? 'Choose logo…' : 'Change logo…'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
        {changed && (
          <button
            type="button"
            onClick={() => {
              setName(branding.companyName);
              setNewLogo(undefined);
            }}
            style={secondaryBtn}
          >
            Undo changes
          </button>
        )}
        <button type="button" onClick={save} disabled={saving || !changed} style={{ ...primaryBtn, opacity: saving || !changed ? 0.6 : 1 }}>
          <i className="bi bi-check-lg" /> {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
};

const card: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid var(--border-color)',
  borderRadius: '16px',
  boxShadow: 'var(--shadow-card)',
  padding: '26px 28px',
};
const labelStyle: React.CSSProperties = { display: 'block', fontWeight: 'bold', color: '#000000', marginBottom: '6px', fontSize: '0.9rem' };
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  fontSize: '0.95rem',
  outline: 'none',
  backgroundColor: '#ffffff',
  boxSizing: 'border-box',
};
const hintStyle: React.CSSProperties = { color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '6px', lineHeight: 1.5 };
const logoBox: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '170px',
  padding: '14px',
  border: '1px dashed var(--border-color)',
  borderRadius: '12px',
  backgroundColor: '#f8f9fa',
};
const primaryBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  backgroundColor: 'var(--primary)',
  color: '#ffffff',
  border: 'none',
  borderRadius: '10px',
  padding: '10px 22px',
  fontSize: '0.95rem',
  fontWeight: 600,
  cursor: 'pointer',
};
const secondaryBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  backgroundColor: '#ffffff',
  color: 'var(--text-heading)',
  border: '1px solid var(--border-color)',
  borderRadius: '10px',
  padding: '9px 16px',
  fontSize: '0.9rem',
  fontWeight: 600,
  cursor: 'pointer',
};
