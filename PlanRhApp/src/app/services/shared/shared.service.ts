import { Injectable } from '@angular/core';
import { MessageService } from 'primeng/api';

@Injectable({
  providedIn: 'root'
})
export class SharedService {
  constructor(private messageService: MessageService) {}

  applyFilter<T>(items: T[], searchTerm: string, fields: string[]): T[] {
    if (!searchTerm) return [...items];
    const term = searchTerm.toLowerCase();
    return items.filter(item =>
      fields.some(field => {
        const value = (item as any)[field]?.toString().toLowerCase() || '';
        return value.includes(term);
      })
    );
  }

  showSuccess(message: string) {
    this.messageService.add({ severity: 'success', summary: 'Succès', detail: message });
  }

  showError(message: string) {
    this.messageService.add({ severity: 'error', summary: 'Erreur', detail: message });
  }
}