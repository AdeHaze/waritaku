/**
 * RBAC Permission Library
 *
 * Resources: entries, media, taxonomies, taxonomy_terms, users,
 *            settings, content_builder, taxonomy_builder, layout,
 *            redirects, system
 *
 * Actions: read, create, edit_own, edit_others, delete_own, delete_others
 */

export type Resource =
    | 'entries' | 'media' | 'taxonomies' | 'taxonomy_terms'
    | 'users' | 'settings' | 'content_builder' | 'taxonomy_builder'
    | 'layout' | 'redirects' | 'system' | 'roles';

export type Action =
    | 'read' | 'create' | 'edit_own' | 'edit_others'
    | 'delete_own' | 'delete_others';

/**
 * A flat set of "resource:action" strings for a user's role.
 * e.g. Set { "entries:read", "entries:create", "entries:edit_own" }
 */
export type PermissionSet = Set<string>;

/**
 * Build a permission key string.
 */
export function permKey(resource: Resource, action: Action): string {
    return `${resource}:${action}`;
}

/**
 * Check if a permission set contains a specific resource+action.
 */
export function hasPermission(permissions: PermissionSet, resource: Resource, action: Action): boolean {
    return permissions.has(permKey(resource, action));
}

/**
 * Check any one of multiple actions for a given resource.
 */
export function hasAnyPermission(permissions: PermissionSet, resource: Resource, actions: Action[]): boolean {
    return actions.some(a => hasPermission(permissions, resource, a));
}

/**
 * Load permission set for a given role slug from the database.
 * Returns an empty set if the role has no permissions configured,
 * allowing safe fallback without crashing.
 */
export async function loadUserPermissions(db: any, roleSlug: string): Promise<PermissionSet> {
    const set: PermissionSet = new Set();
    if (!db || !roleSlug) return set;
    try {
        const { roles, rolePermissions } = await import('../db/schema');
        const { eq } = await import('drizzle-orm');

        const roleRes = await db.select({ id: roles.id }).from(roles).where(eq(roles.slug, roleSlug)).limit(1);
        if (roleRes.length === 0) return set;

        const roleId = roleRes[0].id;
        const perms = await db.select({
            resource: rolePermissions.resource,
            action: rolePermissions.action,
        }).from(rolePermissions).where(eq(rolePermissions.roleId, roleId));

        for (const p of perms) {
            set.add(`${p.resource}:${p.action}`);
        }
    } catch (e) {
        console.error('[permissions] Failed to load permissions for role:', roleSlug, e);
    }
    return set;
}
