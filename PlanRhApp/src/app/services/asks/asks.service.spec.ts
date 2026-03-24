import { TestBed } from '@angular/core/testing';

import { AsksService } from './asks.service';

describe('AsksService', () => {
  let service: AsksService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AsksService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
