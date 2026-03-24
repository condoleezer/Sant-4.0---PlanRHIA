import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environment/environment';

export interface DetectionRule {
  id: string;
  name: string;
  description: string;
  type: 'absence' | 'scheduling' | 'compliance' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  conditions: any;
  actions: string[];
}

export interface DetectionResult {
  rule_id: string;
  triggered: boolean;
  message: string;
  data: any;
  severity: string;
}

@Injectable({
  providedIn: 'root'
})
export class DetectionService {
  private apiUrl = environment.apiUrl + '/detection';

  constructor(private http: HttpClient) {}

  // Règles de détection prédéfinies - DÉSACTIVÉES par défaut
  getDetectionRules(): DetectionRule[] {
    return [
      {
        id: 'absence_unjustified',
        name: 'Absence non justifiée',
        description: 'Détecte les absences sans justificatif après 48h',
        type: 'absence',
        severity: 'high',
        enabled: false, // DÉSACTIVÉ pour éviter la surcharge d'alertes
        conditions: {
          time_threshold: 48, // heures
          status: 'En cours'
        },
        actions: ['create_alert', 'notify_secretary']
      },
      {
        id: 'schedule_conflict',
        name: 'Conflit de planning',
        description: 'Détecte les doubles réservations de créneaux',
        type: 'scheduling',
        severity: 'critical',
        enabled: false, // DÉSACTIVÉ pour éviter la surcharge d'anomalies
        conditions: {
          check_overlap: true,
          same_service: true
        },
        actions: ['create_anomaly', 'notify_cadre']
      },
      {
        id: 'overtime_exceeded',
        name: 'Dépassement heures supplémentaires',
        description: 'Détecte les dépassements de quotas légaux',
        type: 'compliance',
        severity: 'medium',
        enabled: false, // DÉSACTIVÉ pour éviter la surcharge d'anomalies
        conditions: {
          monthly_limit: 40,
          check_period: 'monthly'
        },
        actions: ['create_anomaly', 'notify_cadre']
      },
      {
        id: 'understaffing',
        name: 'Sous-effectif critique',
        description: 'Détecte les services avec personnel insuffisant',
        type: 'scheduling',
        severity: 'critical',
        enabled: false, // DÉSACTIVÉ pour éviter la surcharge d'alertes
        conditions: {
          min_staff_ratio: 0.6,
          check_time: 'real_time'
        },
        actions: ['create_alert', 'notify_cadre']
      }
    ];
  }

  // Exécuter toutes les règles de détection
  runDetection(): Observable<DetectionResult[]> {
    // Pour l'instant, retourne des résultats simulés
    // Dans une vraie implémentation, ceci ferait des appels API
    return of(this.simulateDetection());
  }

  private simulateDetection(): DetectionResult[] {
    const results: DetectionResult[] = [];
    
    // Simulation d'une absence non justifiée
    results.push({
      rule_id: 'absence_unjustified',
      triggered: true,
      message: 'M. Dupont n\'a pas justifié son absence du 15/01/2025',
      data: {
        employee: 'M. Dupont',
        absence_date: '2025-01-15',
        hours_since: 52
      },
      severity: 'high'
    });

    // Simulation d'un conflit de planning
    results.push({
      rule_id: 'schedule_conflict',
      triggered: true,
      message: 'Dr Martin et Dr Durand sont assignés au même créneau',
      data: {
        doctors: ['Dr Martin', 'Dr Durand'],
        time_slot: '14:00-16:00',
        date: '2025-01-15'
      },
      severity: 'critical'
    });

    return results;
  }

  // Créer une alerte automatiquement
  createAlertFromDetection(result: DetectionResult): Observable<any> {
    const alertData = {
      title: result.message,
      message: `Détection automatique: ${result.message}`,
      type: result.severity === 'critical' ? 'error' : 'warning',
      priority: result.severity,
      auto_generated: true,
      detection_rule_id: result.rule_id,
      related_data: result.data
    };

    return this.http.post(`${this.apiUrl}/create-alert`, alertData);
  }

  // Créer une anomalie automatiquement
  createAnomalyFromDetection(result: DetectionResult): Observable<any> {
    const anomalyData = {
      title: result.message,
      description: `Anomalie détectée automatiquement: ${result.message}`,
      type: this.getAnomalyType(result.rule_id),
      severity: result.severity,
      status: 'open',
      auto_generated: true,
      detection_rule_id: result.rule_id,
      related_data: result.data
    };

    return this.http.post(`${this.apiUrl}/create-anomaly`, anomalyData);
  }

  private getAnomalyType(ruleId: string): string {
    const rule = this.getDetectionRules().find(r => r.id === ruleId);
    return rule?.type || 'system';
  }
}

