"use client";

// Cluster owner / point of contact — shown atop a cluster (full) and on each
// cluster card (compact). Thin wrapper over the shared OwnerPicker.

import { OwnerPicker } from "@/components/sections/blog-clusters/owner-picker";
import { setClusterOwner } from "@/lib/actions/blog-clusters";
import type { Member } from "@/components/sections/assignee-picker";

export function ClusterOwner({ projectId, clusterId, ownerId, ownerReady, members, canManage, compact = false }: {
  projectId: string;
  clusterId: string;
  ownerId: string | null;
  ownerReady: boolean;
  members: Member[];
  canManage: boolean;
  compact?: boolean;
}) {
  return (
    <OwnerPicker
      label="Cluster owner"
      ownerId={ownerId}
      ownerName={null}
      ready={ownerReady}
      members={members}
      canManage={canManage}
      compact={compact}
      onPick={(id) => setClusterOwner({ project_id: projectId, cluster_id: clusterId, owner_id: id })}
    />
  );
}
