import { Injectable } from '@angular/core';
import { TOKEN_KEY, USER_DATA } from '../../constants/constants';
import { User } from '../../models/User';

interface JwtPayload {
  _id?: string;
  exp?: number;
  [key: string]: any;
}

@Injectable({
  providedIn: 'root'
})
export class TokenService {
  public saveToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  }

  public saveUserData(user: User): void {
    localStorage.setItem(USER_DATA, JSON.stringify(user));
  }

  public getUserData(): User | null {
    try {
      const data = localStorage.getItem(USER_DATA);
      if (!data) {
        console.log('No user data found in localStorage');
        return null;
      }
      return JSON.parse(data) as User;
    } catch (error) {
      console.error('Error parsing user data from localStorage:', error);
      this.clearStorage();
      return null;
    }
  }

  public getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  public removeToken(): void {
    console.log('Removing token from localStorage');
    localStorage.removeItem(TOKEN_KEY);
  }

  public clearStorage(): void {
    console.log('Clearing all authentication data from localStorage');
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_DATA);
  }

  public parseJwt(token: string | null): JwtPayload | null {
    if (!token) {
      console.log('No token provided to parseJwt');
      return null;
    }
    try {
      const base64Url = token.split('.')[1];
      if (!base64Url) {
        console.error('Invalid token format: missing payload');
        return null;
      }
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        window.atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('Error parsing JWT:', error);
      return null;
    }
  }

  public getTokenExpirationDate(): Date | null {
    const token = this.getToken();
    if (!token) {
      console.log('No token found for expiration check');
      return null;
    }
    const payload = this.parseJwt(token);
    if (!payload || !payload.exp) {
      console.log('No expiration date found in token payload');
      return null;
    }
    return new Date(payload.exp * 1000);
  }

  public isExpired(): boolean {
    const token = this.getToken();
    if (!token) {
      console.log('No token, considering expired');
      return true;
    }

    const payload = this.parseJwt(token);
    if (!payload?.exp) {
      console.log('No expiration field in token, considering expired');
      return true;
    }

    // Convert Unix timestamp (seconds) to milliseconds
    const expirationDate = new Date(payload.exp * 1000);
    const now = new Date();

    // Log UTC times to avoid timezone confusion
    const expirationUTC = expirationDate.toISOString();
    const nowUTC = now.toISOString();

    // Add a buffer of 5 minutes to account for clock skew
    const bufferMinutes = 5 * 60 * 1000;
    const isExpired = (expirationDate.getTime() - bufferMinutes) < now.getTime();

    console.log('Token expiration check:', {
      expirationDate: expirationDate.toISOString(),
      now: now.toISOString(),
      expirationLocal: expirationDate,
      nowLocal: now,
      timezoneOffset: now.getTimezoneOffset(),
      isExpired
    });

    return isExpired;
  }

  public getUserId(): string | null {
    const payload = this.parseJwt(this.getToken());
    if (!payload) {
      console.log('No token payload found');
      return null;
    }
    // Backend uses 'user_id' in the JWT payload
    // Use bracket notation because user_id comes from an index signature
    const userId = payload['user_id'] || payload['_id'];
    if (!userId) {
      console.log('No user ID found in token payload. Available keys:', Object.keys(payload));
      return null;
    }
    return userId;
  }
}