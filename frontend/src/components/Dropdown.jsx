import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CheckIcon, ChevronDown } from './Icons.jsx';

/**
 * Dropdown bergaya SatisView: tombol biru PENS dengan chevron kuning, menu putih
 * dengan pilihan terpilih bertanda centang.
 * Mengikuti pola ARIA listbox (panah atas/bawah, Home/End, Enter, Esc, ketik huruf).
 */
export default function Dropdown({
  label,
  value,
  options,
  onChange,
  placeholder = 'Pilih',
  className = '',
  menuClassName = '',
  disabled = false,
  renderOption,
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const buttonRef = useRef(null);
  const typeahead = useRef({ text: '', at: 0 });
  const id = useId();

  const selectedIndex = useMemo(() => options.findIndex((o) => o.value === value), [options, value]);
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const openMenu = () => {
    if (disabled || !options.length) return;
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
    requestAnimationFrame(() => listRef.current?.focus());
  };

  const choose = (index) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange?.(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onListKey = (event) => {
    const last = options.length - 1;
    if (event.key === 'ArrowDown') setActive((i) => Math.min(last, i + 1));
    else if (event.key === 'ArrowUp') setActive((i) => Math.max(0, i - 1));
    else if (event.key === 'Home') setActive(0);
    else if (event.key === 'End') setActive(last);
    else if (event.key === 'Enter' || event.key === ' ') choose(active);
    else if (event.key === 'Escape' || event.key === 'Tab') {
      setOpen(false);
      if (event.key === 'Escape') buttonRef.current?.focus();
      return;
    } else if (event.key.length === 1) {
      const now = Date.now();
      typeahead.current.text = (now - typeahead.current.at < 700 ? typeahead.current.text : '') + event.key.toLowerCase();
      typeahead.current.at = now;
      const found = options.findIndex((o) => String(o.label).toLowerCase().startsWith(typeahead.current.text));
      if (found >= 0) setActive(found);
      return;
    } else return;
    event.preventDefault();
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={label ? `${label}: ${selected?.label ?? placeholder}` : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
            event.preventDefault();
            openMenu();
          }
        }}
        className="on-dark group flex min-h-[54px] w-full items-center gap-3 rounded-2xl bg-brand py-2.5 pr-4 pl-5 text-left text-white shadow-[0_8px_18px_-10px_rgb(20_72_122/0.8)] transition hover:bg-brand-800 active:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="min-w-0 flex-1">
          {label && <span className="block text-[11px] leading-tight font-medium text-brand-100">{label}</span>}
          <span className="block truncate text-[15px] leading-tight font-semibold">{selected?.label ?? placeholder}</span>
        </span>
        <ChevronDown size={20} className={`shrink-0 text-gold transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className={`absolute top-[calc(100%+8px)] right-0 left-0 z-40 animate-fade-in rounded-2xl border border-line bg-white p-1.5 shadow-pop ${menuClassName}`}
        >
          <ul
            ref={listRef}
            id={`${id}-list`}
            role="listbox"
            tabIndex={-1}
            aria-label={label}
            aria-activedescendant={`${id}-opt-${active}`}
            onKeyDown={onListKey}
            className="sv-scroll max-h-72 outline-none"
          >
            {options.map((option, index) => {
              const isSelected = index === selectedIndex;
              const isActive = index === active;
              return (
                <li
                  key={option.value}
                  id={`${id}-opt-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled || undefined}
                  onPointerEnter={() => setActive(index)}
                  onClick={() => choose(index)}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm leading-snug transition-colors ${
                    isActive ? 'bg-brand-50' : ''
                  } ${isSelected ? 'font-semibold text-brand-900' : 'text-ink'} ${option.disabled ? 'opacity-50' : ''}`}
                >
                  <CheckIcon size={16} strokeWidth={2.6} className={`shrink-0 ${isSelected ? 'text-brand' : 'invisible'}`} />
                  <span className="min-w-0 flex-1">{renderOption ? renderOption(option, { isSelected }) : option.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
