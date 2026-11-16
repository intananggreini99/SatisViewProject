import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, downloadFile, fetchJson } from '../api/client.js';
import Drawer from '../components/Drawer.jsx';
import GroupNav from '../components/GroupNav.jsx';
import Header from '../components/Header.jsx';
import Hero from '../components/Hero.jsx';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../hooks/useAuth.js';
import { useHashState } from '../hooks/useHashState.js';
import { useToast } from '../hooks/useToast.js';
import { GROUPS, SEMUA, TABS, findGroup } from '../lib/constants.js';
import { fmtBytes, fmtDateTime } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import KpiView from '../views/KpiView.jsx';
import MappingView from '../views/MappingView.jsx';
import TextView from '../views/TextView.jsx';

const VIEWS = { kpi: KpiView, mapping: MappingView, text: TextView };

export default function Dashboard() {
  const [{ group: groupKey, tab, segment }, update] = useHashState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const { notify } = useToast();
  const { pengguna, keluar } = useAuth();
  const onLogout = useCallback(() => {
    keluar('Anda telah keluar dari dashboard.');
    navigate('/masuk?peran=pengelola');
  }, [keluar]);

  const group = findGroup(groupKey);
  const overview = useApi(api.groups());
  const segments = useApi(api.segments(group.key));

  // Segmen di URL yang tidak dikenal (mis. setelah data berubah) dikembalikan ke "Semua".
  useEffect(() => {
    const list = segments.data?.segments;
    if (!list?.length || segments.refreshing) return;
    if (!list.some((s) => s.value === segment)) update({ segment: SEMUA }, { replace: true });
  }, [segments.data, segments.refreshing, segment, update]);

  // Perbarui ringkasan status data secara berkala (pipeline berjalan terjadwal).
  useEffect(() => {
    const id = window.setInterval(overview.reload, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [overview.reload]);

  const groupStatus = useMemo(
    () => Object.fromEntries((overview.data?.groups ?? []).map((g) => [g.key, g.status])),
    [overview.data],
  );
  const drawerGroups = useMemo(
    () =>
      GROUPS.map((g) => ({
        ...g,
        ...(overview.data?.groups ?? []).find((o) => o.key === g.key),
      })),
    [overview.data],
  );

  const onReport = useCallback(async () => {
    setReportBusy(true);
    try {
      const status = await fetchJson(api.reportStatus());
      if (!status.available) {
        notify({
          type: 'error',
          title: 'Laporan belum tersedia',
          message:
            status.reason === 'hdfs_unreachable'
              ? 'Penyimpanan HDFS belum dapat dihubungi. Coba beberapa saat lagi.'
              : `${status.filename} belum diunggah ke folder laporan Google Drive.`,
        });
        return;
      }
      await downloadFile(api.report(), status.filename);
      notify({
        type: 'success',
        title: 'Laporan diunduh',
        message: [status.filename, fmtBytes(status.size), status.modifiedAt && `versi ${fmtDateTime(status.modifiedAt)}`]
          .filter(Boolean)
          .join(' · '),
      });
    } catch (error) {
      notify({ type: 'error', title: 'Gagal mengunduh laporan', message: error.message });
    } finally {
      setReportBusy(false);
    }
  }, [notify]);

  const View = VIEWS[tab] ?? KpiView;
  const activeTab = TABS.find((t) => t.key === tab) ?? TABS[0];
  const onSegmentChange = useCallback((value) => update({ segment: value }, { replace: true }), [update]);
  const onTabChange = useCallback((key) => update({ tab: key }), [update]);
  const onGroupChange = useCallback((key) => update({ group: key }), [update]);
  const groupInfo = overview.data?.groups?.find((g) => g.key === group.key) ?? (overview.error ? { status: 'no_data' } : null);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#panel-utama"
        className="sr-only z-[80] rounded-full bg-gold px-4 py-2 font-semibold text-brand-950 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Lompat ke konten
      </a>
      <Header
        tab={activeTab.key}
        onTabChange={onTabChange}
        onMenu={() => setDrawerOpen(true)}
        onReport={onReport}
        reportBusy={reportBusy}
        pengguna={pengguna}
        onLogout={onLogout}
      />
      <Hero group={group} info={groupInfo} />
      <GroupNav group={group.key} onGroupChange={onGroupChange} groupStatus={groupStatus} />

      <main
        id="panel-utama"
        role="tabpanel"
        aria-labelledby={`tab-${activeTab.key}`}
        tabIndex={-1}
        className="mx-auto w-full max-w-[1320px] flex-1 px-3 pt-6 pb-16 outline-none sm:px-6 sm:pt-8 lg:px-10"
      >
        <View key={`${group.key}:${activeTab.key}`} group={group} segment={segment} onSegmentChange={onSegmentChange} segments={segments} />
      </main>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-1 px-4 py-6 text-xs text-ink-muted sm:px-6 md:flex-row md:items-center md:justify-between lg:px-10">
          <p>
            <strong className="font-semibold text-brand">SatisView</strong>, dashboard kepuasan layanan & fasilitas kampus PENS.
            Hanya data agregat, tanpa identitas responden.
          </p>
          <p>Data: Google Form & form web SatisView → Kafka → HDFS → Apache Airflow → PostgreSQL · © SatisView Team</p>
        </div>
      </footer>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        groups={drawerGroups}
        currentGroup={group.key}
        onGroupChange={onGroupChange}
        tab={activeTab.key}
        onTabChange={onTabChange}
        onReport={onReport}
        pengguna={pengguna}
        onLogout={onLogout}
      />
    </div>
  );
}
