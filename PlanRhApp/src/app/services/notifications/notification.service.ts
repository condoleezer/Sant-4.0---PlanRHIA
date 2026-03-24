import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, interval, Subscription } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environment/environment';

export interface Notification {
  _id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'alert' | 'anomaly' | 'event' | 'system';
  user_id: string;
  service_id?: string;
  read: boolean;
  created_at: string;
  expires_at?: string;
  action_url?: string;
  action_label?: string;
}

export interface NotificationStats {
  total: number;
  unread: number;
  critical: number;
  byCategory: Record<string, number>;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notificationsSubject = new BehaviorSubject<Notification[]>([]);
  private statsSubject = new BehaviorSubject<NotificationStats>({
    total: 0,
    unread: 0,
    critical: 0,
    byCategory: {}
  });
  
  private refreshInterval: Subscription | null = null;
  private readonly REFRESH_INTERVAL = 10000; // 10 secondes

  constructor(private http: HttpClient) {
    this.startAutoRefresh();
  }

  // Observables publics
  get notifications$(): Observable<Notification[]> {
    return this.notificationsSubject.asObservable();
  }

  get stats$(): Observable<NotificationStats> {
    return this.statsSubject.asObservable();
  }

  get notifications(): Notification[] {
    return this.notificationsSubject.value;
  }

  get stats(): NotificationStats {
    return this.statsSubject.value;
  }

  // Méthodes de gestion des notifications
  loadNotifications(userId: string): Observable<any> {
    return this.http.get(`${environment.apiUrl}/notifications/user/${userId}`);
  }

  markAsRead(notificationId: string): Observable<any> {
    return this.http.patch(`${environment.apiUrl}/notifications/${notificationId}/read`, {});
  }

  markAllAsRead(userId: string): Observable<any> {
    return this.http.patch(`${environment.apiUrl}/notifications/user/${userId}/read-all`, {});
  }

  deleteNotification(notificationId: string): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/notifications/${notificationId}`);
  }

  createNotification(notification: Partial<Notification>): Observable<any> {
    return this.http.post(`${environment.apiUrl}/notifications`, notification);
  }

  // Méthodes internes
  private startAutoRefresh(): void {
    this.refreshInterval = interval(this.REFRESH_INTERVAL).subscribe(() => {
      // Cette méthode sera appelée périodiquement pour vérifier les nouvelles notifications
      // L'implémentation dépendra de l'utilisateur connecté
    });
  }

  private stopAutoRefresh(): void {
    if (this.refreshInterval) {
      this.refreshInterval.unsubscribe();
      this.refreshInterval = null;
    }
  }

  updateNotifications(notifications: Notification[]): void {
    this.notificationsSubject.next(notifications);
    this.calculateStats();
  }

  addNotification(notification: Notification): void {
    const currentNotifications = this.notifications;
    const updatedNotifications = [notification, ...currentNotifications];
    this.updateNotifications(updatedNotifications);
  }

  removeNotification(notificationId: string): void {
    const currentNotifications = this.notifications;
    const updatedNotifications = currentNotifications.filter(n => n._id !== notificationId);
    this.updateNotifications(updatedNotifications);
  }

  markNotificationAsRead(notificationId: string): void {
    const currentNotifications = this.notifications;
    const updatedNotifications = currentNotifications.map(n => 
      n._id === notificationId ? { ...n, read: true } : n
    );
    this.updateNotifications(updatedNotifications);
  }

  private calculateStats(): void {
    const notifications = this.notifications;
    const stats: NotificationStats = {
      total: notifications.length,
      unread: notifications.filter(n => !n.read).length,
      critical: notifications.filter(n => n.priority === 'critical').length,
      byCategory: {}
    };

    // Calculer les statistiques par catégorie
    notifications.forEach(notification => {
      const category = notification.category;
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
    });

    this.statsSubject.next(stats);
  }

  // Méthodes utilitaires
  getUnreadNotifications(): Notification[] {
    return this.notifications.filter(n => !n.read);
  }

  getCriticalNotifications(): Notification[] {
    return this.notifications.filter(n => n.priority === 'critical');
  }

  getNotificationsByCategory(category: string): Notification[] {
    return this.notifications.filter(n => n.category === category);
  }

  hasUnreadNotifications(): boolean {
    return this.stats.unread > 0;
  }

  hasCriticalNotifications(): boolean {
    return this.stats.critical > 0;
  }

  // Méthodes de simulation pour les tests
  simulateNewNotification(): void {
    const mockNotification: Notification = {
      _id: `mock_${Date.now()}`,
      title: 'Nouvelle alerte détectée',
      message: 'Une anomalie de planning a été détectée dans votre service',
      type: 'warning',
      priority: 'high',
      category: 'alert',
      user_id: 'current_user',
      read: false,
      created_at: new Date().toISOString(),
      action_url: '/alerts',
      action_label: 'Voir les alertes'
    };

    this.addNotification(mockNotification);
  }

  simulateCriticalNotification(): void {
    const mockNotification: Notification = {
      _id: `critical_${Date.now()}`,
      title: 'Alerte critique',
      message: 'Sous-effectif critique détecté - Action immédiate requise',
      type: 'error',
      priority: 'critical',
      category: 'anomaly',
      user_id: 'current_user',
      read: false,
      created_at: new Date().toISOString(),
      action_url: '/anomalies',
      action_label: 'Gérer les anomalies'
    };

    this.addNotification(mockNotification);
  }

  // Nettoyage
  destroy(): void {
    this.stopAutoRefresh();
    this.notificationsSubject.complete();
    this.statsSubject.complete();
  }
}














