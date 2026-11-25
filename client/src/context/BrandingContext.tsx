import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

// Company Branding: the company's name and logo, shown on the login page, the menu, the home page,
// printed Job Orders / Lot Operation sheets and report exports. An admin sets them in
// Admin > Company Branding; until then the app shows its own name and logo (GarmentMFG).

export const PRODUCT_NAME = 'GarmentMFG';
export const DEFAULT_LOGO = '/brand/garmentmfg-logo.png';

interface Branding {
  companyName: string; // '' = not set
  displayName: string; // the company name, or "GarmentMFG" when not set
  hasLogo: boolean; // the company has its own logo
  logoUrl: string; // for <img> on screen
  logoDataUrl: string; // the same picture as a data: URL, for print windows and PDFs ('' while loading)
  refresh: () => Promise<void>;
}

const BrandingContext = createContext<Branding | undefined>(undefined);

/** Read a picture into a data: URL (prints and PDFs need the picture itself, not an address) */
async function toDataUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return '';
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

export const BrandingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [companyName, setCompanyName] = useState('');
  const [hasLogo, setHasLogo] = useState(false);
  const [logoUrl, setLogoUrl] = useState(DEFAULT_LOGO);
  const [logoDataUrl, setLogoDataUrl] = useState('');

  const refresh = useCallback(async () => {
    let name = '';
    let own = false;
    let url = DEFAULT_LOGO;
    try {
      const res = await fetch('/api/branding', { cache: 'no-cache' });
      if (res.ok) {
        const b = await res.json();
        name = b.companyName || '';
        own = !!b.hasLogo;
        if (own) url = `/api/branding/logo?v=${b.version}`;
      }
    } catch {
      // server not reachable: keep the app's own name and logo
    }
    setCompanyName(name);
    setHasLogo(own);
    setLogoUrl(url);
    setLogoDataUrl(await toDataUrl(url));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const displayName = companyName || PRODUCT_NAME;

  // browser tab: "ABC Garments · GarmentMFG", or just "GarmentMFG"
  useEffect(() => {
    document.title = companyName ? `${companyName} · ${PRODUCT_NAME}` : PRODUCT_NAME;
  }, [companyName]);

  return (
    <BrandingContext.Provider value={{ companyName, displayName, hasLogo, logoUrl, logoDataUrl, refresh }}>
      {children}
    </BrandingContext.Provider>
  );
};

export const useBranding = (): Branding => {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBranding must be used inside BrandingProvider');
  return ctx;
};
