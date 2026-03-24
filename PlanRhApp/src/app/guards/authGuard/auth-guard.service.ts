import { inject } from '@angular/core';
import { Router, UrlTree } from '@angular/router';
import { AuthService } from '../../services/auth/auth.service';

export const AuthGuard = (): boolean | UrlTree => {
  const router: Router = inject(Router);
  const authService: AuthService = inject(AuthService);

  if (authService.isAuthenticated()) {
    console.log('AuthGuard: User authenticated, allowing access');
    return true; // Allow access to protected routes
  }
  console.log('AuthGuard: User not authenticated, redirecting to login');
  return router.createUrlTree(['']);
};

export const CheckAuth = (): boolean | UrlTree => {
  const router: Router = inject(Router);
  const authService: AuthService = inject(AuthService);

  // Allow access to login page regardless of authentication status
  console.log('CheckAuth: Allowing access to login page');
  return true;
};