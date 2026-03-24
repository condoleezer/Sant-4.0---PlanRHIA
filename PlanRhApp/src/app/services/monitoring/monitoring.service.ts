import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, interval, Subscription } from 'rxjs';
import { DetectionService, DetectionResult } from '../detection/detection.service';
import { AlertsService } from '../alerts/alerts.service';
import { AnomaliesService } from '../anomalies/anomalies.service';

export interface MonitoringStatus {
  isActive: boolean;
  lastCheck: Date | null;
  totalDetections: number;
  activeRules: number;
}

@Injectable({
  providedIn: 'root'
})
export class MonitoringService {
  private monitoringStatus = new BehaviorSubject<MonitoringStatus>({
    isActive: false,
    lastCheck: null,
    totalDetections: 0,
    activeRules: 0
  });

  private monitoringSubscription: Subscription | null = null;
  private checkInterval = 300000; // 5 minutes par défaut

  constructor(
    private detectionService: DetectionService,
    private alertsService: AlertsService,
    private anomaliesService: AnomaliesService
  ) {}

  // Démarrer la surveillance automatique
  startMonitoring(intervalMs: number = this.checkInterval): void {
    if (this.monitoringSubscription) {
      this.stopMonitoring();
    }

    this.monitoringStatus.next({
      ...this.monitoringStatus.value,
      isActive: true,
      activeRules: this.detectionService.getDetectionRules().filter(r => r.enabled).length
    });

    this.monitoringSubscription = interval(intervalMs).subscribe(() => {
      this.runDetectionCycle();
    });

    // Exécution immédiate
    this.runDetectionCycle();
  }

  // Arrêter la surveillance
  stopMonitoring(): void {
    if (this.monitoringSubscription) {
      this.monitoringSubscription.unsubscribe();
      this.monitoringSubscription = null;
    }

    this.monitoringStatus.next({
      ...this.monitoringStatus.value,
      isActive: false
    });
  }

  // Cycle de détection complet
  private runDetectionCycle(): void {
    console.log('🔍 Exécution du cycle de détection...');
    
    this.detectionService.runDetection().subscribe({
      next: (results) => {
        this.processDetectionResults(results);
        this.updateMonitoringStatus(results);
      },
      error: (error) => {
        console.error('❌ Erreur lors de la détection:', error);
      }
    });
  }

  // Traiter les résultats de détection
  private processDetectionResults(results: DetectionResult[]): void {
    results.forEach(result => {
      if (result.triggered) {
        console.log(`🚨 Règle déclenchée: ${result.rule_id}`);
        
        // Créer soit une alerte soit une anomalie, mais pas les deux
        if (this.shouldCreateAlert(result)) {
          this.detectionService.createAlertFromDetection(result).subscribe({
            next: () => console.log('✅ Alerte créée'),
            error: (error) => console.error('❌ Erreur création alerte:', error)
          });
        } else if (this.shouldCreateAnomaly(result)) {
          this.detectionService.createAnomalyFromDetection(result).subscribe({
            next: () => console.log('✅ Anomalie créée'),
            error: (error) => console.error('❌ Erreur création anomalie:', error)
          });
        }
      }
    });
  }

  // Déterminer si une alerte doit être créée
  private shouldCreateAlert(result: DetectionResult): boolean {
    // Les alertes sont pour les problèmes urgents nécessitant une action immédiate
    const alertRules = ['absence_unjustified', 'understaffing'];
    return alertRules.includes(result.rule_id);
  }

  // Déterminer si une anomalie doit être créée
  private shouldCreateAnomaly(result: DetectionResult): boolean {
    // Les anomalies sont pour les problèmes de conformité et de planning
    const anomalyRules = ['schedule_conflict', 'overtime_exceeded', 'rule_violation'];
    return anomalyRules.includes(result.rule_id);
  }

  // Mettre à jour le statut de surveillance
  private updateMonitoringStatus(results: DetectionResult[]): void {
    const triggeredCount = results.filter(r => r.triggered).length;
    
    this.monitoringStatus.next({
      ...this.monitoringStatus.value,
      lastCheck: new Date(),
      totalDetections: this.monitoringStatus.value.totalDetections + triggeredCount
    });
  }

  // Obtenir le statut de surveillance
  getMonitoringStatus(): Observable<MonitoringStatus> {
    return this.monitoringStatus.asObservable();
  }

  // Exécuter une détection manuelle
  runManualDetection(): Observable<DetectionResult[]> {
    return this.detectionService.runDetection();
  }

  // Configurer l'intervalle de surveillance
  setCheckInterval(intervalMs: number): void {
    this.checkInterval = intervalMs;
    if (this.monitoringStatus.value.isActive) {
      this.startMonitoring(intervalMs);
    }
  }

  // Obtenir les règles de détection
  getDetectionRules() {
    return this.detectionService.getDetectionRules();
  }
}
