import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('notification processor workflow', () => {
  it('runs automatically and remains manually dispatchable', async () => {
    const workflow = await readFile(
      path.resolve(process.cwd(), '.github/workflows/process-due-notifications.yml'),
      'utf8',
    );

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain("- cron: '*/5 * * * *'");
    expect(workflow).toContain('APP_URL: https://remindlly.vercel.app');
    expect(workflow).not.toContain('APP_URL: ${{ secrets.APP_URL }}');
  });
});
