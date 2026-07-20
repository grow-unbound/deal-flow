'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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
  const notificationsRef = useRef<AppNotification[]>([]);

  useEffect(() => {
    if (!userId) {
      notificationsRef.current = [];
      setNotifications([]);
      return;
    }
    const initial = loadFromStorage(userId);
    notificationsRef.current = initial;
    setNotifications(initial);
  }, [userId]);

  const add = useCallback((n: AppNotification) => {
    if (notificationsRef.current.some((p) => p.id === n.id)) return false;
    const next = [n, ...notificationsRef.current].slice(0, MAX_ENTRIES);
    notificationsRef.current = next;
    setNotifications(next);
    if (userId) saveToStorage(userId, next);
    return true;
  }, [userId]);

  const patchByEntityId = useCallback((
    entityType: AppNotification['entityType'],
    entityId: string,
    patch: Pick<AppNotification, 'title' | 'body'>,
  ) => {
    let changed = false;
    const next = notificationsRef.current.map((n) => {
      if (n.entityType !== entityType || n.entityId !== entityId) return n;
      changed = true;
      return { ...n, ...patch };
    });
    if (!changed) return;
    notificationsRef.current = next;
    setNotifications(next);
    if (userId) saveToStorage(userId, next);
  }, [userId]);

  const markRead = useCallback((id: string) => {
    const next = notificationsRef.current.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
    notificationsRef.current = next;
    setNotifications(next);
    if (userId) saveToStorage(userId, next);
  }, [userId]);

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    const next = notificationsRef.current.map((n) => (n.readAt ? n : { ...n, readAt: now }));
    notificationsRef.current = next;
    setNotifications(next);
    if (userId) saveToStorage(userId, next);
  }, [userId]);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return { notifications, add, patchByEntityId, markRead, markAllRead, unreadCount };
}
