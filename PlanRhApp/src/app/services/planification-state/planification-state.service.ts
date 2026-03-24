import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { PlanningCell, PlanningFilters } from '../planification/planification.service';

/**
 * Service pour sauvegarder l'état de la simulation de planning
 * Permet de conserver les modifications même après navigation
 */
@Injectable({
  providedIn: 'root'
})
export class PlanificationStateService {
  private planningCellsState$ = new BehaviorSubject<PlanningCell[]>([]);
  private filtersState$ = new BehaviorSubject<PlanningFilters | null>(null);
  private hasChangesState$ = new BehaviorSubject<boolean>(false);

  planningCells$: Observable<PlanningCell[]> = this.planningCellsState$.asObservable();
  filters$: Observable<PlanningFilters | null> = this.filtersState$.asObservable();
  hasChanges$: Observable<boolean> = this.hasChangesState$.asObservable();

  /**
   * Sauvegarder l'état des cellules de planning
   */
  savePlanningCells(cells: PlanningCell[]): void {
    this.planningCellsState$.next(cells);
    // Sauvegarder aussi dans localStorage pour persister entre les sessions
    try {
      localStorage.setItem('planification_cells', JSON.stringify(cells));
    } catch (e) {
      console.warn('Impossible de sauvegarder dans localStorage:', e);
    }
  }

  /**
   * Récupérer l'état des cellules de planning
   */
  getPlanningCells(): PlanningCell[] {
    // D'abord essayer depuis le BehaviorSubject
    const currentState = this.planningCellsState$.getValue();
    if (currentState.length > 0) {
      return currentState;
    }
    
    // Sinon, essayer depuis localStorage
    try {
      const saved = localStorage.getItem('planification_cells');
      if (saved) {
        const cells = JSON.parse(saved);
        this.planningCellsState$.next(cells);
        return cells;
      }
    } catch (e) {
      console.warn('Impossible de récupérer depuis localStorage:', e);
    }
    
    return [];
  }

  /**
   * Sauvegarder les filtres
   */
  saveFilters(filters: PlanningFilters): void {
    this.filtersState$.next(filters);
    try {
      localStorage.setItem('planification_filters', JSON.stringify(filters));
    } catch (e) {
      console.warn('Impossible de sauvegarder les filtres:', e);
    }
  }

  /**
   * Récupérer les filtres sauvegardés
   */
  getFilters(): PlanningFilters | null {
    const currentState = this.filtersState$.getValue();
    if (currentState) {
      return currentState;
    }
    
    try {
      const saved = localStorage.getItem('planification_filters');
      if (saved) {
        const filters = JSON.parse(saved);
        this.filtersState$.next(filters);
        return filters;
      }
    } catch (e) {
      console.warn('Impossible de récupérer les filtres:', e);
    }
    
    return null;
  }

  /**
   * Sauvegarder l'état des modifications
   */
  saveHasChanges(hasChanges: boolean): void {
    this.hasChangesState$.next(hasChanges);
    try {
      localStorage.setItem('planification_hasChanges', JSON.stringify(hasChanges));
    } catch (e) {
      console.warn('Impossible de sauvegarder hasChanges:', e);
    }
  }

  /**
   * Récupérer l'état des modifications
   */
  getHasChanges(): boolean {
    const currentState = this.hasChangesState$.getValue();
    if (currentState) {
      return currentState;
    }
    
    try {
      const saved = localStorage.getItem('planification_hasChanges');
      if (saved) {
        const hasChanges = JSON.parse(saved);
        this.hasChangesState$.next(hasChanges);
        return hasChanges;
      }
    } catch (e) {
      console.warn('Impossible de récupérer hasChanges:', e);
    }
    
    return false;
  }

  /**
   * Vérifier s'il y a un état sauvegardé
   */
  hasSavedState(): boolean {
    const cells = this.getPlanningCells();
    return cells.length > 0;
  }

  /**
   * Effacer l'état sauvegardé
   */
  clearState(): void {
    this.planningCellsState$.next([]);
    this.filtersState$.next(null);
    this.hasChangesState$.next(false);
    
    try {
      localStorage.removeItem('planification_cells');
      localStorage.removeItem('planification_filters');
      localStorage.removeItem('planification_hasChanges');
    } catch (e) {
      console.warn('Impossible de supprimer du localStorage:', e);
    }
  }

  /**
   * Effacer uniquement les cellules (garder les filtres)
   */
  clearCells(): void {
    this.planningCellsState$.next([]);
    this.hasChangesState$.next(false);
    
    try {
      localStorage.removeItem('planification_cells');
      localStorage.removeItem('planification_hasChanges');
    } catch (e) {
      console.warn('Impossible de supprimer les cellules:', e);
    }
  }
}


