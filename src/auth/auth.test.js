import { describe, expect, it } from 'vitest';
import { getRole } from '@/auth/auth';

describe('Cognito role resolution', () => {
  it('gives owner precedence over admin and employee membership', () => {
    expect(getRole({ 'cognito:groups': ['employee', 'admin', 'owner'] })).toBe(
      'owner',
    );
    expect(getRole({ 'cognito:groups': ['employee', 'admin'] })).toBe('admin');
  });

  it('recognizes employees and rejects unrelated groups', () => {
    expect(getRole({ 'cognito:groups': ['employee'] })).toBe('employee');
    expect(getRole({ 'cognito:groups': ['contractor'] })).toBeNull();
    expect(getRole({})).toBeNull();
  });
});
