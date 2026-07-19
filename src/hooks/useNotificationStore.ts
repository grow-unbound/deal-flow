'use client';

import { useCallback, useEffect, useState } from 'react';

export type NotificationKind =
  | 'new_catalog'
  | 'new_estimate'
  | 'new_order'
  | 'estimate_updated'
  | 'order_updated'
  | 'invoice_updated'
  | 'broadcast_updated';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  entityType: 'catalog' | 'estimate' | 'order' | 'invoice' | 'broadcast';
  entityId: string;
  href: string;
  readAt: string | null;
  createdAt: string;
}

const MAX_ENTRIES = 200;
const PRUNE_DAYS = 30;

function storageKey(userId: string) {
  return `df_notifications_${userId}`;
}

function loadFromStorage(userId: string): AppNotification[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const all = JSON.parse(raw) as AppNotification[];
    const cutoff = Date.now() - PRUNE_DAYS * 24 * 60 * 60 * 1000;
    return all.filter((n) => new Date(n.createdAt).getTime() > cutoff);
  } catch {
    return [];
  }
}

function saveToStorage(userId: string, notifications: AppNotification[]) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(notifications.slice(0, MAX_ENTRIES)));
  } catch {
    // storage full or unavailable — ignore
  }
}

export function useNotificationStore(userId: string | null) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (!userId) { setNotifications([]); return; }
    setNotifications(loadFromStorage(userId));
  }, [userId]);

  const add = useCallback((n: AppNotification) => {
    setNotifications((prev) => {
      if (prev.some((p) => p.id === n.id)) return prev;
      const next = [n, ...prev].slice(0, MAX_ENTRIES);
      if (userId) saveToStorage(userId, next);
      return next;
    });
  }, [userId]);

  const patchByEntityId = useCallback((
    entityType: AppNotification['entityType'],
    entityId: string,
    patch: Pick<AppNotification, 'title' | 'body'>,
  ) => {
    setNotifications((prev) => {
      let changed = false;
      const next = prev.map((n) => {
        if (n.entityType !== entityType || n.entityId !== entityId) return n;
        changed = true;
        return { ...n, ...patch };
      });
      if (!changed) return prev;
      if (userId) saveToStorage(userId, next);
      return next;
    });
  }, [userId]);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
      if (userId) saveToStorage(userId, next);
      return next;
    });
  }, [userId]);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const now = new Date().toISOString();
      const next = prev.map((n) => (n.readAt ? n : { ...n, readAt: now }));
      if (userId) saveToStorage(userId, next);
      return next;
    });
  }, [userId]);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return { notifications, add, patchByEntityId, markRead, markAllRead, unreadCount };
}
