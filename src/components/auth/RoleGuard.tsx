'use client';

import { type ReactNode } from 'react';
import { type Role } from '@/constants';
import { useRole } from '@/hooks/useRole';
import { PermissionDenied } from './PermissionDenied';

interface RoleGuardProps {
  /** Roles that are allowed to see the children */
  roles: Role[];
  children: ReactNode;
  /** Custom fallback — defaults to <PermissionDenied /> */
  fallback?: ReactNode;
}

/**
 * Renders children only when the current user's role is in the allowed list.
 * If role is not yet loaded (null), renders nothing to avoid a flash.
 * If role is loaded but not allowed, renders <PermissionDenied /> or the fallback.
 */
export function RoleGuard({ roles, children, fallback }: RoleGuardProps) {
  const { role, can } = useRole();

  if (role === null) return null;

  if (!can(roles)) {
    return <>{fallback ?? <PermissionDenied />}</>;
  }

  return <>{children}</>;
}
