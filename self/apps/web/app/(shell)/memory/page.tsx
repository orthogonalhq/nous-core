'use client';

import { useProject } from '@/lib/project-context';
import { trpc } from '@/lib/trpc';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function MemoryPage() {
  const { projectId } = useProject();
  const { data: entries, isLoading } = trpc.memory.list.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId },
  );
  const { data: denials } = trpc.memory.denials.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId },
  );
  const deleteMutation = trpc.memory.delete.useMutation();
  const utils = trpc.useUtils();

  const handleExport = async () => {
    if (!projectId) return;
    const data = await utils.memory.export.fetch({ projectId });
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nous-memory-${projectId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteAll = async () => {
    if (!projectId || !confirm('Delete all memory for this project?')) return;
    await deleteMutation.mutateAsync({ projectId });
    utils.memory.list.invalidate();
    utils.memory.denials.invalidate();
  };

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-muted-foreground">
          Select a project from the sidebar to view memory.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Loading memory...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Memory Inspector</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            Export
          </Button>
          <Button variant="outline" onClick={handleDeleteAll}>
            Delete All
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Approved Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {!entries?.length ? (
            <p className="text-muted-foreground">No approved memory entries yet.</p>
          ) : (
            <ul className="space-y-2">
              {entries.map((e) => (
                <li
                  key={e.id}
                  className="rounded border border-border p-3 text-sm"
                >
                  <div className="text-xs text-muted-foreground">
                    {e.type} · {e.createdAt}
                  </div>
                  <p className="whitespace-pre-wrap">{e.content}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Denied Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {!denials?.length ? (
            <p className="text-muted-foreground">No denied memory candidates.</p>
          ) : (
            <ul className="space-y-2">
              {denials.map((d, i) => (
                <li
                  key={i}
                  className="rounded border border-border p-3 text-sm"
                >
                  <div className="text-xs text-muted-foreground">
                    Reason: {d.reason}
                  </div>
                  <p className="whitespace-pre-wrap">
                    {typeof d.candidate === 'object' && d.candidate && 'content' in d.candidate
                      ? String((d.candidate as { content: string }).content)
                      : JSON.stringify(d.candidate)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
