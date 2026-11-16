// Dokumen laporan SatisView_Report.pdf dibaca langsung dari HDFS lewat WebHDFS.
import { config } from '../config.js';

const reportUrl = (op) => {
  const path = config.reportPath.split('/').map(encodeURIComponent).join('/');
  return `${config.webhdfsUrl}${path}?op=${op}&user.name=${encodeURIComponent(config.hdfsUser)}`;
};

export const reportFilename = () => config.reportPath.split('/').pop() || 'SatisView_Report.pdf';

export async function getReportStatus() {
  try {
    const res = await fetch(reportUrl('GETFILESTATUS'), { signal: AbortSignal.timeout(5000) });
    if (res.status === 404) {
      return { available: false, reason: 'not_found', filename: reportFilename() };
    }
    if (!res.ok) {
      return { available: false, reason: 'hdfs_error', detail: `HTTP ${res.status}`, filename: reportFilename() };
    }
    const { FileStatus: status } = await res.json();
    const available = status?.type === 'FILE' && Number(status.length) > 0;
    return {
      available,
      reason: available ? null : 'empty',
      filename: reportFilename(),
      size: Number(status?.length ?? 0),
      modifiedAt: status?.modificationTime ? new Date(status.modificationTime).toISOString() : null,
    };
  } catch (error) {
    return { available: false, reason: 'hdfs_unreachable', detail: error.message, filename: reportFilename() };
  }
}

/** Buka stream PDF dari HDFS (NameNode mengalihkan ke DataNode). */
export async function openReportStream() {
  return fetch(reportUrl('OPEN'), { redirect: 'follow', signal: AbortSignal.timeout(120_000) });
}
