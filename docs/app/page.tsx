import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Jarvis</h1>
      <p className="max-w-md text-lg text-fd-muted-foreground">
        Internal development documentation and project management system.
      </p>
      <Link
        href="/docs"
        className="inline-flex h-10 items-center justify-center rounded-md bg-fd-primary px-6 text-sm font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/90"
      >
        Browse Documentation
      </Link>
    </main>
  );
}
