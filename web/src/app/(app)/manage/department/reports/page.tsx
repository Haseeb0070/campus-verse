"use client";

import { ReportsView } from "@/components/manage/reports-view";

/** A coordinator's report: the same as the admins', limited to their departments. */
export default function DepartmentReportPage() {
  return <ReportsView department />;
}
