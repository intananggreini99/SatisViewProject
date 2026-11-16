// Ikon SVG ringan (tanpa library tambahan). Semua dekoratif kecuali diberi `title`.
const base = (props) => ({
  width: props.size ?? 20,
  height: props.size ?? 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: props.strokeWidth ?? 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': props.title ? undefined : true,
  role: props.title ? 'img' : undefined,
  className: props.className,
});

export const DownloadIcon = (p) => (
  <svg {...base(p)}>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
  </svg>
);

export const MenuIcon = (p) => (
  <svg {...base({ strokeWidth: 2.2, ...p })}>
    <path d="M4 7h16M4 12h16M4 17h10" />
  </svg>
);

export const CloseIcon = (p) => (
  <svg {...base(p)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

/** Chevron garis (gaya ikon outline yang sama di seluruh aplikasi). */
export const ChevronDown = (p) => (
  <svg {...base({ strokeWidth: 2.4, ...p })}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const ChevronRight = (p) => (
  <svg {...base({ strokeWidth: 2.4, ...p })}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export const RefreshIcon = (p) => (
  <svg {...base(p)}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </svg>
);

export const InfoIcon = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M12 11v6M12 7.5v.01" />
  </svg>
);

export const AlertIcon = (p) => (
  <svg {...base(p)}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17v.01" />
  </svg>
);

export const CheckIcon = (p) => (
  <svg {...base(p)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const InboxIcon = (p) => (
  <svg {...base(p)}>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z" />
  </svg>
);

export const TrophyIcon = (p) => (
  <svg {...base(p)}>
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
    <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
  </svg>
);

export const WrenchIcon = (p) => (
  <svg {...base(p)}>
    <path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-3-3 6.4-6.4a4 4 0 0 1-1.7-5.3z" />
    <path d="m3 21 6-6" />
  </svg>
);

export const TableIcon = (p) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 10h18M9 10v10" />
  </svg>
);

export const ChartIcon = (p) => (
  <svg {...base(p)}>
    <path d="M4 20V4M4 20h16" />
    <path d="M8 16h8M8 12h11M8 8h5" />
  </svg>
);

export const SearchIcon = (p) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

export const RotateIcon = (p) => (
  <svg {...base(p)}>
    <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
    <path d="M3 21v-5h5" />
  </svg>
);

export const PlusIcon = (p) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const MinusIcon = (p) => (
  <svg {...base(p)}>
    <path d="M5 12h14" />
  </svg>
);

export const SparkleIcon = ({ className }) => (
  <svg viewBox="0 0 48 48" aria-hidden className={className}>
    <path d="M20 8c1.6 7.6 4.4 10.4 12 12-7.6 1.6-10.4 4.4-12 12-1.6-7.6-4.4-10.4-12-12 7.6-1.6 10.4-4.4 12-12z" fill="#F3C903" />
    <path d="M37 2c.8 3.7 2.2 5.1 5.9 5.9-3.7.8-5.1 2.2-5.9 5.9-.8-3.7-2.2-5.1-5.9-5.9 3.7-.8 5.1-2.2 5.9-5.9z" fill="#F3C903" />
  </svg>
);

/* Ikon menu analisis (navbar & sidebar). */
export const GaugeIcon = (p) => (
  <svg {...base(p)}>
    <path d="M4.5 17a8.5 8.5 0 1 1 15 0" />
    <path d="m12 13 4-4.5" />
    <circle cx="12" cy="13" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export const ScatterIcon = (p) => (
  <svg {...base(p)}>
    <path d="M4 4v16h16" />
    <circle cx="9" cy="14" r="1.6" />
    <circle cx="13.5" cy="9" r="1.6" />
    <circle cx="17.5" cy="13" r="1.6" />
  </svg>
);

export const ChatIcon = (p) => (
  <svg {...base(p)}>
    <path d="M20 12.5a7.5 7.5 0 0 1-11 6.6L4 20l1-4.3A7.5 7.5 0 1 1 20 12.5z" />
    <path d="M9 11h6M9 14h4" />
  </svg>
);

export const UsersIcon = (p) => (
  <svg {...base(p)}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M21.5 20a6.5 6.5 0 0 0-4-6" />
  </svg>
);

export const DocIcon = (p) => (
  <svg {...base(p)}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </svg>
);

export const BookIcon = (p) => (
  <svg {...base(p)}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
    <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
  </svg>
);

export const ArrowLeftIcon = (p) => (
  <svg {...base(p)}>
    <path d="M19 12H5" />
    <path d="m11 18-6-6 6-6" />
  </svg>
);

export const ArrowRightIcon = (p) => (
  <svg {...base(p)}>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </svg>
);

export const LockIcon = (p) => (
  <svg {...base(p)}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </svg>
);

export const LogOutIcon = (p) => (
  <svg {...base(p)}>
    <path d="M10 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H10" />
    <path d="M15 16l4-4-4-4" />
    <path d="M19 12H9" />
  </svg>
);

export const EyeIcon = (p) => (
  <svg {...base(p)}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const EyeOffIcon = (p) => (
  <svg {...base(p)}>
    <path d="M10.6 5.6A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4" />
    <path d="M6.4 6.9C3.9 8.6 2.5 12 2.5 12S6 18.5 12 18.5a9.3 9.3 0 0 0 4.4-1.1" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    <path d="m3 3 18 18" />
  </svg>
);

export const UserIcon = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
  </svg>
);

export const SendIcon = (p) => (
  <svg {...base(p)}>
    <path d="M21 3 10.5 13.5" />
    <path d="M21 3 14.5 21l-4-7.5L3 9.5z" />
  </svg>
);

export const ClipboardIcon = (p) => (
  <svg {...base(p)}>
    <rect x="5" y="4.5" width="14" height="17" rx="2.5" />
    <path d="M9 4.5V3.5h6v1" />
    <path d="M9 11h6M9 15h4" />
  </svg>
);

export const ShieldIcon = (p) => (
  <svg {...base(p)}>
    <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export const ClockIcon = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
