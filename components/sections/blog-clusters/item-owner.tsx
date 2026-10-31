"use client";

// Per-post owner (POC) — the owner of one planned post, shown on each row of a
// cluster's table. Thin wrapper over the shared OwnerPicker.

import { OwnerPicker } from "@/components/sections/blog-clusters/owner-picker";
import { setClusterItemOwner } from "@/lib/actions/blog-clusters";
import type { Member } from "@/components/sections/assignee-picker";

export function ItemOwner({ projectId, itemId, ownerId, ownerName, ready, members, canManage, compact = true }: {
  projectId: string;
  itemId: string;
  ownerId: string | null;
  ownerName: string | null;
  ready: boolean;
  members: Member[];
  canManage: boolean;
  compact?: boolean;
}) {
  return (
    <OwnerPicker
      label="Owner"
      ownerId={ownerId}
      ownerName={ownerName}
      ready={ready}
      members={members}
      canManage={canManage}
      compact={compact}
      onPick={(id) => setClusterItemOwner({ project_id: projectId, item_id: itemId, owner_id: id })}
    />
  );
}
