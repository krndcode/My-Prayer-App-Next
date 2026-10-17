"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, LoadingState, Notice, PageHeading, Panel, SecondaryButton } from "@/components/ui/DashboardPrimitives";

function formatCreatedAt(value) {
  const seconds = value?._seconds ?? value?.seconds;
  if (!seconds) return "Recently reported";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })
    .format(new Date(seconds * 1000));
}

export default function ModerationWorkspace() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadReports = useCallback(async () => {
    try {
      const response = await fetch("/api/moderation/reports", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load reports.");
      setReports(result.reports || []);
      setError("");
    } catch (loadError) {
      setError(loadError.message || "Unable to load reports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let live = true;
    fetch("/api/moderation/reports", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load reports.");
        return result;
      })
      .then((result) => {
        if (live) {
          setReports(result.reports || []);
          setError("");
        }
      })
      .catch((loadError) => {
        if (live) setError(loadError.message || "Unable to load reports.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  async function review(report, action) {
    setBusyId(report.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/moderation/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: report.id, action })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to process this report.");
      setNotice(action === "remove" ? "Reported content removed." : "Report dismissed.");
      await loadReports();
    } catch (reviewError) {
      setError(reviewError.message || "Unable to process this report.");
    } finally {
      setBusyId("");
    }
  }

  if (loading) return <LoadingState label="Loading moderation reports…" />;

  return (
    <div>
      <PageHeading
        eyebrow="Community safety"
        title="Moderation reports"
        description="Review user reports and remove content that violates community guidelines."
        action={<SecondaryButton type="button" onClick={loadReports}>Refresh reports</SecondaryButton>}
      />
      {error && <div className="mb-4"><Notice>{error}</Notice></div>}
      {notice && <div className="mb-4"><Notice tone="success">{notice}</Notice></div>}
      {reports.length === 0 ? (
        <Panel><EmptyState title="No reports to review" description="New reports will appear here for moderator review." /></Panel>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <Panel key={report.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
                    {report.contentType === "prayerRequests" ? "Prayer request" : "Testimony"} · {formatCreatedAt(report.createdAt)}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    Report reason: <span className="font-normal">{report.reason}</span>
                  </p>
                  {report.content ? (
                    <>
                      <p className="mt-3 text-xs text-slate-500">
                        {report.content.authorName} · {report.content.status}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {report.content.text || "This content has already been removed."}
                      </p>
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">The reported content no longer exists.</p>
                  )}
                </div>
                {!report.reviewStatus && (
                  <div className="flex shrink-0 gap-2">
                    <SecondaryButton
                      type="button"
                      disabled={busyId === report.id}
                      onClick={() => review(report, "dismiss")}
                    >
                      Dismiss
                    </SecondaryButton>
                    <button
                      type="button"
                      disabled={busyId === report.id || !report.content}
                      onClick={() => review(report, "remove")}
                      className="rounded-xl bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
                    >
                      {busyId === report.id ? "Saving…" : "Remove content"}
                    </button>
                  </div>
                )}
                {report.reviewStatus && (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {report.reviewStatus}
                  </span>
                )}
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
