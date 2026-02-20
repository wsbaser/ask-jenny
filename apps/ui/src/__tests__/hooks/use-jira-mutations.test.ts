/**
 * Unit tests for Jira mutation hooks
 *
 * Tests useJiraConnect, useJiraDisconnect, useJiraImport
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  useJiraConnect,
  useJiraDisconnect,
  useJiraImport,
} from '../../hooks/mutations/use-jira-mutations';

// Mock the http-api-client
vi.mock('@/lib/http-api-client', () => ({
  getHttpApiClient: () => ({
    fetch: vi.fn(),
  }),
}));

import { getHttpApiClient } from '@/lib/http-api-client';

describe('Jira mutation hooks', () => {
  let queryClient: QueryClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
        mutations: {
          retry: false,
        },
      },
    });

    mockFetch = vi.fn();
    vi.mocked(getHttpApiClient).mockReturnValue({ fetch: mockFetch } as any);
  });

  afterEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  describe('useJiraConnect', () => {
    it('should initiate OAuth flow successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          authorizationUrl: 'https://auth.atlassian.com/authorize?client_id=...',
          state: 'random-state-123',
        }),
      });

      const { result } = renderHook(() => useJiraConnect(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ returnUrl: 'http://localhost:3007/board' });
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/jira/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnUrl: 'http://localhost:3007/board' }),
      });

      expect(result.current.data).toEqual({
        authorizationUrl: 'https://auth.atlassian.com/authorize?client_id=...',
        state: 'random-state-123',
      });
    });

    it('should handle OAuth initiation error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Jira OAuth is not configured',
        }),
      });

      const { result } = renderHook(() => useJiraConnect(), { wrapper });

      await act(async () => {
        try {
          await result.current.mutateAsync({ returnUrl: 'http://localhost:3007' });
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.isError).toBe(true);
      expect(result.current.error?.message).toBe('Jira OAuth is not configured');
    });

    it('should handle non-JSON error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const { result } = renderHook(() => useJiraConnect(), { wrapper });

      await act(async () => {
        try {
          await result.current.mutateAsync({ returnUrl: 'http://localhost:3007' });
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.isError).toBe(true);
      expect(result.current.error?.message).toBe('HTTP 500');
    });

    it('should work without returnUrl', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          authorizationUrl: 'https://auth.atlassian.com/authorize',
          state: 'state',
        }),
      });

      const { result } = renderHook(() => useJiraConnect(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({});
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/jira/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    });
  });

  describe('useJiraDisconnect', () => {
    it('should disconnect successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useJiraDisconnect(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync();
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/jira/disconnect', {
        method: 'POST',
      });

      expect(result.current.data).toEqual({ success: true });
    });

    it('should invalidate jira queries on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useJiraDisconnect(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync();
      });

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['jira'],
      });
    });

    it('should handle disconnect error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          error: 'Failed to clear credentials',
        }),
      });

      const { result } = renderHook(() => useJiraDisconnect(), { wrapper });

      await act(async () => {
        try {
          await result.current.mutateAsync();
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.isError).toBe(true);
      expect(result.current.error?.message).toBe('Failed to clear credentials');
    });

    it('should handle non-JSON error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => {
          throw new Error('Service unavailable');
        },
      });

      const { result } = renderHook(() => useJiraDisconnect(), { wrapper });

      await act(async () => {
        try {
          await result.current.mutateAsync();
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.error?.message).toBe('HTTP 503');
    });
  });

  describe('useJiraImport', () => {
    it('should import issues successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          total: 2,
          successful: 2,
          failed: 0,
          duplicates: 0,
          results: [
            { issueKey: 'PROJ-1', success: true, featureId: 'feature-1' },
            { issueKey: 'PROJ-2', success: true, featureId: 'feature-2' },
          ],
        }),
      });

      const { result } = renderHook(() => useJiraImport(), { wrapper });

      const importRequest = {
        projectPath: '/test/project',
        issues: [
          { key: 'PROJ-1', summary: 'Feature 1' },
          { key: 'PROJ-2', summary: 'Feature 2' },
        ],
        defaultCategory: 'Sprint Import',
        includeIssueKey: true,
        includeUrl: true,
      };

      await act(async () => {
        await result.current.mutateAsync(importRequest as any);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/jira/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"projectPath":"/test/project"'),
      });

      expect(result.current.data?.successful).toBe(2);
      expect(result.current.data?.failed).toBe(0);
    });

    it('should handle partial import success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          total: 3,
          successful: 1,
          failed: 1,
          duplicates: 1,
          results: [
            { issueKey: 'PROJ-1', success: true, featureId: 'feature-1' },
            { issueKey: 'PROJ-2', success: false, duplicate: true },
            { issueKey: 'PROJ-3', success: false, error: 'Failed to create' },
          ],
        }),
      });

      const { result } = renderHook(() => useJiraImport(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          projectPath: '/test',
          issues: [
            { key: 'PROJ-1', summary: 'New' },
            { key: 'PROJ-2', summary: 'Duplicate' },
            { key: 'PROJ-3', summary: 'Failed' },
          ],
        } as any);
      });

      expect(result.current.data?.successful).toBe(1);
      expect(result.current.data?.duplicates).toBe(1);
      expect(result.current.data?.failed).toBe(1);
    });

    it('should handle import error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: 'Not connected to Jira',
        }),
      });

      const { result } = renderHook(() => useJiraImport(), { wrapper });

      await act(async () => {
        try {
          await result.current.mutateAsync({
            projectPath: '/test',
            issues: [{ key: 'PROJ-1', summary: 'Test' }],
          } as any);
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.isError).toBe(true);
      expect(result.current.error?.message).toBe('Not connected to Jira');
    });

    it('should handle non-JSON error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const { result } = renderHook(() => useJiraImport(), { wrapper });

      await act(async () => {
        try {
          await result.current.mutateAsync({
            projectPath: '/test',
            issues: [],
          } as any);
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.error?.message).toBe('HTTP 500');
    });

    it('should invalidate features query on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          total: 1,
          successful: 1,
          failed: 0,
          duplicates: 0,
          results: [{ issueKey: 'PROJ-1', success: true, featureId: 'f-1' }],
        }),
      });

      const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useJiraImport(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          projectPath: '/test',
          issues: [{ key: 'PROJ-1', summary: 'Test' }],
        } as any);
      });

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['features'],
      });
    });

    it('should pass all options to API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          total: 1,
          successful: 1,
          failed: 0,
          duplicates: 0,
          results: [],
        }),
      });

      const { result } = renderHook(() => useJiraImport(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          projectPath: '/test/project',
          issues: [
            {
              key: 'PROJ-1',
              summary: 'Test',
              description: 'Desc',
              url: 'https://jira.example.com/PROJ-1',
            },
          ],
          defaultCategory: 'Custom Category',
          includeIssueKey: false,
          includeUrl: false,
        } as any);
      });

      const callBody = JSON.parse((mockFetch.mock.calls[0][1] as { body: string }).body);

      expect(callBody.projectPath).toBe('/test/project');
      expect(callBody.defaultCategory).toBe('Custom Category');
      expect(callBody.includeIssueKey).toBe(false);
      expect(callBody.includeUrl).toBe(false);
      expect(callBody.issueIds).toEqual(['PROJ-1']);
    });
  });
});
