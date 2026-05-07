import { TestBed } from '@angular/core/testing';
import { SecurityService } from './security.service';

describe('SecurityService', () => {
  let service: SecurityService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(SecurityService);
  });

  afterEach(() => {
    service.ngOnDestroy();
    localStorage.clear();
  });

  it('should sanitize script tags and handlers', () => {
    const payload = '<img src=x onerror=alert(1)><script>alert(2)</script>Hello';
    const sanitized = service.sanitize(payload);
    expect(sanitized).toContain('Hello');
    expect(sanitized).not.toContain('script');
    expect(sanitized).not.toContain('onerror');
  });

  it('should lock out after max attempts', () => {
    for (let i = 0; i < 5; i++) {
      service.recordFailedAttempt();
    }
    expect(service.isLockedOut()).toBeTrue();
    expect(service.remainingAttempts()).toBe(0);
  });

  it('should reset counter after resetRateLimit', () => {
    service.recordFailedAttempt();
    service.resetRateLimit();
    expect(service.remainingAttempts()).toBe(5);
    expect(service.isLockedOut()).toBeFalse();
  });
});
