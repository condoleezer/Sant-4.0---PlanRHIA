import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environment/environment'; // Chemin correct depuis services/replacement-ai/

export interface ReplacementSuggestion {
  user_id: string;
  name: string;
  score: number;
  reasons: string[];
  warnings?: string[];  // Ajout de la propriété warnings
  availability_match: boolean;
  date_compatibility: number;
  full_coverage?: boolean;  // Ajout de la propriété full_coverage
}

export interface AISuggestionsResponse {
  suggestions: ReplacementSuggestion[];
  explanations: string[];
  total_candidates: number;
  has_available: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ChatRequest {
  absence_id: string;
  message: string;
  context?: any;
}

@Injectable({
  providedIn: 'root'
})
export class ReplacementAIService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getSuggestions(absenceId: string, serviceId?: string): Observable<any> {
    let params = new HttpParams();
    if (serviceId) {
      params = params.set('service_id', serviceId);
    }
    
    return this.http.get<any>(`${this.apiUrl}/replacement-ai/suggestions/${absenceId}`, { params });
  }

  evaluateSpecificUser(absenceId: string, userId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/replacement-ai/evaluate-user/${absenceId}/${userId}`);
  }

  chatWithAI(absenceId: string, message: string, context?: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/replacement-ai/chat`, {
      absence_id: absenceId,
      message: message,
      context: context
    });
  }
}

