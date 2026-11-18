"use client";

import { useParams } from "next/navigation";
import { AssignmentForm } from "@/components/assignment-form";
import { useAssignment } from "@/lib/queries";

/** Change an assignment: the same form as a new one, filled in. */
export default function EditAssignmentPage() {
  const { id } = useParams<{ id: string }>();
  const assignment = useAssignment(Number(id));
  if (assignment.isPending) return <p className="text-body text-ink-2">Loading…</p>;
  if (!assignment.data?.can_manage) {
    return (
      <div className="glass mx-auto max-w-xl rounded-card p-6">
        <p className="text-headline font-semibold">You can&apos;t edit this assignment</p>
        <p className="mt-1 text-body text-ink-2">Only the section&apos;s teachers can change it.</p>
      </div>
    );
  }
  return <AssignmentForm existing={assignment.data} />;
}
