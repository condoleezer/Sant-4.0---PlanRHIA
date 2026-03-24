import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { OverlayPanelModule, OverlayPanel } from 'primeng/overlaypanel';
import { ButtonModule } from 'primeng/button';
import { BadgeModule } from 'primeng/badge';
import { TagModule } from 'primeng/tag';
import { ScrollPanelModule } from 'primeng/scrollpanel';
import { TooltipModule } from 'primeng/tooltip';

import { NotificationService, Notification, NotificationStats } from '../../../services/notifications/notification.service';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    OverlayPanelModule,
    ButtonModule,
    BadgeModule,
    TagModule,
    ScrollPanelModule,
    TooltipModule
  ],
  templateUrl: './notification-bell.component.html',
  styleUrls: ['./notification-bell.component.css']
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  @Input() userId: string = '';
  @Output() notificationClick = new EventEmitter<Notification>();
  @ViewChild('notificationPanel') notificationPanel!: OverlayPanel;

  notifications: Notification[] = [];
  stats: NotificationStats = {
    total: 0,
    unread: 0,
    critical: 0,
    byCategory: {}
  };
  
  private destroy$ = new Subject<void>();

  constructor(private notificationService: NotificationService) {}

  ngOnInit(): void {
    if (this.userId) {
      this.loadNotifications();
    }

    // S'abonner aux mises à jour des notifications
    this.notificationService.notifications$
      .pipe(takeUntil(this.destroy$))
      .subscribe(notifications => {
        this.notifications = notifications;
      });

    // S'abonner aux statistiques
    this.notificationService.stats$
      .pipe(takeUntil(this.destroy$))
      .subscribe(stats => {
        this.stats = stats;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadNotifications(): void {
    this.notificationService.loadNotifications(this.userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.notificationService.updateNotifications(response.data || []);
        },
        error: (error) => {
          console.error('Erreur lors du chargement des notifications:', error);
        }
      });
  }

  onNotificationClick(notification: Notification): void {
    if (!notification.read) {
      this.notificationService.markAsRead(notification._id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.notificationService.markNotificationAsRead(notification._id);
          },
          error: (error) => {
            console.error('Erreur lors de la mise à jour:', error);
          }
        });
    }

    // Fermer le panel avant de naviguer
    if (this.notificationPanel) {
      this.notificationPanel.hide();
    }

    this.notificationClick.emit(notification);
  }

  markAllAsRead(): void {
    this.notificationService.markAllAsRead(this.userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          const updatedNotifications = this.notifications.map(n => ({ ...n, read: true }));
          this.notificationService.updateNotifications(updatedNotifications);
        },
        error: (error) => {
          console.error('Erreur lors de la mise à jour:', error);
        }
      });
  }

  deleteNotification(notification: Notification, event: Event): void {
    event.stopPropagation();
    
    this.notificationService.deleteNotification(notification._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.notificationService.removeNotification(notification._id);
        },
        error: (error) => {
          console.error('Erreur lors de la suppression:', error);
        }
      });
  }

  getNotificationIcon(type: string): string {
    switch (type) {
      case 'info': return 'pi pi-info-circle';
      case 'warning': return 'pi pi-exclamation-triangle';
      case 'error': return 'pi pi-times-circle';
      case 'success': return 'pi pi-check-circle';
      default: return 'pi pi-bell';
    }
  }

  getNotificationSeverity(type: string): string {
    switch (type) {
      case 'info': return 'info';
      case 'warning': return 'warning';
      case 'error': return 'danger';
      case 'success': return 'success';
      default: return 'info';
    }
  }

  getPrioritySeverity(priority: string): string {
    switch (priority) {
      case 'critical': return 'danger';
      case 'high': return 'warning';
      case 'medium': return 'info';
      case 'low': return 'success';
      default: return 'info';
    }
  }

  getPriorityLabel(priority: string): string {
    switch (priority) {
      case 'critical': return 'Critique';
      case 'high': return 'Haute';
      case 'medium': return 'Moyenne';
      case 'low': return 'Basse';
      default: return priority;
    }
  }

  getCategoryLabel(category: string): string {
    switch (category) {
      case 'alert': return 'Alerte';
      case 'anomaly': return 'Anomalie';
      case 'event': return 'Événement';
      case 'system': return 'Système';
      default: return category;
    }
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) {
      return 'À l\'instant';
    } else if (diffInMinutes < 60) {
      return `Il y a ${diffInMinutes} min`;
    } else if (diffInMinutes < 1440) {
      const hours = Math.floor(diffInMinutes / 60);
      return `Il y a ${hours}h`;
    } else {
      return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  }

  // Méthodes de simulation pour les tests
  simulateNotification(): void {
    this.notificationService.simulateNewNotification();
  }

  simulateCriticalNotification(): void {
    this.notificationService.simulateCriticalNotification();
  }

  trackByNotificationId(index: number, notification: Notification): string {
    return notification._id;
  }
}
