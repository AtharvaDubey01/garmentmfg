import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormPage } from '../../components/common/FormPage';
import { Toast } from '../../components/common/Toast';

interface LookupItem {
  id: number;
  name: string;
}

export const CompanyForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id && id !== 'new');
  const navigate = useNavigate();

  // Form State
  const [compname, setCompname] = useState('');
  const [mailingname, setMailingname] = useState('');
  const [cmpaddr1, setCmpaddr1] = useState('');
  const [cmpaddr2, setCmpaddr2] = useState('');
  const [cmpaddr3, setCmpaddr3] = useState('');
  const [cmpcountry, setCmpcountry] = useState<string>('1');
  const [cmpstate, setCmpstate] = useState<string>('');
  const [cmpcity, setCmpcity] = useState('');
  const [cmppincode, setCmppincode] = useState('');
  const [cmptelephone, setCmptelephone] = useState('');
  const [cmpmobile, setCmpmobile] = useState('');
  const [cmpemail, setCmpemail] = useState('');
  const [cmpwebsite, setCmpwebsite] = useState('');
  const [cmpgstn, setCmpgstn] = useState('');
  const [cmppanno, setCmppanno] = useState('');
  const [cmpcinno, setCmpcinno] = useState('');
  const [cmplbtno, setCmplbtno] = useState('');

  // Dropdown options
  const [countries, setCountries] = useState<LookupItem[]>([]);
  const [states, setStates] = useState<LookupItem[]>([]);

  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load lookups & details
  useEffect(() => {
    // 1. Fetch Countries
    fetch('/api/masters/lookups/countries', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        setCountries(data.map((c: any) => ({ id: c.id, name: c.country })));
      })
      .catch((err) => console.error('Error fetching countries:', err));

    // 2. Fetch States
    fetch('/api/masters/lookups/states', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        setStates(data.map((s: any) => ({ id: s.id, name: s.statename })));
      })
      .catch((err) => console.error('Error fetching states:', err));

    // 3. If editing, fetch Company details
    if (isEdit && id) {
      setLoading(true);
      fetch(`/api/masters/companies/${id}`, { credentials: 'include' })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to load company details');
          return res.json();
        })
        .then((data) => {
          setCompname(data.compname || '');
          setMailingname(data.mailingname || '');
          setCmpaddr1(data.cmpaddr1 || '');
          setCmpaddr2(data.cmpaddr2 || '');
          setCmpaddr3(data.cmpaddr3 || '');
          setCmpcountry(data.cmpcountry ? String(data.cmpcountry) : '1');
          setCmpstate(data.cmpstate ? String(data.cmpstate) : '');
          setCmpcity(data.cmpcity || '');
          setCmppincode(data.cmppincode || '');
          setCmptelephone(data.cmptelephone || '');
          setCmpmobile(data.cmpmobile || '');
          setCmpemail(data.cmpemail || '');
          setCmpwebsite(data.cmpwebsite || '');
          setCmpgstn(data.cmpgstn || '');
          setCmppanno(data.cmppanno || '');
          setCmpcinno(data.cmpcinno || '');
          setCmplbtno(data.cmplbtno || '');
        })
        .catch((err) => {
          setToast({ type: 'error', message: err.message });
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [id, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!compname.trim() || !cmpaddr1.trim() || !cmpstate) {
      setErrorMessage('Please Enter * Mandatory Fields');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const url = isEdit ? `/api/masters/companies/${id}` : '/api/masters/companies';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          compname,
          mailingname,
          cmpaddr1,
          cmpaddr2,
          cmpaddr3,
          cmpcountry,
          cmpstate,
          cmpcity,
          cmppincode,
          cmptelephone,
          cmpmobile,
          cmpemail,
          cmpwebsite,
          cmpgstn,
          cmppanno,
          cmpcinno,
          cmplbtno,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.message || 'Error saving company');
        return;
      }

      navigate('/masters/company');
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setCompname('');
    setMailingname('');
    setCmpaddr1('');
    setCmpaddr2('');
    setCmpaddr3('');
    setCmpcountry('1');
    setCmpstate('');
    setCmpcity('');
    setCmppincode('');
    setCmptelephone('');
    setCmpmobile('');
    setCmpemail('');
    setCmpwebsite('');
    setCmpgstn('');
    setCmppanno('');
    setCmpcinno('');
    setCmplbtno('');
    setErrorMessage('');
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    border: '1px solid #ced4da',
    borderRadius: '8px',
    fontSize: '0.88rem',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: '4px',
    fontSize: '0.85rem',
  };

  return (
    <div>
      <FormPage
        title="Company Master"
        onSubmit={handleSubmit}
        onClear={handleClear}
        exitPath="/masters/company"
        loading={loading}
        isEdit={isEdit}
      >
        <div style={{ gridColumn: 'span 3', width: '100%', maxWidth: '900px', margin: '0 auto' }}>
          {errorMessage && (
            <div
              style={{
                color: 'var(--danger)',
                fontWeight: 'bold',
                fontSize: '0.9rem',
                marginBottom: '16px',
                textAlign: 'center',
              }}
            >
              {errorMessage}
            </div>
          )}

          {/* Row 1: Company Name, Mailing Name */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>
                Company Name <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="text"
                value={compname}
                onChange={(e) => setCompname(e.target.value)}
                autoFocus
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Company Mailing Name</label>
              <input
                type="text"
                value={mailingname}
                onChange={(e) => setMailingname(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Row 2: Address, Address 1, Address 2 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>
                Address <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="text"
                value={cmpaddr1}
                onChange={(e) => setCmpaddr1(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Address 1</label>
              <input
                type="text"
                value={cmpaddr2}
                onChange={(e) => setCmpaddr2(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Address 2</label>
              <input
                type="text"
                value={cmpaddr3}
                onChange={(e) => setCmpaddr3(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Row 3: Country, State, City */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>Country</label>
              <select
                value={cmpcountry}
                onChange={(e) => setCmpcountry(e.target.value)}
                style={inputStyle}
              >
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>
                State <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <select
                value={cmpstate}
                onChange={(e) => setCmpstate(e.target.value)}
                style={inputStyle}
              >
                <option value="">--Select--</option>
                {states.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>City</label>
              <input
                type="text"
                value={cmpcity}
                onChange={(e) => setCmpcity(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Row 4: PinCode, Telephone No., Mobile No. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>PinCode</label>
              <input
                type="text"
                value={cmppincode}
                onChange={(e) => setCmppincode(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Telephone No.</label>
              <input
                type="text"
                value={cmptelephone}
                onChange={(e) => setCmptelephone(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Mobile No.</label>
              <input
                type="text"
                value={cmpmobile}
                onChange={(e) => setCmpmobile(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Row 5: EmailID, WebSite, GSTIN No. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>EmailID</label>
              <input
                type="email"
                value={cmpemail}
                onChange={(e) => setCmpemail(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>WebSite</label>
              <input
                type="text"
                value={cmpwebsite}
                onChange={(e) => setCmpwebsite(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>GSTIN No.</label>
              <input
                type="text"
                value={cmpgstn}
                onChange={(e) => setCmpgstn(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Row 6: PAN No., CIN No., LBT No. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>PAN No.</label>
              <input
                type="text"
                value={cmppanno}
                onChange={(e) => setCmppanno(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>CIN No.</label>
              <input
                type="text"
                value={cmpcinno}
                onChange={(e) => setCmpcinno(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>LBT No.</label>
              <input
                type="text"
                value={cmplbtno}
                onChange={(e) => setCmplbtno(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
        </div>
      </FormPage>

      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};
