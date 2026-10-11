// Which permissions unlock which sync entity. Shared by the sync engine,
// the Sync Center page, and PermissionContext.
export const ENTITY_PERMISSIONS = {
  birth:    ['birth_verification', 'birth_archive_uploader'],
  death:    ['death_verification', 'death_archive_uploader'],
  marriage: ['marriage_verification', 'marriage_archive_uploader'],
  tracking: [
    'document_tracking',
    'document_stage_registration',
    'document_stage_civil_registrar',
    'document_stage_posting_period',
    'document_stage_records_division',
    'document_stage_registry_number',
    'document_stage_releasing',
  ],
};

// null = everything (admin). A Set = only those entities.
export function getAllowedEntities(permissions, isAdmin) {
  if (isAdmin || (Array.isArray(permissions) && permissions.includes('*'))) return null;
  const perms = Array.isArray(permissions) ? permissions : [];
  const allowed = new Set();
  for (const [entity, required] of Object.entries(ENTITY_PERMISSIONS)) {
    if (required.some((p) => perms.includes(p))) allowed.add(entity);
  }
  return allowed;
}

// Default is an empty set: nothing syncs until a login sets the scope.
let scope = new Set();

export function setSyncScope(allowed) {
  scope = allowed; // null means all
}

export function isEntityAllowed(entity) {
  return scope === null || scope.has(entity);
}