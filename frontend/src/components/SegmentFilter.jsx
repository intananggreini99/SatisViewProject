import { useMemo } from 'react';
import { SEMUA } from '../lib/constants.js';
import { fmtInt } from '../lib/format.js';
import Dropdown from './Dropdown.jsx';

/** Dropdown segmen (Program Studi / Departemen / Unit Kerja / Jenis Instansi / Jenis Penyedia). */
export default function SegmentFilter({ segments, segmentLabel, value, onChange, className = '' }) {
  const options = useMemo(() => {
    const list = segments?.length ? segments : [{ value: SEMUA, respondents: null }];
    return list.map((s) => ({
      value: s.value,
      label: s.value === SEMUA ? `Semua ${segmentLabel}` : s.value,
      respondents: s.respondents,
    }));
  }, [segments, segmentLabel]);

  return (
    <Dropdown
      label={segmentLabel}
      value={value}
      options={options}
      onChange={onChange}
      className={className}
      renderOption={(option) => (
        <span className="flex items-center justify-between gap-3">
          <span>{option.label}</span>
          {Number.isFinite(option.respondents) && (
            <span className="shrink-0 rounded-full bg-brand-50 px-2 text-[11px] font-semibold text-brand-700 tabular">
              {fmtInt(option.respondents)}
            </span>
          )}
        </span>
      )}
    />
  );
}
