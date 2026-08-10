// Section-permission resolver shim for the imported AI-Visibility actions.
// We360's real access control is enforced by getUserContext + RLS
// (has_project_access). This resolver simply grants full section rights to any
// authenticated caller who already passed those gates — appropriate for an
// internal tool where every member of a project may manage AI Visibility.

export interface SectionRights {
  view: boolean;
  add: boolean;
  edit: boolean;
  complete: boolean;
  delete: boolean;
}

const FULL: SectionRights = { view: true, add: true, edit: true, complete: true, delete: true };

/** Returns full rights for every section key the caller reads (e.g.
 *  `perms.ai_visibility?.edit`). A Proxy so any section name resolves permissive. */
export async function getProjectSectionPermissions(
  _projectId: string,
): Promise<Record<string, SectionRights>> {
  return new Proxy({} as Record<string, SectionRights>, {
    get: () => FULL,
  });
}
