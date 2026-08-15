import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Filter, Search, Calendar } from "lucide-react";
import { AppShell } from "@/components/uh/app-shell";
import { StaffRoute } from "@/components/uh/route-guards";
import { api, type AuditLogData } from "@/lib/api";

export const Route = createFileRoute("/audit-logs")({

  head: () => ({
    meta: [
      { title: "Audit Logs — UrHealth Command Center" },
      { name: "description", content: "Audit log of all Google-authenticated public searches for patient reunification." },
    ],
  }),
  component: AuditLogsGuarded,
});

function AuditLogsGuarded() {
  return (
    <StaffRoute allowedRoles={["district_admin"]}>
      <AuditLogsScreen />
    </StaffRoute>
  );
}

function AuditLogsScreen() {
  const [emailFilter, setEmailFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const auditQuery = useQuery({
    queryKey: ["audit-logs"],
    queryFn: api.getAuditLogs,
  });

  const logs = auditQuery.data ?? [];

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (emailFilter.trim()) {
        const queryStr = emailFilter.trim().toLowerCase();
        const matchesEmail = log.public_user_email?.toLowerCase().includes(queryStr);
        const matchesName = log.public_user_name?.toLowerCase().includes(queryStr);
        if (!matchesEmail && !matchesName) return false;
      }

      if (startDate) {
        const logDate = new Date(log.searched_at).getTime();
        const start = new Date(startDate).getTime();
        if (logDate < start) return false;
      }

      if (endDate) {
        const logDate = new Date(log.searched_at).getTime();
        const end = new Date(endDate).setHours(23, 59, 59, 999);
        if (logDate > end) return false;
      }

      return true;
    });
  }, [logs, emailFilter, startDate, endDate]);

  return (
    <AppShell
      role="District Admin"
      title="Family Re-Unification Audit Log"
      subtitle="Complete, audited log of Google-verified identity searches across public patient records."
    >
      <div className="panel p-5">
        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[240px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter by searcher email or name..."
                value={emailFilter}
                onChange={(e) => setEmailFilter(e.target.value)}
                className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span>Showing {filteredLogs.length} of {logs.length} audit entries</span>
          </div>
        </div>

        {/* Audit Log Table */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2.5 pr-4 font-semibold">Searcher Identity</th>
                <th className="py-2.5 pr-4 font-semibold">Search Type</th>
                <th className="py-2.5 pr-4 font-semibold">Query Parameters</th>
                <th className="py-2.5 pr-4 font-semibold">Matched Result</th>
                <th className="py-2.5 pr-4 font-semibold">Timestamp</th>
                <th className="py-2.5 pr-4 font-semibold">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-muted/40 transition-colors">
                  <td className="py-3 pr-4">
                    <div className="font-semibold text-foreground">{log.public_user_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{log.public_user_email}</div>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs">
                    <span className="rounded-full bg-secondary px-2.5 py-0.5 font-medium text-secondary-foreground">
                      {log.query_type}
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-muted-foreground max-w-[220px] truncate">
                    {JSON.stringify(log.query_params)}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs">
                    {log.tracking_id_result ? (
                      <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-500 font-semibold">
                        {log.tracking_id_result}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-xs text-muted-foreground">
                    {new Date(log.searched_at).toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                    {log.ip_address}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredLogs.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No search audit entries found matching the active filters.
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
